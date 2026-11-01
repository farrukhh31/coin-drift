// Coin Drift dashboard. All user data is inserted as text nodes (never innerHTML), so nothing a player types can inject markup.
'use strict';
const $ = (id) => document.getElementById(id), NS = 'http://www.w3.org/2000/svg';
const h = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; kids.flat().forEach((k) => k != null && k !== false && e.append(k)); return e; };
const sv = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
const fmt = (ms) => (ms == null ? '--' : Math.floor(ms / 6e4) + ':' + ((ms % 6e4) / 1e3).toFixed(1).padStart(4, '0'));
const when = (d) => new Date(String(d).replace(' ', 'T') + (/[zZ]|\+/.test(d) ? '' : 'Z'));
const ago = (d) => { if (!d) return 'never'; const s = (Date.now() - when(d)) / 1e3; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
const api = async (url, method = 'GET', body) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (r.status === 401 && !/\/api\/(2fa|password|account)/.test(url)) { location.href = '/login'; throw new Error('Signed out'); }
  const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.error || 'Something went wrong.'); e.data = d; throw e; } return d;
};
function toast(msg, type = 'ok') {
  const t = h('div', 'toast ' + type, icon(type === 'ok' ? 'check' : 'alert'), msg); $('toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2800);
}
function countUp(el, to, suf = '') { if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to + suf; return; } const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 1000); el.textContent = Math.round(to * (1 - (1 - k) ** 4)) + suf; if (k < 1) requestAnimationFrame(f); })(t0); }

// ---------- icons ----------
const IC = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', runs: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  play: 'M6 4l14 8-14 8z', moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z', out: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9', coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4',
  flame: 'M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  lock: 'M6 11h12v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zM8 11V8a4 4 0 0 1 8 0v3', key: 'M14 10a4 4 0 1 0-3.9-3.1L3 14v4h4v-2h2v-2h2l1.9-1.9A4 4 0 0 0 14 10z', phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  monitor: 'M3 5h18v11H3zM8 21h8M12 16v5', alert: 'M12 3l10 18H2zM12 10v5M12 18h.01', check: 'M5 12l5 5 9-10', x: 'M6 6l12 12M18 6L6 18', copy: 'M9 9h11v11H9zM5 15V5h10', download: 'M12 3v12M7 11l5 5 5-5M4 21h16',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5', cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12L4 7.5M12 12v9',
};
const icon = (n) => { const s = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'ic', 'aria-hidden': 'true' }); s.append(sv('path', { d: IC[n] || IC.star })); return s; };
const chip3d = (ic, color) => { const c = h('div', 'chip3d', icon(ic)); if (color) c.style.setProperty('--c', color); return c; };

// ---------- theme, accent, 3D effects ----------
let theme = 'dark', fx = null;
try { theme = localStorage.getItem('theme') || 'dark'; fx = localStorage.getItem('fx'); } catch {}
if (!fx) fx = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'on'; // reduced-motion users start with effects off
const setTheme = (t) => { theme = t; document.documentElement.dataset.theme = t; try { localStorage.setItem('theme', t); } catch {} };
const setAccent = (a) => { document.documentElement.style.setProperty('--acc', a); heroCtl && heroCtl.color(a); };
const setFx = (on) => { fx = on ? 'on' : 'off'; document.documentElement.dataset.fx = fx; try { localStorage.setItem('fx', fx); } catch {} if (D) go(); };
setTheme(theme); document.documentElement.dataset.fx = fx;

