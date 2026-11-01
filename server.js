// Coin Drift server: Express + SQLite. Auth (bcrypt + hashed session tokens), validation, rate limiting.
const express = require('express'), helmet = require('helmet'), rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs'), crypto = require('crypto'), path = require('path'), Database = require('better-sqlite3');
const QRCode = require('qrcode');
const { store, limiter, redisOn } = require('./store');
const PROD = process.env.NODE_ENV === 'production', PORT = process.env.PORT || 3000, WEEK = 7 * 864e5;
const PEPPER = process.env.PEPPER || (PROD ? (() => { throw new Error('PEPPER env var is required in production'); })() : 'dev-only-pepper');
const IDLE_MS = (Number(process.env.SESSION_IDLE_MIN) || 1440) * 6e4; // sign out after this long without activity (default 24h)
const COOKIE_SECURE = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : PROD;

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, score INTEGER, coins INTEGER, time_ms INTEGER, level_reached INTEGER, stars INTEGER, completed INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, event TEXT NOT NULL, ip TEXT, ua TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
for (const q of ['ip TEXT', 'ua TEXT', 'created TEXT']) { try { db.exec('ALTER TABLE sessions ADD COLUMN ' + q); } catch {} } // migrate older databases
for (const q of ['accent TEXT', 'totp_secret TEXT', 'totp_on INTEGER DEFAULT 0', 'recovery TEXT']) { try { db.exec('ALTER TABLE users ADD COLUMN ' + q); } catch {} }
try { db.exec('ALTER TABLE sessions ADD COLUMN seen INTEGER'); } catch {}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const str = (v) => (typeof v === 'string' ? v.trim() : '');
// ---- Hashing ----
// 1) password -> HMAC-SHA256 with a secret PEPPER (kept outside the database) -> 2) bcrypt (salted, slow, cost 12).
//    A stolen database is useless without the pepper, and the HMAC also removes bcrypt's 72-byte limit.
const pre = (pw) => crypto.createHmac('sha256', PEPPER).update(pw).digest('base64');
const hashPw = (pw) => bcrypt.hashSync(pre(pw), 12);
function verifyPw(pw, hash) { // returns 'ok', 'legacy' (old un-peppered hash: re-hash on login) or false
  if (bcrypt.compareSync(pre(pw), hash)) return 'ok';
  return bcrypt.compareSync(pw, hash) ? 'legacy' : false;
}
const DUMMY = hashPw('timing-equalizer'); // so "no such user" takes as long as "wrong password"
const audit = (req, uid, event) => db.prepare('INSERT INTO audit(user_id,event,ip,ua) VALUES(?,?,?,?)').run(uid, event, req.ip, String(req.headers['user-agent'] || '').slice(0, 200));

