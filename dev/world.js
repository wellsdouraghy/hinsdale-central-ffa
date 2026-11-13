// Free-fly viewer for the world module.
//   ?cam=x,y,z,yawDeg,pitchDeg  &q=low|medium|high  &gkey=GOOGLE_KEY  &col=1 (show collision)  &hud=0
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
  settings: { quality, googleTilesKey: qs.get('gkey') || null },
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
