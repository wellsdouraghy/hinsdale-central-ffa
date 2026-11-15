// Third-person motion harness (silent). A RemotePlayer is fed scripted 'st' samples (the same shape the network
// sends) and filmed by a fixed follow camera over a 1 m checker floor, so foot skating and pose changes are visible.
//   ?s=<scenario>   loop one scenario live (see SCEN)      ?view=q|side|front|back      ?look=<outfit id>   ?speed=0.25
//   window.anim.strip(name, scenario, [t...], view)  -> POSTs a contact strip to the local shot receiver (port 5199)
//   window.anim.sheet(name, [scenario...])           -> several strips stacked in one image
//   window.anim.all(prefix)                          -> strips for every scenario
//   window.anim.perf(n, frames)                      -> ms per character.update over n characters
import * as THREE from 'three';
import { RemotePlayer } from '../src/game/remotePlayer.js';
import { charactersReady } from '../src/visuals/character.js';

const Q = new URLSearchParams(location.search);
const W = 380, H = 440;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb4c8);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 300);
scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x55584c, 1.5));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 8, bottom: -4, near: 1, far: 40 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
// 1 m checker floor
const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d');
cx.fillStyle = '#8d9188'; cx.fillRect(0, 0, 128, 128); cx.fillStyle = '#7b8077'; cx.fillRect(0, 0, 64, 64); cx.fillRect(64, 64, 64, 64);
cx.strokeStyle = '#5d6159'; cx.lineWidth = 2; cx.strokeRect(0, 0, 128, 128);
const ftex = new THREE.CanvasTexture(cv); ftex.wrapS = ftex.wrapT = THREE.RepeatWrapping; ftex.repeat.set(200, 200); ftex.colorSpace = THREE.SRGBColorSpace; ftex.anisotropy = 8;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// props
const propMat = new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.9 });
const ledge = new THREE.Mesh(new THREE.BoxGeometry(4, 1.7, 3), propMat); ledge.castShadow = ledge.receiveShadow = true; ledge.visible = false; scene.add(ledge);
const ladder = new THREE.Group(); ladder.visible = false; scene.add(ladder);
{
  const m = new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.6, metalness: 0.6 });
  for (const x of [-0.25, 0.25]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 9), m); r.position.set(x, 4.5, 0); ladder.add(r); }
  for (let y = 0.3; y < 9; y += 0.3) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5), m); r.rotation.z = Math.PI / 2; r.position.y = y; ladder.add(r); }
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 0.3), propMat); wall.position.set(0, 4.5, -0.25); ladder.add(wall);
}
const anchorM = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xffcc33 })); anchorM.visible = false; scene.add(anchorM);
const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x111111 })); cable.frustumCulled = false; cable.visible = false; scene.add(cable);

