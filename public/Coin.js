// ============================================================
// Coin Drift - a simple three.js game
// Move with WASD (or arrows), hold Shift to dash.
// ============================================================

// ---------- Settings (change these to tweak the game) ----------
const GROUND_SIZE = 40;
// Levels: every world (look, rules, goals) is defined in levels.js
const LEVELS = window.LEVEL_DATA;
let level = 0, COINS_TO_WIN = LEVELS[0].coins, magnet = 3;      // magnet = raycast "click a coin to pull it" charges
let run = { score: 0, coins: 0, ms: 0, stars: 0 };               // totals for the whole run (all levels)
const newRun = () => { level = 0; run = { score: 0, coins: 0, ms: 0, stars: 0 }; runSaved = false; applyLevel(); };
let runSaved = false; // each run is saved exactly once (the server accepts one save per run token)
function applyLevel() { COINS_TO_WIN = LEVELS[level].coins; }
// save the run to the backend (session cookie identifies the player). keepalive lets it finish even while the page is closing.
function submitRun(levelReached, completed, snap = run) {
  if (runSaved) return Promise.resolve();
  runSaved = true;
  return fetch("/api/runs", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: snap.score, coins: snap.coins, timeMs: snap.ms, levelReached, stars: snap.stars, completed, token: runToken }) })
    .then((r) => { if (r.status === 401) location.href = "/login"; }).catch(() => {});
}
// Called when the player leaves mid-run (Dashboard button, closing the tab): keeps the coins and levels they already earned.
function saveProgress() {
  if (runSaved) return Promise.resolve();
  const live = state === "playing" || state === "paused" || state === "falling"; // current level not finished yet: count the coins so far
  const snap = { score: run.score + (live ? collected * 100 : 0), coins: run.coins + (live ? collected : 0), ms: run.ms + (live ? Math.round(elapsed * 1000) : 0), stars: run.stars };
  if (!snap.coins) return Promise.resolve(); // nothing earned yet, nothing to record
  return submitRun(level + 1, false, snap);
}
const PLAYER_SPEED = 9;
const DASH_MULTIPLIER = 1.7;
const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches; // phone or tablet

// ---------- Page elements ----------
const $ = (id) => document.getElementById(id);
const scoreEl = $("score");
const fillEl = $("fill");
const timeEl = $("time");
const bestEl = $("best");
const staminaEl = $("stamina");

// Dash energy, camera shake
let stamina = 1;
let exhausted = false;
let trailTimer = 0;
let shake = 0;
let viewScale = 1; // how far the camera is pulled back (bigger on tall phone screens)

// ---------- Game state: "menu" -> "playing" -> "won" ----------
let state = "menu";
function setState(newState) {
  state = newState;
  document.body.dataset.state = newState; // the CSS uses this (letterbox bars, HUD)
}
let collected = 0;
let elapsed = 0;
let bests = {}; // best time for each level
try { bests = JSON.parse(localStorage.getItem("coin-drift-bests")) || {}; } catch (e) {}
function showBest() { bestEl.textContent = bests[level] ? formatTime(bests[level]) : "--"; }

// ============================================================
// 1. Scene, camera, renderer
// ============================================================
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2b2466, 35, 160); // far things fade into a purple haze

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 12, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// ============================================================
// 2. Lights
// ============================================================
const hemi = new THREE.HemisphereLight(0x8fb8ff, 0x1a1040, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(10, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 512 : 1024, IS_TOUCH ? 512 : 1024); // lighter shadows on phones
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
scene.add(sun);

// ============================================================
// 3. Environment: sky, moon, ground, arena, trees, mountains...
// ============================================================

// Sky dome - a big sphere seen from the inside, colored from horizon to top
const SKY_RADIUS = 180;
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
  new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })
);
const skyPositions = sky.geometry.attributes.position;
const skyColors = [];
const horizonColor = new THREE.Color(0x2b2466); // same as the fog, so the ground blends in
const topColor = new THREE.Color(0x040819);
for (let i = 0; i < skyPositions.count; i++) {
  const height = Math.max(skyPositions.getY(i) / SKY_RADIUS, 0); // 0 at horizon, 1 at top
  const color = horizonColor.clone().lerp(topColor, Math.pow(height, 0.5));
  skyColors.push(color.r, color.g, color.b);
}
sky.geometry.setAttribute("color", new THREE.Float32BufferAttribute(skyColors, 3));
scene.add(sky);

// Moon with a soft glow
const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 32), new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false }));
moon.position.set(-70, 55, -110);
scene.add(moon);
const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(12, 32, 32), new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.14, fog: false }));
moonGlow.position.copy(moon.position);
scene.add(moonGlow);

// Big dark ground around the arena
const outerGround = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  new THREE.MeshStandardMaterial({ color: 0x0e1440, roughness: 1 })
);
outerGround.rotation.x = -Math.PI / 2;
outerGround.position.y = -30; // far below - falling off the arena is a long drop
outerGround.receiveShadow = true;
scene.add(outerGround);

// Everything that belongs to the arena lives in one group so it can be resized (bigger levels, shrinking floors)
const arena = new THREE.Group();
scene.add(arena);

// The arena: a raised platform where the game happens
const platform = new THREE.Mesh(
  new THREE.BoxGeometry(GROUND_SIZE + 1, 1, GROUND_SIZE + 1),
  new THREE.MeshStandardMaterial({ color: 0x0a0f2e, roughness: 0.8 })
);
platform.position.y = -0.52;
arena.add(platform);

// Rocky underside so the arena looks like a floating island
const underside = new THREE.Mesh(
  new THREE.ConeGeometry(GROUND_SIZE * 0.62, 16, 6),
  new THREE.MeshStandardMaterial({ color: 0x0a0f2e, flatShading: true })
);
underside.rotation.x = Math.PI; // point downwards
underside.position.y = -9;
arena.add(underside);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x16224f, roughness: 0.5, metalness: 0.3 })
);
ground.rotation.x = -Math.PI / 2; // lay it flat
ground.receiveShadow = true;
arena.add(ground);

let grid = new THREE.GridHelper(GROUND_SIZE, 40, 0x4d7cff, 0x2a3f8f);
grid.position.y = 0.01;
grid.material.transparent = true;
grid.material.opacity = 0.35;
arena.add(grid);

// Glowing border around the arena (4 thin boxes)
const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x36e0ff, emissive: 0x36e0ff, emissiveIntensity: 1.2 });
function addTrim(width, depth, x, z) {
  const trim = new THREE.Mesh(new THREE.BoxGeometry(width, 0.15, depth), trimMaterial);
  trim.position.set(x, 0.07, z);
  arena.add(trim);
}
addTrim(GROUND_SIZE + 0.3, 0.3, 0, GROUND_SIZE / 2);
addTrim(GROUND_SIZE + 0.3, 0.3, 0, -GROUND_SIZE / 2);
addTrim(0.3, GROUND_SIZE + 0.3, GROUND_SIZE / 2, 0);
addTrim(0.3, GROUND_SIZE + 0.3, -GROUND_SIZE / 2, 0);

