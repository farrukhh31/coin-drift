// Coin Drift sign in / sign up: the 3D world behind the form (three.js r128, same look as the game).
// auth.js talks to it through window.CD3D: mode(), focus(), pass(), error(), success().
(function () {
  'use strict';
  var canvas = document.getElementById('scene'), panel = document.getElementById('panel'), T = window.THREE;
  if (!T || !canvas) { document.body.classList.add('no-webgl'); return; }
  var renderer;
  try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { document.body.classList.add('no-webgl'); return; }

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.setClearColor(0x000000, 0);

  var FOV = 38, CAM_D = 12.5;
  var scene = new T.Scene();
  scene.fog = new T.Fog(0x2b2466, 24, 75);
  var camera = new T.PerspectiveCamera(FOV, 1, 0.1, 200);

  // ---------- lights: cool sky, warm rim, coloured accents ----------
  scene.add(new T.HemisphereLight(0x8fb8ff, 0x1a1040, 0.95));
  var sun = new T.DirectionalLight(0xffffff, 1.05); sun.position.set(6, 10, 7); scene.add(sun);
  var cyanLight = new T.PointLight(0x36e0ff, 1.5, 16); cyanLight.position.set(-5, 2.5, 4); scene.add(cyanLight);
  var goldLight = new T.PointLight(0xffcf5c, 1.2, 16); goldLight.position.set(5, 3, -2); scene.add(goldLight);

  var world = new T.Group(); scene.add(world);   // everything the form talks to (island, cube, coins)
  var far = new T.Group(); scene.add(far);       // background decoration

  // ---------- helpers ----------
  function roundedBox(w, h, d, r, seg) { // a cube with soft corners (three r128 has no built-in one)
    var g = new T.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = new Float32Array(p.count * 3);
    var ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r, v = new T.Vector3(), c = new T.Vector3(), o = new T.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z)));
      o.copy(v).sub(c).normalize();
      p.setXYZ(i, c.x + o.x * r, c.y + o.y * r, c.z + o.z * r); n[i * 3] = o.x; n[i * 3 + 1] = o.y; n[i * 3 + 2] = o.z;
    }
    g.setAttribute('normal', new T.BufferAttribute(n, 3));
    return g;
  }
  function softTexture(stops) { // radial gradient drawn on a canvas (shadow blob, sparkle)
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  }
  var ease = function (k) { return k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; };
  var lerp = function (a, b, k) { return a + (b - a) * k; };

  // ---------- the floating island (same recipe as the game arena) ----------
  var island = new T.Group(); world.add(island);
  var navy = new T.MeshStandardMaterial({ color: 0x0f1a4a, roughness: 0.75, metalness: 0.2 });
  var slab = new T.Mesh(new T.BoxGeometry(8, 0.6, 8), navy); slab.position.y = -0.3; island.add(slab);
  var top = new T.Mesh(new T.PlaneGeometry(7.6, 7.6), new T.MeshStandardMaterial({ color: 0x1a2a66, roughness: 0.45, metalness: 0.35 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.005; island.add(top);
  var grid = new T.GridHelper(7.6, 12, 0x4d7cff, 0x2f4aa8); grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.7; island.add(grid);
  var under = new T.Mesh(new T.ConeGeometry(4.7, 6.2, 6), new T.MeshStandardMaterial({ color: 0x131f57, flatShading: true, roughness: 0.9 }));
  under.rotation.x = Math.PI; under.position.y = -3.7; island.add(under);
  var glow = new T.MeshStandardMaterial({ color: 0x36e0ff, emissive: 0x36e0ff, emissiveIntensity: 0.95 });
  [[8.1, 0.12, 0, 3.9], [8.1, 0.12, 0, -3.9], [0.12, 8.1, 3.9, 0], [0.12, 8.1, -3.9, 0]].forEach(function (b) {
    var m = new T.Mesh(new T.BoxGeometry(b[0], 0.16, b[1]), glow); m.position.set(b[2], 0.05, b[3]); island.add(m);
  });
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) { // glowing corner pillars
    var p = new T.Mesh(new T.CylinderGeometry(0.08, 0.12, 1.1, 8), glow); p.position.set(c[0] * 3.95, 0.55, c[1] * 3.95); island.add(p);
    var s = new T.Mesh(new T.SphereGeometry(0.17, 16, 12), glow); s.position.set(c[0] * 3.95, 1.2, c[1] * 3.95); island.add(s);
  });
  var pulse = new T.Mesh(new T.RingGeometry(1.5, 1.68, 56), new T.MeshBasicMaterial({ color: 0x36e0ff, transparent: true, opacity: 0.5, side: T.DoubleSide, fog: false }));
  pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.04; world.add(pulse);

  // ---------- the cube hero ----------
  var cube = new T.Group(); world.add(cube); var CUBE_K = 1.25; // hero size
  var bodyMat = new T.MeshPhysicalMaterial({ color: 0x36e0ff, roughness: 0.26, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.15, emissive: 0x0a5c70, emissiveIntensity: 0.38 });
  var body = new T.Mesh(roundedBox(1.8, 1.8, 1.8, 0.36, 10), bodyMat); cube.add(body);
  var ink = new T.MeshBasicMaterial({ color: 0x0a3a4a });
  var eyeGeo = new T.SphereGeometry(0.13, 18, 14);
  var eyes = [-1, 1].map(function (s) { var e = new T.Mesh(eyeGeo, ink); e.scale.set(1, 1.35, 0.4); e.position.set(s * 0.38, 0.2, 0.9); cube.add(e); return e; });
  var mouthG = new T.Group(); mouthG.position.set(0, 0.02, 0.9); cube.add(mouthG);
  var mouth = new T.Mesh(new T.TorusGeometry(0.26, 0.045, 8, 28, Math.PI), ink); mouth.rotation.z = Math.PI; mouthG.add(mouth);
  var cheekMat = new T.MeshBasicMaterial({ color: 0xff8fb8, transparent: true, opacity: 0.55 });
  [-1, 1].forEach(function (s) { var c = new T.Mesh(new T.CircleGeometry(0.1, 20), cheekMat); c.position.set(s * 0.64, -0.08, 0.912); cube.add(c); });
  var shadow = new T.Mesh(new T.PlaneGeometry(3.6, 3.6), new T.MeshBasicMaterial({ map: softTexture([[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, fog: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.035; world.add(shadow);

  // ---------- coins ----------
  var coinGeo = new T.CylinderGeometry(0.42, 0.42, 0.1, 36); coinGeo.rotateX(Math.PI / 2);
  var rimGeo = new T.TorusGeometry(0.36, 0.032, 8, 36), gemGeo = new T.BoxGeometry(0.17, 0.17, 0.03);
  var coinMat = new T.MeshStandardMaterial({ color: 0xffcf5c, emissive: 0x8a5a00, emissiveIntensity: 0.55, metalness: 0.85, roughness: 0.28 });
  var rimMat = new T.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xa87000, emissiveIntensity: 0.45, metalness: 0.9, roughness: 0.2 });
  function makeCoin(scale) {
    var g = new T.Group(), d = new T.Mesh(coinGeo, coinMat); g.add(d);
    [0.062, -0.062].forEach(function (z) { var r = new T.Mesh(rimGeo, rimMat); r.position.z = z; g.add(r); var m = new T.Mesh(gemGeo, rimMat); m.rotation.z = Math.PI / 4; m.position.z = z * 1.1; g.add(m); });
    g.scale.setScalar(scale || 1); return g;
  }
  var ring = [], RING_N = 8;
  for (var i = 0; i < RING_N; i++) { var rc = makeCoin(1); rc.userData = { a: i / RING_N * Math.PI * 2, ph: i * 1.3 }; world.add(rc); ring.push(rc); }
  var floaters = [], FLOAT_N = coarse ? 9 : 16;
  for (i = 0; i < FLOAT_N; i++) {
    var fc = makeCoin(0.7 + Math.random() * 0.8);
    fc.position.set((Math.random() - 0.5) * 34, -3 + Math.random() * 12, -4 - Math.random() * 22);
    fc.userData = { base: fc.position.y, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.2 }; far.add(fc); floaters.push(fc);
  }
  var cubes = [], dm = new T.MeshStandardMaterial({ color: 0x5b4bd6, emissive: 0x1b1470, roughness: 0.4, metalness: 0.2 });
  for (i = 0; i < (coarse ? 4 : 8); i++) {
    var dc = new T.Mesh(roundedBox(1, 1, 1, 0.2, 4), dm), sc = 0.5 + Math.random() * 1.1; dc.scale.setScalar(sc);
    dc.position.set((Math.random() - 0.5) * 38, -2 + Math.random() * 12, -8 - Math.random() * 24);
    dc.userData = { sx: (Math.random() - 0.5) * 0.5, sy: (Math.random() - 0.5) * 0.5, base: dc.position.y, ph: Math.random() * 6 }; far.add(dc); cubes.push(dc);
  }
  var moon = new T.Mesh(new T.SphereGeometry(2.6, 32, 24), new T.MeshBasicMaterial({ color: 0xfff1c9, fog: false })); moon.position.set(9, 8.5, -38); far.add(moon);
  var moonGlow = new T.Mesh(new T.SphereGeometry(4.6, 32, 24), new T.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.13, fog: false })); moonGlow.position.copy(moon.position); far.add(moonGlow);

  // sparkles drifting up
  var SP = coarse ? 90 : 190, sp = new Float32Array(SP * 3), sv = new Float32Array(SP);
  for (i = 0; i < SP; i++) { sp[i * 3] = (Math.random() - 0.5) * 30; sp[i * 3 + 1] = Math.random() * 14 - 4; sp[i * 3 + 2] = (Math.random() - 0.5) * 16 - 2; sv[i] = 0.15 + Math.random() * 0.45; }
  var spGeo = new T.BufferGeometry(); spGeo.setAttribute('position', new T.BufferAttribute(sp, 3));
  var sparkles = new T.Points(spGeo, new T.PointsMaterial({ size: 0.16, map: softTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(190,233,255,.6)'], [1, 'rgba(190,233,255,0)']]), transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
  scene.add(sparkles);

  // burst pool for the success moment
  var bursts = []; for (i = 0; i < 34; i++) { var bc = makeCoin(0.36); bc.visible = false; bc.userData = { v: new T.Vector3(), life: 0 }; world.add(bc); bursts.push(bc); }

  // ---------- layout: the scene lives in whatever space the form leaves free ----------
  var view = { s: 1, wide: true };
  function layout() {
    var W = innerWidth, H = innerHeight, r = panel.getBoundingClientRect();
    view.wide = !matchMedia('(max-width: 860px) and (min-height: 561px)').matches; // same breakpoint as the CSS
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = FOV; camera.updateProjectionMatrix();
    var ppu = (H / 2) / (Math.tan(FOV * Math.PI / 360) * CAM_D), freeW, freeH, cx, cy;
    if (view.wide) { freeW = Math.max(300, W - r.width); freeH = H; cx = freeW / 2; cy = H * 0.44; }
    else { freeW = W; freeH = Math.max(140, r.top); cx = W / 2; cy = freeH * 0.54; }
    view.s = Math.max(0.3, Math.min(freeW * 0.95 / ((view.wide ? 13.5 : 11) * ppu), freeH * 0.8 / (11 * ppu), 1.25));
    world.scale.setScalar(view.s);
    world.position.set((cx - W / 2) / ppu, -(cy - H / 2) / ppu + 0.9 * view.s, 0);
  }
  addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(panel);
  layout();

  // ---------- state that the form drives ----------
  var mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', function (e) { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  var S = { focus: 0, focusT: 0, eyes: 0, eyesT: 0, mood: 1, moodT: 1, errT: 0, shake: 0, spin: 0, spinDir: 1, spinT: 0, spinDur: 0.9, jump: 0, jumpT: 0, win: 0, blink: 3, blinkK: 0 };
  window.CD3D = {
    mode: function (m) { S.spinDir = m === 'signup' ? 1 : -1; S.spinT = 0.001; S.spinDur = 0.9; },
    focus: function (on) { S.focusT = on ? 1 : 0; },
    pass: function (level) { S.eyesT = level; },          // 0 open, 0.5 peeking, 1 eyes closed
    error: function () { S.errT = 1.7; S.shake = 0.55; },
    success: function () {
      S.win = 1; S.spinDir = 1; S.spinT = 0.001; S.spinDur = 1.1; S.jumpT = 0.001; S.moodT = 1;
      bursts.forEach(function (c) {
        var d = c.userData, a = Math.random() * 6.28, up = 5 + Math.random() * 6;
        c.position.set(0, 1.3, 0.4); d.v.set(Math.cos(a) * (2 + Math.random() * 4), up, Math.sin(a) * (2 + Math.random() * 3)); d.life = 1.6 + Math.random() * 0.5; c.visible = true;
      });
    }
  };

  // ---------- frame ----------
  var clock = new T.Clock(), t = 0, redEm = new T.Color(0x8a1030), baseEm = new T.Color(0x0a5c70), redBody = new T.Color(0xff5a7e), baseBody = new T.Color(0x36e0ff);
  function frame() {
    var dt = Math.min(clock.getDelta(), 0.05); t += dt;
    var k = Math.min(1, dt * 6);

    // camera drifts with the pointer
    mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 3); mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 3);
    var zoom = 1 - S.win * 0.08;
    camera.position.set(mouse.sx * 1.5, 4.3 - mouse.sy * 0.8, CAM_D * zoom); camera.lookAt(0, 0.5, 0);

    // state easing
    S.focus = lerp(S.focus, S.focusT, k); S.eyes = lerp(S.eyes, S.eyesT, Math.min(1, dt * 9));
    S.errT = Math.max(0, S.errT - dt); S.moodT = S.errT > 0 ? -1 : 1; S.mood = lerp(S.mood, S.moodT, Math.min(1, dt * 10));
    S.win = Math.max(0, S.win - dt * 0.45);
    S.blink -= dt; if (S.blink < 0) { S.blinkK = 1; S.blink = 2.5 + Math.random() * 3; } S.blinkK = Math.max(0, S.blinkK - dt * 7);

    // hop loop with squash and stretch
    var c = (t * 0.42) % 1, air = c < 0.4 ? Math.sin(c / 0.4 * Math.PI) : 0, land = c >= 0.4 && c < 0.55 ? Math.sin((c - 0.4) / 0.15 * Math.PI) : 0, pre = c > 0.93 ? (c - 0.93) / 0.07 : 0;
    var squash = land * 0.16 + pre * 0.1, sy = 1 - squash + air * 0.06, sxz = 1 + squash * 0.5 - air * 0.03;
    var jump = 0; if (S.jumpT > 0) { S.jumpT += dt; var jk = Math.min(1, S.jumpT / 1.1); jump = Math.sin(jk * Math.PI) * 1.7; if (jk >= 1) S.jumpT = 0; }
    var lift = air * 0.6 + jump;
    cube.scale.set(sxz * CUBE_K, sy * CUBE_K, sxz * CUBE_K); cube.position.y = 0.9 * CUBE_K * sy + lift;
    S.shake = Math.max(0, S.shake - dt); cube.position.x = Math.sin(t * 60) * S.shake * 0.35;

    // spin when switching tabs / on success
    var lookYaw = mouse.sx * 0.55 + S.focus * (view.wide ? 0.5 : 0), lookPitch = mouse.sy * 0.25 + S.focus * (view.wide ? 0 : 0.28);
    if (S.spinT > 0) {
      S.spinT += dt; var sk = Math.min(1, S.spinT / S.spinDur);
      cube.rotation.y = lookYaw + ease(sk) * Math.PI * 2 * S.spinDir;
      if (sk >= 1) { S.spinT = 0; cube.rotation.y = lookYaw; } // a full turn ends exactly where it started
    } else cube.rotation.y = lerp(cube.rotation.y, lookYaw, k);
    cube.rotation.x = lerp(cube.rotation.x, lookPitch, k);

    // face: blink, eyes closed for the password, smile or frown
    var open = Math.max(0.1, 1 - S.eyes * 0.92 - S.blinkK * 0.9);
    eyes.forEach(function (e) { e.scale.y = 1.35 * open; });
    var m = (S.mood + 1) / 2; mouth.rotation.z = lerp(0, Math.PI, m); mouthG.position.y = lerp(-0.3, 0.02, m); mouthG.scale.setScalar(1 + S.win * 0.4);
    var ek = Math.min(1, S.errT / 0.5); bodyMat.color.copy(baseBody).lerp(redBody, ek * 0.85); bodyMat.emissive.copy(baseEm).lerp(redEm, ek);

    // shadow + pulse ring follow the hop
    shadow.scale.setScalar(1 - Math.min(0.5, lift * 0.22)); shadow.material.opacity = 1 - Math.min(0.6, lift * 0.25);
    var pk = (t * 0.5) % 1; pulse.scale.setScalar(1 + pk * 1.3); pulse.material.opacity = 0.5 * (1 - pk);

    // island drifts, coins orbit
    island.rotation.y = t * 0.12; island.position.y = Math.sin(t * 0.9) * 0.08; world.rotation.y = mouse.sx * 0.2;
    var orbit = 0.35 + S.win * 1.6;
    ring.forEach(function (rc, j) {
      var d = rc.userData; d.a += dt * orbit;
      var rad = 2.7 + Math.sin(t * 0.8 + d.ph) * 0.15;
      rc.position.set(Math.cos(d.a) * rad, 3.15 + Math.sin(t * 1.3 + d.ph) * 0.25 + S.win * 0.5, Math.sin(d.a) * rad);
      rc.rotation.y = t * 1.8 + d.ph;
    });
    floaters.forEach(function (f) { var d = f.userData; f.position.y = d.base + Math.sin(t * d.sp + d.ph) * 0.5; f.rotation.y = t * d.sp; });
    cubes.forEach(function (q) { var d = q.userData; q.rotation.x += d.sx * dt; q.rotation.y += d.sy * dt; q.position.y = d.base + Math.sin(t * 0.5 + d.ph) * 0.6; });
    moon.position.y = 8.5 + Math.sin(t * 0.2) * 0.3; moonGlow.position.y = moon.position.y;

    // sparkles
    var p = spGeo.attributes.position.array;
    for (var q = 0; q < SP; q++) { p[q * 3 + 1] += sv[q] * dt; if (p[q * 3 + 1] > 11) p[q * 3 + 1] = -4; }
    spGeo.attributes.position.needsUpdate = true;

    // success coin burst
    bursts.forEach(function (b) {
      if (!b.visible) return; var d = b.userData; d.life -= dt; if (d.life <= 0) { b.visible = false; return; }
      d.v.y -= 14 * dt; b.position.addScaledVector(d.v, dt); b.rotation.y += dt * 9; b.rotation.x += dt * 3;
      b.scale.setScalar(0.36 * Math.min(1, d.life * 2));
    });

    renderer.render(scene, camera);
  }

  if (reduce) { // no animation: one still frame, redrawn when the layout changes
    window.CD3D = { mode: function () {}, focus: function () {}, pass: function () {}, error: function () {}, success: function () {} };
    var still = function () { clock.getDelta(); t = 1.2; frame(); }; still(); addEventListener('resize', still);
    if (window.ResizeObserver) new ResizeObserver(still).observe(panel);
    return;
  }
  (function loop() { requestAnimationFrame(loop); if (!document.hidden) frame(); })();
  document.addEventListener('visibilitychange', function () { clock.getDelta(); });
})();