// ---- scenarios: t -> 'st' sample { p, v, yaw, pitch, c, s, g, a, m, ga, w } ------------------------------------------
const G = 22, sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const base = (o) => ({ p: [0, 0, 0], v: [0, 0, 0], yaw: 0, pitch: 0, c: 0, s: 0, g: 1, w: 'ar', ...o });
const line = (vx, vz, o = {}) => (t) => base({ p: [vx * t, 0, vz * t], v: [vx, 0, vz], ...o });
function jumpY(t, t0, v0) { const u = t - t0; if (u < 0) return null; const y = v0 * u - 0.5 * G * u * u; return y > 0 ? { y, vy: v0 - G * u } : null; }
const SCEN = {
  idle: { fn: () => base({}), times: [0.5, 1.5, 2.5], view: 'q' },
  aim: { fn: (t) => base({ pitch: Math.sin(t * 2) * 0.9 }), times: [0.78, 1.57, 2.36], view: 'side' },
  walk: { fn: line(0, -5), times: [1, 1.1, 1.2, 1.3, 1.4, 1.5], view: 'side' },
  adswalk: { fn: line(0, -3, { a: 1 }), times: [1, 1.15, 1.3, 1.45], view: 'q' },
  sniperads: { fn: (t) => base({ w: 'sniper', a: sm((t - 0.4) / 0.36) }), times: [0.3, 0.6, 1.2], view: 'q' },
  strafe: { fn: line(5, 0), times: [1, 1.1, 1.2, 1.3, 1.4, 1.5], view: 'front' },
  backpedal: { fn: line(0, 5), times: [1, 1.1, 1.2, 1.3, 1.4, 1.5], view: 'side' },
  diag: { fn: line(3.5, -3.5), times: [1, 1.15, 1.3, 1.45], view: 'q' },
  sprint: { fn: line(0, -7.5, { s: 1 }), times: [1, 1.08, 1.16, 1.24, 1.32, 1.4], view: 'side' },
  crouch: { fn: (t) => base({ c: t > 0.3 ? 1 : 0 }), times: [0.2, 0.45, 1.2], view: 'q' },
  crouchwalk: { fn: line(0, -2.5, { c: 1 }), times: [1, 1.2, 1.4, 1.6], view: 'side' },
  startstop: {
    fn: (t) => { const k = t < 0.3 ? 0 : t < 1.3 ? 1 - Math.exp(-14 * (t - 0.3)) : Math.exp(-14 * (t - 1.3)); const d = t < 0.3 ? 0 : t < 1.3 ? 5 * (t - 0.3) - 5 / 14 * (1 - Math.exp(-14 * (t - 0.3))) : 5 - 5 / 14 + 5 / 14 * (1 - Math.exp(-14 * (t - 1.3))); return base({ p: [0, 0, -d], v: [0, 0, -5 * k] }); },
    times: [0.25, 0.4, 0.55, 1.2, 1.36, 1.5, 1.8], view: 'side',
  },
  turn: { fn: (t) => base({ yaw: -1.6 * sm((t - 0.5) / 0.25) }), times: [0.45, 0.62, 0.75, 0.95, 1.4], view: 'q' },
  slide: {
    fn: (t) => { if (t < 0.6) return base({ p: [0, 0, -7.5 * t], v: [0, 0, -7.5], s: 1 }); const u = t - 0.6; if (u < 0.8) { const sp = 10 * Math.exp(-2.2 * u); return base({ p: [0, 0, -4.5 - 10 / 2.2 * (1 - Math.exp(-2.2 * u))], v: [0, 0, -sp], c: 1, m: 1 }); } const d0 = 4.5 + 10 / 2.2 * (1 - Math.exp(-2.2 * 0.8)); return base({ p: [0, 0, -d0 - 2.5 * (u - 0.8)], v: [0, 0, -2.5], c: 1 }); },
    times: [0.55, 0.68, 0.85, 1.1, 1.35, 1.6], view: 'side',
  },
  jump: {
    fn: (t) => { const j = jumpY(t, 0.5, 6.4); return base({ p: [0, j ? j.y : 0, -5 * t], v: [0, j ? j.vy : 0, -5], g: j ? 0 : 1 }); },
    times: [0.45, 0.6, 0.78, 0.95, 1.06, 1.12, 1.2, 1.4], view: 'side',
  },
  djump: {
    fn: (t) => { let y = 0, vy = 0, g = 1; if (t >= 0.5 && t < 0.8) { const u = t - 0.5; y = 6.4 * u - 11 * u * u; vy = 6.4 - G * u; g = 0; } else if (t >= 0.8) { const y0 = 6.4 * 0.3 - 11 * 0.09, u = t - 0.8; const yy = y0 + 6.2 * u - 11 * u * u; if (yy > 0) { y = yy; vy = 6.2 - G * u; g = 0; } } return base({ p: [0, y, -5 * t], v: [0, vy, -5], g }); },
    times: [0.7, 0.82, 0.9, 1.05, 1.3, 1.55, 1.62], view: 'side',
  },
  dash: {
    fn: (t) => { const u = t - 0.5; if (u < 0) return base({ p: [0, 0, -5 * t], v: [0, 0, -5] }); if (u < 0.32) return base({ p: [0, 0, -2.5 - 13 * u], v: [0, 0, -13], m: 4 }); const w = u - 0.32, sp = 5 + 8 * Math.exp(-14 * w); return base({ p: [0, 0, -2.5 - 4.16 - 5 * w - 8 / 14 * (1 - Math.exp(-14 * w))], v: [0, 0, -sp] }); },
    times: [0.45, 0.55, 0.65, 0.78, 0.9, 1.1], view: 'side',
  },
  dashside: {
    fn: (t) => { const u = t - 0.5; if (u < 0) return base({}); if (u < 0.32) return base({ p: [13 * u, 0, 0], v: [13, 0, 0], m: 4 }); const w = u - 0.32, sp = 13 * Math.exp(-14 * w); return base({ p: [4.16 + 13 / 14 * (1 - Math.exp(-14 * w)), 0, 0], v: [sp, 0, 0] }); },
    times: [0.45, 0.56, 0.7, 0.86, 1.1], view: 'front',
  },
  grapple: (() => {
    // precomputed: stand, fire at 0.3, reel toward the anchor, fling at arrival, ballistic afterwards
    const A = [0, 13, -24], S = []; let p = [0, 0, 0], v = [0, 0, 0], sp = 8, on = false, done = false, g = 1; const dt = 1 / 120;
    for (let t = 0; t < 4; t += dt) {
      if (!on && !done && t >= 0.3) { on = true; v[1] = 4; g = 0; }
      if (on) {
        const to = [A[0] - p[0], A[1] - p[1] - 1.65, A[2] - p[2]], d = Math.hypot(...to);
        if (d < 1.6) { on = false; done = true; v[1] = Math.max(v[1], 0) + 4.5; }
        else { sp = Math.min(24, sp + 38 * dt); const k = 1 - Math.exp(-7 * dt), crest = 3.2 + 6 * (1 - Math.min(1, d / 6)); v[0] += (to[0] / d * sp - v[0]) * k; v[2] += (to[2] / d * sp - v[2]) * k; v[1] += (to[1] / d * sp + crest - v[1]) * k; v[1] -= G * 0.15 * dt; }
      } else if (!g) v[1] -= G * dt;
      p = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
      if (done && p[1] <= 0) { p[1] = 0; v[1] = 0; g = 1; v[2] *= Math.exp(-14 * dt); }
      S.push(base({ p: p.slice(), v: v.slice(), g, pitch: on || t < 0.3 ? 0.45 : 0.1, ...(on ? { ga: A } : {}) }));
    }
    return { fn: (t) => S[Math.min(S.length - 1, Math.round(t * 120))], times: [0.25, 0.4, 0.6, 0.9, 1.2, 1.5, 1.7, 1.95, 2.3], view: 'side', anchor: A, wide: 1 };
  })(),
  mantle: {
    fn: (t) => {
      const t0 = 0.5, z0 = -2.1; if (t < t0 - 0.2) return base({ p: [0, 0, -5 * t], v: [0, 0, -5] });
      if (t < t0) { const u = t - (t0 - 0.2); return base({ p: [0, 6.4 * u - 11 * u * u, -5 * t], v: [0, 6.4 - G * u, -5], g: 0 }); }
      const y0 = 6.4 * 0.2 - 11 * 0.04, k = Math.min(1, (t - t0) / 0.35), up = Math.min(1, k / 0.6), f = Math.max(0, (k - 0.35) / 0.65);
      if (k < 1) return base({ p: [0, y0 + (1.7 - y0) * (1 - (1 - up) * (1 - up)), -2.5 - 0.9 * f], v: [0, 0, 0], g: 0, m: 3 });
      const w = t - t0 - 0.35; return base({ p: [0, 1.7, -3.4 - 3 * w], v: [0, 0, -3 - 2 * (1 - Math.exp(-14 * w))] });
    },
    times: [0.42, 0.52, 0.6, 0.7, 0.8, 0.9, 1.1], view: 'side', ledge: [0, 0.85, -4.6],
  },
  ladder: { fn: (t) => base({ p: [0, 0.3 + 4.2 * t, 0], v: [0, 4.2, 0], g: 0, m: 2 }), times: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0], view: 'back', ladder: 1 },
  hit: { fn: () => base({}), times: [0.28, 0.34, 0.42, 0.55, 0.8], view: 'q', events: [[0.3, (r) => r.character.flinch?.(new THREE.Vector3(0.4, 0, 1), 1)]] },
  death: { fn: () => base({}), times: [0.28, 0.45, 0.6, 0.8, 1.0, 1.4], view: 'q', events: [[0.3, (r) => r.character.die(new THREE.Vector3(0.2, 0, 1))]] },
  deathrun: { fn: (t) => (t < 0.6 ? base({ p: [0, 0, -7.5 * t], v: [0, 0, -7.5], s: 1 }) : base({ p: [0, 0, -4.5], v: [0, 0, -7.5] })), times: [0.55, 0.7, 0.85, 1.0, 1.2, 1.6], view: 'side', events: [[0.6, (r) => r.character.die(new THREE.Vector3(0, 0, -1))]] },
};
SCEN.grappleclose = { ...SCEN.grapple, wide: 0, times: [0.36, 0.5, 0.8, 1.3, 1.62, 1.75, 1.9], view: 'q' };
const VIEWS = { q: [2.4, 1.5, -3.0], side: [4.4, 1.2, -0.4], front: [0.5, 1.4, -4.6], back: [1.6, 1.6, 4.2] };