// Glowing pillars in the four corners
const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x36e0ff, emissive: 0x36e0ff, emissiveIntensity: 0.9 });
[[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3, 8), pillarMaterial);
  pillar.position.set(sx * (GROUND_SIZE / 2 + 0.8), 1.5, sz * (GROUND_SIZE / 2 + 0.8));
  pillar.castShadow = true;
  arena.add(pillar);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), pillarMaterial);
  top.position.set(pillar.position.x, 3.4, pillar.position.z);
  arena.add(top);
});

// Low-poly trees outside the arena
const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x1f8a8a, emissive: 0x0b3a4a, flatShading: true });
function makeTree(x, z, scale) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x2a1f3d }));
  trunk.position.y = 0.8;
  tree.add(trunk);
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7 - i * 0.4, 2.2, 7), leafMaterial);
    cone.position.y = 2.2 + i * 1.2;
    cone.castShadow = true;
    tree.add(cone);
  }
  tree.position.set(x, -30, z);
  tree.scale.setScalar(scale);
  scene.add(tree);
}
for (let i = 0; i < 34; i++) {
  const x = (Math.random() - 0.5) * 120;
  const z = (Math.random() - 0.5) * 120;
  if (Math.max(Math.abs(x), Math.abs(z)) > 26) makeTree(x, z, (0.8 + Math.random() * 0.9) * 2); // keep the arena clear
}

// Mountains far away (the fog makes them look misty)
const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2260, flatShading: true });
for (let i = 0; i < 14; i++) {
  const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
  const distance = 105 + Math.random() * 20;
  const height = 60 + Math.random() * 40;
  const mountain = new THREE.Mesh(new THREE.ConeGeometry(22 + Math.random() * 14, height, 5), mountainMaterial);
  mountain.position.set(Math.cos(angle) * distance, height / 2 - 30, Math.sin(angle) * distance);
  scene.add(mountain);
}

// Stars
const starPositions = [];
for (let i = 0; i < 900; i++) {
  starPositions.push((Math.random() - 0.5) * 300, Math.random() * 100 + 10, (Math.random() - 0.5) * 300);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, fog: false }));
scene.add(stars);

// Floating crystals in three glowing colors
const crystals = [];
const crystalColors = [0x7a5cff, 0x36e0ff, 0xff6ad5];
for (let i = 0; i < 16; i++) {
  const color = crystalColors[i % 3];
  const crystal = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1 + Math.random() * 1.5, 0),
    new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.7, flatShading: true })
  );
  const angle = Math.random() * Math.PI * 2;
  const distance = 30 + Math.random() * 14;
  crystal.position.set(Math.cos(angle) * distance, 5 + Math.random() * 14, Math.sin(angle) * distance);
  scene.add(crystal);
  crystals.push(crystal);
}

// Fireflies drifting above the arena
const FIREFLY_COUNT = 90;
const fireflyBase = [];
const fireflyPositions = new Float32Array(FIREFLY_COUNT * 3);
for (let i = 0; i < FIREFLY_COUNT; i++) {
  const base = [(Math.random() - 0.5) * 50, 0.6 + Math.random() * 5, (Math.random() - 0.5) * 50];
  fireflyBase.push(base);
  fireflyPositions.set(base, i * 3);
}
const fireflyGeometry = new THREE.BufferGeometry();
fireflyGeometry.setAttribute("position", new THREE.BufferAttribute(fireflyPositions, 3));
const fireflies = new THREE.Points(
  fireflyGeometry,
  new THREE.PointsMaterial({ color: 0xd6ff8a, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
);
fireflies.frustumCulled = false;
scene.add(fireflies);

let fxMode = "float", fxSpeed = 0; // floating, rising embers or falling snow/rain
function updateFireflies(time) {
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const base = fireflyBase[i];
    fireflyPositions[i * 3] = base[0] + Math.sin(time * 0.5 + i) * 1.2;
    fireflyPositions[i * 3 + 1] = fxMode === "rise" ? ((base[1] + time * fxSpeed) % 12) + 0.3 : fxMode === "fall" ? 12.3 - ((base[1] + time * fxSpeed) % 12) : base[1] + Math.sin(time * 0.9 + i * 2) * 0.6;
    fireflyPositions[i * 3 + 2] = base[2] + Math.cos(time * 0.4 + i) * 1.2;
  }
  fireflyGeometry.attributes.position.needsUpdate = true;
}

// ============================================================
// 4. Player cube
// ============================================================
const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x36e0ff, emissive: 0x0a7c99, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.4 })
);
player.position.y = 0.5;
player.castShadow = true;
player.add(new THREE.PointLight(0x36e0ff, 1.2, 9)); // cyan glow on the ground
scene.add(player);

// ============================================================
// 5. Coins
// ============================================================
const coinGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 32);
const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xffcf5c, emissive: 0xb37a00, emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.2 });
let coins = [];
const hitGeometry = new THREE.SphereGeometry(1.1, 8, 8);

function spawnCoins() {
  coins.forEach((coin) => scene.remove(coin));
  coins = [];

  for (let i = 0; i < COINS_TO_WIN; i++) {
    // the group spins; the disc inside is tipped upright like a real coin
    const coin = new THREE.Group();
    const disc = new THREE.Mesh(coinGeometry, coinMaterial);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    coin.add(disc);
    coin.add(new THREE.Mesh(hitGeometry, new THREE.MeshBasicMaterial({ visible: false }))); // bigger invisible target for raycasting

    const spot = placeSpot(1.2); // keeps coins out of rocks
    coin.position.set(spot[0], 1, spot[1]);
    coin.userData.offset = Math.random() * 6; // so coins don't bob in sync
    scene.add(coin);
    coins.push(coin);
  }
}

// ============================================================
// 6. Sparkles (when a coin is collected)
// ============================================================
const sparks = [];
const sparkGeometry = new THREE.SphereGeometry(0.08, 6, 6);

function burst(position, count = 12, color = 0xffe08a) {
  for (let i = 0; i < count; i++) {
    const spark = new THREE.Mesh(sparkGeometry, new THREE.MeshBasicMaterial({ color: color, transparent: true }));
    spark.position.copy(position);
    spark.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4);
    spark.userData.life = 1;
    scene.add(spark);
    sparks.push(spark);
  }
}

// ============================================================
// 7. Sound (made with code, no audio files)
// ============================================================
let audio;
let muted = false;

// Browsers only allow sound after a click, so we create the audio here
// and call it from the Start / Play again buttons.
function unlockAudio() {
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
}

function tone(frequency, duration, type = "sine", volume = 0.3, delay = 0) {
  if (muted) return;
  unlockAudio();
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration); // fade out
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration);
}

function playCoinSound() {
  tone(880, 0.12);
  tone(1320, 0.18, "sine", 0.3, 0.08);
}

function playWinSound() {
  [523, 659, 784, 1047].forEach((note, i) => tone(note, 0.35, "triangle", 0.3, i * 0.13));
}

// ---------- More sounds: whoosh, boom, music pad, UI ----------
let noiseBuffer;
function getNoise() {
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; // random static
  }
  return noiseBuffer;
}

