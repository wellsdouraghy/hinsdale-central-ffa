// Character look lineup (silent: no audio is created on this page).
//   ?team=red|blue        team colour
//   ?look=1..5|<id>       close-up of one look (front 3/4, full body); omit for the 5-wide lineup
//   ?pose=gun|idle        gun = the in-game character (createCharacter: rifle hold + idle), idle = bare Mixamo idle clip
//   ?cam=x,y,z,tx,ty,tz   camera override     ?labels=0  ?hud=0  ?debug=1 (texture class view)  ?yaw=<rad>
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { LOOKS, applyLook, __analyze } from '../src/visuals/characterLooks.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const TEAM = Q.get('team') === 'blue' ? { color: 0x2a6bff, name: 'Lions' } : { color: 0xe0242c, name: 'Red Devils' };
const lookQ = Q.get('look');
const single = lookQ ? (LOOKS.find((l) => l.id === lookQ) ? [lookQ] : /^\d$/.test(lookQ) ? [LOOKS[+lookQ - 1].id] : [lookQ]) : null;
const ids = single || LOOKS.map((l) => l.id);
const pose = Q.get('pose') || 'gun';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(num('px', Math.min(devicePixelRatio, 2)));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = num('exp', 0.95);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(single ? 30 : 28, innerWidth / innerHeight, 0.05, 500);

// sky + image-based light (Poly Haven CC0 sky already used by the world module)
const hdr = await new HDRLoader().loadAsync('../assets/world/sky_2k.hdr');
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = hdr; scene.background = hdr;
scene.environmentIntensity = 0.85; scene.backgroundIntensity = 0.9; scene.backgroundBlurriness = 0.02;
scene.environmentRotation.y = scene.backgroundRotation.y = num('sky', 2.2);
const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
sun.position.set(-4.5, 8, 6.5);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 4, bottom: -2, near: 1, far: 30 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.015; sun.shadow.radius = 3;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5); fill.position.set(5, 3, 4); scene.add(fill);

// ground: asphalt apron with a painted line, grass beyond
const tl = new THREE.TextureLoader();
const gtex = (n, rep, srgb) => { const t = tl.load('../assets/world/tex/' + n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: gtex('grass_color.jpg', 160, true), normalMap: gtex('grass_normal.jpg', 160), roughness: 1, color: 0xb8c0a8 }));
grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
const pad = new THREE.Mesh(new THREE.PlaneGeometry(400, 9), new THREE.MeshStandardMaterial({ map: gtex('concrete_color.jpg', 1, true), normalMap: gtex('concrete_normal.jpg', 1), roughness: 0.95, color: 0x9c9c99 }));
pad.material.map.repeat.set(130, 3); pad.material.normalMap.repeat.set(130, 3);
pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.012, -0.5); pad.receiveShadow = true; scene.add(pad);

