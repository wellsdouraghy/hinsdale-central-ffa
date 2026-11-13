// Visuals test page. URL params:
//   view=vm|chars|fx|gun   w=ar|smg|sniper|shotgun|pistol   ads=0..1   move=0..1  sprint=1  fire=1 (auto fire)
//   reload=<sec>  pause=<sec> (freeze animation time after N seconds)  hud=0  cam=x,y,z,tx,ty,tz  look=<rad/s>
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WEAPONS, createViewmodel, preloadViewmodels } from '../src/visuals/weapons.js';
import { createCharacter, charactersReady } from '../src/visuals/character.js';
import { createEffects } from '../src/visuals/effects.js';
import { skyEquirect } from '../src/visuals/textures.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const view = Q.get('view') || 'vm';
const IDS = Object.keys(WEAPONS);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromEquirectangular(skyEquirect()).texture;
scene.background = skyEquirect();
scene.backgroundBlurriness = 0.15;
const sunDir = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
const sun = new THREE.DirectionalLight(0xfff1dd, 3.2);
sun.position.copy(sunDir).multiplyScalar(30);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 80 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, new THREE.HemisphereLight(0xbfd4ff, 0x5a5648, 0.5));

const SURF = { concrete: 0x8f8f8a, brick: 0x8a4a38, metal: 0x6f7780, grass: 0x4f7a3a, dirt: 0x6a5238, wood: 0x8a6a45, asphalt: 0x3a3a3c, glass: 0x9fc0cc, rubber: 0x222222 };
const targets = [];
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: SURF.asphalt, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.userData.surface = 'asphalt';
scene.add(ground); targets.push(ground);
const names = ['concrete', 'brick', 'metal', 'grass', 'dirt', 'wood', 'glass'];
names.forEach((s, i) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.4), new THREE.MeshStandardMaterial({ color: SURF[s], roughness: s === 'metal' ? 0.4 : 0.9, metalness: s === 'metal' ? 0.8 : 0 }));
  m.position.set((i - (names.length - 1) / 2) * 2.5, 1.5, -9); m.castShadow = m.receiveShadow = true; m.userData.surface = s;
  scene.add(m); targets.push(m);
});

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 500);
camera.position.set(0, 1.65, 0); camera.lookAt(0, 1.55, -9);
const overlayScene = new THREE.Scene();
const overlayCamera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 10);
let controls = null;
if (Q.get('extlights') === '1') {   // mimic the game's own overlay lights (the viewmodel rig should switch itself off)
  overlayScene.add(new THREE.HemisphereLight(0xe8f0ff, 0x4a4036, 1.4));
  const s2 = new THREE.DirectionalLight(0xffffff, 2.2); s2.position.set(0.4, 0.8, 0.3).multiplyScalar(10); overlayScene.add(s2);
}

const effects = createEffects(scene);
const st = { w: IDS.includes(Q.get('w')) ? Q.get('w') : 'ar', ads: num('ads', 0), adsTarget: num('ads', 0), move: num('move', 0), sprint: Q.get('sprint') === '1', fire: Q.get('fire') === '1' };
let vm = null;
function setWeapon(id) {
  if (vm) { overlayScene.remove(vm.object3D); vm.dispose(); }
  st.w = id; vm = createViewmodel(id);
  (view === 'gun' ? scene : overlayScene).add(vm.object3D);
  if (view === 'gun') { vm.object3D.position.set(0, 1.4, -0.2); vm.lights.visible = false; }
  else if (!Q.has('noequip')) vm.equip();
  if (Q.has('reload')) vm.reload(num('reload', 2));
  window.dbg.vm = vm;
}
window.dbg = { THREE, scene, camera, overlayScene, overlayCamera, effects, st, renderer };

const chars = [];
if (view === 'chars') {
  const defs = [
    ['Idle', { speed: 0, weaponId: 'ar' }], ['Walk', { speed: 1.8, weaponId: 'smg' }], ['Run', { speed: 5.5, sprinting: true, weaponId: 'ar' }],
    ['Crouch', { speed: 0, crouching: true, weaponId: 'shotgun' }], ['CrouchWalk', { speed: 1.2, crouching: true, weaponId: 'pistol' }],
    ['AimUp', { speed: 0, aimPitch: 0.7, weaponId: 'sniper' }], ['AimDown', { speed: 0, aimPitch: -0.7, weaponId: 'ar' }], ['Dead', { speed: 0, weaponId: 'ar' }],
  ];
  const cols = [0xd43a2f, 0x2f7fd4, 0x35b34a, 0xe0b020, 0xb04fd0, 0xe07820, 0x20c0c0, 0xdddddd];
  defs.forEach(([name, s], i) => {
    const c = createCharacter({ color: cols[i], name });
    c.object3D.position.set((i - (defs.length - 1) / 2) * 1.25, 0, -4);
    c.object3D.rotation.y = Math.PI + num('yaw', 0);   // face the camera (+z)
    scene.add(c.object3D);
    const state = { speed: 0, crouching: false, aimPitch: 0, weaponId: 'ar', grounded: true, sprinting: false, ...s };
    c.setState(state);
    if (name === 'Dead') charactersReady.then(() => c.die());
    chars.push({ c, state, name });
  });
  camera.position.set(0, 1.5, 1.2); camera.lookAt(0, 0.95, -4);
  window.dbg.chars = chars;
}
if (Q.has('cam')) { const a = Q.get('cam').split(',').map(Number); camera.position.set(a[0], a[1], a[2]); camera.lookAt(a[3], a[4], a[5]); }
if (view === 'gun' || Q.get('orbit') === '1') {
  if (view === 'gun' && !Q.has('cam')) camera.position.set(-0.7, 1.55, -0.45);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...(view === 'gun' ? [0, 1.38, -0.45] : [0, 1, -4])); controls.update();
}
setWeapon(st.w);
// crop=x0,y0,x1,y1 (fractions of the frame): render only that sub-rectangle at full resolution (for close inspection)
if (Q.has('crop')) {
  const [x0, y0, x1, y1] = Q.get('crop').split(',').map(Number), W = 1000, H = 1000 / camera.aspect;
  for (const c of [camera, overlayCamera]) c.setViewOffset(W, H, x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H);
}