// Whoosh: static that goes through a filter whose pitch sweeps up or down
function whoosh(delay, duration, fromFreq, toFreq, volume) {
  if (muted) return;
  unlockAudio();
  const t = audio.currentTime + delay;
  const source = audio.createBufferSource();
  source.buffer = getNoise();
  source.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(fromFreq, t);
  filter.frequency.exponentialRampToValueAtTime(toFreq, t + duration);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume, t + duration * 0.5);
  gain.gain.linearRampToValueAtTime(0.0001, t + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  source.start(t);
  source.stop(t + duration);
}

// Boom: a deep thump
function boom(delay = 0) {
  if (muted) return;
  unlockAudio();
  const t = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(35, t + 0.7);
  gain.gain.setValueAtTime(0.6, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.8);
}

// Pad: a soft, warm chord that fades in. Returns an object so we can stop it later.
function pad(notes, volume, fadeIn) {
  if (muted) return null;
  unlockAudio();
  const t = audio.currentTime;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume, t + fadeIn);
  filter.connect(gain);
  gain.connect(audio.destination);

  const oscillators = [];
  notes.forEach((frequency) => {
    [-5, 5].forEach((detune) => { // two slightly different copies make it shimmer
      const osc = audio.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      oscillators.push(osc);
    });
  });

  return {
    stop(fade = 1) {
      const now = audio.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + fade);
      oscillators.forEach((osc) => osc.stop(now + fade + 0.05));
    },
  };
}

// Background music while playing
let ambient = null;
function startAmbient() {
  stopAmbient(0.1);
  ambient = pad([98, 147, 196, 247], 0.03, 2.5);
}
function stopAmbient(fade = 1) {
  if (ambient) ambient.stop(fade);
  ambient = null;
}

function playClick() {
  tone(600, 0.06, "square", 0.08);
  tone(900, 0.08, "square", 0.06, 0.04);
}

function playGoSound() {
  [523, 784, 1047].forEach((note, i) => tone(note, 0.5, "triangle", 0.3, i * 0.08));
}

// Sad "womp womp" for game over
function playGameOverSound() {
  boom();
  [392, 370, 349].forEach((note, i) => tone(note, 0.4, "triangle", 0.3, 0.5 + i * 0.42));
  tone(311, 1.4, "triangle", 0.3, 1.8);
}

document.querySelectorAll("button").forEach((button) => button.addEventListener("click", playClick));

// ============================================================
// 8. Keyboard
// ============================================================
const keys = {};
addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (state === "intro" && (e.code === "Space" || e.code === "Enter")) endIntro(); // skip the cutscene
  if (e.code === "KeyP" || e.code === "Escape") togglePause();
});
addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

// ============================================================
// 8b. Touch controls (phones and tablets): joystick + dash button
// ============================================================
const joystick = { x: 0, z: 0 };
const stick = $("stick");
const knob = $("knob");
const dashButton = $("dash");
let stickPointer = null;

function moveStick(e) {
  const rect = stick.getBoundingClientRect();
  const max = rect.width / 2;
  let dx = e.clientX - (rect.left + max);
  let dy = e.clientY - (rect.top + max);
  const length = Math.hypot(dx, dy);
  if (length > max) { dx = (dx / length) * max; dy = (dy / length) * max; } // keep the knob inside
  knob.style.transform = "translate(" + dx + "px, " + dy + "px)";
  joystick.x = Math.abs(dx / max) > 0.2 ? dx / max : 0; // small dead zone
  joystick.z = Math.abs(dy / max) > 0.2 ? dy / max : 0;
}
function releaseStick(e) {
  if (e.pointerId !== stickPointer) return;
  stickPointer = null;
  joystick.x = joystick.z = 0;
  knob.style.transform = "translate(0, 0)";
}
stick.addEventListener("pointerdown", (e) => { stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickPointer) moveStick(e); });
stick.addEventListener("pointerup", releaseStick);
stick.addEventListener("pointercancel", releaseStick);

// holding the dash button works like holding Shift
dashButton.addEventListener("pointerdown", (e) => { dashButton.setPointerCapture(e.pointerId); keys.shift = true; });
dashButton.addEventListener("pointerup", () => (keys.shift = false));
dashButton.addEventListener("pointercancel", () => (keys.shift = false));
$("pause-btn").addEventListener("click", () => togglePause());

// ============================================================
// 9. Page UI helpers
// ============================================================
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return m + ":" + s;
}

function updateScoreUI() {
  scoreEl.textContent = collected;
  fillEl.style.width = (collected / COINS_TO_WIN) * 100 + "%";

  // restart the little "pop" animation
  scoreEl.classList.remove("pop");
  void scoreEl.offsetWidth;
  scoreEl.classList.add("pop");
}

$("total").textContent = COINS_TO_WIN;
showBest();

// ============================================================
// 10. Start, win and play again
// ============================================================
function resetGame() {
  collected = 0;
  elapsed = 0;
  magnet = LEVELS[level].magnets;
  $("total").textContent = COINS_TO_WIN;
  $("lvl").textContent = level + 1;
  $("mag").textContent = magnet;
  updateScoreUI();
  timeEl.textContent = formatTime(0);
  player.position.set(0, 0.5, 0);
  buildLevel();
  showBest();
  $("brief").classList.remove("show");
  $("win").classList.remove("show");
  $("gameover").classList.remove("show");
  $("pause").classList.remove("show");
  $("confetti").innerHTML = "";
  Array.from($("stars").children).forEach((star) => star.classList.remove("on")); // so the stars pop again next time
  stamina = 1;
  exhausted = false;
  shake = 0;
  player.rotation.set(0, 0, 0);
  vel.x = vel.z = kick.x = kick.z = 0;
  player.visible = true;
  trimMaterial.color.setHex(trimColor);
  trimMaterial.emissive.setHex(trimColor);
  $("start-screen").classList.remove("show");
}

// "Play again" goes straight into the game
// one-time token from the server for each run (replay protection)
let runToken = null;
function getToken() { runToken = null; fetch("/api/runs/start", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()).then((d) => { runToken = d.token; }).catch(() => {}); }
function startGame() {
  if (level === 0) getToken();
  unlockAudio(); // this runs from a button click, so sound is allowed
  resetGame();
  startAmbient();
  setState("playing");
}

// ---------- Intro cutscene ----------
// The camera flies along a smooth curve through these points:
// a wide circle around the world, a low fly-by, a close-up on the cube,
// and finally the normal gameplay camera position (0, 12, 14).
const introEnd = new THREE.Vector3(0, 12, 14); // where the gameplay camera starts (changes with screen shape)
let introPath = null, CUT = null; // built from the current level's cutscene data (levels.js) when it starts
const lookTarget = new THREE.Vector3();
let introTime = 0;
let introMusic = null;

// Sound cues that play at certain times during the cutscene
let introCues = [];
const melodyScale = [220, 262, 294, 330, 392, 440, 524, 588];
const melodyPattern = [0, 2, 4, 5, 4, 2, 3, 1];
function runCue(c) { // c = [time, effect, ...args]
  const [, fx, ...a] = c;
  if (fx === "whoosh") whoosh(0, a[0], a[1], a[2], a[3]);
  else if (fx === "boom") boom();
  else if (fx === "tone") tone(a[0], a[1], a[2], a[3]);
  else if (fx === "chord") a[0].forEach((f, i) => tone(f, a[1], a[2], a[3], i * 0.05));
  else if (fx === "bell") [1319, 1568, 1976].forEach((f, i) => tone(f, 1.2, "sine", 0.12, i * 0.12));
  else if (fx === "thunder") { flash = 0.4; whoosh(0, 1.4, 250, 50, 0.35); boom(); }
}
function buildCues(cut) {
  const list = cut.cues.map((c) => ({ time: c[0], play: () => runCue(c) }));
  if (cut.melody) for (let i = 0; i < 14; i++) list.push({ time: 1.4 + i * 0.5, play: () => tone(melodyScale[melodyPattern[i % 8]], 0.7, "triangle", 0.1) });
  return list;
}