// ---- Validation (whitelist style; SQL is always parameterized, the UI only uses textContent) ----
// Passwords that are technically long enough but are the first thing an attacker tries.
const COMMON = new Set(['password1', 'password12', 'password123', 'password1234', 'passw0rd1', 'qwerty123', 'qwerty1234', 'qwertyuiop1', '12345678a', 'a1234567', 'abc12345', 'abcd1234', 'abc123456', 'iloveyou1', 'iloveyou123', 'welcome1', 'welcome123', 'letmein123', 'admin123', 'admin1234', 'football1', 'monkey123', 'dragon123', 'master123', 'sunshine1', 'princess1', 'superman1', 'trustno1', 'coindrift1', 'coindrift123', 'changeme1', 'changeme123', 'pakistan123', 'pakistan1']);
const weakPw = (pw, name) => COMMON.has(pw.toLowerCase()) || /^(.)\1+$/.test(pw) || (name && pw.toLowerCase().includes(String(name).toLowerCase()) && String(name).length >= 3);
const USER_RE = /^[A-Za-z0-9_]{3,20}$/, EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
function validateSignup({ username, email, password }) {
  username = str(username); email = str(email).toLowerCase();
  if (!USER_RE.test(username)) return { error: 'Username: 3-20 letters, numbers or underscores.' };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (typeof password !== 'string' || password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    return { error: 'Password: 8-72 characters with at least one letter and one number.' };
  if (weakPw(password, username)) return { error: 'That password is too easy to guess. Pick something less common that does not contain your username.' };
  return { username, email, password };
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ['https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: null } } }));
app.use(express.json({ limit: '10kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// CSRF defence in depth: a state-changing request that names a different origin is refused (cookie is also SameSite=Strict, body must be JSON).
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const o = req.headers.origin; if (!o) return next();
  try { if (new URL(o).host === req.headers.host) return next(); } catch {}
  res.status(403).json({ error: 'Cross-site request blocked.' });
});
app.use('/api', limiter(60e3, 120, 'Too many requests.', 'api'));
const authLimit = limiter(15 * 60e3, 10, 'Too many attempts. Try again in 15 minutes.', 'auth');
const tfaLimit = limiter(15 * 60e3, 20, 'Too many attempts. Try again in 15 minutes.', 'tfa');
const scoreLimit = limiter(60e3, 20, 'Slow down.', 'score');

// ---- Sessions: random 256-bit token in an httpOnly cookie; only its SHA-256 is stored ----
function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires,ip,ua,created,seen) VALUES(?,?,?,?,?,datetime('now'),?)").run(sha(token), userId, Date.now() + WEEK, req.ip, String(req.headers['user-agent'] || '').slice(0, 200), Date.now());
  res.cookie('sid', token, { httpOnly: true, sameSite: 'strict', secure: COOKIE_SECURE, maxAge: WEEK });
}
app.use((req, res, next) => {
  const m = /(?:^|; )sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  req.sid = m && sha(m[1]);
  const now = Date.now();
  req.user = m && db.prepare('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND (s.seen IS NULL OR s.seen>?)').get(req.sid, now, now - IDLE_MS);
  if (req.user) db.prepare('UPDATE sessions SET seen=? WHERE token_hash=? AND (seen IS NULL OR seen<?)').run(now, req.sid, now - 6e4); // "last active", refreshed at most once a minute
  next();
});
const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Not signed in.' }));
// state-changing requests must be JSON (blocks plain cross-site form posts; cookie is SameSite=Strict too)
app.use('/api', (req, res, next) => (req.method === 'GET' || req.is('application/json') ? next() : res.status(415).json({ error: 'JSON only.' })));

// ---- Auth API ----
app.post('/api/signup', authLimit, (req, res) => {
  const v = validateSignup(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const id = db.prepare('INSERT INTO users(username,email,hash) VALUES(?,?,?)').run(v.username, v.email, hashPw(v.password)).lastInsertRowid;
    startSession(req, res, id); audit(req, id, 'signup');
    res.status(201).json({ ok: true });
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'That username or email is already taken.' });
    throw e;
  }
});
app.post('/api/login', authLimit, async (req, res) => {
  const id = str(req.body && req.body.identifier).toLowerCase().slice(0, 254), pw = req.body && req.body.password;
  if (!id || typeof pw !== 'string' || pw.length > 72) return res.status(400).json({ error: 'Enter your username/email and password.' });
  const u = db.prepare('SELECT id, hash, totp_on FROM users WHERE username=? OR email=?').get(id, id);
  try { if (Number(await store.get('fail:' + id)) >= 5) { if (u) audit(req, u.id, 'lockout'); return res.status(429).json({ error: 'Account temporarily locked. Try again in 15 minutes.' }); } } catch {}
  const ok = verifyPw(pw, u ? u.hash : DUMMY);
  if (!u || !ok) { // lockout counter: 5 failures in 15 minutes
    const n = await store.incr('fail:' + id, 900).catch(() => 0);
    if (u) audit(req, u.id, n >= 5 ? 'lockout' : 'login_fail');
    return res.status(401).json({ error: 'Wrong username/email or password.' }); // same message for both cases
  }
  await store.del('fail:' + id).catch(() => {});
  if (ok === 'legacy') db.prepare('UPDATE users SET hash=? WHERE id=?').run(hashPw(pw), u.id); // upgrade old hashes silently
  if (u.totp_on) { // password was right but the account needs a second factor: hand out a short-lived, single-purpose ticket, no session yet
    const ticket = crypto.randomBytes(24).toString('hex');
    try { await store.set('tfa:' + ticket, String(u.id), 300); } catch { return res.status(503).json({ error: 'Try again.' }); }
    return res.json({ need2fa: true, ticket });
  }
  startSession(req, res, u.id); audit(req, u.id, 'login_ok');
  res.json({ ok: true });
});
app.post('/api/login/2fa', tfaLimit, async (req, res) => {
  const { ticket, code } = req.body || {};
  if (typeof ticket !== 'string' || !/^[a-f0-9]{48}$/.test(ticket) || typeof code !== 'string' || code.length > 20) return res.status(400).json({ error: 'Enter your 6-digit code.' });
  let uid; try { uid = Number(await store.get('tfa:' + ticket)); } catch { return res.status(503).json({ error: 'Try again.' }); }
  if (!uid) return res.status(401).json({ error: 'That sign-in expired. Enter your password again.', expired: true });
  try { if (Number(await store.get('fail2fa:' + uid)) >= 5) { audit(req, uid, 'lockout'); return res.status(429).json({ error: 'Too many wrong codes. Try again in 15 minutes.' }); } } catch {}
  const u = db.prepare('SELECT id, totp_secret, totp_on, recovery FROM users WHERE id=?').get(uid);
  const how = u && u.totp_on ? await checkSecondFactor(u, code) : null;
  if (!how) {
    const n = await store.incr('fail2fa:' + uid, 900).catch(() => 0);
    audit(req, uid, '2fa_fail'); if (n >= 5) await store.del('tfa:' + ticket).catch(() => {});
    return res.status(401).json({ error: 'That code is not right.' });
  }
  await store.del('tfa:' + ticket).catch(() => {}); await store.del('fail2fa:' + uid).catch(() => {});
  startSession(req, res, uid); audit(req, uid, how === 'recovery' ? 'login_recovery' : 'login_ok');
  res.json({ ok: true, recovery: how === 'recovery' });
});
app.post('/api/logout', (req, res) => { if (req.sid) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sid); res.clearCookie('sid'); res.json({ ok: true }); });
app.get('/api/me', needUser, (req, res) => res.json(req.user));