// characters
const SPACING = 1.22, chars = [], mixers = [];
const yaw = num('yaw', single ? 0.6 : 0.45);
if (pose === 'gun') {
  const { createCharacter, charactersReady } = await import('../src/visuals/character.js');
  ids.forEach((id, i) => {
    const c = createCharacter({ color: TEAM.color, name: '' });
    c.object3D.position.set((i - (ids.length - 1) / 2) * SPACING, 0, 0);
    c.object3D.rotation.y = Math.PI + yaw;
    c.object3D.traverse((o) => { if (o.isSprite) o.visible = false; });
    c.setState({ speed: 0, crouching: false, aimPitch: -0.12, weaponId: ['ar', 'smg', 'shotgun', 'sniper', 'ar'][single ? LOOKS.findIndex((l) => l.id === id) : i] || 'ar', grounded: true, sprinting: false });
    scene.add(c.object3D); chars.push({ id, c, root: c.object3D });
  });
  await charactersReady; await null;
} else {
  const gltf = await new GLTFLoader().loadAsync('../assets/visuals/soldier.glb');
  ids.forEach((id, i) => {
    const model = SkeletonUtils.clone(gltf.scene);
    model.traverse((o) => { if (o.isSkinnedMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
    const root = new THREE.Group(); root.add(model);
    model.rotation.y = Math.PI; model.scale.setScalar(1.8 / 1.83);
    root.position.set((i - (ids.length - 1) / 2) * SPACING, 0, 0); root.rotation.y = yaw;
    const mixer = new THREE.AnimationMixer(model);
    const clip = gltf.animations.find((a) => a.name === (Q.get('clip') || 'Idle'));
    if (clip) { const a = mixer.clipAction(clip); a.play(); a.time = i * 0.7; }
    mixers.push(mixer); scene.add(root); chars.push({ id, root });
  });
}
for (const ch of chars) ch.applied = applyLook(ch.root, ch.id, { teamColor: TEAM.color, debug: num('debug', 0) });
window.__an = () => __analyze(chars[0].root);
window.__chars = chars; window.__scene = scene; window.THREE = THREE;

// labels (drawn into the scene so they are part of the saved image)
function label(text, sub, x) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,14,18,0.78)'; g.beginPath(); g.roundRect(8, 8, 752, 144, 22); g.fill();
  g.fillStyle = '#' + new THREE.Color(TEAM.color).getHexString(); g.beginPath(); g.roundRect(8, 8, 16, 144, [22, 0, 0, 22]); g.fill();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.font = '700 62px system-ui,-apple-system,"Segoe UI",sans-serif'; g.fillText(text, 392, 60, 700);
  g.font = '500 34px system-ui,-apple-system,"Segoe UI",sans-serif'; g.fillStyle = 'rgba(255,255,255,0.72)'; g.fillText(sub, 392, 118, 700);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false, fog: false }));
  s.scale.set(single ? 1.06 : 0.98, single ? 0.221 : 0.204, 1); s.position.set(x, 2.06, 0); s.renderOrder = 10;
  scene.add(s);
}
if (Q.get('labels') !== '0') chars.forEach((ch) => {
  const n = LOOKS.findIndex((l) => l.id === ch.id), L = LOOKS[n];
  if (L) label(`${n + 1}. ${L.name}`, TEAM.name, ch.root.position.x);
});

// camera
const cam = Q.get('cam')?.split(',').map(Number) || (single ? [0, 1.3, 4.35, 0, 1.03, 0] : [0.15, 1.35, 7.5, 0.15, 1.1, 0]);
camera.position.set(cam[0], cam[1], cam[2]);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(cam[3], cam[4], cam[5]); controls.update();

const hud = document.getElementById('hud');
if (Q.get('hud') === '0') hud.style.display = 'none';
function tick(dt) { for (const ch of chars) ch.c?.update(dt); for (const m of mixers) m.update(dt); }
for (let w = num('warm', 1.2); w > 0; w -= 1 / 60) tick(1 / 60);
const clock = new THREE.Clock();
function frame() {
  renderer.render(scene, camera);
  if (hud.style.display !== 'none') hud.textContent = `${TEAM.name}   calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}\n?team=red|blue  ?look=1..5  ?pose=gun|idle  drag to orbit`;
}
renderer.setAnimationLoop(() => { tick(Math.min(clock.getDelta(), 0.05)); controls.update(); frame(); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// Dev helper: save the current view to a local receiver (python script on :5199) -> dev/shots/<name>.jpg
window.__shot = async (name, frames = 6) => {
  for (let i = 0; i < frames; i++) { tick(0.016); frame(); await new Promise((r) => setTimeout(r, 40)); }
  frame();
  const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/jpeg', 0.92));
  await fetch('http://127.0.0.1:5199/' + name + '.jpg', { method: 'POST', body: blob });
  if (window.__after) window.__after();
  return name + ' ' + blob.size + ' ' + renderer.domElement.width + 'x' + renderer.domElement.height;
};
window.__ready = true;
