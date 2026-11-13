// First-person weapon viewmodels: procedural guns (guns.js) + posed gloved hands (hands.js) + procedural animation.
//
// ADS: when state.ads === 1 the optical axis of the sight (red-dot tube / scope / iron sights) lies exactly on the
// overlay camera's -z axis, so the sight centre is at screen centre for ANY overlay FOV. Sizes were tuned for a
// 70 degree vertical-FOV overlay camera (near plane <= 0.02).
// state.lookDelta is the yaw/pitch change of the view this frame in radians (x = yaw to the right, y = pitch up).
import * as THREE from 'three';
import { buildGun, gunMaterials } from './guns.js';
import { createHand, handsReady } from './hands.js';
import { buildGrenadeModel } from './grenade.js';
import * as T from './textures.js';

export const WEAPONS = {
  ar: { name: 'M4 Carbine' },
  smg: { name: 'MP5 Submachine Gun' },
  sniper: { name: 'Bolt-Action Rifle' },
  shotgun: { name: 'Pump Shotgun' },
  pistol: { name: 'M9 Pistol' },
};

export const ADS_OVERLAY_FOV = 70;

const D = Math.PI / 180;
// hip: gun origin in camera space + [pitch, yaw, roll]; adsDist: eye -> rear of sight along the view axis.
// Hands: pos in gun space (x, y, f) of the palm centre, rot [pitch, yaw, roll] applied as yaw * pitch * roll.
const CFG = {
  ar: {
    hip: [0.095, -0.135, -0.17], hipRot: [0.01, 0.03, -0.03], adsDist: 0.085,
    recoil: { back: 0.9, up: 0.55, side: 0.25, roll: 0.5 }, flash: 1, cycle: null, reload: 'mag',
    shell: { r: 0.0048, l: 0.04, mat: 'brass' },
    handR: { pos: [0.021, -0.082, 0.024], rot: [22 * D, 16 * D, -84 * D], curl: [0.55, [0.35, 0.55, 0.3], 1.0, 1.05, 1.1], forearm: [-0.12, -0.1, 0] },
    handL: { pos: [-0.004, -0.038, 0.385], rot: [14 * D, -58 * D, 172 * D], curl: [0.25, 0.92, 0.95, 0.95, 0.9], forearm: [-0.25, -0.1, 0], parent: null },
  },
  smg: {
    hip: [0.095, -0.138, -0.17], hipRot: [0.01, 0.03, -0.03], adsDist: 0.085,
    recoil: { back: 0.7, up: 0.4, side: 0.3, roll: 0.5 }, flash: 0.8, cycle: null, reload: 'mag',
    shell: { r: 0.0048, l: 0.019, mat: 'brass' },
    handR: { pos: [0.022, -0.092, 0.03], rot: [22 * D, 16 * D, -84 * D], curl: [0.55, [0.35, 0.55, 0.3], 1.0, 1.05, 1.1], forearm: [-0.12, -0.1, 0] },
    handL: { pos: [-0.004, -0.058, 0.36], rot: [14 * D, -58 * D, 172 * D], curl: [0.2, 0.8, 0.85, 0.85, 0.8], forearm: [-0.25, -0.1, 0], parent: null },
  },
  sniper: {
    hip: [0.095, -0.145, -0.2], hipRot: [0.008, 0.03, -0.025], adsDist: 0.07,
    recoil: { back: 2.2, up: 1.6, side: 0.3, roll: 0.8 }, flash: 1.5, cycle: 'bolt', cycleDur: 0.95, reload: 'mag',
    shell: { r: 0.006, l: 0.05, mat: 'brass' },
    handR: { pos: [0.022, -0.1, -0.084], rot: [26 * D, 14 * D, -84 * D], curl: [0.5, [0.35, 0.55, 0.3], 1.0, 1.05, 1.1], forearm: [-0.12, -0.1, 0] },
    handL: { pos: [-0.004, -0.066, 0.3], rot: [14 * D, -58 * D, 172 * D], curl: [0.2, 0.75, 0.8, 0.8, 0.75], forearm: [-0.25, -0.1, 0], parent: null },
  },
  shotgun: {
    hip: [0.095, -0.125, -0.2], hipRot: [0.01, 0.03, -0.03], adsDist: 0.06, adsEye: [0, 0.05, -0.03],
    recoil: { back: 2.0, up: 1.7, side: 0.4, roll: 1.0 }, flash: 1.6, cycle: 'pump', cycleDur: 0.5, reload: 'shells',
    shell: { r: 0.0098, l: 0.058, mat: 'shell' },
    handR: { pos: [0.02, -0.064, -0.066], rot: [34 * D, 14 * D, -84 * D], curl: [0.5, [0.3, 0.5, 0.3], 0.9, 0.95, 1.0], forearm: [-0.12, -0.1, 0] },
    handL: { pos: [-0.003, -0.052, 0.46], rot: [14 * D, -58 * D, 172 * D], curl: [0.25, 0.9, 0.95, 0.95, 0.9], forearm: [-0.25, -0.1, 0], parent: 'pump' },
  },
  pistol: {
    hip: [0.065, -0.08, -0.34], hipRot: [0.0, 0.03, -0.02], adsDist: 0.28,
    recoil: { back: 1.0, up: 1.5, side: 0.3, roll: 0.6 }, flash: 0.7, cycle: 'slide', cycleDur: 0.09, reload: 'mag',
    shell: { r: 0.0049, l: 0.019, mat: 'brass' },
    handR: { pos: [0.017, -0.066, 0.008], rot: [20 * D, 10 * D, -86 * D], curl: [0.5, [0.3, 0.5, 0.3], 1.0, 1.05, 1.1], forearm: [0.12, 0.1, 0] },
    handL: { pos: [-0.022, -0.064, 0.03], rot: [24 * D, -22 * D, 84 * D], curl: [0.35, 0.85, 0.95, 1.0, 1.0], forearm: [0.12, -0.15, 0], parent: null },
  },
};