// ---- Two-factor authentication (TOTP, RFC 6238: works with Google Authenticator, Authy, 1Password, ...) ----
// The shared secret is encrypted at rest (AES-256-GCM, key derived from PEPPER); recovery codes are stored only as SHA-256 hashes.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = (buf) => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const b32dec = (str) => { let bits = ''; for (const c of str.replace(/=+$/, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const hotp = (key, step) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', key).update(c).digest(), o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
const KEK = crypto.createHash('sha256').update('2fa-secret:' + PEPPER).digest();
const seal = (txt) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEK, iv), ct = Buffer.concat([c.update(txt, 'utf8'), c.final()]); return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join('.'); };
const unseal = (blob) => { const [iv, tag, ct] = String(blob).split('.').map((x) => Buffer.from(x, 'base64')), d = crypto.createDecipheriv('aes-256-gcm', KEK, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); };
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function totpOk(userId, secretB32, code) { // accepts the current 30s window +-1, and refuses to accept the same code twice
  if (!/^\d{6}$/.test(code)) return false;
  const key = b32dec(secretB32), now = Math.floor(Date.now() / 3e4);
  for (const d of [0, -1, 1]) if (eq(hotp(key, now + d), code)) {
    try { if (await store.get('totp:' + userId + ':' + (now + d))) return false; await store.set('totp:' + userId + ':' + (now + d), 1, 120); } catch {}
    return true;
  }
  return false;
}
async function checkSecondFactor(u, raw) { // returns 'totp', 'recovery' or null
  const code = String(raw).replace(/[\s-]/g, '').toLowerCase();
  if (await totpOk(u.id, unseal(u.totp_secret), code)) return 'totp';
  const list = JSON.parse(u.recovery || '[]'), h = sha(code), i = list.indexOf(h);
  if (/^[a-z0-9]{10}$/.test(code) && i >= 0) { list.splice(i, 1); db.prepare('UPDATE users SET recovery=? WHERE id=?').run(JSON.stringify(list), u.id); return 'recovery'; } // each recovery code works once
  return null;
}
const newRecovery = () => Array.from({ length: 8 }, () => { const t = crypto.randomBytes(8).toString('hex').slice(0, 10); return t.slice(0, 5) + '-' + t.slice(5); });
const saveRecovery = (userId, codes) => db.prepare('UPDATE users SET recovery=? WHERE id=?').run(JSON.stringify(codes.map((c) => sha(c.replace('-', '')))), userId);
const pwCheck = (userId, pw) => typeof pw === 'string' && pw.length <= 72 && !!verifyPw(pw, db.prepare('SELECT hash FROM users WHERE id=?').get(userId).hash);
const twofaRow = (id) => db.prepare('SELECT id, username, totp_secret, totp_on, recovery FROM users WHERE id=?').get(id);