// input
addEventListener('keydown', (e) => {
  const i = '12345'.indexOf(e.key);
  if (i >= 0) setWeapon(IDS[i]);
  if (e.key === 'r') vm.reload(2.2);
  if (e.key === 'Shift') st.sprint = true;
  if (e.key === 'w') st.move = 1;
  if (e.key === 'k') chars.forEach((c) => c.c.die());
  if (e.key === 'l') chars.forEach((c) => c.c.reset());
  if (e.key === 'f') chars.forEach((c) => c.c.fire());
});
addEventListener('keyup', (e) => { if (e.key === 'Shift') st.sprint = false; if (e.key === 'w') st.move = 0; });
addEventListener('contextmenu', (e) => e.preventDefault());
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3(), nrm = new THREE.Vector3();
let mouseDown = false, lastShot = 0;
function shoot(x, y) {
  ndc.set(x, y); ray.setFromCamera(ndc, camera);
  if (view !== 'gun' && view !== 'chars') vm.fire();
  chars.forEach((c) => c.c.fire());
  const hit = ray.intersectObjects(targets, false)[0];
  const from = view === 'chars' || view === 'gun' ? tmp.copy(camera.position).add(new THREE.Vector3(0.2, -0.2, 0)) : vm.muzzleWorldPosition(tmp, overlayCamera, camera);
  if (hit) {
    nrm.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    effects.impact(hit.point, nrm, hit.object.userData.surface);
    effects.tracer(from, hit.point);
    if (Q.get('blood') === '1') effects.blood(hit.point, ray.ray.direction);
  } else effects.tracer(from, ray.ray.at(200, new THREE.Vector3()));
}
addEventListener('mousedown', (e) => { if (e.button === 2) st.adsTarget = 1; else if (e.button === 0) { mouseDown = true; } });
addEventListener('mouseup', (e) => { if (e.button === 2) st.adsTarget = num('ads', 0); else mouseDown = false; });
let mx = 0, my = 0, lastMx = 0, lastMy = 0;
addEventListener('mousemove', (e) => { mx = (e.clientX / innerWidth) * 2 - 1; my = -(e.clientY / innerHeight) * 2 + 1; });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = overlayCamera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); overlayCamera.updateProjectionMatrix();
});

const hud = document.getElementById('hud');
if (Q.get('hud') === '0') { hud.style.display = 'none'; document.getElementById('x').style.display = 'none'; }
const clock = new THREE.Clock();
let t = 0, fxT = 0;
const pauseAt = num('pause', Infinity), look = { x: 0, y: 0 };
function tick(dt) {
  if (t >= pauseAt) dt = 0;
  t += dt;
  st.ads += (st.adsTarget - st.ads) * Math.min(1, dt * 14);
  if (Math.abs(st.ads - st.adsTarget) < 0.002) st.ads = st.adsTarget;
  const rate = { ar: 0.085, smg: 0.07, sniper: 1.3, shotgun: 0.85, pistol: 0.22 }[st.w];
  if ((mouseDown || st.fire) && dt > 0 && t - lastShot > rate) {
    lastShot = t;
    shoot(mouseDown ? mx : (Math.random() - 0.5) * (view === 'fx' ? 1.6 : 0.1), mouseDown ? my : (Math.random() - 0.5) * (view === 'fx' ? 0.8 : 0.1));
  }
  if (view === 'fx' && dt > 0) {
    fxT -= dt;
    if (fxT <= 0) { fxT = 0.6; effects.blood(new THREE.Vector3((Math.random() - 0.5) * 6, 1.3, -6), new THREE.Vector3(0, 0, -1)); }
  }
  look.x = (mx - lastMx) * 0.6 + num('look', 0) * dt; look.y = (my - lastMy) * 0.4; lastMx = mx; lastMy = my;
  vm.update(dt, { moveSpeed: st.move, sprinting: st.sprint, ads: st.ads, grounded: true, lookDelta: look });
  for (const c of chars) c.c.update(dt);
  effects.update(dt, camera);
}
// Hidden/background tabs barely run rAF, so screenshots pre-simulate `warm` seconds deterministically.
await Promise.all([preloadViewmodels(), charactersReady]);
camera.updateMatrixWorld(); overlayCamera.updateMatrixWorld(); scene.updateMatrixWorld(true); overlayScene.updateMatrixWorld(true);
for (let w = num('warm', 1.5); w > 0; w -= 1 / 60) tick(1 / 60);
// two throwaway frames so render-dependent setup (fallback environment, shader compile) is done before the first shot
for (let i = 0; i < 2; i++) { renderer.clear(); renderer.render(scene, camera); renderer.clearDepth(); renderer.render(overlayScene, overlayCamera); tick(0); }
renderer.setAnimationLoop(() => {
  tick(Math.min(clock.getDelta(), 0.05));
  controls?.update();
  renderer.clear();
  renderer.render(scene, camera);
  if (view === 'vm' || view === 'fx') { renderer.clearDepth(); renderer.render(overlayScene, overlayCamera); }
  if (hud.style.display !== 'none') hud.textContent = `${WEAPONS[st.w].name}  [1-5 weapon, LMB fire, RMB ADS, R reload, W move, Shift sprint, K/L die/reset]\ncalls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}`;
});
