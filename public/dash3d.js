// Coin Drift dashboard 3D layer (three.js r128, same CDN as the game and the sign-in page).
//   D3D.background(canvas)  ambient field of drifting coins and cubes behind the whole dashboard
//   D3D.hero(canvas, accent) the big gold coin + cube mascot in the overview hero
// Both return a controller { stop(), color(hex) } or null when WebGL is unavailable (the CSS fallbacks stay visible).
// Rendering pauses when the tab is hidden or the canvas is off screen, and is skipped entirely when effects are off.
(function () {
  'use strict';
  var T = window.THREE;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = matchMedia('(pointer: coarse)').matches;
  var fxOn = function () { return document.documentElement.dataset.fx !== 'off'; };
  window.D3D = { background: function () { return null; }, hero: function () { return null; } };
  if (!T) return;

  var pointer = { x: 0, y: 0 };
  addEventListener('pointermove', function (e) { pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

  function makeRenderer(canvas, alpha) {
    try {
      var r = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: alpha !== false, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)); r.setClearColor(0x000000, 0);
      return r;
    } catch (e) { return null; }
  }
  function fit(renderer, camera, canvas) {
    var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    if (canvas.__w === w && canvas.__h === h) return; canvas.__w = w; canvas.__h = h;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function glow(stops) { var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); }

  // A tiny studio environment (soft boxes on a dark dome) so metal actually looks like metal without any HDR download.
  function studioEnv(renderer) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 256; var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#9fb6ff'); g.addColorStop(.5, '#3a3f8f'); g.addColorStop(1, '#0a0d2a'); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    x.fillStyle = 'rgba(255,255,255,.95)'; x.fillRect(60, 40, 90, 50); x.fillRect(330, 30, 120, 40);
    x.fillStyle = 'rgba(255,214,120,.9)'; x.fillRect(220, 60, 60, 80);
    x.fillStyle = 'rgba(120,230,255,.8)'; x.fillRect(430, 110, 50, 70);
    var tex = new T.CanvasTexture(c); tex.mapping = T.EquirectangularReflectionMapping;
    var pm = new T.PMREMGenerator(renderer), env = pm.fromEquirectangular(tex).texture; pm.dispose(); tex.dispose(); return env;
  }

  function coinFace(hex) { // embossed face: rim, inner ring, bold C
    var s = 512, c = document.createElement('canvas'); c.width = c.height = s; var x = c.getContext('2d'), col = new T.Color(hex);
    var hi = col.clone().lerp(new T.Color(0xffffff), .55).getStyle(), lo = col.clone().lerp(new T.Color(0x000000), .35).getStyle(), mid = col.getStyle();
    var g = x.createRadialGradient(190, 170, 20, 256, 256, 290); g.addColorStop(0, hi); g.addColorStop(.55, mid); g.addColorStop(1, lo);
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    x.lineWidth = 16; x.strokeStyle = lo; x.beginPath(); x.arc(256, 256, 226, 0, 7); x.stroke();
    x.lineWidth = 6; x.strokeStyle = hi; x.beginPath(); x.arc(256, 256, 206, 0, 7); x.stroke();
    x.setLineDash([3, 14]); x.lineWidth = 7; x.strokeStyle = lo; x.beginPath(); x.arc(256, 256, 186, 0, 7); x.stroke(); x.setLineDash([]);
    x.font = '800 270px Poppins, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = hi; x.fillText('C', 252, 262); x.fillStyle = lo; x.fillText('C', 260, 270); x.fillStyle = mid; x.fillText('C', 256, 266);
    var t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }

  // ------------------------------------------------------------------ ambient background
  D3D.background = function (canvas) {
    var renderer = makeRenderer(canvas); if (!renderer) return null;
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(48, 1, 0.1, 100); camera.position.z = 14;
    scene.fog = new T.Fog(0x070a22, 12, 34);
    scene.add(new T.HemisphereLight(0x9bb8ff, 0x1a1040, 1.1));
    var key = new T.DirectionalLight(0xffffff, 1.2); key.position.set(4, 8, 8); scene.add(key);
    var warm = new T.PointLight(0xffcf5c, 1.6, 30); warm.position.set(8, -3, 6); scene.add(warm);
    var cool = new T.PointLight(0x36e0ff, 1.6, 30); cool.position.set(-9, 4, 4); scene.add(cool);
    scene.environment = studioEnv(renderer);
    var gold = new T.MeshStandardMaterial({ color: 0xffcf5c, metalness: .9, roughness: .3, envMapIntensity: .9 });
    var cyan = new T.MeshStandardMaterial({ color: 0x36e0ff, metalness: .1, roughness: .35, emissive: 0x0b4a5a, emissiveIntensity: .6 });
    var violet = new T.MeshStandardMaterial({ color: 0x7c5cff, metalness: .2, roughness: .4, emissive: 0x2a1a6a, emissiveIntensity: .5 });
    var coinG = new T.CylinderGeometry(.55, .55, .14, 28), cubeG = new T.BoxGeometry(.7, .7, .7);
    var items = [], N = coarse ? 12 : 22;
    for (var i = 0; i < N; i++) {
      var isCoin = i % 3 !== 2, m = new T.Mesh(isCoin ? coinG : cubeG, isCoin ? gold : (i % 2 ? cyan : violet));
      var depth = -8 + Math.random() * 9; // farther items are smaller on screen and drift slower
      m.position.set((Math.random() - .5) * 30, (Math.random() - .5) * 18, depth);
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      var s = .6 + Math.random() * .9; m.scale.setScalar(s); scene.add(m);
      items.push({ m: m, vy: .12 + Math.random() * .25, spin: (Math.random() - .5) * 1.2, depth: depth });
    }
    var run = true, last = 0, scroll = 0;
    addEventListener('scroll', function () { scroll = scrollY; }, { passive: true });
    function frame(t) {
      if (!run) return; requestAnimationFrame(frame);
      if (document.hidden || !fxOn()) return;
      if (t - last < 33) return; var dt = Math.min(.1, (t - last) / 1000); last = t; // ~30fps is plenty for a backdrop
      fit(renderer, camera, canvas);
      if (!reduce) items.forEach(function (it) {
        it.m.position.y += it.vy * dt; it.m.rotation.x += it.spin * dt; it.m.rotation.y += it.spin * .7 * dt;
        if (it.m.position.y > 10) { it.m.position.y = -10; it.m.position.x = (Math.random() - .5) * 30; }
      });
      camera.position.x += (pointer.x * 1.2 - camera.position.x) * .04;
      camera.position.y += (-pointer.y * .8 - scroll * .0016 - camera.position.y) * .04;
      camera.lookAt(0, 0, 0); renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    return { stop: function () { run = false; renderer.dispose(); }, color: function () {} };
  };

  // ------------------------------------------------------------------ hero: coin + mascot
  D3D.hero = function (canvas, accent) {
    var renderer = makeRenderer(canvas); if (!renderer) return null;
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(32, 1, 0.1, 50); camera.position.set(.5, .3, 11.5);
    scene.environment = studioEnv(renderer);
    scene.add(new T.HemisphereLight(0xcfdcff, 0x1a1040, .8));
    var sun = new T.DirectionalLight(0xffffff, 1.3); sun.position.set(3, 5, 6); scene.add(sun);
    var rim = new T.PointLight(0x36e0ff, 2.2, 14); rim.position.set(-4, 1, -2); scene.add(rim);
    var warm = new T.PointLight(0xffcf5c, 1.6, 14); warm.position.set(4, -2, 3); scene.add(warm);

    var col = new T.Color(accent || '#ffcf5c'), face = coinFace(col.getStyle());
    var edge = new T.MeshStandardMaterial({ color: col, metalness: .92, roughness: .26, envMapIntensity: 1.25 });
    var capMat = new T.MeshStandardMaterial({ map: face, metalness: .75, roughness: .34, envMapIntensity: 1.1 });
    var coin = new T.Group(); scene.add(coin);
    var body = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, .3, 72), [edge, capMat, capMat]); body.rotation.x = Math.PI / 2; coin.add(body);
    var rimG = new T.TorusGeometry(1.47, .075, 20, 90), r1 = new T.Mesh(rimG, edge), r2 = new T.Mesh(rimG, edge); r1.position.z = .15; r2.position.z = -.15; coin.add(r1, r2);

    // glowing pedestal rings under the coin
    var ringMat = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: .55, blending: T.AdditiveBlending, depthWrite: false });
    var ring1 = new T.Mesh(new T.RingGeometry(1.9, 2.0, 80), ringMat), ring2 = new T.Mesh(new T.RingGeometry(2.4, 2.45, 80), ringMat.clone());
    [ring1, ring2].forEach(function (r) { r.rotation.x = -Math.PI / 2; r.position.y = -2.05; scene.add(r); }); ring2.material.opacity = .25;
    var halo = new T.Sprite(new T.SpriteMaterial({ map: glow([[0, 'rgba(255,255,255,.55)'], [.35, 'rgba(255,207,92,.25)'], [1, 'rgba(255,207,92,0)']]), blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.set(5.2, 5.2, 1); halo.position.z = -1.2; scene.add(halo);

    // the cube mascot, bobbing beside the coin and watching the pointer
    var mascot = new T.Group(); mascot.position.set(2.0, -1.05, .9); scene.add(mascot);
    var cube = new T.Mesh(new T.BoxGeometry(.95, .95, .95), new T.MeshStandardMaterial({ color: 0x36e0ff, metalness: .1, roughness: .28, emissive: 0x0a5566, emissiveIntensity: .55 }));
    mascot.add(cube);
    var eyeM = new T.MeshBasicMaterial({ color: 0x0a2a3a }), eyes = [-.2, .2].map(function (x) { var e = new T.Mesh(new T.SphereGeometry(.075, 12, 12), eyeM); e.position.set(x, .08, .485); cube.add(e); return e; });
    var shadow = new T.Mesh(new T.CircleGeometry(.55, 24), new T.MeshBasicMaterial({ map: glow([[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(2.15, -2.04, .9); scene.add(shadow);

    // sparkles
    var P = 46, pos = new Float32Array(P * 3), seeds = [];
    for (var i = 0; i < P; i++) { var a = Math.random() * 6.28, r = 2.1 + Math.random() * 1.6; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - .5) * 4.4; pos[i * 3 + 2] = Math.sin(a) * r * .6; seeds.push(Math.random() * 6.28); }
    var pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
    var sparks = new T.Points(pg, new T.PointsMaterial({ size: .14, map: glow([[0, 'rgba(255,255,255,1)'], [.4, 'rgba(255,230,160,.6)'], [1, 'rgba(255,230,160,0)']]), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    scene.add(sparks);

    var run = true, visible = true, t0 = performance.now(), spinTo = 0, spinV = 0, tiltX = 0, tiltY = 0, poke = 0;
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }) : null; if (io) io.observe(canvas);
    canvas.addEventListener('pointerdown', function () { poke = 1; spinV = 9; }); // click the coin for a flip
    function draw(t) {
      var s = (t - t0) / 1000; fit(renderer, camera, canvas);
      var live = !reduce;
      coin.rotation.y = (live ? s * .9 : .5) + spinTo; spinTo += spinV * .016; spinV *= .94;
      tiltX += ((pointer.y * .35) - tiltX) * .06; tiltY += ((pointer.x * .25) - tiltY) * .06;
      coin.rotation.x = tiltX + (live ? Math.sin(s * 1.3) * .06 : 0); coin.rotation.z = -tiltY * .3; coin.position.y = live ? Math.sin(s * 1.6) * .12 : 0;
      ring1.rotation.z = s * .25; ring2.rotation.z = -s * .18; ringMat.opacity = .45 + Math.sin(s * 2) * .12;
      mascot.position.y = -1.05 + (live ? Math.abs(Math.sin(s * 2.4)) * .38 : .1); cube.rotation.y = Math.sin(s * 1.1) * .45 + pointer.x * .5; cube.rotation.x = -pointer.y * .3;
      shadow.scale.setScalar(1 - Math.abs(Math.sin(s * 2.4)) * .25);
      sparks.rotation.y = live ? s * .12 : 0;
      renderer.render(scene, camera);
    }
    function frame(t) {
      if (!run) return; requestAnimationFrame(frame);
      if (document.hidden || !visible || !fxOn()) return; draw(t);
    }
    requestAnimationFrame(frame);
    return {
      stop: function () { run = false; if (io) io.disconnect(); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); },
      color: function (hex) { var c = new T.Color(hex); edge.color.copy(c); ringMat.color.copy(c); capMat.map = coinFace(c.getStyle()); capMat.needsUpdate = true; },
    };
  };
})();