app.post('/api/2fa/setup', tfaLimit, needUser, async (req, res) => { // step 1: password check, then a fresh secret (not active until a code proves the app works)
  const u = twofaRow(req.user.id);
  if (u.totp_on) return res.status(409).json({ error: 'Two-factor authentication is already on.' });
  if (!pwCheck(u.id, (req.body || {}).password)) return res.status(403).json({ error: 'Password is wrong.' });
  const secret = b32enc(crypto.randomBytes(20));
  db.prepare('UPDATE users SET totp_secret=?, totp_on=0 WHERE id=?').run(seal(secret), u.id);
  const uri = 'otpauth://totp/' + encodeURIComponent('Coin Drift:' + u.username) + '?secret=' + secret + '&issuer=' + encodeURIComponent('Coin Drift') + '&algorithm=SHA1&digits=6&period=30';
  res.json({ secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: '#0a1230', light: '#ffffff' } }) });
});
app.post('/api/2fa/enable', tfaLimit, needUser, async (req, res) => { // step 2: prove the authenticator works, then hand out one-time recovery codes
  const u = twofaRow(req.user.id);
  if (u.totp_on || !u.totp_secret) return res.status(409).json({ error: 'Start the setup again.' });
  if (!(await totpOk(u.id, unseal(u.totp_secret), String((req.body || {}).code || '').replace(/\s/g, '')))) return res.status(400).json({ error: 'That code is not right. Check the time on your phone and try again.' });
  const codes = newRecovery(); saveRecovery(u.id, codes);
  db.prepare('UPDATE users SET totp_on=1 WHERE id=?').run(u.id); audit(req, u.id, '2fa_on');
  res.json({ ok: true, codes });
});
app.post('/api/2fa/disable', tfaLimit, needUser, async (req, res) => {
  const u = twofaRow(req.user.id), { password, code } = req.body || {};
  if (!u.totp_on) return res.status(409).json({ error: 'Two-factor authentication is not on.' });
  if (!pwCheck(u.id, password)) return res.status(403).json({ error: 'Password is wrong.' });
  if (!(await checkSecondFactor(u, String(code || '')))) return res.status(403).json({ error: 'That code is not right.' });
  db.prepare('UPDATE users SET totp_on=0, totp_secret=NULL, recovery=NULL WHERE id=?').run(u.id); audit(req, u.id, '2fa_off');
  res.json({ ok: true });
});
app.post('/api/2fa/recovery', tfaLimit, needUser, async (req, res) => { // new set of recovery codes (invalidates the old ones)
  const u = twofaRow(req.user.id), { password, code } = req.body || {};
  if (!u.totp_on) return res.status(409).json({ error: 'Turn on two-factor authentication first.' });
  if (!pwCheck(u.id, password)) return res.status(403).json({ error: 'Password is wrong.' });
  if (!(await checkSecondFactor(u, String(code || '')))) return res.status(403).json({ error: 'That code is not right.' });
  const codes = newRecovery(); saveRecovery(u.id, codes); audit(req, u.id, '2fa_recovery_new');
  res.json({ ok: true, codes });
});