const captionEl = $("caption");
function showCaption(text) {
  if (captionEl.textContent === text) return;
  captionEl.textContent = text;
  captionEl.classList.remove("show");
  void captionEl.offsetWidth; // restart the fade animation
  if (text) captionEl.classList.add("show");
}

function startIntro() {
  unlockAudio();
  if (level === 0) { runSaved = false; getToken(); } // the Start button begins a new run: it needs a run token (later worlds keep the same run)
  resetGame();
  CUT = LEVELS[level].cut; // every world has its own cutscene
  introPath = new THREE.CatmullRomCurve3(CUT.path.map((q) => new THREE.Vector3(q[0], q[1], q[2])).concat(introEnd));
  introCues = buildCues(CUT);
  introTime = 0;
  introMusic = pad(CUT.music, CUT.vol, 3); // cutscene music
  setState("intro");
}

function endIntro() {
  if (!runToken) getToken(); // safety net if the first request failed
  camera.fov = 55;
  camera.updateProjectionMatrix();
  resetHazards(); // enemies go back to their starting spots
  showCaption("");
  showCaption("Go!");
  if (introMusic) introMusic.stop(0.5);
  introMusic = null;
  playGoSound();
  startAmbient();
  setState("playing");
}

function updateIntro(dt) {
  introTime += dt;
  introCues.forEach((cue) => {
    if (!cue.done && introTime >= cue.time) {
      cue.done = true;
      cue.play();
    }
  });
  const k = Math.min(introTime / CUT.time, 1);
  const eased = k * k * (3 - 2 * k); // slow start, slow finish

  camera.position.copy(introPath.getPointAt(eased));
  lookTarget.set(0, CUT.look[0] + (CUT.look[1] - CUT.look[0]) * eased, 0); // look at the world, then settle on the cube
  camera.lookAt(lookTarget);
  camera.fov = CUT.fov[1] + (CUT.fov[0] - CUT.fov[1]) * (1 - eased);    // starts wide, zooms in to normal
  camera.updateProjectionMatrix();

  player.rotation.y += dt;

  // captions appear at different times
  const cap = CUT.caps.find((c) => introTime >= c[0] && introTime < c[1]);
  showCaption(cap ? cap[2].replace("{coins}", COINS_TO_WIN) : "");

  if (k >= 1) endIntro();
}

// ---------- Falling off the edge ----------
let fallSpeed = 0;
let fallTime = 0;
const fallDirection = new THREE.Vector3();

function playFallSound() {
  if (muted) return;
  unlockAudio();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.setValueAtTime(700, audio.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, audio.currentTime + 1.4); // pitch drops
  gain.gain.setValueAtTime(0.25, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 1.4);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 1.4);
}

function startFalling(dx, dz) {
  setState("falling");
  fallSpeed = 0;
  fallTime = 0;
  fallDirection.set(dx, 0, dz).normalize().multiplyScalar(3); // keeps drifting the way it was moving
  stopAmbient(1.5);
  playFallSound();
}

function updateFalling(dt) {
  fallTime += dt;
  fallSpeed += 25 * dt; // gravity
  player.position.y -= fallSpeed * dt;
  player.position.addScaledVector(fallDirection, dt);
  player.rotation.x += 5 * dt; // tumble
  player.rotation.z += 3 * dt;

  // the camera follows the cube down and keeps it in the center of the screen
  cameraTarget.set(player.position.x, player.position.y + 7 * viewScale, player.position.z + 10 * viewScale);
  camera.position.lerp(cameraTarget, 0.12);
  camera.lookAt(player.position);

  // hit the valley far below? game over
  if (player.position.y < -27) {
    boom();
    gameOver();
  }
}

function gameOver(title = "Oops! You fell", text = "The cube slipped off the edge.") {
  setState("gameover");
  stopAmbient(1);
  $("gameover").querySelector("h1").textContent = title;
  $("gameover").querySelector("p").textContent = text;
  playGameOverSound();
  $("over-coins").textContent = collected + " / " + COINS_TO_WIN;
  run.score += collected * 100; run.coins += collected; run.ms += Math.round(elapsed * 1000);
  $("over-card").textContent = "Reached level " + (level + 1) + "  run score " + run.score;
  submitRun(level + 1, false);
  $("gameover").classList.add("show");
}

function launchConfetti() {
  const colors = ["#ffcf5c", "#36e0ff", "#ff6ad5", "#7a5cff", "#ffffff"];
  for (let i = 0; i < 70; i++) {
    const piece = document.createElement("i");
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = 2.5 + Math.random() * 2.5 + "s";
    piece.style.animationDelay = Math.random() * 1.2 + "s";
    $("confetti").appendChild(piece);
  }
}

function togglePause() {
  if (state === "playing") {
    setState("paused");
    $("pause").classList.add("show");
  } else if (state === "paused") {
    setState("playing");
    $("pause").classList.remove("show");
  }
}

function winGame() {
  setState("won");
  stopAmbient(2);
  burst(player.position, 60); // celebration

  const isNewBest = !bests[level] || elapsed < bests[level];
  if (isNewBest) {
    bests[level] = elapsed;
    try { localStorage.setItem("coin-drift-bests", JSON.stringify(bests)); } catch (e) {}
    showBest();
  }

  // stars depend on how fast you were
  const L = LEVELS[level];
  const goals = L.objectives.map(objOk); // each level has its own goals: clear it = 1 star, +1 per bonus goal
  const starCount = 1 + goals.filter(Boolean).length;
  // scorecard: 100/coin + gems + 250/star + speed bonus
  const pts = collected * 100 + gemScore + starCount * 250 + Math.max(0, Math.round((L.par - elapsed) * 10));
  run.score += pts; run.coins += collected; run.ms += Math.round(elapsed * 1000); run.stars += starCount;
  const last = level === LEVELS.length - 1;
  if (last) submitRun(level + 1, true);

  // show the win screen shortly after
  setTimeout(() => {
    showWinExtras(L, goals, starCount, last);
    $("final-time").textContent = formatTime(elapsed);
    $("win-best").textContent = formatTime(bests[level]);
    $("new-best").style.display = isNewBest ? "block" : "none";
    Array.from($("stars").children).forEach((star, i) => {
      star.classList.toggle("on", i < starCount);
      star.style.animationDelay = 0.5 + i * 0.3 + "s"; // stars pop in one by one
    });
    $("scorecard").textContent = "Level " + (level + 1) + "/" + LEVELS.length + "  +" + pts + " pts  run total " + run.score;
    $("again").textContent = last ? "Play again" : "Next level";
    $("win").classList.add("show");
    launchConfetti();
    playWinSound();
  }, 700);
}

