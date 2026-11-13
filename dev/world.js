// Free-fly viewer for the world module.
//   ?cam=x,y,z,yawDeg,pitchDeg  &q=low|medium|high  &gkey=GOOGLE_KEY or &tiles=1 (uses VITE_GOOGLE_TILES_KEY)  &col=1 (show collision)  &hud=0
// WASD + mouse (click to lock), Space/C up/down, Shift fast. Exposes window.__world, __camera, __scene, __renderer.
import * as THREE from 'three';
import { createWorld } from '../src/world/index.js';

const qs = new URLSearchParams(location.search);
const quality = qs.get('q') || 'high';
const renderer = new THREE.WebGLRenderer({ antialias: quality === 'low', powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(parseFloat(qs.get('fov') || '75'), innerWidth / innerHeight, 0.1, 6000);
camera.rotation.order = 'YXZ';
let yaw = 0, pitch = 0;
function setCam(str) {
  const v = str.split(',').map(Number);
  camera.position.set(v[0] || 0, v[1] ?? 1.7, v[2] || 0);
  yaw = THREE.MathUtils.degToRad(v[3] || 0); pitch = THREE.MathUtils.degToRad(v[4] || 0);
  camera.rotation.set(pitch, yaw, 0);
  camera.updateMatrixWorld();
}
setCam(qs.get('cam') || '-150,1.7,-30,0,0');
window.__setCam = setCam;

const loadEl = document.getElementById('load');
const world = await createWorld({
  renderer, scene, camera,
  settings: { quality, googleTilesKey: qs.get('gkey') || (qs.get('tiles') === '1' ? import.meta.env.VITE_GOOGLE_TILES_KEY : null) || null },
  onProgress: (f, label) => { loadEl.textContent = `${Math.round(f * 100)}% ${label}`; },
});
loadEl.remove();
world.setSize(innerWidth, innerHeight);
Object.assign(window, { __world: world, __camera: camera, __scene: scene, __renderer: renderer, THREE });
const attr = document.getElementById('attr');

if (qs.get('col') === '1') {
  const m = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
  for (const c of world.collisionMeshes) { const mm = new THREE.Mesh(c.geometry, m); scene.add(mm); }
}
if (qs.get('spawns') === '1') {
  for (const p of world.spawnPoints) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30), new THREE.MeshBasicMaterial({ color: 0x00ffff })); s.position.copy(p).setY(15); scene.add(s); }
}

// CTF preview: flags + bases at world.ctfBases (always shown; cheap)
const ctfBits = [];
if (world.ctfBases) {
  const { createFlag, createFlagBase } = await import('../src/visuals/flag.js');
  for (const team of ['red', 'blue']) {
    const base = createFlagBase({ team }), flag = createFlag({ team });
    base.object3D.position.copy(world.ctfBases[team]); flag.object3D.position.copy(world.ctfBases[team]);
    scene.add(base.object3D, flag.object3D); ctfBits.push(base, flag);
  }
  window.__ctf = ctfBits;
}
if (qs.get('show') === 'heli' && world.heliSpawns) {
  for (const h of world.heliSpawns) {
    const g = new THREE.Group(); g.position.copy(h.pos); g.rotation.y = h.yaw;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 6.5), new THREE.MeshStandardMaterial({ color: 0x3d4a3a })); body.position.y = 1.3;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffcc00 })); nose.position.set(0, 1.3, -4.0);
    const disc = new THREE.Mesh(new THREE.RingGeometry(7.9, 8.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide })); disc.position.y = 3.2;
    g.add(body, nose, disc); scene.add(g);
  }
}
if (qs.get('show') === 'nav' && world.navGrid) {
  const n = world.navGrid; const pos = [], col = [];
  for (let j = 0; j < n.nz; j += 1) for (let i = 0; i < n.nx; i += 1) { const k = j * n.nx + i; if (!n.walk[k]) continue; pos.push(n.x0 + (i + 0.5) * n.cell, 0.25, n.z0 + (j + 0.5) * n.cell); const c = (n.cost[k] - 1) / 1.5; col.push(c, 1 - c, 0.2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.5, vertexColors: true })));
}
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.0022; pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.0022));
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); world.setSize(innerWidth, innerHeight); });

const hud = document.getElementById('hud');
if (qs.get('hud') === '0') hud.style.display = 'none';
const clock = new THREE.Clock();
let frames = 0, acc = 0, fps = 0;
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
window.__perf = { fps: 0, ms: [] };
renderer.info.autoReset = false;
renderer.setAnimationLoop(() => {
  renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.1);
  if (document.pointerLockElement === renderer.domElement || window.__auto !== true) camera.rotation.set(pitch, yaw, 0);
  const sp = (keys.ShiftLeft ? 60 : 8) * dt;
  camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize();
  if (keys.KeyW) camera.position.addScaledVector(fwd, sp);
  if (keys.KeyS) camera.position.addScaledVector(fwd, -sp);
  if (keys.KeyD) camera.position.addScaledVector(right, sp);
  if (keys.KeyA) camera.position.addScaledVector(right, -sp);
  if (keys.Space) camera.position.y += sp;
  if (keys.KeyC) camera.position.y -= sp;
  for (const b of ctfBits) b.update(dt);
  world.update(dt, camera);
  world.render(null, null);
  frames++; acc += dt;
  if (acc > 0.5) {
    fps = frames / acc; frames = 0; acc = 0; window.__perf.fps = fps;
    const i = renderer.info;
    hud.textContent = `${fps.toFixed(0)} fps  q=${quality}\ncalls ${i.render.calls}  tris ${(i.render.triangles / 1e6).toFixed(2)}M  tex ${i.memory.textures} geo ${i.memory.geometries}\ncam ${camera.position.x.toFixed(1)},${camera.position.y.toFixed(1)},${camera.position.z.toFixed(1)},${THREE.MathUtils.radToDeg(yaw).toFixed(0)},${THREE.MathUtils.radToDeg(pitch).toFixed(0)}`;
    if (attr.innerHTML !== world.attributionHTML) attr.innerHTML = world.attributionHTML;
  }
});

// Dev helper: save the current view to a local receiver (python script on :5199) -> dev/shots/<name>.jpg
window.__shot = async (name, cam, frames = 8) => {
  if (cam) setCam(cam);
  for (let i = 0; i < frames; i++) { for (const b of ctfBits) b.update(0.016); world.update(0.016, camera); world.render(null, null); await new Promise((r) => setTimeout(r, 30)); }
  world.update(0.016, camera); world.render(null, null);
  const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/jpeg', 0.9));
  await fetch('http://127.0.0.1:5199/' + name, { method: 'POST', body: blob });
  return name + ' ' + blob.size;
};

// Dev helper: average ms per frame (update + render, GPU flushed) at a list of camera strings.
window.__bench = (cams, n = 40) => {
  const gl = renderer.getContext(); const out = {}; const px = new Uint8Array(4);
  for (const c of cams) {
    setCam(c); world.update(0.016, camera); world.render(null, null); gl.finish();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { world.update(0.016, camera); renderer.info.reset(); world.render(null, null); }
    gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    out[c] = +((performance.now() - t0) / n).toFixed(2);
  }
  return out;
};