// ---------- 3D scenes (dash3d.js); the CSS fallbacks stay if WebGL is missing ----------
let heroCtl = null;
const stopHero = () => { if (heroCtl) heroCtl.stop(); heroCtl = null; };
function startHero(stage, canvas) {
  if (fx === 'off' || !window.D3D) return;
  requestAnimationFrame(() => { if (!stage.isConnected) return; heroCtl = D3D.hero(canvas, getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#ffcf5c'); if (heroCtl) stage.classList.add('ready'); else canvas.remove(); });
}
if (window.D3D && !D3D.background($('bg3d'))) $('bg3d').remove();

// ---------- shared pieces ----------
let D = null, ti = 0;
const WORLDS = [['Neon Night', '#36e0ff'], ['Ember Ruins', '#ff8a2a'], ['Frostfield', '#7fdcff'], ['Storm Spire', '#ffe45c'], ['Void Core', '#ff4adf']];
const tile = (cls, ...k) => { const t = h('div', 'tile ' + cls, ...k); t.style.setProperty('--i', ti++); return t; };
const grid = (...k) => { ti = 0; return h('div', 'grid12', ...k); };
function table(head, rows) {
  const t = h('table'), tr = t.createTHead().insertRow(); head.forEach((x) => tr.append(h('th', '', x)));
  const tb = t.createTBody(); rows.forEach((r) => { const row = tb.insertRow(); r.forEach((c) => { const td = row.insertCell(); c instanceof Node ? td.append(c) : (td.textContent = c); }); });
  if (!rows.length) { const td = tb.insertRow().insertCell(); td.colSpan = head.length; td.className = 'mut'; td.textContent = 'Nothing here yet. Play a run!'; } return h('div', 'tscroll', t);
}
function seg(items, on, cb) { const w = h('div', 'seg', ''); items.forEach(([k, l]) => { const b = h('button', k === on ? 'on' : '', l); b.type = 'button'; b.onclick = () => { [...w.children].forEach((x) => (x.className = '')); b.className = 'on'; cb(k); }; w.append(b); }); return w; }
function spark(vals, color = 'var(--acc)') {
  const W = 120, H = 38, s = sv('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  if (vals.length < 2) return s;
  const max = Math.max(...vals, 1), min = Math.min(...vals), rng = max - min || 1, pts = vals.map((v, i) => [(i * W) / (vals.length - 1), H - 4 - ((v - min) / rng) * (H - 10)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const g = sv('linearGradient', { id: 'sg' + Math.random().toString(36).slice(2, 7), x1: 0, y1: 0, x2: 0, y2: 1 }); g.append(sv('stop', { offset: 0, 'stop-color': color, 'stop-opacity': .35 }), sv('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 }));
  const defs = sv('defs'); defs.append(g); s.append(defs, sv('path', { d: d + `L${W} ${H}L0 ${H}Z`, fill: `url(#${g.id})`, stroke: 'none' }), sv('path', { d, stroke: color, 'stroke-width': 2.4 }));
  return s;
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function delta(vals) { // last 5 vs the 5 before: a chip like "+12%"
  if (vals.length < 6) return null; const a = avg(vals.slice(-5)), b = avg(vals.slice(-10, -5)); if (!b) return null; const p = Math.round(((a - b) / b) * 100);
  return h('span', 'delta ' + (p >= 0 ? 'up' : 'dn'), (p >= 0 ? '▲ +' : '▼ ') + p + '%');
}
function trendChart(trend, key, mode) {
  if (trend.length < 2) return h('div', 'empty', 'Play at least 2 runs to unlock your performance chart.');
  const val = (t) => (key === 'sec' ? t.timeMs / 1000 : t[key]), unit = (v) => (key === 'sec' ? v.toFixed(1) + ' s' : v + (key === 'score' ? ' pts' : ' coins'));
  const W = 640, H = 250, P = 34, bars = mode === 'bars', data = bars ? trend.slice(-14) : trend, max = Math.max(...data.map(val), 1), n = data.length;
  const box = h('div', 'pos'), svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Performance chart' }), tip = h('div', 'tip');
  [0, .5, 1].forEach((f) => { const yy = H - P - f * (H - 2 * P - 14); svg.append(sv('line', { x1: P, x2: W - P, y1: yy, y2: yy, stroke: 'var(--line)' })); const tx = sv('text', { x: 2, y: yy + 4, fill: 'var(--mut)', 'font-size': 11 }); tx.textContent = Math.round(max * f); svg.append(tx); });
  const yv = (v) => H - P - (v / max) * (H - 2 * P - 14);
  if (bars) { // extruded 3D bars: front face, lit top face, shaded side face
    const bw = (W - 2 * P) / n, d = Math.min(12, bw * .28);
    data.forEach((t, i) => {
      const w = bw * .6, x = P + i * bw + bw * .12, y = yv(val(t)), hh = H - P - y, g = sv('g', { class: 'bar3' }); g.style.animationDelay = i * 45 + 'ms';
      g.append(sv('rect', { class: 'b-front', x, y, width: w, height: Math.max(2, hh), rx: 2 }),
        sv('polygon', { class: 'b-top', points: `${x},${y} ${x + d},${y - d * .6} ${x + w + d},${y - d * .6} ${x + w},${y}` }),
        sv('polygon', { class: 'b-side', points: `${x + w},${y} ${x + w + d},${y - d * .6} ${x + w + d},${y + hh - d * .6} ${x + w},${y + hh}` }));
      g.addEventListener('pointerenter', () => { tip.textContent = unit(val(t)) + '  ·  ' + ago(t.date); tip.style.left = ((x + w / 2) / W) * 100 + '%'; tip.style.top = (y / H) * 100 + '%'; tip.style.opacity = 1; });
      g.addEventListener('pointerleave', () => (tip.style.opacity = 0)); svg.append(g);
    });
  } else {
    const x = (i) => P + (i * (W - 2 * P)) / (n - 1), pts = data.map((t, i) => [x(i), yv(val(t))]), line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const g = sv('linearGradient', { id: 'ag', x1: 0, y1: 0, x2: 0, y2: 1 }); g.append(sv('stop', { offset: 0, 'stop-color': 'var(--acc)', 'stop-opacity': .5 }), sv('stop', { offset: 1, 'stop-color': 'var(--acc)', 'stop-opacity': 0 })); const defs = sv('defs'); defs.append(g); svg.append(defs);
    const area = sv('path', { d: line + `L${x(n - 1)} ${H - P}L${P} ${H - P}Z`, fill: 'url(#ag)' }), ln = sv('path', { d: line, fill: 'none', stroke: 'var(--acc)', 'stroke-width': 3.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', style: 'filter:drop-shadow(0 6px 8px color-mix(in srgb,var(--acc) 60%,transparent))' });
    const len = 2600; ln.style.cssText += `;stroke-dasharray:${len};stroke-dashoffset:${len};transition:stroke-dashoffset 1.4s ease`; setTimeout(() => (ln.style.strokeDashoffset = 0), 60);
    const cross = sv('line', { y1: P - 8, y2: H - P, stroke: 'var(--acc)', 'stroke-dasharray': '4 4', opacity: 0 }), dot = sv('circle', { r: 6.5, fill: 'var(--acc)', stroke: '#fff', 'stroke-width': 2, opacity: 0 });
    svg.append(area, ln, cross, dot);
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round((((e.clientX - r.left) / r.width) * W - P) / ((W - 2 * P) / (n - 1)))));
      cross.setAttribute('x1', pts[i][0]); cross.setAttribute('x2', pts[i][0]); dot.setAttribute('cx', pts[i][0]); dot.setAttribute('cy', pts[i][1]); cross.setAttribute('opacity', 1); dot.setAttribute('opacity', 1);
      tip.textContent = unit(val(data[i])) + '  ·  ' + ago(data[i].date); tip.style.left = (pts[i][0] / W) * 100 + '%'; tip.style.top = (pts[i][1] / H) * 100 + '%'; tip.style.opacity = 1;
    });
    svg.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); tip.style.opacity = 0; });
  }
  box.append(svg, tip); return box;
}
function heatmap() {
  const days = 84, today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today - (days - 1) * 864e5), lead = (start.getUTCDay() + 6) % 7, g = h('div', 'heat');
  for (let i = 0; i < lead; i++) g.append(h('i', 'x'));
  for (let i = 0; i < days; i++) { const k = new Date(+start + i * 864e5).toISOString().slice(0, 10), c = D.heat[k] || 0, e = h('i', c ? 'l' + (c > 4 ? 4 : c > 2 ? 3 : c > 1 ? 2 : 1) : ''); e.title = c + (c === 1 ? ' run' : ' runs') + '  ' + k; g.append(e); }
  return g;
}

// ---------- views ----------
function overview() {
  const { user, stats: s, level: L } = D, hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const rival = D.rival ? D.rival.gap + ' pts to pass ' + D.rival.username + ' on the leaderboard.' : D.rank === 1 ? 'You hold the top score. Defend it!' : 'Finish a run to enter the leaderboard.';
  const play = h('a', 'play', icon('play'), s.runs ? 'Continue playing' : 'Play your first run'); play.href = '/game';
  const pct = Math.max(0, Math.min(1, (L.xp - L.from) / (L.to - L.from))), xpb = h('div'); setTimeout(() => (xpb.style.width = Math.max(3, pct * 100) + '%'), 200);
  const canvas = h('canvas'); canvas.setAttribute('aria-label', 'Spinning gold coin and the cube mascot. Click to flip.'); const stage = h('div', 'stage3d', h('div', 'cssCoin', 'C'), canvas); startHero(stage, canvas);
  const hero = tile('s8 hero', h('div', 'z1', h('span', 'eyebrow', greet), h('h2', '', 'Ready to drift, ' + user.username + '?'), h('p', 'mut', rival),
    h('div', 'row', play, h('span', 'chip', icon('flame'), s.streak + (s.streak === 1 ? ' day streak' : ' day streak')), h('span', 'chip cy', icon('trophy'), D.rank ? 'Rank #' + D.rank + ' of ' + D.players : 'Unranked')),
    h('div', 'xp', h('div', 'top', h('b', '', 'Lv ' + L.n + ' ' + L.title), h('span', 'mut', (L.xp - L.from).toLocaleString() + ' / ' + (L.to - L.from).toLocaleString() + ' XP')), h('div', 'bar2', xpb))), stage);
  const done = D.quests.filter((q) => q.cur >= q.goal).length;
  const quests = tile('s4', h('div', 'thead', h('h3', '', 'Daily quests'), h('span', 'chip ' + (done === 3 ? 'ok' : ''), done + '/3')),
    D.quests.map((q) => { const b = h('div'); setTimeout(() => (b.style.width = Math.min(100, (q.cur / q.goal) * 100) + '%'), 250); return h('div', 'q' + (q.cur >= q.goal ? ' done' : ''), h('div', 'top', h('b', '', q.name), h('span', 'mut', Math.min(q.cur, q.goal) + '/' + q.goal + '  +' + q.xp + ' XP')), h('div', 'bar2', b), h('span', 'mut', q.desc)); }));
  const scores = D.trend.map((t) => t.score), coins = D.trend.map((t) => t.coins), perDay = Array.from({ length: 14 }, (_, i) => D.heat[new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10)] || 0);
  const stat = (label, v, suf, ic, color, extra, line) => { const b = h('b'); typeof v === 'number' ? countUp(b, v, suf || '') : (b.textContent = v);
    return tile('s3 stat', h('div', 'head', chip3d(ic, color), extra || ''), h('span', 'mut', label), b, line || ''); };
  let key = 'score', mode = 'area'; const cbox = h('div'), draw = () => cbox.replaceChildren(trendChart(D.trend, key, mode)); draw();
  const perf = tile('s8', h('div', 'thead', h('h3', '', 'Performance'), h('div', 'row', seg([['score', 'Score'], ['coins', 'Coins'], ['sec', 'Time']], 'score', (k) => { key = k; draw(); }), seg([['area', 'Line'], ['bars', '3D bars']], 'area', (k) => { mode = k; draw(); })), ), cbox);
  perf.querySelector('.thead .row').style.margin = 0;
  const R = D.records, rec = tile('s4', h('div', 'thead', h('h3', '', 'Personal records')),
    [['Best score', R.score], ['Fastest clear', fmt(R.fastest)], ['Most coins in a run', R.coins], ['Most stars in a run', R.stars], ['Highest world', R.level + '/5']].map(([k, v]) => h('div', 'rec', h('span', 'mut', k), h('b', '', v))));
  const worlds = tile('s12', h('div', 'thead', h('h3', '', 'Worlds'), h('span', 'mut', 'You have reached world ' + Math.max(1, s.maxLevel) + ' of 5')), h('div', 'worlds', WORLDS.map(([name, c], i) => {
    const info = D.byLevel.find((l) => l.lvl === i + 1), open = i === 0 || s.maxLevel >= i + 1, cur = Math.max(1, s.maxLevel) === i + 1, b = h('div', 'wblk' + (open ? '' : ' locked') + (cur ? ' cur' : ''), h('div', 'n', 'World ' + (i + 1)), h('h4', '', name),
      h('div', 'kv', h('span', '', 'Runs ended here'), h('b', '', info ? info.runs : 0)), h('div', 'kv', h('span', '', 'Best run'), h('b', '', info ? info.best : '--')));
    if (!open) { const l = icon('lock'); l.classList.add('lk'); b.append(l); } b.style.setProperty('--c', c); return b; })));
  const act = tile('s8', h('div', 'thead', h('h3', '', 'Activity'), h('span', 'mut', 'Last 12 weeks')), heatmap());
  const tips = insights(), ins = tile('s4', h('div', 'thead', h('h3', '', 'Coach')), tips.map(([ic, c, text, link]) => { const el = h('div', 'ins', chip3d(ic, c), h('div', '', text)); if (link) { el.style.cursor = 'pointer'; el.onclick = () => (location.hash = link); } return el; }));
  const top = D.board.slice(0, 5), lb = tile('s4', h('div', 'thead', h('h3', '', 'Top players'), (() => { const a = h('a', 'mut', 'View all'); a.href = '#leaderboard'; return a; })()),
    top.length ? top.map((x, i) => h('div', 'lbrow' + (x.username === user.username ? ' me2' : ''), h('span', 'n', i + 1), h('span', '', x.username), h('span', 'sc', x.score))) : h('div', 'empty', 'No scores yet.'));
  const recent = tile('s8', h('div', 'thead', h('h3', '', 'Recent runs')), D.recent.slice(0, 5).map((r) => h('div', 'tl', h('span', 'dot' + (r.completed ? '' : ' f')), h('b', '', r.score + ' pts'), h('span', 'mut', 'World ' + r.level + '  ·  ' + r.coins + ' coins  ·  ' + fmt(r.timeMs)), h('span', 'chip ' + (r.completed ? 'ok' : 'bad'), r.completed ? 'Cleared' : 'Not cleared'), h('span', 'mut', ago(r.date)))));
  if (!D.recent.length) recent.append(h('div', 'empty', 'No runs yet. Your journey starts with one click.'));
  return grid(hero, quests,
    stat('Best score', s.bestScore, '', 'trophy', '#ffcf5c', delta(scores), spark(scores, '#ffcf5c')), stat('Runs played', s.runs, '', 'play', '#36e0ff', null, spark(perDay, '#36e0ff')),
    stat('Win rate', s.winRate, '%', 'star', '#4ade80', h('span', 'mut', s.wins + ' of ' + s.runs + ' cleared')), stat('Coins collected', s.coins, '', 'coin', '#8b6cff', delta(coins), spark(coins, '#8b6cff')),
    perf, rec, worlds, act, ins, lb, recent);
}
function insights() { // plain-language coaching computed from the data the server already sent
  const s = D.stats, out = [], sc = D.trend.map((t) => t.score);
  if (!s.runs) return [['play', '#ffcf5c', 'Play your first run to unlock personal tips, charts and achievements.']];
  if (sc.length >= 6) { const a = avg(sc.slice(-5)), b = avg(sc.slice(-10, -5)); if (b) out.push(a >= b ? ['bolt', '#4ade80', 'Your last 5 runs average ' + Math.round(a) + ' pts, up ' + Math.round(((a - b) / b) * 100) + '% on the 5 before. Keep the momentum.'] : ['alert', '#ffb347', 'Your last 5 runs average ' + Math.round(a) + ' pts, ' + Math.round(((b - a) / b) * 100) + '% below the 5 before. A warm-up run in world 1 can help.']); }
  const fav = [...D.byLevel].sort((a, b) => b.runs - a.runs)[0]; if (fav && fav.runs > 1) out.push(['cube', WORLDS[fav.lvl - 1][1], 'Most of your runs end in ' + WORLDS[fav.lvl - 1][0] + ' (' + fav.runs + ' runs). Use its power earlier to get past it.']);
  const next = D.achievements.find((a) => !a.unlocked); if (next) out.push(['trophy', '#ffcf5c', 'Next badge: ' + next.name + '. ' + next.desc + '.', 'achievements']);
  if (D.rival) out.push(['chart', '#36e0ff', D.rival.gap + ' pts separate you from ' + D.rival.username + ' on the leaderboard.', 'leaderboard']);
  if (!D.user.twofa) out.push(['shield', '#ff6a8a', 'Protect your account: turn on two-step verification in the Security center.', 'security']);
  return out.slice(0, 4);
}
function runsView() {
  const st = { f: 'all', s: 'id', p: 0 }, body = h('div'), exp = h('a', 'btn ghost sm', icon('download'), 'Export CSV'); exp.href = '/api/export.csv';
  const load = async () => {
    const d = await api(`/api/history?filter=${st.f}&sort=${st.s}&page=${st.p}`);
    const prev = h('button', 'btn ghost sm', 'Prev'), next = h('button', 'btn ghost sm', 'Next'); prev.disabled = st.p === 0; next.disabled = st.p + 1 >= d.pages;
    prev.onclick = () => { st.p--; load(); }; next.onclick = () => { st.p++; load(); };
    body.replaceChildren(table(['Score', 'World', 'Coins', 'Stars', 'Time', 'Result', 'When'], d.rows.map((r) => [r.score, r.level + '/5', r.coins, r.stars, fmt(r.timeMs), h('span', 'chip ' + (r.completed ? 'ok' : 'bad'), r.completed ? 'Cleared' : 'Not cleared'), ago(r.date)])),
      h('div', 'row', prev, h('span', 'mut', 'Page ' + (st.p + 1) + ' of ' + d.pages + '  ·  ' + d.total + ' runs'), next));
  };
  load().catch(() => {});
  return grid(tile('s12', h('div', 'thead', h('div', 'row', seg([['all', 'All'], ['cleared', 'Cleared'], ['fell', 'Not cleared']], 'all', (k) => { st.f = k; st.p = 0; load(); }), seg([['id', 'Latest'], ['score', 'Best score']], 'id', (k) => { st.s = k; st.p = 0; load(); })), exp), body));
}
function achievementsView() {
  const A = D.achievements, got = A.filter((a) => a.unlocked).length, ico = { first: 'play', ember: 'flame', frost: 'cube', storm: 'bolt', void: 'moon', clear: 'trophy', perfect: 'star', speed: 'flame', hoard: 'coin', rich: 'chart', vet: 'runs', streak: 'flame' };
  const bar = h('div'); setTimeout(() => (bar.style.width = (got / A.length) * 100 + '%'), 150);
  const g = h('div', 'ach', tile('s12 head', h('div', 'thead', h('h3', '', got + ' of ' + A.length + ' unlocked'), h('span', 'mut', 'Hover or tap a medal to flip it')), h('div', 'bar2', bar)));
  A.forEach((a, i) => { const m = h('div', 'medal' + (a.unlocked ? ' on' : ''),
    h('div', 'face front', h('div', 'disc', icon(a.unlocked ? ico[a.id] || 'star' : 'lock')), h('h3', '', a.name), h('span', 'chip ' + (a.unlocked ? 'ok' : ''), a.unlocked ? 'Unlocked' : 'Locked')),
    h('div', 'face back', h('h3', '', a.name), h('p', 'mut', a.desc), h('span', 'chip ' + (a.unlocked ? 'ok' : 'warn'), a.unlocked ? 'Earned' : 'Keep playing')));
    m.tabIndex = 0; m.style.setProperty('--i', i); m.onclick = () => m.classList.toggle('flip'); g.append(m); });
  return g;
}
function leaderboardView() {
  const box = h('div'), me = D.user.username, cols = ['#ffcf5c', '#c9d4ff', '#e0955a'];
  const draw = (rows) => {
    const order = [1, 0, 2].filter((i) => rows[i]);
    box.replaceChildren(h('div', 'podium', order.map((i) => { const p = h('div', 'pod', h('div', 'rk', ['1', '2', '3'][i]), h('b', '', rows[i].score), h('span', 'who', rows[i].username)); p.style.setProperty('--c', cols[i]); p.style.minHeight = [190, 150, 120][i] + 'px'; return p; })),
      rows.slice(3).map((x, i) => h('div', 'lbrow' + (x.username === me ? ' me2' : ''), h('span', 'n', i + 4), h('span', '', x.username), h('span', 'mut', 'World ' + x.level + '/5'), h('span', 'sc', x.score))));
    if (!rows.length) box.append(h('div', 'empty', 'No scores in this period yet.'));
  };
  draw(D.board);
  return grid(tile('s12', h('div', 'thead', h('h3', '', 'Leaderboard'), seg([['all', 'All time'], ['week', 'This week']], 'all', async (p) => draw(await api('/api/leaderboard?period=' + p)))), box));
}

// ---------- security center ----------
const LBL = { signup: 'Account created', login_ok: 'Signed in', login_fail: 'Failed sign-in', lockout: 'Account locked (too many failures)', password_change: 'Password changed', session_revoked: 'Session revoked', run_rejected: 'Suspicious run rejected',
  '2fa_on': 'Two-step verification turned on', '2fa_off': 'Two-step verification turned off', '2fa_fail': 'Wrong two-step code', login_recovery: 'Signed in with a recovery code', '2fa_recovery_new': 'New recovery codes created' };
const SEV = { login_fail: 'warn', '2fa_fail': 'warn', lockout: 'bad', run_rejected: 'warn', '2fa_off': 'warn', login_recovery: 'warn', session_revoked: 'warn', password_change: 'cy' };
const dev = (ua = '') => (/Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser') + ' on ' + (/Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown device');
const input = (ph, ac, type = 'password', max = 72) => { const i = h('input'); i.type = type; i.placeholder = ph; i.maxLength = max; i.autocomplete = ac; i.setAttribute('aria-label', ph); return i; };
const otpInput = (ph = '6-digit code') => { const i = input(ph, 'one-time-code', 'text', 20); i.inputMode = 'text'; i.className = 'otp'; i.spellcheck = false; return i; };
const copy = async (txt, label) => { try { await navigator.clipboard.writeText(txt); toast(label + ' copied'); } catch { toast('Copy failed. Select the text instead.', 'bad'); } };
const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };
function codesBox(codes, onDone) {
  const copyBtn = h('button', 'btn ghost sm', icon('copy'), 'Copy'), dl = h('button', 'btn ghost sm', icon('download'), 'Download'), done = h('button', 'btn sm', 'I have saved them');
  copyBtn.onclick = () => copy(codes.join('\n'), 'Recovery codes');
  dl.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['Coin Drift recovery codes (each works once)\n\n' + codes.join('\n') + '\n'], { type: 'text/plain' })); a.download = 'coin-drift-recovery-codes.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  done.onclick = onDone;
  return h('div', 'wiz', h('h3', '', 'Save your recovery codes'), h('p', 'mut', 'If you lose your phone, each of these signs you in once. This is the only time they are shown.'), h('div', 'codes', codes.map((c) => h('code', '', c))), h('div', 'row', copyBtn, dl, done));
}
function twofaCard(s, redo) {
  const box = h('div'), head = h('div', 'thead', h('h3', '', 'Two-step verification'), h('span', 'chip ' + (s.twofa ? 'ok' : 'bad'), s.twofa ? 'On' : 'Off')), wiz = h('div');
  const lead = h('p', 'mut', s.twofa ? 'Signing in needs your password and a 6-digit code from your authenticator app. ' + s.recoveryLeft + ' recovery code' + (s.recoveryLeft === 1 ? '' : 's') + ' left.' : 'Add a second lock. Even if someone learns your password, they cannot sign in without your phone.');
  if (!s.twofa) {
    const go = h('button', 'btn', icon('shield'), 'Set up two-step verification'); go.onclick = () => { go.hidden = true; step1(); };
    const step1 = () => { const pw = input('Confirm your password', 'current-password'), err = h('div', 'err'), b = h('button', 'btn', 'Continue'); const f = h('form', '', pw, err, b);
      f.onsubmit = (e) => { e.preventDefault(); err.textContent = ''; busy(b, async () => { try { step2(await api('/api/2fa/setup', 'POST', { password: pw.value })); } catch (x) { err.textContent = x.message; } }); };
      wiz.replaceChildren(h('div', 'wiz', h('div', 'steps', h('i', 'on'), h('i'), h('i')), f)); pw.focus(); };
    const step2 = (d) => { const code = otpInput(), err = h('div', 'err'), b = h('button', 'btn', 'Verify and turn on'), img = h('img', 'qr'); img.src = d.qr; img.alt = 'QR code for your authenticator app'; img.width = img.height = 190; const f = h('form', '', code, err, b);
      const cp = h('button', 'btn ghost sm', icon('copy'), 'Copy key'); cp.type = 'button'; cp.onclick = () => copy(d.secret, 'Setup key');
      f.onsubmit = (e) => { e.preventDefault(); err.textContent = ''; busy(b, async () => { try { step3((await api('/api/2fa/enable', 'POST', { code: code.value })).codes); } catch (x) { err.textContent = x.message; } }); };
      wiz.replaceChildren(h('div', 'wiz', h('div', 'steps', h('i', 'on'), h('i', 'on'), h('i')), h('p', 'mut', 'Scan this with Google Authenticator, Authy, 1Password or similar. Can not scan? Type the key instead.'), h('div', 'row', img),
        h('div', 'secret', d.secret.match(/.{1,4}/g).join(' '), cp), h('label', 'lb', 'Enter the 6-digit code it shows'), f)); code.focus(); };
    const step3 = (codes) => { toast('Two-step verification is on'); wiz.replaceChildren(h('div', 'steps', h('i', 'on'), h('i', 'on'), h('i', 'on')), codesBox(codes, redo)); };
    box.append(head, lead, h('div', 'row', go), wiz);
  } else {
    const pw = input('Password', 'current-password'), code = otpInput('Code or recovery code'), err = h('div', 'err'), off = h('button', 'btn danger sm', 'Turn off'), regen = h('button', 'btn ghost sm', icon('key'), 'New recovery codes');
    const ask = (label, btn, run) => { const f = h('form', 'wiz', h('p', 'mut', label), pw, code, err, btn); btn.type = 'submit'; f.onsubmit = (e) => { e.preventDefault(); err.textContent = ''; busy(btn, async () => { try { await run(); } catch (x) { err.textContent = x.message; } }); }; wiz.replaceChildren(f); pw.focus(); };
    off.type = 'button'; regen.type = 'button';
    off.onclick = () => ask('Turn off two-step verification? Confirm with your password and a code.', off, async () => { await api('/api/2fa/disable', 'POST', { password: pw.value, code: code.value }); toast('Two-step verification turned off'); redo(); });
    regen.onclick = () => ask('This replaces your old recovery codes. Confirm with your password and a code.', regen, async () => { const d = await api('/api/2fa/recovery', 'POST', { password: pw.value, code: code.value }); wiz.replaceChildren(codesBox(d.codes, redo)); });
    box.append(head, lead, h('div', 'row', regen, off), wiz);
  }
  return box;
}
async function securityLoad(root) {
  const s = await api('/api/security'), redo = () => securityLoad(root).catch(() => {});
  const bad = s.log.some((l) => ['login_fail', 'lockout', '2fa_fail', 'run_rejected'].includes(l.event));
  const checks = [
    ['Two-step verification', s.twofa, 40, s.twofa ? 'Your account needs a code from your phone' : 'The single biggest upgrade. Takes one minute.'],
    ['Recovery codes in reserve', s.twofa && s.recoveryLeft >= 3, 10, s.twofa ? s.recoveryLeft + ' left' : 'Created when you turn on two-step verification'],
    ['Encrypted connection (HTTPS)', location.protocol === 'https:', 15, location.protocol === 'https:' ? 'Traffic is encrypted in transit' : 'Serve the site over HTTPS and set COOKIE_SECURE=true'],
    ['Few signed-in devices', s.sessions.length <= 2, 15, s.sessions.length + ' active session' + (s.sessions.length === 1 ? '' : 's') + '. Sign out the ones you do not use.'],
    ['No suspicious activity lately', !bad, 20, bad ? 'Failed sign-ins or rejected runs in your recent log' : 'Nothing odd in your last 20 events'],
  ];
  const score = checks.reduce((a, c) => a + (c[1] ? c[2] : 0), 0), col = score >= 80 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--bad)', C = 2 * Math.PI * 46;
  const arc = sv('circle', { cx: 55, cy: 55, r: 46, fill: 'none', stroke: col, 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': C, 'stroke-dashoffset': C, style: 'transition:stroke-dashoffset 1.3s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 0 8px ' + col + ')' });
  const dial = h('div', 'dial', (() => { const v = sv('svg', { viewBox: '0 0 110 110', 'aria-hidden': 'true' }); v.append(sv('circle', { cx: 55, cy: 55, r: 46, fill: 'none', stroke: 'var(--line)', 'stroke-width': 10 }), arc); return v; })(), h('b', '', String(score), h('small', '', 'of 100')));
  setTimeout(() => arc.setAttribute('stroke-dashoffset', C * (1 - score / 100)), 150);
  const verdict = score >= 80 ? 'Excellent. Your account is well protected.' : score >= 50 ? 'Good start. A few quick wins left.' : 'Needs attention. Start with two-step verification.';
  const list = s.sessions.map((x) => { const r = h('div', 'srow', chip3d(/Android|iPhone|iPad/.test(x.ua || '') ? 'phone' : 'monitor', x.current ? '#36e0ff' : '#8b6cff'), h('div', 'grow', h('b', '', dev(x.ua)), h('small', '', (x.ip || 'unknown IP') + '  ·  active ' + (x.seen ? ago(new Date(x.seen).toISOString()) : ago(x.created)) + '  ·  signed in ' + ago(x.created))));
    if (x.current) r.append(h('span', 'chip cy', 'This device')); else { const b = h('button', 'btn ghost sm', 'Revoke'); b.onclick = async () => { await api('/api/sessions/revoke', 'POST', { id: x.id }); toast('Session revoked'); redo(); }; r.append(b); } return r; });
  const all = s.sessions.length > 1 ? (() => { const b = h('button', 'btn ghost sm', icon('out'), 'Sign out all other devices'); b.style.marginTop = '14px'; b.onclick = async () => { await api('/api/sessions/revoke', 'POST', { id: 'others' }); toast('Other devices signed out'); redo(); }; return b; })() : null;
  const logRows = s.log.map((l) => { const sev = SEV[l.event] || 'ok'; return h('div', 'srow', chip3d(sev === 'ok' ? 'check' : sev === 'cy' ? 'key' : 'alert', { ok: '#4ade80', cy: '#36e0ff', warn: '#ffb347', bad: '#ff6a8a' }[sev]), h('div', 'grow', h('b', '', LBL[l.event] || l.event), h('small', '', dev(l.ua) + '  ·  ' + (l.ip || ''))), h('span', 'mut', ago(l.date))); });
  const facts = ['Passwords: bcrypt + secret pepper', 'Sessions stored as SHA-256 hashes', 'Rate limits: ' + (s.redis ? 'Redis' : 'in-memory'), 'Lockout after 5 failed sign-ins', 'Idle sign-out after ' + s.idleHours + 'h', 'One-time run tokens', 'CSRF origin checks'].map((x) => h('span', 'chip ok', icon('check'), x));
  ti = 0;
  root.replaceChildren(grid(
    tile('s12', h('div', 'thead', h('h3', '', 'Security score'), h('span', 'mut', verdict)), h('div', 'score', dial, h('div', '', checks.map(([n, ok, pts, note]) => h('div', 'chk' + (ok ? ' ok' : ''), h('span', 'tick', icon(ok ? 'check' : 'x')), h('div', '', h('b', '', n), h('small', '', note)), h('span', 'pts', (ok ? '+' : '') + (ok ? pts : pts + ' available'))))))),
    tile('s6', twofaCard(s, redo)),
    tile('s6', h('div', 'thead', h('h3', '', 'Signed-in devices (' + s.sessions.length + ')')), list, all),
    tile('s7', h('div', 'thead', h('h3', '', 'Recent activity'), h('span', 'mut', 'Last 20 events')), logRows.length ? logRows : h('div', 'empty', 'Nothing yet.')),
    tile('s5', h('div', 'thead', h('h3', '', 'How we protect you')), h('div', 'row', facts)),
  ));
}
function securityView() { const r = h('div', '', grid(...[1, 2, 3].map(() => { const s = h('div', 'sk s12'); return s; }))); securityLoad(r).catch((e) => r.replaceChildren(h('div', 'empty', e.message))); return r; }