function collectCoin(coin) {
  shake = 0.3;
  burst(coin.position);
  playCoinSound();
  scene.remove(coin);
  coins.splice(coins.indexOf(coin), 1);

  collected++;
  updateScoreUI();
  if (collected === COINS_TO_WIN) winGame();
}

// ---------- Raycasting: point at a coin with the mouse/finger ----------
// hover = coin grows; click/tap = costs 1 magnet charge + 2s penalty, coin flies to you
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
let hovered = null;
function pickCoin(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(coins, true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (o && !coins.includes(o)) o = o.parent;
  return o || null;
}
const canvasEl = renderer.domElement;
canvasEl.addEventListener("pointermove", (e) => {
  if (state !== "playing" || e.pointerType !== "mouse") { hovered = null; return; }
  hovered = pickCoin(e);
  canvasEl.style.cursor = hovered && magnet > 0 ? "pointer" : "default";
});
canvasEl.addEventListener("pointerdown", (e) => {
  if (state !== "playing" || magnet <= 0) return;
  const coin = pickCoin(e);
  if (!coin || coin.userData.pull) return;
  coin.userData.pull = true;
  magnet--; magnetsUsed++; elapsed += 2;
  $("mag").textContent = magnet;
  whoosh(0, 0.4, 400, 2000, 0.2);
});

$("start").addEventListener("click", startIntro);
$("skip").addEventListener("click", () => state === "intro" && endIntro());
$("again").addEventListener("click", () => { if (level < LEVELS.length - 1) { level++; applyLevel(); showBriefing(); } else { newRun(); startGame(); } }); // next level (briefing card first), or a fresh run
$("b-go").addEventListener("click", startIntro); // each new world opens with its own cutscene
$("retry").addEventListener("click", () => { newRun(); startGame(); });
$("exit").addEventListener("click", () => { // wait (max 1.5s) for the save so the dashboard shows this run right away
  Promise.race([saveProgress(), new Promise((r) => setTimeout(r, 1500))]).finally(() => (location.href = "/dashboard"));
});
addEventListener("pagehide", saveProgress);
$("resume").addEventListener("click", togglePause);
$("mute").addEventListener("click", () => {
  muted = !muted;
  $("mute").textContent = muted ? "Sound off" : "Sound on";
  if (muted) {
    stopAmbient(0.2);
    if (introMusic) introMusic.stop(0.2);
  } else {
    playCoinSound(); // quick test beep
    if (state === "playing") startAmbient();
  }
});

// ============================================================
// 10b. Level system: themes, rocks, sentries, pickups, goals
// ============================================================
let gripT = 0, phaseT = 0, warpT = 0, powerCd = 0, strikeT = 2;
let theme = null, hearts = 3, shield = 0, invuln = 0, damage = 0, magnetsUsed = 0, gems = 0, gemScore = 0, bonusTime = 0, flash = 0, trimColor = 0x36e0ff, lastHud = "";
const vel = { x: 0, z: 0 }, kick = { x: 0, z: 0 }; // vel = your own motion (slides on ice), kick = knockback from a hit
const obstacles = [], hazards = [], pickups = [], strikes = [];
player.material.transparent = true;
const levelGroup = new THREE.Group();
scene.add(levelGroup);
const hazardMat = new THREE.MeshStandardMaterial({ color: 0xff3355, emissive: 0xff1133, emissiveIntensity: 1.2, flatShading: true });
const rockMat = new THREE.MeshStandardMaterial({ flatShading: true });
const PICKUPS = {
  shield: [0x36e0ff, new THREE.TorusGeometry(0.45, 0.13, 8, 20)], heart: [0xff6a8a, new THREE.SphereGeometry(0.42, 12, 12)],
  time: [0x7dff9a, new THREE.BoxGeometry(0.65, 0.65, 0.65)], gem: [0xb36bff, new THREE.OctahedronGeometry(0.6)],
};
const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: 0x36e0ff, transparent: true, opacity: 0.25 }));
shieldMesh.visible = false;
player.add(shieldMesh);

// ---- Goals ----
const objText = (o) => ({ time: "Finish under " + o.v + "s", nohit: "Take no damage", nomagnet: "Use no magnets", gems: "Collect every gem", left: "Finish with " + o.v + "s left" })[o.t];
function objState(o) { // "" = still possible, "ok" = done, "fail" = can't be earned any more
  const L = LEVELS[level], left = (L.limit || 0) + bonusTime - elapsed;
  switch (o.t) {
    case "time": return elapsed > o.v ? "fail" : "";
    case "nohit": return damage > 0 ? "fail" : "";
    case "nomagnet": return magnetsUsed > 0 ? "fail" : "";
    case "gems": return gems >= L.gems ? "ok" : "";
    case "left": return left < o.v ? "fail" : "";
  }
  return "";
}
const objOk = (o) => objState(o) !== "fail" && (o.t !== "gems" || gems >= LEVELS[level].gems);

function updateHud() {
  const L = LEVELS[level];
  const P = L.power;
  $("pbar").style.width = (powerCd > 0 ? 1 - powerCd / P.cd : 1) * 100 + "%";
  $("hearts").textContent = "\u2665".repeat(Math.max(hearts, 0)) + "\u2661".repeat(Math.max(L.hearts - hearts, 0)) + (shield ? "  \u25C8" + shield : "");
  const rows = ['<li class="' + (collected >= L.coins ? "ok" : "") + '">Coins ' + collected + "/" + L.coins + "</li>"]
    .concat(L.objectives.map((o) => '<li class="' + objState(o) + '">' + objText(o) + (o.t === "gems" ? " " + gems + "/" + L.gems : "") + "</li>")).join("");
  if (rows !== lastHud) { lastHud = rows; $("goals").innerHTML = "<b>Goals</b><ul>" + rows + "</ul>"; }
}

// ---- Looks ----
function setSky(horizon, top) {
  const a = sky.geometry.attributes.color, h = new THREE.Color(horizon), t = new THREE.Color(top), c = new THREE.Color();
  for (let i = 0; i < a.count; i++) {
    c.copy(h).lerp(t, Math.pow(Math.max(skyPositions.getY(i) / SKY_RADIUS, 0), 0.5));
    a.setXYZ(i, c.r, c.g, c.b);
  }
  a.needsUpdate = true;
}
function applyTheme(T) {
  theme = T;
  setSky(T.sky[0], T.sky[1]);
  scene.fog.color.setHex(T.fog); scene.fog.near = T.fogNear; scene.fog.far = T.fogFar;
  hemi.color.setHex(T.hemi[0]); hemi.groundColor.setHex(T.hemi[1]); sun.color.setHex(T.sun);
  ground.material.color.setHex(T.ground); ground.material.roughness = T.rough; ground.material.metalness = T.metal;
  platform.material.color.setHex(T.base); underside.material.color.setHex(T.base);
  outerGround.material.color.setHex(T.void); outerGround.material.emissive.setHex(T.voidGlow);
  arena.remove(grid);
  grid = new THREE.GridHelper(GROUND_SIZE, 40, T.grid[0], T.grid[1]);
  grid.position.y = 0.01; grid.material.transparent = true; grid.material.opacity = 0.35;
  arena.add(grid);
  trimColor = T.trim;
  [trimMaterial, pillarMaterial].forEach((m) => { m.color.setHex(T.trim); m.emissive.setHex(T.trim); });
  leafMaterial.color.setHex(T.leaf); leafMaterial.emissive.setHex(T.leafGlow); mountainMaterial.color.setHex(T.mount);
  [moon, moonGlow].forEach((m) => { m.material.color.setHex(T.moon[0]); m.scale.setScalar(T.moon[1]); });
  crystals.forEach((c, i) => { c.material.color.setHex(T.crystals[i % 3]); c.material.emissive.setHex(T.crystals[i % 3]); });
  stars.visible = T.stars;
  fireflies.material.color.setHex(T.fx.color); fireflies.material.size = T.fx.size; fxMode = T.fx.mode; fxSpeed = T.fx.speed;
  rockMat.color.setHex(T.rock); rockMat.emissive.setHex(T.rockGlow);
}
function applyArena(m = 1) { // m < 1 = the arena has shrunk
  const s = LEVELS[level].size * m;
  arena.scale.set(s, 1, s);
  half = (GROUND_SIZE / 2) * s;
}

