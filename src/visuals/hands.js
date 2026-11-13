// First-person gloved hands + sleeved forearms. Hand meshes are the rigged WebXR "generic-hand" models (MIT),
// re-parented into a proper finger hierarchy so they can be posed procedurally (finger curl) around each weapon.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';

export const ASSET_BASE = (import.meta.env?.BASE_URL ?? './') + 'assets/visuals/';
const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const chainOf = (f) => f === 'thumb'
  ? ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']
  : [`${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`];

let mats = null;
function materials() {
  if (mats) return mats;
  const fn = T.fabricNormal().clone(); fn.repeat.set(9, 9); fn.needsUpdate = true;
  const fn2 = T.fabricNormal().clone(); fn2.repeat.set(5, 9); fn2.needsUpdate = true;
  const cloth = T.clothNormal().clone(); cloth.repeat.set(1, 1.6); cloth.needsUpdate = true;
  const camo = T.camoMap().clone(); camo.repeat.set(1.6, 2.2); camo.needsUpdate = true;
  mats = {
    glove: new THREE.MeshStandardMaterial({ color: 0x35332c, roughness: 0.82, metalness: 0, normalMap: fn, normalScale: new THREE.Vector2(1.3, 1.3) }),
    cuff: new THREE.MeshStandardMaterial({ color: 0x1d1d1b, roughness: 0.88, metalness: 0, normalMap: fn2, normalScale: new THREE.Vector2(0.9, 0.9) }),
    guard: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.55, metalness: 0, normalMap: T.polymerNormal(), normalScale: new THREE.Vector2(0.4, 0.4) }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0xffffff, map: camo, roughness: 0.92, metalness: 0, normalMap: cloth, normalScale: new THREE.Vector2(1.6, 1.6) }),
  };
  return mats;
}

// Template per side: { scene, rest: Map(name -> {q, parentQ, axis[], spreadAxis}), fit: Matrix4, wrist: Vector3 }
const templates = {};
async function loadSide(side) {
  const gltf = await new GLTFLoader().loadAsync(ASSET_BASE + (side === 'R' ? 'hand_right.glb' : 'hand_left.glb'));
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const bone = (n) => scene.getObjectByName(n);
  const wrist = bone('wrist');
  // flat joint list -> hierarchy (world transforms preserved)
  for (const f of FINGERS) {
    const ch = chainOf(f);
    let parent = wrist;
    for (const n of ch) { const b = bone(n); parent.attach(b); parent = b; }
  }
  scene.updateMatrixWorld(true);
  const P = (n) => bone(n).getWorldPosition(new THREE.Vector3());
  const W = P('wrist');
  const F = P('middle-finger-phalanx-proximal').sub(W).normalize();
  let N = P('index-finger-phalanx-proximal').sub(W).cross(P('pinky-finger-phalanx-proximal').sub(W)).normalize();
  if (side === 'L') N.negate();
  N.addScaledVector(F, -N.dot(F)).normalize();           // palm normal, orthogonal to finger direction
  const palm = W.clone().addScaledVector(F, 0.068).addScaledVector(N, 0.012);
  const rest = new Map();
  scene.traverse((o) => {
    if (!o.isBone) return;
    rest.set(o.name, { q: o.getWorldQuaternion(new THREE.Quaternion()), parentQ: o.parent.getWorldQuaternion(new THREE.Quaternion()), local: o.quaternion.clone() });
  });
  for (const f of FINGERS) {
    const ch = chainOf(f);
    for (let i = 0; i < ch.length - 1; i++) {
      const p = P(ch[i]), d = P(ch[i + 1]).sub(p).normalize();
      const toward = f === 'thumb' ? palm.clone().addScaledVector(N, 0.03).addScaledVector(F, 0.02).sub(p).normalize() : N;
      rest.get(ch[i]).axis = d.clone().cross(toward).normalize();
      rest.get(ch[i]).spread = N.clone();
    }
  }
  // canonical frame: origin at palm centre, fingers -z, palm facing -y
  const Zc = F.clone().negate(), Yc = N.clone().negate(), Xc = Yc.clone().cross(Zc);
  const fit = new THREE.Matrix4().makeBasis(Xc, Yc, Zc).setPosition(palm).invert();
  let skinned = null;
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned = o; });
  skinned.material = materials().glove;
  skinned.frustumCulled = false;
  templates[side] = { scene, rest, fit, wrist: W.clone().applyMatrix4(fit) };
}

export const handsReady = Promise.all([loadSide('R'), loadSide('L')]).catch((e) => { console.warn('[visuals] hand models failed to load', e); });