let rp = null;
function makePlayer() {
  rp?.dispose();
  rp = new RemotePlayer({ id: 1, name: '', color: 0x2a6bff, scene });
  rp.character.setLook?.(Q.get('look') || 'assault');
  rp.character.setRelation?.('enemy');
  rp.spawn(new THREE.Vector3(), 0, 0);
}
const _h = new THREE.Vector3();
async function rigReady() { for (let i = 0; i < 200 && !rp.character._puppet?.rig; i++) await new Promise((r) => setTimeout(r, 5)); }
function pose(sc, t, dt, fired) {
  const s = sc.fn(t);
  for (const e of sc.events || []) if (t >= e[0] && !fired.has(e)) { fired.add(e); e[1](rp); }
  rp.applySample(s, dt);
  if (!s.ga) rp.grappleAnchor = null; else (rp.grappleAnchor ||= new THREE.Vector3()).fromArray(s.ga);
  return s;
}
function frame(sc, s, view) {
  const off = VIEWS[view || sc.view || 'q'], k = sc.wide ? 1.7 : 1;
  const ty = sc.wide ? s.p[1] + 1.1 : s.p[1] * 0.85 + 0.95;
  camera.position.set(s.p[0] + off[0] * k, ty + (off[1] - 0.95) * k, s.p[2] + off[2] * k);
  camera.lookAt(s.p[0], ty, s.p[2]);
  sun.position.set(s.p[0] - 5, s.p[1] + 9, s.p[2] - 4); sun.target.position.set(s.p[0], s.p[1], s.p[2]); sun.target.updateMatrixWorld();
  ledge.visible = !!sc.ledge; if (sc.ledge) ledge.position.fromArray(sc.ledge);
  ladder.visible = !!sc.ladder; if (sc.ladder) ladder.position.set(0, 0, -0.45);
  anchorM.visible = !!sc.anchor; if (sc.anchor) anchorM.position.fromArray(sc.anchor);
  cable.visible = !!s.ga;
  if (s.ga) {
    const from = rp.character.handWorldPosition ? rp.character.handWorldPosition(_h) : _h.set(s.p[0] - 0.25, s.p[1] + 1.35, s.p[2] - 0.35);
    const a = cable.geometry.attributes.position; a.setXYZ(0, from.x, from.y, from.z); a.setXYZ(1, s.ga[0], s.ga[1], s.ga[2]); a.needsUpdate = true;
  }
}
async function run(sc, upTo, view) {     // deterministic replay from t = 0
  makePlayer(); await rigReady(); const fired = new Set(); let s = null; const dt = 1 / 60;
  for (let t = 0; t <= upTo + 1e-6; t += dt) s = pose(sc, t, dt, fired);
  frame(sc, s, view); return s;
}
async function strip(name, scen, times, view) {
  await charactersReady;
  const sc = SCEN[scen]; times ||= sc.times;
  const out = document.createElement('canvas'); out.width = W * times.length; out.height = H; const o = out.getContext('2d');
  renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
  makePlayer(); await rigReady(); const fired = new Set(); const dt = 1 / 60; let i = 0, s = null;
  for (let t = 0; i < times.length; t += dt) {
    s = pose(sc, t, dt, fired);
    if (t + 1e-6 >= times[i]) {
      frame(sc, s, view); renderer.render(scene, camera); o.drawImage(renderer.domElement, i * W, 0);
      o.fillStyle = '#000a'; o.fillRect(i * W, 0, 74, 20); o.fillStyle = '#fff'; o.font = '13px system-ui'; o.fillText(`${scen} ${times[i].toFixed(2)}`, i * W + 4, 14);
      i++;
    }
  }
  resize();
  if (!name) return out;
  return save(name, out);
}
async function save(name, canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  await fetch('http://127.0.0.1:5199/save?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
  return name;
}
// several scenarios stacked into one sheet (rows scaled to a common width)
async function sheet(name, scens, width = 1900) {
  const rows = []; for (const k of scens) rows.push(await strip(null, k));
  const hs = rows.map((r) => Math.round(r.height * width / r.width));
  const out = document.createElement('canvas'); out.width = width; out.height = hs.reduce((a, b) => a + b, 0); const o = out.getContext('2d');
  let y = 0; rows.forEach((r, i) => { o.drawImage(r, 0, y, width, hs[i]); y += hs[i]; });
  return save(name, out);
}
async function all(prefix) { const done = []; for (const k of Object.keys(SCEN)) done.push(await strip(`${prefix}_${k}.jpg`, k)); return done; }
async function perf(n = 12, frames = 600) {
  await charactersReady; await new Promise((r) => setTimeout(r, 300));
  const list = []; for (let i = 0; i < n; i++) { const r = new RemotePlayer({ id: 10 + i, name: 'P' + i, color: 0xd23a3a, scene }); r.spawn(new THREE.Vector3(i * 1.2 - 6, 0, -3), 0, 0); list.push(r); }
  await new Promise((r) => setTimeout(r, 50));
  const keys = ['walk', 'sprint', 'strafe', 'crouchwalk', 'jump', 'slide', 'idle', 'backpedal', 'adswalk', 'djump', 'dash', 'diag'];
  for (let w = 0; w < 120; w++) list.forEach((r, i) => r.applySample(SCEN[keys[i % keys.length]].fn((w / 60) % 1.5), 1 / 60));
  const t0 = performance.now();
  for (let f = 0; f < frames; f++) list.forEach((r, i) => r.applySample(SCEN[keys[i % keys.length]].fn((f / 60) % 1.5), 1 / 60));
  const ms = (performance.now() - t0) / frames; list.forEach((r) => r.dispose());
  return { chars: n, msPerFrame: +ms.toFixed(3), usPerChar: +(ms / n * 1000).toFixed(1) };
}
window.anim = { strip, sheet, all, perf, SCEN, run, get rp() { return rp; }, renderer, scene, camera };

function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
await charactersReady;
const live = SCEN[Q.get('s') || 'walk'], speed = parseFloat(Q.get('speed') || '1'), dur = Math.max(...live.times) + 0.6;
let lt = 0, fired = new Set(), last = performance.now(); makePlayer(); await rigReady();
if (Q.has('t')) { await run(live, parseFloat(Q.get('t')), Q.get('view')); renderer.render(scene, camera); }
else renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000) * speed; last = now;
  if (dt <= 0) return;
  lt += dt; if (lt > dur) { lt = 0; fired = new Set(); makePlayer(); return; }
  const s = pose(live, lt, dt, fired); frame(live, s, Q.get('view')); renderer.render(scene, camera);
  document.getElementById('hud').textContent = `${Q.get('s') || 'walk'}  t=${lt.toFixed(2)}`;
});
// ?sheets=name:scen,scen;name2:scen...  runs those sheets on load; survives dev-server reloads (done ones are skipped)
if (Q.has('sheets')) {
  renderer.setAnimationLoop(null);
  const key = 'animSheets:' + Q.get('sheets') + ':' + (Q.get('run') || '');
  const done = new Set(JSON.parse(sessionStorage.getItem(key) || '[]'));
  for (const job of Q.get('sheets').split(';')) {
    const [name, list] = job.split(':');
    if (done.has(name)) continue;
    await sheet(name + '.jpg', list.split(','));
    done.add(name); sessionStorage.setItem(key, JSON.stringify([...done]));
  }
  window.__sheetsDone = true; document.title = 'sheets done';
}