// ---- Game API: save a finished run, read dashboard data ----
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// One-time run tokens: issued when a run starts, consumed (deleted) when it is saved -> no replay, and play time must be plausible.
app.post('/api/runs/start', scoreLimit, needUser, async (req, res) => {
  const t = crypto.randomBytes(16).toString('hex');
  try { await store.set('run:' + t, req.user.id + ':' + Date.now(), 7200); res.json({ token: t }); } catch { res.status(503).json({ error: 'Try again.' }); }
});
app.post('/api/runs', scoreLimit, needUser, async (req, res) => {
  const { score, coins, timeMs, levelReached, stars, completed, token } = req.body || {};
  let started = null;
  try {
    const v = typeof token === 'string' && /^[a-f0-9]{32}$/.test(token) ? await store.getdel('run:' + token) : null;
    if (v && Number(String(v).split(':')[0]) === req.user.id) started = Number(String(v).split(':')[1]);
  } catch { return res.status(503).json({ error: 'Try again.' }); }
  if (!started) { audit(req, req.user.id, 'run_rejected'); return res.status(400).json({ error: 'Invalid or reused run token.' }); }
  const sane = int(levelReached, 1, 5) && int(coins, 0, 100) && int(stars, 0, 3 * levelReached) && int(timeMs, 0, 36e5) && typeof completed === 'boolean'
    && int(score, 0, coins * 100 + stars * 250 + levelReached * 2000) && (coins === 0 || timeMs >= coins * 500); // rejects impossible scores
  if (!sane || Date.now() - started < timeMs - 30000) { audit(req, req.user.id, 'run_rejected'); return res.status(400).json({ error: 'Invalid run.' }); } // 30s slack for magnet penalties
  db.prepare('INSERT INTO runs(user_id,score,coins,time_ms,level_reached,stars,completed) VALUES(?,?,?,?,?,?,?)').run(req.user.id, score, coins, timeMs, levelReached, stars, completed ? 1 : 0);
  res.status(201).json({ ok: true });
});
// ---- Dashboard data: everything is computed server-side from the player's runs ----
const TITLES = ['Rookie', 'Drifter', 'Coin Hunter', 'Sky Runner', 'Cube Master', 'Legend'];
const ACH = [
  ['first', 'First Steps', 'Finish your first run', (s) => s.runs >= 1],
  ['ember', 'Ember Walker', 'Reach Ember Ruins (level 2)', (s) => s.maxLevel >= 2],
  ['frost', 'Frost Skater', 'Reach Frostfield (level 3)', (s) => s.maxLevel >= 3],
  ['storm', 'Storm Chaser', 'Reach Storm Spire (level 4)', (s) => s.maxLevel >= 4],
  ['void', 'Void Walker', 'Reach Void Core (level 5)', (s) => s.maxLevel >= 5],
  ['clear', 'Champion', 'Clear all 5 worlds', (s) => s.wins >= 1],
  ['perfect', 'Perfectionist', 'Earn 12 stars in one run', (s) => s.maxStars >= 12],
  ['speed', 'Speed Demon', 'Clear a full run in under 5 minutes', (s) => s.bestTime != null && s.bestTime < 3e5],
  ['hoard', 'Coin Hoarder', 'Collect 100 coins', (s) => s.coins >= 100],
  ['rich', 'High Roller', 'Score 6000+ in one run', (s) => s.bestScore >= 6000],
  ['vet', 'Veteran', 'Play 25 runs', (s) => s.runs >= 25],
  ['streak', 'On Fire', 'Play 3 days in a row', (s) => s.streak >= 3],
];
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
function streakOf(days) { // consecutive UTC days ending today (or yesterday)
  const set = new Set(days); let d = Date.now(), n = 0;
  if (!set.has(dayKey(d))) d -= 864e5;
  while (set.has(dayKey(d))) { n++; d -= 864e5; }
  return n;
}
const board = (period) => db.prepare(`SELECT u.username, MAX(r.score) score, MAX(r.level_reached) level, COUNT(*) runs FROM runs r JOIN users u ON u.id=r.user_id ${period === 'week' ? "WHERE r.created_at >= datetime('now','-7 days')" : ''} GROUP BY u.id ORDER BY score DESC LIMIT 10`).all();