// ---------- account ----------
const pwScore = (v) => { if (!v) return 0; let s = 0; if (v.length >= 8) s++; if (/[A-Za-z]/.test(v) && /\d/.test(v)) s++; if (v.length >= 12) s++; if (/[^A-Za-z0-9]/.test(v) || (/[a-z]/.test(v) && /[A-Z]/.test(v))) s++; return Math.max(1, s); };
function accountView() {
  const u = D.user, sw = h('div', 'sw');
  ['#ffcf5c', '#36e0ff', '#ff6a8a', '#8b6cff', '#4ade80', '#ff9f43'].forEach((c) => { const b = h('button', c === u.accent ? 'on' : ''); b.style.background = c; b.setAttribute('aria-label', 'Accent ' + c); b.type = 'button';
    b.onclick = async () => { try { await api('/api/profile', 'POST', { accent: c }); u.accent = c; setAccent(c); [...sw.children].forEach((x) => (x.className = '')); b.className = 'on'; toast('Accent updated'); } catch (x) { toast(x.message, 'bad'); } }; sw.append(b); });
  const fxBtn = h('button', 'sw3'); fxBtn.type = 'button'; fxBtn.setAttribute('role', 'switch'); fxBtn.setAttribute('aria-checked', String(fx === 'on')); fxBtn.setAttribute('aria-label', '3D effects');
  fxBtn.onclick = () => { const on = fx !== 'on'; fxBtn.setAttribute('aria-checked', String(on)); setFx(on); };
  const profile = tile('s12', h('div', 'row', h('div', 'ava big', u.username[0].toUpperCase()), h('div', '', h('h2', '', u.username), h('p', 'mut', u.email + '  ·  member since ' + when(u.joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
    h('div', 'row', h('span', 'chip', 'Lv ' + D.level.n + ' ' + D.level.title), h('span', 'chip ' + (u.twofa ? 'ok' : 'bad'), icon('shield'), u.twofa ? '2-step on' : '2-step off'), h('span', 'chip cy', D.stats.runs + ' runs')))));
  profile.firstChild.style.marginTop = 0;
  const look = tile('s6', h('h3', '', 'Appearance'), h('p', 'mut', 'Accent colour recolours the whole dashboard, the coin and the charts.'), h('div', 'row', sw),
    h('div', 'row', seg([['dark', 'Dark'], ['light', 'Light']], theme, (k) => setTheme(k))), h('div', 'tog', h('div', '', h('b', '', '3D effects'), h('small', '', 'Card tilt, the 3D coin and the animated backdrop. Turn off on slow devices.')), fxBtn));
  // change password
  const cur = input('Current password', 'current-password'), nxt = input('New password (8+ chars, letter + number)', 'new-password'), c1 = otpInput('2-step code'), e1 = h('div', 'err'), b1 = h('button', 'btn', 'Update password'), meter = h('div', 'pwm', h('i'), h('i'), h('i'), h('i'));
  nxt.addEventListener('input', () => (meter.className = 'pwm' + (nxt.value ? ' s' + pwScore(nxt.value) : '')));
  const f1 = h('form', '', cur, nxt, meter, u.twofa ? c1 : null, e1, b1);
  f1.onsubmit = (e) => { e.preventDefault(); e1.textContent = ''; busy(b1, async () => { try { await api('/api/password', 'POST', { current: cur.value, next: nxt.value, code: c1.value }); f1.reset(); meter.className = 'pwm'; toast('Password updated. Other devices signed out.'); } catch (x) { e1.textContent = x.message; } }); };
  const pwTile = tile('s6', h('h3', '', 'Change password'), h('p', 'mut', 'Other devices are signed out when you change it.'), h('div', 'row', ''), f1);
  // delete
  const dp = input('Confirm your password', 'current-password'), dc = otpInput('2-step code'), e2 = h('div', 'err'), b2 = h('button', 'btn danger', 'Delete forever');
  const f2 = h('form', '', dp, u.twofa ? dc : null, e2, b2);
  f2.onsubmit = (e) => { e.preventDefault(); e2.textContent = ''; if (!confirm('Delete your account and all runs permanently? This cannot be undone.')) return; busy(b2, async () => { try { await api('/api/account/delete', 'POST', { password: dp.value, code: dc.value }); location.href = '/signup'; } catch (x) { e2.textContent = x.message; } }); };
  const exp = h('a', 'btn ghost', icon('download'), 'Download my runs (CSV)'); exp.href = '/api/export.csv';
  const data = tile('s6', h('h3', '', 'Your data'), h('p', 'mut', 'Every run you have played, as a spreadsheet. Your data is yours.'), h('div', 'row', exp));
  const del = tile('s6 danger-zone', h('h3', '', 'Delete account'), h('p', 'mut', 'Removes your profile, runs and sessions for good.'), h('div', 'row', ''), f2);
  return grid(profile, look, pwTile, data, del);
}

// ---------- shell, router, palette ----------
const VIEWS = [['overview', 'home', 'Overview', 'Your progress at a glance', overview], ['runs', 'runs', 'Run history', 'Filter, sort and export every run', runsView], ['achievements', 'trophy', 'Achievements', 'Medals you have earned', achievementsView], ['leaderboard', 'chart', 'Leaderboard', 'See how you compare', leaderboardView], ['security', 'shield', 'Security', 'Two-step verification, devices and activity', securityView], ['account', 'gear', 'Account', 'Profile, appearance, password and data', accountView]];
const logout = async () => { await api('/api/logout', 'POST', {}).catch(() => {}); location.href = '/login'; };
function buildShell() {
  const side = $('side'), nav = (cls) => VIEWS.map(([id, ic, label]) => { const b = h('button', cls, icon(ic), cls === 'nv' ? label : ''); b.dataset.v = id; b.type = 'button'; b.setAttribute('aria-label', label); b.onclick = () => (location.hash = id); return b; });
  const tm = h('button', 'nv', icon('moon'), 'Theme'); tm.type = 'button'; tm.onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark'); const lo = h('button', 'nv', icon('out'), 'Log out'); lo.type = 'button'; lo.onclick = logout;
  const u = D.user; side.append(h('div', 'brand', h('i'), 'Coin Drift'), ...nav('nv'), h('div', 'grow'), tm, lo, h('div', 'me', h('div', 'ava', u.username[0].toUpperCase()), h('div', '', h('b', '', u.username), h('small', '', 'Lv ' + D.level.n + ' ' + D.level.title))));
  $('tabbar').append(...nav('tb')); $('kic').append(icon('search'));
}
function go() {
  stopHero(); const v = VIEWS.find((x) => x[0] === location.hash.slice(1)) || VIEWS[0];
  document.querySelectorAll('[data-v]').forEach((b) => { b.classList.toggle('on', b.dataset.v === v[0]); b.setAttribute('aria-current', b.dataset.v === v[0] ? 'page' : 'false'); });
  $('title').textContent = v[2]; $('sub').textContent = v[3]; document.title = 'Coin Drift - ' + v[2]; ti = 0; $('view').replaceChildren(v[4]()); scrollTo(0, 0);
}
// 3D tilt: cards lean toward the pointer (mouse only) and a soft light follows it. Forms and tables only get the light.
let cur = null, pend = null, raf = 0;
const tiltOf = (t) => (t.dataset.tilt != null ? +t.dataset.tilt : t.classList.contains('s3') ? 7 : t.classList.contains('s12') || t.querySelector('form,table') ? 0 : 3);
const rest = (t) => { if (!t) return; t.classList.remove('live'); t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); };
$('view').addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return; const t = e.target.closest && e.target.closest('.tile'); if (t !== cur) { rest(cur); cur = t; } if (!t) return; pend = { t, x: e.clientX, y: e.clientY };
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; const { t, x, y } = pend, r = t.getBoundingClientRect(), px = (x - r.left) / r.width, py = (y - r.top) / r.height, k = document.documentElement.dataset.fx === 'on' ? tiltOf(t) : 0;
    t.style.setProperty('--mx', x - r.left + 'px'); t.style.setProperty('--my', y - r.top + 'px'); if (k) { t.classList.add('live'); t.style.setProperty('--rx', ((0.5 - py) * 2 * k).toFixed(2) + 'deg'); t.style.setProperty('--ry', ((px - 0.5) * 2 * k).toFixed(2) + 'deg'); } });
});
$('view').addEventListener('pointerleave', () => { rest(cur); cur = null; });
const CMDS = () => [...VIEWS.map(([id, ic, label]) => [label, ic, () => (location.hash = id)]), ['Play now', 'play', () => (location.href = '/game')], ...(D && !D.user.twofa ? [['Turn on two-step verification', 'shield', () => (location.hash = 'security')]] : []),
  ['Toggle light / dark', 'moon', () => setTheme(theme === 'dark' ? 'light' : 'dark')], ['Toggle 3D effects', 'cube', () => setFx(fx !== 'on')], ['Export runs (CSV)', 'download', () => (location.href = '/api/export.csv')], ['Log out', 'out', logout]];