const sat = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => { const t = sat((p - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// Keyframes: [p, x, y, z, pitch, yaw, roll]. Off-hand tracks are in camera space (palm centre, 'YXZ' rotation);
// WHIP is an offset added to the gun pose. p = normalised action time.
const KNIFE = [
  [0, -0.30, -0.42, -0.22, 0.6, -0.2, 1.5],
  [0.2, -0.30, 0.05, -0.30, 0.25, -0.15, 2.3],      // wound up high on the left, blade cocked back
  [0.42, 0.17, -0.09, -0.44, 0.45, -1.0, 0.35],     // slash across to the lower right
  [0.6, 0.21, -0.12, -0.42, 0.5, -1.1, 0.25],       // impact hold / follow-through
  [1, -0.05, -0.5, -0.25, 0.7, -0.5, 1.2],
];
const NADE = [
  [0, -0.25, -0.45, -0.3, 0.3, -0.3, 2.6],
  [0.18, -0.13, -0.13, -0.36, 0.15, -0.45, 2.5],    // presented: pin comes out here (also the cooking pose)
  [0.4, -0.33, 0.10, -0.17, 1.2, -0.2, 2.0],        // cocked back by the ear
  [0.55, -0.06, 0.08, -0.5, 0.3, -0.25, 1.7],       // release
  [0.72, 0.04, -0.2, -0.5, -0.6, -0.35, 1.5],       // follow-through
  [1, -0.2, -0.5, -0.3, 0.3, -0.3, 2.0],
];
const WHIP = [
  [0, 0, 0, 0, 0, 0, 0],
  [0.22, 0.05, 0.11, 0.10, 0.95, -0.15, -0.35],     // raised by the shoulder, muzzle up
  [0.42, -0.14, 0.0, -0.16, 0.35, 0.75, 0.7],       // butt of the grip driven forward-left
  [0.58, -0.16, -0.02, -0.15, 0.3, 0.85, 0.75],
  [1, 0, 0, 0, 0, 0, 0],
];
function evalKeys(keys, p, pos, rot) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], u = seg(p, a[0], b[0]);
  pos.set(a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u);
  rot.set(a[4] + (b[4] - a[4]) * u, a[5] + (b[5] - a[5]) * u, a[6] + (b[6] - a[6]) * u);
}

// Combat knife in the off-hand frame: handle across the palm (x axis), blade out of the thumb side.
let knifeRes = null;
function buildKnife() {
  if (!knifeRes) {
    const blade = new THREE.Shape([[0.062, -0.015], [0.165, -0.017], [0.2, -0.008], [0.222, 0.006], [0.19, 0.0125], [0.062, 0.0125]].map(([x, y]) => new THREE.Vector2(x, y)));
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.0012, bevelEnabled: true, bevelThickness: 0.0011, bevelSize: 0.004, bevelOffset: -0.004, bevelSegments: 1 });
    bg.translate(0, 0, -0.0006); bg.rotateX(Math.PI / 2);
    const hg = new THREE.CapsuleGeometry(0.0125, 0.085, 4, 10); hg.rotateZ(Math.PI / 2); hg.scale(1, 0.8, 1.15); hg.translate(0.005, 0, 0);
    const gg = new THREE.BoxGeometry(0.006, 0.012, 0.046); gg.translate(0.058, 0, 0);
    knifeRes = {
      bg, hg, gg,
      steel: new THREE.MeshStandardMaterial({ color: 0x9a9da1, metalness: 1, roughness: 0.28 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0, roughness: 0.8, normalMap: T.stippleNormal(), normalScale: new THREE.Vector2(0.6, 0.6) }),
      guard: new THREE.MeshStandardMaterial({ color: 0x2a2b2d, metalness: 0.8, roughness: 0.45 }),
    };
  }
  const g = new THREE.Group();
  for (const [geo, mat] of [[knifeRes.bg, knifeRes.steel], [knifeRes.hg, knifeRes.dark], [knifeRes.gg, knifeRes.guard]]) { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; g.add(m); }
  g.position.set(0, -0.02, -0.012); g.scale.setScalar(0.88);
  return g;
}