// ---- Placement helpers (keep coins and pickups out of rocks) ----
const spawnRange = () => { const L = LEVELS[level]; return (GROUND_SIZE / 2) * L.size * (L.shrink ? 1 - L.shrink.amount : 1) - 3; };
function placeSpot(pad) {
  const R = spawnRange(); let x, z, n = 0;
  do { x = (Math.random() * 2 - 1) * R; z = (Math.random() * 2 - 1) * R; n++; }
  while (n < 60 && (Math.hypot(x, z) < 4 || obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad)));
  return [x, z];
}

// ---- Build a whole level ----
function buildLevel() {
  const L = LEVELS[level], R = spawnRange();
  applyTheme(L.theme);
  applyArena();
  $("lvls").textContent = LEVELS.length; $("lname").textContent = L.name; $("tmode").textContent = L.limit ? "time left" : "time";
  hearts = L.hearts; shield = 0; damage = 0; magnetsUsed = 0; gems = 0; gemScore = 0; bonusTime = 0; invuln = 1.5; lastHud = "";
  while (levelGroup.children.length) levelGroup.remove(levelGroup.children[0]);
  obstacles.length = hazards.length = pickups.length = strikes.length = 0;
  gripT = phaseT = warpT = powerCd = 0; strikeT = 2; $("pname").textContent = L.power.name;

  for (let i = 0; i < (L.rocks || 0); i++) { // rocks you can't walk through
    const [x, z] = placeSpot(2.5), rad = 1 + Math.random() * 0.9, h = 1.2 + Math.random() * 2.2, shape = L.theme.rockShape;
    const geo = shape === "box" ? new THREE.BoxGeometry(rad * 1.8, h, rad * 1.8) : shape === "cone" ? new THREE.ConeGeometry(rad, h * 1.4, 5) : new THREE.CylinderGeometry(rad * 0.8, rad, h, 6);
    const rock = new THREE.Mesh(geo, rockMat);
    rock.position.set(x, shape === "cone" ? h * 0.7 : h / 2, z); rock.rotation.y = Math.random() * 3; rock.castShadow = true;
    levelGroup.add(rock); obstacles.push({ x, z, r: rad * 0.95 + 0.5 });
  }
  (L.hazards || []).forEach((H) => { // each world has its own enemies
    const lk = H.look, sz = lk.size, mat = new THREE.MeshStandardMaterial({ color: lk.color, emissive: lk.color, emissiveIntensity: 1, flatShading: true });
    for (let i = 0; i < H.n; i++) {
      const geo = lk.shape === "cone" ? new THREE.ConeGeometry(sz, sz * 2.2, 6) : lk.shape === "oct" ? new THREE.OctahedronGeometry(sz) : lk.shape === "box" ? new THREE.BoxGeometry(sz * 1.6, sz * 1.6, sz * 1.6) : lk.shape === "torus" ? new THREE.TorusGeometry(sz, sz * 0.3, 8, 16) : new THREE.IcosahedronGeometry(sz, 1);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.position.y = 0.7;
      const h = { m, type: H.type, speed: H.speed, t: 0, stun: 0, hit: sz + 0.5, phase: Math.random() * 6.28, axis: i % 2, lane: (Math.random() * 2 - 1) * R, ext: R, rad: 5 + Math.random() * Math.max(R - 6, 2), pull: H.speed, rng: 9 };
      if (H.type === "chase") m.position.set((i % 2 ? 1 : -1) * R, 0.7, (i < 2 ? 1 : -1) * R);
      if (H.type === "ricochet") { const a = Math.random() * 6.28; h.dx = Math.cos(a) * H.speed; h.dz = Math.sin(a) * H.speed; m.position.set((Math.random() * 2 - 1) * R, 0.7, (i % 2 ? 0.9 : -0.9) * R); }
      if (H.type === "well") { const ring = new THREE.Mesh(new THREE.TorusGeometry(sz * 2.4, 0.15, 8, 32), mat); ring.rotation.x = Math.PI / 2; m.add(ring); }
      levelGroup.add(m); hazards.push(h);
      moveHazard(h, 0, false); h.p0 = m.position.clone(); // starting spot
    }
  });
  const addPickup = (kind) => {
    const [x, z] = placeSpot(1), [color, geo] = PICKUPS[kind];
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }));
    m.position.set(x, 1.1, z); levelGroup.add(m); pickups.push({ m, kind, color });
  };
  Object.entries(L.pickups || {}).forEach(([k, n]) => { for (let i = 0; i < n; i++) addPickup(k); });
  for (let i = 0; i < (L.gems || 0); i++) addPickup("gem");
  spawnCoins();
  updateHud();
}

// ---- Enemy movement (shared by gameplay and cutscenes) ----
function moveHazard(h, dt, live) {
  const p = h.m.position;
  h.t += dt;
  if (h.type === "patrol") { const v = Math.sin((h.t * h.speed) / h.ext + h.phase) * h.ext; h.axis ? p.set(h.lane, 0.7, v) : p.set(v, 0.7, h.lane); }
  else if (h.type === "orbit") { const a = (h.t * h.speed) / h.rad + h.phase; p.set(Math.cos(a) * h.rad, 0.7, Math.sin(a) * h.rad); }
  else if (h.type === "ricochet") { // flies straight, bounces off the arena edge
    p.x += h.dx * dt; p.z += h.dz * dt;
    if (Math.abs(p.x) > h.ext) { h.dx = -h.dx; p.x = Math.sign(p.x) * h.ext; }
    if (Math.abs(p.z) > h.ext) { h.dz = -h.dz; p.z = Math.sign(p.z) * h.ext; }
  } else if (h.type === "well") p.set(Math.cos(h.t * 0.3 + h.phase) * h.ext * 0.5, 0.7, Math.sin(h.t * 0.23 + h.phase) * h.ext * 0.5);
  else if (live) { const dx = player.position.x - p.x, dz = player.position.z - p.z, d = Math.hypot(dx, dz) || 1; p.x += (dx / d) * h.speed * dt; p.z += (dz / d) * h.speed * dt; }
  h.m.rotation.y += 2 * dt;
}
function resetHazards() { hazards.forEach((h) => { h.t = 0; h.stun = 0; if (h.type === "chase" || h.type === "ricochet") h.m.position.copy(h.p0); else moveHazard(h, 0, false); }); }
function addStrike(at) {
  const r = LEVELS[level].strikes.radius, c = LEVELS[level].strikes.color;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.15, r, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  [ring, fill].forEach((m) => { m.rotation.x = -Math.PI / 2; m.position.set(at[0], 0.06, at[1]); levelGroup.add(m); });
  fill.scale.setScalar(0.01);
  strikes.push({ x: at[0], z: at[1], t: 0, boom: false, ring, fill });
}

