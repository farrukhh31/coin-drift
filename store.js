// Key-value store for rate limits, login lockout and one-time run tokens.
// Uses Redis when REDIS_URL is set (shared across servers, survives restarts); otherwise an in-memory Map (dev only).
const rateLimit = require('express-rate-limit');
let client = null;
if (process.env.REDIS_URL) {
  client = require('redis').createClient({ url: process.env.REDIS_URL });
  client.on('error', (e) => console.error('[redis]', e.message));
  client.connect().catch(() => {}); // commands queue until connected
  console.log('Redis store enabled');
} else console.log('Redis not configured: using in-memory store (development only)');

const mem = new Map();
const live = (k) => { const e = mem.get(k); if (!e) return null; if (e.x < Date.now()) { mem.delete(k); return null; } return e; };
const store = client ? {
  get: (k) => client.get(k), set: (k, v, s) => client.set(k, String(v), { EX: s }), del: (k) => client.del(k), getdel: (k) => client.getDel(k),
  incr: async (k, s) => { const n = await client.incr(k); if (n === 1) await client.expire(k, s); return n; },
} : {
  get: async (k) => (live(k) ? live(k).v : null),
  set: async (k, v, s) => { mem.set(k, { v: String(v), x: Date.now() + s * 1000 }); },
  del: async (k) => { mem.delete(k); },
  getdel: async (k) => { const e = live(k); mem.delete(k); return e ? e.v : null; },
  incr: async (k, s) => { const e = live(k); const n = e ? Number(e.v) + 1 : 1; mem.set(k, { v: String(n), x: e ? e.x : Date.now() + s * 1000 }); return n; },
};
function limiter(windowMs, limit, message, prefix) {
  const o = { windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message } };
  if (client) { const { RedisStore } = require('rate-limit-redis'); o.store = new RedisStore({ sendCommand: (...a) => client.sendCommand(a), prefix: 'rl:' + prefix + ':' }); o.passOnStoreError = true; }
  return rateLimit(o);
}
module.exports = { store, limiter, redisOn: !!client };