// ---- shared resources -----------------------------------------------------------------------------------------------
let shared = null;
function sharedRes() {
  if (shared) return shared;
  const side = new THREE.PlaneGeometry(1, 0.6); side.translate(0.41, 0, 0); side.rotateY(Math.PI / 2); // origin at flash base, extends -z
  const side2 = side.clone(); side2.rotateZ(Math.PI / 2);
  shared = {
    flashSideGeo: side, flashSideGeo2: side2, flashFrontGeo: new THREE.PlaneGeometry(1, 1),
    sideTex: [0, 1, 2, 3].map(T.flashSide), frontTex: [0, 1, 2, 3].map(T.flashFront),
    shellGeo: (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 10); g.rotateX(Math.PI / 2); return g; })(),
    shellMat: new THREE.MeshStandardMaterial({ color: 0x9b1c14, roughness: 0.55, metalness: 0 }),
    brassMat: new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.9 }),
    dotGeo: new THREE.CircleGeometry(1, 16),
    envRT: null,
  };
  return shared;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion();

export function createViewmodel(weaponId) {
  const id = CFG[weaponId] ? weaponId : 'ar';
  const cfg = CFG[id], res = sharedRes(), mats = gunMaterials();
  const root = new THREE.Group(); root.name = 'viewmodel_' + id;
  const body = new THREE.Group(); root.add(body);       // whole-body lunge / twist during melee and throws
  const sway = new THREE.Group(); body.add(sway);
  const { root: gun, parts, anchors } = buildGun(id);
  sway.add(gun);
  gun.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  // --- self-contained lighting (the overlay scene needs no lights of its own)
  const lights = new THREE.Group(); lights.name = 'viewmodelLights';
  const hemi = new THREE.HemisphereLight(0xd6e4ff, 0x6b6456, 1.3);
  const sun = new THREE.DirectionalLight(0xfff0dc, 4.2);
  sun.position.set(-0.5, 0.9, -1.2); sun.target.position.set(0, 0, -0.3);
  lights.add(hemi, sun, sun.target);
  root.add(lights);

  // --- hands
  const mkHand = (side, hc) => {
    const h = createHand(side);
    h.setPose({ curl: hc.curl, forearm: hc.forearm, spread: hc.spread ?? 0 });
    h.base = new THREE.Vector3(hc.pos[0], hc.pos[1], -hc.pos[2]);
    h.group.position.copy(h.base);
    h.group.rotation.set(hc.rot[0], hc.rot[1], hc.rot[2], 'YXZ');
    h.baseQ = h.group.quaternion.clone();
    return h;
  };
  const handR = mkHand('R', cfg.handR), handL = mkHand('L', cfg.handL);
  gun.add(handR.group);
  const lParent = cfg.handL.parent && parts[cfg.handL.parent] ? parts[cfg.handL.parent] : gun;
  lParent.add(handL.group);
  if (lParent !== gun) { handL.base.sub(lParent.position); handL.group.position.copy(handL.base); }

  // --- off hand (camera space) for knife slashes and grenades
  const aux = createHand('L');
  aux.group.visible = false; aux.group.rotation.order = 'YXZ';
  body.add(aux.group);
  const knife = buildKnife(); aux.group.add(knife);
  const nade = buildGrenadeModel();
  nade.group.position.set(0.004, -0.036, -0.014); nade.group.rotation.z = -Math.PI / 2;      // fuze toward the thumb
  nade.group.traverse((o) => { o.frustumCulled = false; });
  aux.group.add(nade.group);
  // loose pin / safety lever that fly off
  const bits = [];
  for (const src of [nade.ring, nade.spoon]) {
    const m = src.clone(true); m.visible = false; m.traverse((o) => { o.frustumCulled = false; });
    root.add(m);
    bits.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 });
  }
  function fling(i, src, vx, vy, vz) {
    const b = bits[i];
    src.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
    src.matrixWorld.decompose(b.m.position, b.m.quaternion, _v2);
    root.worldToLocal(b.m.position);
    b.v.set(vx, vy, vz); b.w.set(Math.random() * 20 - 10, Math.random() * 20 - 10, 14); b.life = 0.8; b.m.visible = true;
  }
  // slash smear: a ribbon through the blade's recent positions
  const SM = 12, smPos = new Float32Array((SM + 1) * 6), smCol = new Float32Array((SM + 1) * 8).fill(1), smIdx = [];
  for (let i = 0; i < SM; i++) smIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  const smGeo = new THREE.BufferGeometry();
  smGeo.setAttribute('position', new THREE.BufferAttribute(smPos, 3)); smGeo.setAttribute('color', new THREE.BufferAttribute(smCol, 4)); smGeo.setIndex(smIdx);
  const smMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const smear = new THREE.Mesh(smGeo, smMat); smear.frustumCulled = false; smear.visible = false; smear.renderOrder = 12;
  body.add(smear);
  const _kp = new THREE.Vector3(), _kr = new THREE.Vector3(), _km = new THREE.Matrix4(), _kq = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
  let act = null, actT = 0, actDur = 0.45, holding = false, fromHold = false, pinOut = false, released = false;
  function endAct() {
    act = null; holding = false; fromHold = false;
    aux.group.visible = false; smear.visible = false; handL.group.visible = true;
    body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
  }
  function startAct(type, dur) {
    act = type; actT = 0; actDur = dur; pinOut = false; released = false;
    aux.group.visible = true;
    knife.visible = type === 'melee' && id !== 'pistol';
    nade.group.visible = type === 'nade'; nade.ring.visible = true; nade.spoon.visible = true;
    if (type === 'melee' && id === 'pistol') aux.group.visible = false;
    aux.setPose(type === 'nade' ? { curl: [0.45, 0.72, 0.75, 0.78, 0.8], forearm: [0.1, 0, 0] } : { curl: [0.95, 1.3, 1.3, 1.3, 1.3], forearm: [0.1, 0, 0] });
  }
  function applyAct(p) {
    const env = seg(p, 0, 0.14) - seg(p, act === 'nade' ? 0.78 : 0.72, 1);
    offL.y -= 0.32 * env; offL.x -= 0.06 * env;                 // the support hand leaves the weapon
    handL.group.visible = env < 0.9;
    if (act === 'melee') {
      const w = seg(p, 0, 0.2) * (1 - seg(p, 0.2, 0.3)), s2 = seg(p, 0.2, 0.42) - seg(p, 0.6, 1);
      body.position.set(0.035 * s2 - 0.02 * w, -0.015 * s2, -0.075 * s2 + 0.03 * w);
      body.rotation.set(0.03 * s2, -0.14 * s2 + 0.08 * w, -0.1 * s2 + 0.05 * w);
      if (id === 'pistol') {
        evalKeys(WHIP, p, _kp, _kr);
        lift.add(_kp); tilt.add(_kr);
        return;
      }
      lift.x += 0.05 * env; lift.y -= 0.09 * env; lift.z += 0.04 * env;
      tilt.x -= 0.3 * env; tilt.y -= 0.3 * env; tilt.z -= 0.35 * env;
      evalKeys(KNIFE, p, aux.group.position, _kr); aux.group.rotation.set(_kr.x, _kr.y, _kr.z);
      // smear: sample the blade (base + tip) along the recent path
      const on = p > 0.21 && p < 0.62;
      smear.visible = on;
      if (on) {
        for (let i = 0; i <= SM; i++) {
          const pi = Math.max(0.2, p - i * 0.016);
          evalKeys(KNIFE, pi, _kp, _kr);
          _km.compose(_kp, _kq.setFromEuler(_e.set(_kr.x, _kr.y, _kr.z, 'YXZ')), _one);
          _v.set(0.075, -0.02, -0.012).applyMatrix4(_km); _v2.set(0.225, -0.02, -0.008).applyMatrix4(_km);
          smPos.set([_v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z], i * 6);
          const f = Math.pow(1 - i / SM, 2) * 0.2 * (1 - seg(p, 0.4, 0.56));
          smCol[i * 8 + 3] = f * 0.15; smCol[i * 8 + 7] = f;
        }
        _e.order = 'XYZ';
        smGeo.attributes.position.needsUpdate = true; smGeo.attributes.color.needsUpdate = true;
      }
    } else {
      lift.x += 0.03 * env; lift.y -= 0.075 * env; lift.z += 0.03 * env;
      tilt.x -= 0.26 * env; tilt.y -= 0.3 * env; tilt.z -= 0.28 * env;
      evalKeys(NADE, p, aux.group.position, _kr); aux.group.rotation.set(_kr.x, _kr.y, _kr.z);
      const wind = seg(p, 0.22, 0.4) * (1 - seg(p, 0.42, 0.55)), thr = seg(p, 0.42, 0.56) - seg(p, 0.68, 1);
      body.position.set(-0.015 * wind + 0.02 * thr, 0.01 * wind - 0.02 * thr, 0.035 * wind - 0.07 * thr);
      body.rotation.set(0.05 * wind - 0.09 * thr, 0.1 * wind - 0.12 * thr, 0.04 * wind - 0.05 * thr);
      if (!pinOut && p >= 0.17) { pinOut = true; fling(0, nade.ring, 0.9, 0.5, 0.3); nade.ring.visible = false; }
      if (!released && p >= 0.55) { released = true; fling(1, nade.spoon, -0.5, 1.4, -0.6); nade.group.visible = false; }
    }
  }

  // --- red dot reticle (only resolves when looking down the tube)
  let dot = null;
  if (anchors.dot) {
    dot = new THREE.Mesh(res.dotGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.25, 0.15), transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
    dot.scale.setScalar(0.00042);
    dot.position.copy(anchors.dot);
    dot.renderOrder = 5;
    gun.add(dot);
  }

  // --- muzzle flash
  const flash = new THREE.Group(); flash.position.copy(anchors.muzzle); flash.visible = false;
  const fmat = () => new THREE.MeshBasicMaterial({ map: res.sideTex[0], color: new THREE.Color(2.2, 1.9, 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const fSideMat = fmat(), fFrontMat = fmat(); fFrontMat.map = res.frontTex[0];
  const fs1 = new THREE.Mesh(res.flashSideGeo, fSideMat), fs2 = new THREE.Mesh(res.flashSideGeo2, fSideMat), ff = new THREE.Mesh(res.flashFrontGeo, fFrontMat);
  ff.position.z = -0.03;
  for (const m of [fs1, fs2, ff]) { m.frustumCulled = false; m.renderOrder = 10; flash.add(m); }
  gun.add(flash);
  const flashLight = new THREE.PointLight(0xffc680, 0, 4, 2);
  flashLight.position.copy(anchors.muzzle).add(_v.set(0, 0.03, -0.08));
  gun.add(flashLight);
  hemi.userData.viewmodelRig = sun.userData.viewmodelRig = flashLight.userData.viewmodelRig = true;
  let flashT = 0, lightCheck = 0;

  // --- shell casings (pooled, simulated in viewmodel space)
  const SHELLS = 6, shells = [];
  const sc = cfg.shell, shellMat = sc.mat === 'shell' ? res.shellMat : res.brassMat;
  for (let i = 0; i < SHELLS; i++) {
    const m = new THREE.Mesh(res.shellGeo, shellMat);
    m.scale.set(sc.r, sc.r, sc.l); m.visible = false; m.frustumCulled = false;
    root.add(m);
    shells.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 });
  }
  let shellIdx = 0;
  function ejectShell() {
    const s = shells[shellIdx]; shellIdx = (shellIdx + 1) % SHELLS;
    gun.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
    s.m.position.copy(anchors.eject); gun.localToWorld(s.m.position); root.worldToLocal(s.m.position);
    s.m.quaternion.copy(sway.quaternion);
    s.v.set(1.6 + Math.random() * 1.0, 1.1 + Math.random() * 0.7, 0.25 + Math.random() * 0.5).applyQuaternion(sway.quaternion);
    s.w.set((Math.random() - 0.5) * 30, 12 + Math.random() * 25, (Math.random() - 0.5) * 30);
    s.life = 0.9; s.m.visible = true;
  }

  // --- animation state
  const hipPos = new THREE.Vector3(...cfg.hip), hipRot = cfg.hipRot;
  // ADS pose: the eye sits at `adsEye` (gun space; default = adsDist behind the sight on its axis) and the gun is
  // pitched so the line eye -> sight anchor is the camera's -z axis: the sight centre lands exactly on screen centre.
  const eye = cfg.adsEye ? new THREE.Vector3(cfg.adsEye[0], cfg.adsEye[1], -cfg.adsEye[2]) : anchors.sight.clone().add(_v.set(0, 0, cfg.adsDist));
  const adsPitch = Math.atan2(eye.y - anchors.sight.y, Math.max(1e-4, eye.z - anchors.sight.z));
  const adsPos = eye.clone().applyEuler(_e.set(adsPitch, 0, 0)).negate();
  let time = Math.random() * 10, bobT = 0, moveAmt = 0, sprintT = 0, airT = 0;
  let lagX = 0, lagY = 0, adsNow = 0;
  const rc = { z: 0, vz: 0, p: 0, vp: 0, y: 0, vy: 0, r: 0, vr: 0 };
  let equipT = 1, reloadT = -1, reloadDur = 1, cycleT = -1, cycleEjected = false, pendingShell = false;
  const magBase = parts.mag ? parts.mag.position.clone() : null;
  const pumpBase = parts.pump ? parts.pump.position.clone() : null;
  const offR = new THREE.Vector3(), offL = new THREE.Vector3(), tilt = new THREE.Vector3(), lift = new THREE.Vector3();
  let renderer = null, sceneRef = null;
  gun.children[0].onBeforeRender = (r, s) => { renderer = r; sceneRef = s; };

  function spring(k, c, dt) {
    for (const [x, v] of [['z', 'vz'], ['p', 'vp'], ['y', 'vy'], ['r', 'vr']]) {
      rc[v] += (-k * rc[x] - c * rc[v]) * dt;
      rc[x] += rc[v] * dt;
    }
  }

  // Bolt / pump / slide cycling. c in 0..1
  function applyCycle(c) {
    if (cfg.cycle === 'bolt') {
      const up = seg(c, 0.12, 0.3) - seg(c, 0.82, 0.97), back = seg(c, 0.3, 0.48) - seg(c, 0.6, 0.8);
      parts.bolt.rotation.z = up * 1.05;
      parts.bolt.position.z = back * 0.085;
      // right hand leaves the grip, works the bolt, returns
      const reach = seg(c, 0.0, 0.14) - seg(c, 0.88, 1.0);
      const knob = _v.set(0.05, -0.02 + up * 0.045, 0.02 + back * 0.085);
      offR.copy(knob).sub(handR.base).multiplyScalar(reach);
      offR.x += reach * 0.012;
      tilt.z -= reach * 0.12; tilt.x += reach * 0.04; lift.x -= reach * 0.01;
      if (!cycleEjected && c > 0.46) { cycleEjected = true; ejectShell(); }
    } else if (cfg.cycle === 'pump') {
      const back = seg(c, 0.08, 0.42) - seg(c, 0.55, 0.92);
      parts.pump.position.z = pumpBase.z + back * 0.088;
      tilt.x += back * 0.03; tilt.z -= back * 0.04;
      if (!cycleEjected && c > 0.4) { cycleEjected = true; ejectShell(); }
    } else if (cfg.cycle === 'slide') {
      parts.slide.position.z = (seg(c, 0, 0.3) - seg(c, 0.4, 1)) * 0.038;
    }
  }

  // Reload choreography. p in 0..1
  function applyReload(p) {
    if (cfg.reload === 'mag') {
      const env = seg(p, 0, 0.14) - seg(p, 0.84, 1);
      const out = seg(p, 0.12, 0.3), back = seg(p, 0.46, 0.66);
      const drop = out * (1 - back);
      tilt.x += env * 0.22; tilt.z -= env * 0.42; tilt.y += env * 0.1; lift.y += env * 0.03; lift.x -= env * 0.02;
      // magazine leaves along the magwell axis then swings away; a fresh one comes back along the same path
      parts.mag.position.set(magBase.x - drop * 0.05, magBase.y - drop * 0.24, magBase.z + drop * 0.05);
      parts.mag.rotation.x = drop * 0.25;
      parts.mag.visible = !(p > 0.31 && p < 0.45);
      // seat bump
      const bump = seg(p, 0.64, 0.68) - seg(p, 0.68, 0.76);
      lift.y += bump * 0.006;
      // left hand: handguard -> magazine -> away with the old mag -> back in -> handguard
      const toMag = seg(p, 0.02, 0.12) - seg(p, 0.7, 0.86);
      if (id === 'pistol') {
        offL.set(0.0, -0.05 - drop * 0.24, 0.0).multiplyScalar(toMag).add(_v.set(-drop * 0.05, 0, drop * 0.05));
      } else {
        const magGrip = _v.set(-0.012, parts.mag.position.y + (id === 'sniper' ? -0.085 : -0.2), -(id === 'sniper' ? 0.115 : id === 'smg' ? 0.235 : 0.19) + parts.mag.position.z);
        offL.copy(magGrip).sub(handL.base).multiplyScalar(toMag);
      }
      if (parts.charge && id === 'smg') {
        const pull = seg(p, 0.72, 0.8) - seg(p, 0.82, 0.86);
        parts.charge.position.z = pull * 0.07;
      } else if (parts.charge) {
        const pull = seg(p, 0.74, 0.82) - seg(p, 0.84, 0.88);
        parts.charge.position.z = pull * 0.06;
      }
      if (parts.slide && id === 'pistol') parts.slide.position.z = (seg(p, 0, 0.05) - seg(p, 0.8, 0.84)) * 0.038;
      if (id === 'sniper') {
        const c = sat((p - 0.72) / 0.26);
        if (p > 0.72) { cycleEjected = true; applyCycle(c); }
      }
    } else if (cfg.reload === 'shells') {
      // roll the gun, feed shells one at a time into the loading port, rack the pump
      const env = seg(p, 0, 0.1) - seg(p, 0.8, 0.9);
      tilt.z += env * 0.75; tilt.x += env * 0.18; lift.y += env * 0.04; lift.x -= env * 0.05;
      const n = Math.max(1, Math.round(reloadDur * 0.7 / 0.5));
      const u = sat((p - 0.1) / 0.7) * n, k = u - Math.floor(u);
      const feed = p > 0.1 && p < 0.8 ? Math.sin(k * Math.PI) : 0;
      const port = _v.set(0.0, -0.085, -0.19).sub(handL.base).sub(pumpBase ?? _v2.set(0, 0, 0));
      offL.copy(port).multiplyScalar(env).add(_v2.set(0.02 * (1 - feed), -0.09 * (1 - feed), 0.08 * (1 - feed)).multiplyScalar(env));
      lift.y += feed * 0.004;
      if (p > 0.88) { cycleEjected = true; applyCycle(sat((p - 0.88) / 0.12)); }
    }
  }

  const api = {
    object3D: root,
    lights,
    weaponId: id,
    adsFov: ADS_OVERLAY_FOV,

    update(dt, state = {}) {
      dt = Math.min(dt, 0.05);
      time += dt;
      const s = state, ads = sat(s.ads ?? 0), grounded = s.grounded !== false;
      const mv = sat(s.moveSpeed ?? 0), sprinting = !!s.sprinting && mv > 0.1;
      adsNow = ads;
      const adsE = ads * ads * (3 - 2 * ads);

      // If the host scene brings its own lights (anything outside our rig), switch the built-in rig off.
      lightCheck -= dt;
      if (sceneRef && lightCheck <= 0) {
        lightCheck = 1;
        let external = false;
        sceneRef.traverse((o) => { if (o.isLight && !o.userData.viewmodelRig) external = true; });
        hemi.visible = sun.visible = !external;
      }
      // fallback reflection environment for the overlay scene
      if (renderer && sceneRef && !sceneRef.environment) {
        if (!res.envRT) { const pm = new THREE.PMREMGenerator(renderer); res.envRT = pm.fromEquirectangular(T.skyEquirect()); pm.dispose(); }
        sceneRef.environment = res.envRT.texture;
      }

      moveAmt = damp(moveAmt, grounded ? mv : 0, 8, dt);
      sprintT = damp(sprintT, sprinting && reloadT < 0 ? 1 : 0, 7, dt);
      airT = damp(airT, grounded ? 0 : 1, 6, dt);
      bobT += dt * (sprinting ? 11.5 : 4 + 4.5 * mv) * (mv > 0.02 ? 1 : 0);
      const bobAmp = moveAmt * (1 + sprintT * 1.5) * (1 - adsE * 0.88);
      const bobX = Math.sin(bobT) * 0.0065 * bobAmp, bobY = -Math.abs(Math.cos(bobT)) * 0.0075 * bobAmp + 0.004 * bobAmp;
      const idleK = 1 - adsE * 0.75;
      const idX = (Math.sin(time * 0.83) * 0.0012 + Math.sin(time * 1.9) * 0.0004) * idleK;
      const idY = (Math.sin(time * 1.31 + 1) * 0.0018) * idleK;

      // look lag (weapon trails the view)
      const ld = s.lookDelta ?? { x: 0, y: 0 }, inv = 1 / Math.max(dt, 1e-3), lagK = 1 - adsE * 0.6;
      lagX = damp(lagX, THREE.MathUtils.clamp(-(ld.x || 0) * inv * 0.012, -0.07, 0.07) * lagK, 10, dt);
      lagY = damp(lagY, THREE.MathUtils.clamp((ld.y || 0) * inv * 0.012, -0.05, 0.05) * lagK, 10, dt);

      // recoil spring
      const sub = Math.max(1, Math.ceil(dt / 0.008));
      for (let i = 0; i < sub; i++) spring(260, 26, dt / sub);

      // flash + light decay
      if (flashT > 0) {
        flashT -= dt;
        const f = Math.max(0, flashT / 0.055);
        flash.visible = f > 0;
        fSideMat.opacity = fFrontMat.opacity = f;
        flashLight.intensity = f * 5 * cfg.flash;
      } else if (flash.visible) { flash.visible = false; flashLight.intensity = 0; }

      // timelines
      offR.set(0, 0, 0); offL.set(0, 0, 0); tilt.set(0, 0, 0); lift.set(0, 0, 0);
      if (equipT < 1) {
        equipT = Math.min(1, equipT + dt / 0.38);
        const e = 1 - seg(equipT, 0, 1);
        lift.y -= e * 0.22; tilt.x -= e * 0.75; tilt.z += e * 0.25;
      }
      if (reloadT >= 0) {
        reloadT += dt / reloadDur;
        if (reloadT >= 1) { reloadT = -1; applyReload(1); if (cfg.cycle) applyCycle(1); if (parts.mag) parts.mag.visible = true; }
        else applyReload(reloadT);
      } else if (cycleT >= 0) {
        cycleT += dt / cfg.cycleDur;
        if (cycleT >= 1) { cycleT = -1; applyCycle(1); } else applyCycle(cycleT);
      }
      if (act) {
        actT += dt;
        let p = actT / actDur;
        if (act === 'nade') {
          if (holding) p = Math.min(0.18, (actT / 0.16) * 0.18);                    // cooking: wait in the presented pose
          else if (fromHold) { const tr = 0.55 * actDur; p = actT < tr ? 0.18 + 0.37 * (actT / tr) : 0.55 + 0.45 * ((actT - tr) / Math.max(0.05, actDur - tr)); }
        }
        if (p >= 1) endAct(); else applyAct(p);
      }
      const busy = act ? 0.9 : reloadT >= 0 ? 0.5 : 0;   // reloading / melee / throwing pull the weapon out of ADS
      const a = adsE * (1 - busy * 0.6);

      // compose pose
      const p = sway.position;
      p.lerpVectors(hipPos, adsPos, a);
      const hipK = 1 - a;
      p.x += bobX + idX + lagX * 0.25 + lift.x + sprintT * hipK * -0.045 + rc.y * 0.01;
      p.y += bobY + idY - lagY * 0.2 + lift.y + sprintT * hipK * -0.012 - airT * 0.012 * hipK;
      p.z += rc.z + lift.z + sprintT * hipK * 0.03;
      const rx = hipRot[0] * hipK + adsPitch * a + tilt.x + rc.p + lagY * 0.9 + idY * 2.5 + sprintT * hipK * -0.24 + bobY * 1.2 + airT * 0.05 * hipK;
      const ry = hipRot[1] * hipK + tilt.y + rc.y + lagX + idX * 2.5 + sprintT * hipK * 0.62 + bobX * 1.0;
      const rz = hipRot[2] * hipK + tilt.z + rc.r + lagX * 0.9 + sprintT * hipK * 0.3 + bobX * 2.2;
      sway.rotation.set(rx, ry, rz, 'YXZ');

      handR.group.position.copy(handR.base).add(offR);
      handL.group.position.copy(handL.base).add(offL);

      if (dot) dot.material.opacity = sat((adsE - 0.55) / 0.35) * (reloadT >= 0 ? 0 : 1);

      // shells
      for (const sh of shells) {
        if (sh.life <= 0) continue;
        sh.life -= dt;
        if (sh.life <= 0) { sh.m.visible = false; continue; }
        sh.v.y -= 9.8 * dt;
        sh.m.position.addScaledVector(sh.v, dt);
        _e.set(sh.w.x * dt, sh.w.y * dt, sh.w.z * dt);
        sh.m.quaternion.multiply(_q.setFromEuler(_e));
      }
      if (pendingShell) { pendingShell = false; ejectShell(); }
      for (const b of bits) {
        if (b.life <= 0) continue;
        b.life -= dt;
        if (b.life <= 0) { b.m.visible = false; continue; }
        b.v.y -= 9.8 * dt; b.m.position.addScaledVector(b.v, dt);
        _e.set(b.w.x * dt, b.w.y * dt, b.w.z * dt); b.m.quaternion.multiply(_q.setFromEuler(_e));
      }
    },

    // Melee strike (~0.45 s): knife slash with the off hand for long guns, pistol-whip for the pistol.
    // Timeline: wind-up 0-20 %, strike 20-42 % (contact ~40 %), hold to 60 %, recover.
    melee(durationSec = 0.45) { startAct('melee', Math.max(0.2, durationSec)); },

    // Frag throw (~0.6 s): gun dips, off hand presents the grenade, pin out, overhand throw. Release at 55 %.
    throwGrenade(durationSec = 0.6) {
      const wasHolding = act === 'nade' && holding;
      if (!wasHolding) startAct('nade', Math.max(0.25, durationSec));
      else { actT = 0; actDur = Math.max(0.25, durationSec); }
      holding = false; fromHold = wasHolding;
    },
    // Cooking: true presents the grenade (pin pulled) and holds it until throwGrenade(); false puts it away.
    setGrenadeInHand(on) {
      if (on) { if (!(act === 'nade' && holding)) { startAct('nade', 0.6); holding = true; fromHold = false; } }
      else if (act === 'nade' && holding) endAct();
    },

    fire() {
      const r = cfg.recoil, k = 1 - adsNow * 0.45;
      rc.vz += 0.9 * r.back * k;
      rc.vp += 2.4 * r.up * k;
      rc.vy += (Math.random() - 0.5) * 2.2 * r.side * k;
      rc.vr += (Math.random() - 0.5) * 2.5 * r.roll * k;
      // flash
      flashT = 0.055;
      flash.visible = true;
      const v = (Math.random() * 4) | 0, sc2 = cfg.flash * (0.8 + Math.random() * 0.5);
      fSideMat.map = res.sideTex[v]; fFrontMat.map = res.frontTex[(v + 1 + ((Math.random() * 3) | 0)) % 4];
      fSideMat.opacity = fFrontMat.opacity = 1;
      flash.rotation.z = Math.random() * Math.PI * 2;
      fs1.scale.setScalar(0.36 * sc2); fs2.scale.setScalar(0.36 * sc2);
      ff.scale.setScalar(0.27 * sc2 * (0.8 + Math.random() * 0.5)); ff.rotation.z = Math.random() * 6.28;
      flashLight.intensity = 5 * cfg.flash;
      if (cfg.cycle === 'bolt' || cfg.cycle === 'pump') { cycleT = 0.0001; cycleEjected = false; }
      else { if (cfg.cycle === 'slide') cycleT = 0.0001; pendingShell = true; }
    },

    reload(durationSec = 2) {
      reloadDur = Math.max(0.3, durationSec); reloadT = 0.0001; cycleT = -1;
      if (cfg.cycle) applyCycle(1);
    },

    equip() { endAct(); equipT = 0; reloadT = -1; cycleT = -1; if (parts.mag) { parts.mag.visible = true; parts.mag.position.copy(magBase); parts.mag.rotation.x = 0; } if (cfg.cycle) applyCycle(1); },

    // Muzzle position mapped from the overlay camera's projection into the world camera's, so a tracer starts exactly
    // where the muzzle appears on screen even when the two cameras use different FOVs.
    muzzleWorldPosition(target, overlayCamera, worldCamera) {
      gun.updateWorldMatrix(true, false);
      _v.copy(anchors.muzzle); gun.localToWorld(_v);
      overlayCamera.updateMatrixWorld(); worldCamera.updateMatrixWorld();
      _v.applyMatrix4(overlayCamera.matrixWorldInverse);
      const depth = Math.max(0.05, -_v.z);
      _v.applyMatrix4(overlayCamera.projectionMatrix);                       // -> NDC
      _v2.set(_v.x, _v.y, 0.5).applyMatrix4(worldCamera.projectionMatrixInverse);
      _v2.multiplyScalar(-depth / _v2.z);                                    // view-space point at the same depth
      return target.copy(_v2).applyMatrix4(worldCamera.matrixWorld);
    },

    // Optional: match the viewmodel light rig to the world. sunDirection is world-space (scene -> sun).
    setLighting({ sunDirection, camera, sunIntensity, ambientIntensity, sunColor } = {}) {
      if (sunDirection && camera) { _v.copy(sunDirection).applyQuaternion(_q.copy(camera.quaternion).invert()); sun.position.copy(_v); sun.target.position.set(0, 0, 0); }
      if (sunIntensity != null) sun.intensity = sunIntensity;
      if (ambientIntensity != null) hemi.intensity = ambientIntensity;
      if (sunColor != null) sun.color.set(sunColor);
    },

    dispose() {
      root.removeFromParent();
      handR.dispose(); handL.dispose(); aux.dispose(); smGeo.dispose(); smMat.dispose();
      fSideMat.dispose(); fFrontMat.dispose(); dot?.material.dispose();
      hemi.dispose?.(); sun.dispose?.(); flashLight.dispose?.();
    },
  };
  // debug handles for the dev page
  api._debug = { gun, parts, handR, handL, anchors, cfg, sway, hipPos, adsPos, lights, aux, body, KNIFE, NADE, WHIP };
  return api;
}

// Optional: await before showing the first frame so hands are present immediately.
export function preloadViewmodels() { return handsReady; }