// ---- World powers (E or Space, or the Power button on touch) ----
function usePower() {
  const P = LEVELS[level].power;
  if (state !== "playing" || powerCd > 0) return;
  powerCd = P.cd;
  burst(player.position, 36, P.color); whoosh(0, 0.5, 300, 2400, 0.25);
  if (P.id === "pulse") coins.forEach((c) => { if (c.position.distanceTo(player.position) < 11) c.userData.pull = true; });
  else if (P.id === "nova") { hazards.forEach((h) => (h.stun = 4)); strikes.forEach((k) => { levelGroup.remove(k.fill); levelGroup.remove(k.ring); }); strikes.length = 0; }
  else if (P.id === "grip") gripT = 4;
  else if (P.id === "warp") warpT = 4;
  else if (P.id === "phase") { phaseT = 2.5; invuln = Math.max(invuln, 2.5); }
}
addEventListener("keydown", (e) => { if (state === "playing" && (e.code === "KeyE" || e.code === "Space")) { usePower(); e.preventDefault(); } });
$("power").addEventListener("pointerdown", usePower);

// ---- Hit by a sentry ----
function hurt(fx, fz) {
  invuln = 1.6; shake = 0.6; boom();
  const dx = player.position.x - fx, dz = player.position.z - fz, d = Math.hypot(dx, dz) || 1;
  kick.x = (dx / d) * 14; kick.z = (dz / d) * 14;
  if (shield > 0) { shield--; burst(player.position, 18, 0x36e0ff); return; }
  damage++; hearts--;
  burst(player.position, 18, 0xff3355);
  if (hearts <= 0) gameOver("Caught!", "The sentries got you.");
}

// ---- Runs every frame while playing ----
function updateLevel(dt, time) {
  const L = LEVELS[level];
  if (invuln > 0) invuln -= dt;
  player.visible = phaseT > 0 || invuln <= 0 || Math.floor(invuln * 12) % 2 === 0;
  shieldMesh.visible = shield > 0;
  if (L.shrink) applyArena(1 - L.shrink.amount * Math.min(Math.max((elapsed - L.shrink.start) / (L.limit - L.shrink.start), 0), 1));
  if (L.limit && L.limit + bonusTime - elapsed <= 0) { gameOver("Time's up!", "The clock ran out."); return; }

  if (gripT > 0) gripT -= dt;
  if (phaseT > 0) phaseT -= dt;
  if (warpT > 0) warpT -= dt;
  if (powerCd > 0) powerCd -= dt;
  player.material.opacity = phaseT > 0 ? 0.35 : 1;
  const hdt = dt * (warpT > 0 ? 0.3 : 1); // Time Warp slows enemies and lightning
  hazards.forEach((h) => {
    if (h.stun > 0) { h.stun -= dt; h.m.rotation.x += 8 * dt; return; }
    moveHazard(h, hdt, true);
    const p = h.m.position, d = Math.hypot(p.x - player.position.x, p.z - player.position.z);
    if (h.type === "well" && phaseT <= 0 && d < h.rng && d > 0.1) { // gravity well drags you in
      const w = 1 - d / h.rng;
      kick.x += ((p.x - player.position.x) / d) * h.pull * w * dt; kick.z += ((p.z - player.position.z) / d) * h.pull * w * dt;
    }
    if (invuln <= 0 && d < h.hit) hurt(p.x, p.z);
  });
  if (L.strikes) { // lava bombs / lightning: a ring shows where, then it explodes
    strikeT -= hdt;
    if (strikeT <= 0) { strikeT = L.strikes.every; addStrike(Math.random() < L.strikes.aim ? [player.position.x, player.position.z] : placeSpot(0)); }
  }
  for (let i = strikes.length - 1; i >= 0; i--) {
    const k = strikes[i];
    k.t += hdt;
    if (!k.boom) {
      k.fill.scale.setScalar(Math.max(Math.min(k.t / L.strikes.delay, 1), 0.01));
      if (k.t >= L.strikes.delay) {
        k.boom = true; k.t = 0; k.fill.scale.setScalar(1); k.fill.material.opacity = 0.9;
        burst(new THREE.Vector3(k.x, 0.5, k.z), 22, L.strikes.color); whoosh(0, 0.5, 700, 70, 0.25);
        if (theme.storm) flash = 0.15;
        if (invuln <= 0 && Math.hypot(k.x - player.position.x, k.z - player.position.z) < L.strikes.radius) hurt(k.x, k.z);
      }
    } else {
      k.fill.material.opacity = Math.max(0, 0.9 - k.t * 3);
      if (k.t > 0.3) { levelGroup.remove(k.fill); levelGroup.remove(k.ring); strikes.splice(i, 1); }
    }
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const k = pickups[i], m = k.m;
    m.rotation.y += 2 * dt; m.position.y = 1.1 + Math.sin(time * 2.5 + i) * 0.2;
    if (Math.hypot(m.position.x - player.position.x, m.position.z - player.position.z) < 1.3) {
      levelGroup.remove(m); pickups.splice(i, 1);
      burst(m.position, 14, k.color); tone(1200, 0.15, "triangle", 0.25); tone(1600, 0.2, "triangle", 0.25, 0.08);
      if (k.kind === "gem") { gems++; gemScore += 300; }
      else if (k.kind === "shield") shield = Math.min(shield + 1, 2);
      else if (k.kind === "heart") hearts = Math.min(hearts + 1, L.hearts);
      else if (k.kind === "time") bonusTime += 8;
    }
  }
  updateHud();
}

// ---- Screens between levels ----
function showBriefing() { // a card with the next world's rules and goals, over a preview of that world
  resetGame(); setState("menu");
  const L = LEVELS[level];
  $("b-num").textContent = "Level " + (level + 1) + " of " + LEVELS.length;
  $("b-name").textContent = L.name; $("b-blurb").textContent = L.blurb; $("b-feat").textContent = L.feat;
  $("b-enemy").textContent = "Enemies: " + L.enemies;
  $("b-power").textContent = "Your power: " + L.power.name + " [E / Space] " + L.power.desc;
  $("b-goals").innerHTML = ["Collect all " + L.coins + " coins"].concat(L.objectives.map(objText)).map((t) => "<li>\u2605 " + t + "</li>").join("");
  $("brief").classList.add("show");
}
function showWinExtras(L, goals, starCount, last) {
  $("win").querySelector("h1").textContent = last ? "All worlds cleared!" : L.name + " cleared!";
  $("win").querySelector("p").textContent = last ? "You are a Coin Drift legend." : "Next up: " + LEVELS[level + 1].name;
  $("win-goals").innerHTML = ['<li class="ok">Collect all ' + L.coins + " coins</li>"].concat(L.objectives.map((o, i) => '<li class="' + (goals[i] ? "ok" : "fail") + '">' + objText(o) + "</li>")).join("");
  $("ach").style.display = starCount === 3 ? "block" : "none";
  $("ach").textContent = "Badge earned: " + L.badge;
}

