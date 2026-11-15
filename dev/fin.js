// Melee finisher harness (silent): two characters on a 1 m checker floor play a finisher scene frame by frame.
//   ?id=<scene id>  loop one scene live from its cinematic camera     ?view=cam|side|front|top   ?speed=0.25
//   ?look=<attacker outfit>  ?vlook=<victim outfit>  ?w=<attacker weapon id>  ?t=<seconds> (freeze one frame)
//   window.fin.strip(name, id, times | count, view)  -> POSTs a contact strip to the local shot receiver (port 5199)
//   window.fin.sheet(name, id, count, views)         -> one row per view (default: cinematic camera + side + front)
//   window.fin.all(prefix, count)                    -> a sheet for every scene
//   window.fin.looks(name, id, t)                    -> one frame per outfit
import * as THREE from 'three';
import { createCharacter, charactersReady } from '../src/visuals/character.js';
import { FINISHERS, createFinisher } from '../src/visuals/finishers.js';
import { LOOKS } from '../src/visuals/characterLooks.js';

const Q = new URLSearchParams(location.search);
let W = 330, H = 300;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb4c8);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 300);
scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x55584c, 1.5));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 8, bottom: -6, near: 1, far: 40 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
sun.position.set(-5, 9, -4); scene.add(sun, sun.target);
const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d');
cx.fillStyle = '#8d9188'; cx.fillRect(0, 0, 128, 128); cx.fillStyle = '#7b8077'; cx.fillRect(0, 0, 64, 64); cx.fillRect(64, 64, 64, 64);
cx.strokeStyle = '#5d6159'; cx.lineWidth = 2; cx.strokeRect(0, 0, 128, 128);
const ftex = new THREE.CanvasTexture(cv); ftex.wrapS = ftex.wrapT = THREE.RepeatWrapping; ftex.repeat.set(200, 200); ftex.colorSpace = THREE.SRGBColorSpace; ftex.anisotropy = 8;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const VIEWS = { side: [[4.6, 0.25, 0], 30], left: [[-4.6, 0.25, 0], 30], front: [[0, 0.25, -4.6], 30], back: [[0, 0.25, 4.6], 30], top: [[0.01, 6, 0], 34], q: [[3.2, 0.7, -3.2], 30], q2: [[-3.2, 0.7, 3.2], 30] };
let A = null, V = null, f = null;
const camOut = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, roll: 0 };
function setup(id, look, vlook, w) {
  A?.dispose(); V?.dispose();
  A = createCharacter({ color: 0xd23a3a, name: '', look: look || Q.get('look') || 'infantry' });
  V = createCharacter({ color: 0x2a6bff, name: '', look: vlook || Q.get('vlook') || 'specops' });
  A.setRelation?.('enemy'); V.setRelation?.('enemy');
  A.setState({ weaponId: w || Q.get('w') || 'ar', grounded: true, speed: 0 }); V.setState({ weaponId: 'smg', grounded: true, speed: 0 });
  f = createFinisher({ id, attacker: A, victim: V });
  f.setOrigin(new THREE.Vector3(0, 0, 0), 0);
  A.object3D.position.copy(f.attackerStart?.position || new THREE.Vector3(0, 0, 1.4)); V.object3D.position.set(0, 0, 0);
  scene.add(A.object3D, V.object3D);
}
async function rigReady() { await charactersReady; for (let i = 0; i < 200 && !(A._puppet?.rig && V._puppet?.rig); i++) await new Promise((r) => setTimeout(r, 5)); A.update(1 / 60); V.update(1 / 60); }
function step(t, dt) { A.update(dt); V.update(dt); f.update(t); }
function aim(view, t) {
  if (!view || view === 'cam') {
    const c = f.camera(t, camOut);
    camera.position.copy(c.pos); camera.up.set(0, 1, 0); camera.lookAt(c.target); if (c.roll) camera.rotateZ(c.roll); camera.fov = c.fov;
  } else {
    // debug views follow the midpoint between the two characters
    const v = VIEWS[view], m = f.bonePosition('Hips', new THREE.Vector3()).lerp(f.bonePosition('Hips', new THREE.Vector3(), 'attacker'), 0.5); m.y = 0.95;
    camera.position.set(m.x + v[0][0], m.y + v[0][1], m.z + v[0][2]); camera.up.set(0, 1, 0); camera.lookAt(m); camera.fov = v[1];
  }
  camera.updateProjectionMatrix();
}
const idOf = (id) => (typeof id === 'number' ? FINISHERS[id].id : id);
const durOf = (id) => FINISHERS.find((x) => x.id === idOf(id)).duration;
function timesFor(id, times) { if (Array.isArray(times)) return times; const n = times || 10, d = durOf(id); return Array.from({ length: n }, (_, i) => +(0.1 + (d - 0.12) * i / (n - 1)).toFixed(2)); }
async function strip(name, id, times, view, opts = {}) {
  id = idOf(id); times = timesFor(id, times);
  const out = document.createElement('canvas'); out.width = W * times.length; out.height = H; const o = out.getContext('2d');
  renderer.setSize(W, H); camera.aspect = W / H;
  setup(id, opts.look, opts.vlook, opts.w); await rigReady();
  const dt = 1 / 60; let i = 0;
  for (let t = 0; i < times.length; t += dt) {
    step(t, dt);
    if (t + 1e-6 >= times[i]) {
      aim(view, t); renderer.render(scene, camera); o.drawImage(renderer.domElement, i * W, 0);
      o.fillStyle = '#000a'; o.fillRect(i * W, 0, 120, 20); o.fillStyle = '#fff'; o.font = '13px system-ui'; o.fillText(`${id} ${view || 'cam'} ${times[i].toFixed(2)}`, i * W + 4, 14);
      i++;
    }
  }
  resize();
  return name ? save(name, out) : out;
}
async function save(name, canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  await fetch('http://127.0.0.1:5199/save?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
  return name;
}
function stack(rows) {
  const out = document.createElement('canvas'); out.width = Math.max(...rows.map((r) => r.width)); out.height = rows.reduce((a, r) => a + r.height, 0); const o = out.getContext('2d');
  let y = 0; for (const r of rows) { o.drawImage(r, 0, y); y += r.height; }
  return out;
}
async function sheet(name, id, times = 10, views = ['cam', 'side', 'front'], opts) {
  const rows = []; for (const v of views) rows.push(await strip(null, id, times, v, opts));
  return save(name, stack(rows));
}
async function all(prefix, times = 10, views) { const done = []; for (const s of FINISHERS) done.push(await sheet(`${prefix}_${s.id}.jpg`, s.id, times, views)); return done; }
async function looks(name, id, t, view = 'cam') {
  const rows = []; let i = 0;
  for (const L of LOOKS) rows.push(await strip(null, id, Array.isArray(t) ? t : [t], view, { look: L.id, vlook: LOOKS[(++i) % LOOKS.length].id, w: ['ar', 'smg', 'sniper', 'shotgun', 'pistol'][i % 5] }));
  return save(name, stack(rows));
}
window.fin = { size(w, h) { W = w; H = h; }, strip, sheet, all, looks, FINISHERS, renderer, scene, camera, get f() { return f; }, get A() { return A; }, get V() { return V; } };

function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
await charactersReady;
const liveId = Q.get('id') || FINISHERS[0].id, speed = parseFloat(Q.get('speed') || '1');
setup(liveId); await rigReady();
let lt = 0, last = performance.now();
if (Q.has('t')) { const T = parseFloat(Q.get('t')); for (let t = 0; t <= T + 1e-6; t += 1 / 60) step(t, 1 / 60); aim(Q.get('view'), T); renderer.render(scene, camera); }
else renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000) * speed; last = now;
  if (dt <= 0 || !f) return;
  lt += dt; if (lt > f.duration + 0.8) { lt = 0; setup(liveId); return; }
  if (!(A._puppet?.rig && V._puppet?.rig)) return;
  step(Math.min(lt, f.duration), dt); aim(Q.get('view'), Math.min(lt, f.duration)); renderer.render(scene, camera);
  document.getElementById('hud').textContent = `${f.name}  (${liveId})  t=${lt.toFixed(2)} / ${f.duration}`;
});