app.get('/api/dashboard', needUser, (req, res) => {
  const rows = db.prepare('SELECT score, coins, time_ms timeMs, level_reached level, stars, completed, created_at date FROM runs WHERE user_id=? ORDER BY id DESC LIMIT 500').all(req.user.id);
  const won = rows.filter((r) => r.completed);
  const st = { runs: rows.length, wins: won.length, coins: 0, totalScore: 0, bestScore: 0, maxStars: 0, maxLevel: 0, bestTime: won.length ? Math.min(...won.map((r) => r.timeMs)) : null };
  rows.forEach((r) => { st.coins += r.coins; st.totalScore += r.score; st.bestScore = Math.max(st.bestScore, r.score); st.maxStars = Math.max(st.maxStars, r.stars); st.maxLevel = Math.max(st.maxLevel, r.level); });
  st.avgScore = rows.length ? Math.round(st.totalScore / rows.length) : 0;
  st.winRate = rows.length ? Math.round((st.wins / rows.length) * 100) : 0;
  st.streak = streakOf(rows.map((r) => r.date.slice(0, 10)));
  const lvl = Math.floor(Math.sqrt(st.totalScore / 150)) + 1; // player level from lifetime score (XP)
  const level = { n: lvl, title: TITLES[Math.min(lvl - 1, TITLES.length - 1)], xp: st.totalScore, from: 150 * (lvl - 1) ** 2, to: 150 * lvl ** 2 };
  const rank = rows.length ? db.prepare('SELECT COUNT(*)+1 n FROM (SELECT MAX(score) m FROM runs GROUP BY user_id) WHERE m > ?').get(st.bestScore).n : null;
  const players = db.prepare('SELECT COUNT(DISTINCT user_id) n FROM runs').get().n;
  const joined = db.prepare('SELECT created_at FROM users WHERE id=?').get(req.user.id).created_at;
  const accent = db.prepare('SELECT accent FROM users WHERE id=?').get(req.user.id).accent || '#ffcf5c';
  const todayRuns = rows.filter((r) => r.date.slice(0, 10) === dayKey(Date.now()));
  const quests = [ // daily quests, recomputed from today's runs
    { id: 'play', name: 'Warm-up', desc: 'Play 2 runs today', cur: todayRuns.length, goal: 2, xp: 100 },
    { id: 'coins', name: 'Coin rush', desc: 'Collect 30 coins today', cur: todayRuns.reduce((a, r) => a + r.coins, 0), goal: 30, xp: 150 },
    { id: 'clear', name: 'Finisher', desc: 'Clear a full run today', cur: todayRuns.filter((r) => r.completed).length, goal: 1, xp: 250 }];
  const heat = {}; rows.forEach((r) => { const k = r.date.slice(0, 10); heat[k] = (heat[k] || 0) + 1; });
  const records = { score: st.bestScore, fastest: st.bestTime, coins: Math.max(0, ...rows.map((r) => r.coins)), stars: st.maxStars, level: Math.max(0, ...rows.map((r) => r.level)) };
  const rival = rows.length ? db.prepare('SELECT u.username, MAX(r.score) m FROM runs r JOIN users u ON u.id=r.user_id GROUP BY u.id HAVING m > ? ORDER BY m ASC LIMIT 1').get(st.bestScore) : null;
  const byLevel = db.prepare('SELECT level_reached lvl, COUNT(*) runs, MAX(score) best, SUM(completed) wins FROM runs WHERE user_id=? GROUP BY level_reached').all(req.user.id);
  const me = db.prepare('SELECT totp_on, email FROM users WHERE id=?').get(req.user.id), twofa = !!me.totp_on;
  const [mail, dom] = me.email.split('@'), email = mail[0] + '***@' + dom; // only a masked address ever reaches the browser
  res.json({ user: { ...req.user, joined, accent, twofa, email }, byLevel, quests, heat, records, rival: rival ? { username: rival.username, gap: rival.m - st.bestScore } : null, stats: st, level, rank, players,
    achievements: ACH.map(([id, name, desc, test]) => ({ id, name, desc, unlocked: !!test(st) })),
    trend: rows.slice(0, 30).reverse().map((r) => ({ score: r.score, coins: r.coins, timeMs: r.timeMs, date: r.date })), recent: rows.slice(0, 10), board: board('all') });
});
app.get('/api/leaderboard', needUser, async (req, res) => { // cached 30s in the store so busy boards don't hit the database
  const p = req.query.period === 'week' ? 'week' : 'all';
  try { const c = await store.get('lb:' + p); if (c) return res.json(JSON.parse(c)); } catch {}
  const rows = board(p); store.set('lb:' + p, JSON.stringify(rows), 30).catch(() => {}); res.json(rows);
});
// ---- Security center: active sessions and audit trail ----
app.get('/api/security', needUser, (req, res) => {
  const sessions = db.prepare('SELECT rowid id, ip, ua, created, seen, token_hash=? current FROM sessions WHERE user_id=? AND expires>? AND (seen IS NULL OR seen>?) ORDER BY rowid DESC').all(req.sid, req.user.id, Date.now(), Date.now() - IDLE_MS);
  const log = db.prepare('SELECT event, ip, ua, created_at date FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 20').all(req.user.id);
  const me = db.prepare('SELECT totp_on, recovery FROM users WHERE id=?').get(req.user.id);
  res.json({ sessions, log, redis: redisOn, twofa: !!me.totp_on, recoveryLeft: me.totp_on ? JSON.parse(me.recovery || '[]').length : 0, secureCookie: COOKIE_SECURE, idleHours: Math.round(IDLE_MS / 36e5) });
});
app.post('/api/sessions/revoke', scoreLimit, needUser, (req, res) => {
  const id = (req.body || {}).id;
  if (id === 'others') db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(req.user.id, req.sid);
  else if (Number.isInteger(id)) db.prepare('DELETE FROM sessions WHERE rowid=? AND user_id=? AND token_hash!=?').run(id, req.user.id, req.sid);
  else return res.status(400).json({ error: 'Bad request.' });
  audit(req, req.user.id, 'session_revoked'); res.json({ ok: true });
});
// ---- Dashboard extras: profile colour, run history with filters, CSV export ----
app.post('/api/profile', scoreLimit, needUser, (req, res) => {
  const a = (req.body || {}).accent;
  if (typeof a !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(a)) return res.status(400).json({ error: 'Invalid colour.' });
  db.prepare('UPDATE users SET accent=? WHERE id=?').run(a, req.user.id); res.json({ ok: true });
});
app.get('/api/history', needUser, (req, res) => {
  const where = req.query.filter === 'cleared' ? ' AND completed=1' : req.query.filter === 'fell' ? ' AND completed=0' : ''; // whitelisted fragments only
  const order = req.query.sort === 'score' ? 'score DESC, id DESC' : 'id DESC';
  const page = Math.min(1000, Math.max(0, parseInt(req.query.page, 10) || 0));
  const total = db.prepare('SELECT COUNT(*) n FROM runs WHERE user_id=?' + where).get(req.user.id).n;
  const rows = db.prepare('SELECT score, coins, time_ms timeMs, level_reached level, stars, completed, created_at date FROM runs WHERE user_id=?' + where + ' ORDER BY ' + order + ' LIMIT 10 OFFSET ?').all(req.user.id, page * 10);
  res.json({ rows, total, pages: Math.max(1, Math.ceil(total / 10)) });
});
app.get('/api/export.csv', needUser, (req, res) => {
  const rows = db.prepare('SELECT created_at, score, coins, time_ms, level_reached, stars, completed FROM runs WHERE user_id=? ORDER BY id').all(req.user.id);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="coin-drift-runs.csv"' });
  res.send(['date,score,coins,time_ms,level,stars,completed', ...rows.map((r) => Object.values(r).join(','))].join('\n')); // numeric/date values only
});
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---- Account settings ----
const pwOk = (p, name) => typeof p === 'string' && p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p) && !weakPw(p, name);
const checkPw = (userId, pw) => typeof pw === 'string' && pw.length <= 72 && !!verifyPw(pw, db.prepare('SELECT hash FROM users WHERE id=?').get(userId).hash);
async function needSecondFactor(req, res) { // sensitive actions ask for a fresh code too when 2FA is on; returns true if the request was already answered
  const u = twofaRow(req.user.id); if (!u.totp_on) return false;
  if (await checkSecondFactor(u, String((req.body || {}).code || ''))) return false;
  res.status(403).json({ error: 'Enter a valid 6-digit code from your authenticator app.', need2fa: true }); return true;
}
app.post('/api/password', authLimit, needUser, async (req, res) => {
  const { current, next } = req.body || {};
  if (!pwOk(next, req.user.username)) return res.status(400).json({ error: 'New password: 8-72 characters with a letter and a number, not a common password and not containing your username.' });
  if (!checkPw(req.user.id, current)) return res.status(403).json({ error: 'Current password is wrong.' });
  if (await needSecondFactor(req, res)) return;
  db.prepare('UPDATE users SET hash=? WHERE id=?').run(hashPw(next), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(req.user.id, req.sid); // sign out every other device
  audit(req, req.user.id, 'password_change');
  res.json({ ok: true });
});
app.post('/api/account/delete', authLimit, needUser, async (req, res) => {
  if (!checkPw(req.user.id, (req.body || {}).password)) return res.status(403).json({ error: 'Password is wrong.' });
  if (await needSecondFactor(req, res)) return;
  db.prepare('DELETE FROM users WHERE id=?').run(req.user.id); // runs + sessions cascade
  res.clearCookie('sid'); res.json({ ok: true });
});

// ---- Pages (dashboard and game are only served to signed-in users) ----
const view = (f) => (req, res) => res.sendFile(path.join(__dirname, 'views', f));
app.get('/', (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));
app.get(['/login', '/signup'], (req, res, next) => (req.user ? res.redirect('/dashboard') : view('auth.html')(req, res, next)));
app.get('/dashboard', (req, res, next) => (req.user ? view('dashboard.html')(req, res, next) : res.redirect('/login')));
app.get('/game', (req, res, next) => (req.user ? view('game.html')(req, res, next) : res.redirect('/login')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { // never leak stack traces
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'Bad request.' });
  console.error(err); res.status(500).json({ error: 'Server error.' });
});
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()), 36e5).unref();
app.listen(PORT, () => console.log('Coin Drift on http://localhost:' + PORT));