// ============================================================
// 11. Game loop - runs every frame
// ============================================================
const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3();
let half = GROUND_SIZE / 2; // distance from the center to the edge (shrinks on some levels)

buildLevel(); // the first world is visible behind the start screen

function movePlayer(dt) {
  const dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joystick.x;
  const dz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + joystick.z;

  // Shift = dash. It uses up energy, and energy comes back when you stop dashing.
  const dashing = keys.shift && (dx || dz) && !exhausted;
  if (dashing) {
    stamina -= 0.5 * dt;
    if (stamina <= 0) { stamina = 0; exhausted = true; }
    trailTimer -= dt;
    if (trailTimer <= 0) { trailTimer = 0.03; burst(player.position, 2, 0x36e0ff); } // cyan trail
  } else {
    stamina = Math.min(1, stamina + 0.25 * dt);
    if (stamina > 0.3) exhausted = false;
  }
  staminaEl.style.width = stamina * 100 + "%";
  dashButton.style.setProperty("--energy", stamina); // the ring on the touch dash button
  const speed = (dashing ? PLAYER_SPEED * DASH_MULTIPLIER : PLAYER_SPEED) * (phaseT > 0 ? 1.3 : gripT > 0 ? 1.2 : 1);

  const length = Math.hypot(dx, dz); // same speed on diagonals
  const power = Math.min(length, 1);  // a gentle push on the stick = slower
  const k = 1 - Math.exp(-(gripT > 0 ? 40 : LEVELS[level].grip || 40) * dt); // grip: high = stops at once, low (ice) = slides
  vel.x += ((length ? (dx / length) * speed * power : 0) - vel.x) * k;
  vel.z += ((length ? (dz / length) * speed * power : 0) - vel.z) * k;
  kick.x *= Math.exp(-5 * dt); kick.z *= Math.exp(-5 * dt);
  player.position.x += (vel.x + kick.x) * dt;
  player.position.z += (vel.z + kick.z) * dt;
  if (Math.hypot(vel.x, vel.z) > 0.5) player.rotation.y += 6 * dt; // spin while moving
  (phaseT > 0 ? [] : obstacles).forEach((o) => { // rocks push you back out (ghosts pass through)
    const ox = player.position.x - o.x, oz = player.position.z - o.z, d = Math.hypot(ox, oz);
    if (d < o.r && d > 0) { player.position.x = o.x + (ox / d) * o.r; player.position.z = o.z + (oz / d) * o.r; vel.x *= 0.3; vel.z *= 0.3; }
  });

  // near the edge? the border glows red as a warning
  const edgeDistance = half - Math.max(Math.abs(player.position.x), Math.abs(player.position.z));
  const danger = edgeDistance < 2;
  trimMaterial.color.setHex(danger ? 0xff3355 : trimColor);
  trimMaterial.emissive.setHex(danger ? 0xff3355 : trimColor);

  // past the edge? start falling
  if (edgeDistance < 0) startFalling(vel.x + kick.x, vel.z + kick.z);

  // camera smoothly follows the player
  cameraTarget.set(player.position.x, 12 * viewScale, player.position.z + 14 * viewScale);
  camera.position.lerp(cameraTarget, 0.06);
  if (shake > 0) { // small shake when you grab a coin
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2);
  }
  camera.lookAt(player.position);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta(); // seconds since the last frame
  const time = clock.elapsedTime;

  if (state === "playing") {
    elapsed += dt;
    const L = LEVELS[level];
    timeEl.textContent = formatTime(L.limit ? Math.max(0, L.limit + bonusTime - elapsed) : elapsed); // countdown on timed levels
    movePlayer(dt);
    if (state === "playing") updateLevel(dt, time);
  } else if (state === "won") {
    // the cube jumps and spins while the camera circles around it
    player.rotation.y += 3 * dt;
    player.position.y = 0.5 + Math.abs(Math.sin(time * 4)) * 0.8;
    camera.position.set(player.position.x + Math.sin(time * 0.6) * 9 * viewScale, 5 * viewScale, player.position.z + Math.cos(time * 0.6) * 9 * viewScale);
    camera.lookAt(player.position);
  } else if (state === "falling") {
    updateFalling(dt);
  } else if (state === "intro") {
    updateIntro(dt);
  } else if (state === "menu") {
    // slow camera orbit behind the start screen
    camera.position.set(Math.sin(time * 0.15) * 36 * viewScale, 15 * viewScale, Math.cos(time * 0.15) * 36 * viewScale);
    camera.lookAt(0, 0, 0);
  }

  // coins: spin, bob, and check if the player touches them
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    coin.rotation.y += 2.5 * dt;
    if (coin.userData.pull) coin.position.lerp(player.position, Math.min(1, 8 * dt)); // magnetized by a click
    else coin.position.y = 1 + Math.sin(time * 2 + coin.userData.offset) * 0.25;
    coin.scale.setScalar(coin === hovered ? 1.35 : 1); // hover highlight

    if (state === "playing" && coin.position.distanceTo(player.position) < 1.1) {
      collectCoin(coin);
    }
  }

  // sparkles fly up, fall, and fade out
  for (let i = sparks.length - 1; i >= 0; i--) {
    const spark = sparks[i];
    spark.userData.velocity.y -= 9 * dt; // gravity
    spark.position.addScaledVector(spark.userData.velocity, dt);
    spark.userData.life -= dt * 1.5;
    spark.material.opacity = Math.max(spark.userData.life, 0);

    if (spark.userData.life <= 0) {
      scene.remove(spark);
      spark.material.dispose();
      sparks.splice(i, 1);
    }
  }

  // background motion
  crystals.forEach((c, i) => {
    c.rotation.x += 0.2 * dt;
    c.rotation.y += 0.3 * dt;
    c.position.y += Math.sin(time + i) * 0.4 * dt;
  });
  stars.rotation.y += 0.004 * dt;
  if (state === "intro" || state === "menu") hazards.forEach((h) => moveHazard(h, dt, false)); // enemies move during cutscenes
  updateFireflies(time);
  if (theme && theme.storm) { // lightning
    flash -= dt;
    if (flash <= 0 && Math.random() < 0.004) { flash = 0.2; whoosh(0.1, 0.8, 300, 60, 0.2); }
  }
  hemi.intensity = 0.9 + (flash > 0 ? 2.4 : 0);

  renderer.render(scene, camera);
}
animate();

// ============================================================
// 12. Keep the canvas the right size
// ============================================================
function fitCamera() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / height;

  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.5 : 2));

  // Tall, narrow screens (phones held upright): pull the camera back so more of the arena is visible
  viewScale = Math.max(1, Math.pow(1.6 / aspect, 0.75));
  introEnd.set(0, 12 * viewScale, 14 * viewScale);
  if (introPath) introPath.updateArcLengths();
}
addEventListener("resize", fitCamera);
addEventListener("orientationchange", () => setTimeout(fitCamera, 200));
fitCamera();