let forearmGeo = null, cuffGeo = null, guardGeo = null, strapGeo = null;
function forearmGeometry() {
  if (forearmGeo) return [forearmGeo, cuffGeo];
  const lathe = (pts, seg = 28) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.rotateX(Math.PI / 2); g.scale(1.14, 0.86, 1); return g; };
  // +z = toward the elbow
  cuffGeo = lathe([[0.0, -0.022], [0.03, -0.02], [0.0335, 0.0], [0.035, 0.03], [0.0362, 0.05], [0.034, 0.052]]);
  // sleeve with a turned-back hem and soft folds
  const pts = [[0.03, 0.03], [0.0385, 0.034], [0.0405, 0.042], [0.0395, 0.052], [0.0375, 0.058]];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26, y = 0.062 + t * 0.36;
    pts.push([0.0385 + t * 0.017 + Math.sin(t * 27) * 0.0012 + Math.sin(t * 61 + 1) * 0.0007, y]);
  }
  pts.push([0, 0.422]);
  forearmGeo = lathe(pts);
  // fold irregularity so the sleeve is not a perfect surface of revolution
  const p = forearmGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(y, x);
    const k = 1 + Math.sin(a * 3 + z * 40) * 0.025 + Math.sin(a * 5 - z * 23) * 0.015;
    p.setXYZ(i, x * k, y * k, z);
  }
  forearmGeo.computeVertexNormals();
  return [forearmGeo, cuffGeo];
}
function gloveExtras() {
  if (!guardGeo) {
    guardGeo = new RoundedBoxGeometry(0.074, 0.011, 0.026, 3, 0.005);
    strapGeo = new RoundedBoxGeometry(0.05, 0.006, 0.028, 2, 0.0025);
  }
  return [guardGeo, strapGeo];
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _inv = new THREE.Quaternion();

// Returns a Group in the canonical hand frame (origin = palm centre, fingers toward -z, palm facing -y,
// thumb toward -x on the right hand / +x on the left). `setPose` may be called before the model has loaded.
export function createHand(side) {
  const group = new THREE.Group();
  group.name = 'hand' + side;
  let bones = null, pose = { curl: [0.5, 0.5, 0.5, 0.5, 0.5], spread: 0, forearm: [0, 0, 0] };
  const forearm = new THREE.Group();
  group.add(forearm);
  const [fg, cg] = forearmGeometry(), m = materials();
  const sleeve = new THREE.Mesh(fg, m.sleeve), cuff = new THREE.Mesh(cg, m.cuff);
  sleeve.frustumCulled = cuff.frustumCulled = false;
  forearm.add(sleeve, cuff);
  forearm.visible = false;

  function apply() {
    forearm.rotation.set(pose.forearm[0], pose.forearm[1], pose.forearm[2], 'YXZ');
    if (!bones) return;
    const tpl = templates[side];
    FINGERS.forEach((f, fi) => {
      const ch = chainOf(f), c = pose.curl[fi];
      const start = f === 'thumb' ? 0 : 1;
      for (let i = start; i < ch.length - 1; i++) {
        const r = tpl.rest.get(ch[i]), b = bones.get(ch[i]);
        const amt = Array.isArray(c) ? (c[i - start] ?? c[c.length - 1]) : c * (f === 'thumb' ? [0.35, 0.5, 0.6][i] : [1.0, 1.15, 0.7][i - 1]);
        _q.setFromAxisAngle(r.axis, amt);
        if (i === start && pose.spread) { _q2.setFromAxisAngle(r.spread, pose.spread * (fi - 2.2) * (side === 'R' ? 1 : -1)); _q.multiply(_q2); }
        _inv.copy(r.parentQ).invert();
        b.quaternion.copy(_inv).multiply(_q).multiply(r.q);
      }
    });
  }

  handsReady.then(() => {
    const tpl = templates[side];
    if (!tpl || group.userData.disposed) return;
    const inst = SkeletonUtils.clone(tpl.scene);
    const fit = new THREE.Group();
    fit.matrixAutoUpdate = false;
    fit.matrix.copy(tpl.fit);
    fit.add(inst);
    group.add(fit);
    bones = new Map();
    inst.traverse((o) => { if (o.isBone) bones.set(o.name, o); if (o.isSkinnedMesh) o.frustumCulled = false; });
    forearm.position.copy(tpl.wrist);
    forearm.visible = true;
    // moulded knuckle guard on the back of the hand + wrist strap
    const [gg, sg] = gloveExtras();
    const guard = new THREE.Mesh(gg, m.guard); guard.position.set(side === 'R' ? 0.004 : -0.004, 0.0215, -0.022); guard.rotation.x = -0.12; guard.frustumCulled = false;
    group.add(guard);
    apply();
  });

  return {
    group, forearm,
    setPose(p) { Object.assign(pose, p); apply(); },
    dispose() { group.userData.disposed = true; group.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); },
  };
}