let sel = 0;
function paint() { const q = $('cmdq').value.toLowerCase(), items = CMDS().filter((c) => c[0].toLowerCase().includes(q)); sel = Math.min(sel, Math.max(0, items.length - 1));
  $('cmdlist').replaceChildren(...items.map((c, i) => { const b = h('button', i === sel ? 'on' : '', icon(c[1]), c[0]); b.type = 'button'; b.onclick = () => { $('cmd').close(); c[2](); }; return b; })); return items; }
const openCmd = () => { $('cmdq').value = ''; sel = 0; paint(); $('cmd').showModal(); $('cmdq').focus(); };
$('cmdbtn').onclick = openCmd; $('cmd').addEventListener('click', (e) => { if (e.target === $('cmd')) $('cmd').close(); });
$('cmdq').addEventListener('input', () => { sel = 0; paint(); });
$('cmdq').addEventListener('keydown', (e) => { const items = paint(); if (e.key === 'ArrowDown') { sel = (sel + 1) % items.length; paint(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = (sel - 1 + items.length) % items.length; paint(); e.preventDefault(); } else if (e.key === 'Enter' && items[sel]) { $('cmd').close(); items[sel][2](); } });
addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); } });
addEventListener('hashchange', () => D && go());
// ---------- live data: the dashboard follows what you play ----------
// Refetches when you come back from the game (tab focus, Back button, bfcache) and every 20s while visible.
// It repaints only if something changed, and never on the forms (Security / Account) so typing is not interrupted.
const sig = (d) => [d.stats.runs, d.stats.totalScore, d.stats.coins, d.rank, d.players, d.recent[0] && d.recent[0].date, d.board.map((b) => b.username + b.score).join()].join('|');
let loading = false;
async function refresh(quiet) {
  if (loading || !D || document.hidden) return; loading = true;
  try {
    const next = await api('/api/dashboard');
    if (sig(next) !== sig(D)) {
      const more = next.stats.runs > D.stats.runs; D = next; setAccent(D.user.accent);
      const lv = document.querySelector('.side .me small'); if (lv) lv.textContent = 'Lv ' + D.level.n + ' ' + D.level.title;
      const now = location.hash.slice(1); if (!['security', 'account'].includes(now)) go();
      if (more && !quiet) toast('Dashboard updated with your latest run');
    }
  } catch {} loading = false;
}
addEventListener('pageshow', (e) => { if (e.persisted) refresh(); });
addEventListener('focus', () => refresh());
document.addEventListener('visibilitychange', () => refresh());
setInterval(() => refresh(), 20000);
async function boot() {
  $('view').replaceChildren(grid(h('div', 'sk s8'), h('div', 'sk s4'), h('div', 'sk s3'), h('div', 'sk s3'), h('div', 'sk s3'), h('div', 'sk s3')));
  try { D = await api('/api/dashboard'); setAccent(D.user.accent); buildShell(); go(); }
  catch (e) { const b = h('button', 'btn', 'Try again'); b.onclick = boot; $('view').replaceChildren(h('div', 'empty', e.message, h('div', 'row', b))); }
}
boot();
