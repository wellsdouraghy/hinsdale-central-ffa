// Third-person player characters: rigged soldier (Soldier.glb, Mixamo "Vanguard") with phase-synced idle/walk/run clips
// (cadence matched to ground speed, legs turned toward the travel direction, played backwards when backpedalling)
// plus a procedural layer: body lean from acceleration and turning, crouch / slide / airborne / landing / ladder /
// mantle / grapple leg poses (leg IK), aim pitch (spine), hip-ready and aim-down-sights weapon holds (arm IK onto
// the gun), breathing, weapon bob and recoil kick, hit flinch, death fall.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildGun } from './guns.js';
import { buildGrenadeModel } from './grenade.js';
import { ASSET_BASE } from './hands.js';
import * as T from './textures.js';
import { applyLook, RIM_GLSL } from './characterLooks.js';

const B = (n) => 'mixamorig:' + n;
const sat = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => { const t = sat((p - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const clamp = THREE.MathUtils.clamp, TAU = Math.PI * 2;
const wrapPi = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };

// Terrain campuses: ground height sampler (x, z) -> y used to plant each foot on the slope; null on flat campuses.
let groundSampler = null;
export function setCharacterGround(fn) { groundSampler = typeof fn === 'function' ? fn : null; }

// ---- shared template ------------------------------------------------------------------------------------------------
let template = null;
async function load() {
  const gltf = await new GLTFLoader().loadAsync(ASSET_BASE + 'soldier.glb');
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const get = (n) => scene.getObjectByName(B(n)) || scene.getObjectByName(('mixamorig' + n));
  const wp = (n) => get(n).getWorldPosition(new THREE.Vector3());
  // which way does the bind pose face?
  const fwd = wp('LeftToeBase').sub(wp('LeftFoot')).add(wp('RightToeBase')).sub(wp('RightFoot')); fwd.y = 0; fwd.normalize();
  const yawFix = Math.atan2(-fwd.x, -fwd.z);        // rotate so forward becomes -z
  // hand frames from the T-pose: finger axis and palm normal in each hand bone's local space
  const hand = {};
  for (const s of ['Left', 'Right']) {
    const h = get(s + 'Hand'), q = h.getWorldQuaternion(new THREE.Quaternion()).invert();
    const f = wp(s + 'HandMiddle1').sub(wp(s + 'Hand')).normalize();
    const fL = f.clone().applyQuaternion(q), pL = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
    pL.addScaledVector(fL, -pL.dot(fL)).normalize();
    const m = new THREE.Matrix4().makeBasis(fL, pL, fL.clone().cross(pL));
    hand[s] = { frameInv: new THREE.Quaternion().setFromRotationMatrix(m).invert(), curlAxis: fL.clone().cross(pL).normalize(), fL, pL };
  }
  const height = wp('HeadTop_End').y - Math.min(wp('LeftToeBase').y, 0);
  // Arms, hands and fingers are driven procedurally: strip their tracks so the mixer does not fight the IK.
  const clips = {};
  for (const c of gltf.animations) {
    const clip = c.clone();
    clip.tracks = clip.tracks.filter((t) => !/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(t.name) && !/\.scale$/.test(t.name));
    clips[c.name] = clip;
  }
  scene.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.material.metalness = 0; o.material.roughness = 0.82;
      if (/visor/i.test(o.name)) { o.material = o.material.clone(); o.material.color.set(0x0b0d10); o.material.roughness = 0.12; o.material.metalness = 0.9; o.material.map = null; }
    }
  });
  // Fit accent bands to the mesh: measure the vertices bound to a bone inside a height range (bone space, cm).
  let body = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && !/visor/i.test(o.name)) body = o; });
  const fitBand = (boneName, y0, y1) => {
    const bi = body.skeleton.bones.findIndex((b) => b.name === get(boneName).name);
    const inv = body.skeleton.boneInverses[bi], P = body.geometry.attributes.position, SI = body.geometry.attributes.skinIndex, SW = body.geometry.attributes.skinWeight;
    const v = new THREE.Vector3(); let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, n = 0;
    for (let i = 0; i < P.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (SI.getComponent(i, k) === bi) w += SW.getComponent(i, k);
      if (w < 0.45) continue;
      v.fromBufferAttribute(P, i).applyMatrix4(body.bindMatrix).applyMatrix4(inv);
      if (v.y < y0 || v.y > y1) continue;
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z); n++;
    }
    if (n < 4) return null;
    return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, rx: (maxX - minX) / 2, rz: (maxZ - minZ) / 2, y: (y0 + y1) / 2, h: y1 - y0 };
  };
  const bands = { LeftArm: fitBand('LeftArm', 14, 20), RightArm: fitBand('RightArm', 14, 20), Head: fitBand('Head', 11, 14.5) };
  // Locomotion clips: ground speed each one was authored for (foot speed while planted) and where in the cycle the
  // left foot leads, so walk and run can be blended in step and their cadence matched to the real speed.
  const scale = 1.8 / height, loco = {};
  for (const k of ['Walk', 'Run']) {
    const m = SkeletonUtils.clone(scene), mx = new THREE.AnimationMixer(m), D = clips[k].duration, N = 48;
    mx.clipAction(clips[k]).play();
    const lf = m.getObjectByName(get('LeftFoot').name), rf = m.getObjectByName(get('RightFoot').name), pl = [], pr = [];
    for (let i = 0; i < N; i++) { mx.setTime(i / N * D); m.updateMatrixWorld(true); pl.push(lf.getWorldPosition(new THREE.Vector3())); pr.push(rf.getWorldPosition(new THREE.Vector3())); }
    let lo = 1e9, hi = -1e9, sum = 0, n = 0, re = 0, im = 0;
    for (const q of pl) { lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); }
    for (let i = 0; i < N; i++) {
      if (pl[i].y < lo + 0.18 * (hi - lo)) { sum -= pl[(i + 1) % N].clone().sub(pl[(i + N - 1) % N]).dot(fwd) / (2 * D / N); n++; }
      const d = pl[i].clone().sub(pr[i]).dot(fwd); re += d * Math.cos(i / N * TAU); im += d * Math.sin(i / N * TAU);
    }
    loco[k] = { dur: D, speed: Math.max(0.5, sum / Math.max(1, n) * scale), phase: Math.atan2(im, re) / TAU };
    mx.stopAllAction(); mx.uncacheRoot(m);
  }
  template = { scene, clips, yawFix, hand, bands, scale, loco };
}
export const charactersReady = load().catch((e) => { console.warn('[visuals] soldier model failed to load', e); });

// ---- IK helpers (world space) ---------------------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
const _p = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export function worldQuat(obj, out) { obj.matrixWorld.decompose(_s, out, _v2); return out; }
// Apply a world-space rotation to a bone (its matrixWorld and its parent's must be current).
export function rotateWorld(bone, q, update = true) {
  worldQuat(bone.parent, _pq); worldQuat(bone, _wq);
  bone.quaternion.copy(_pq.invert()).multiply(q).multiply(_wq);
  if (update) bone.updateWorldMatrix(false, true);
}
export function setWorldQuat(bone, q) {
  worldQuat(bone.parent, _pq);
  bone.quaternion.copy(_pq.invert()).multiply(q);
  bone.updateWorldMatrix(false, true);
}
export function solveTwoBone(a, b, c, target, pole) {
  _a.setFromMatrixPosition(a.matrixWorld); _b.setFromMatrixPosition(b.matrixWorld); _c.setFromMatrixPosition(c.matrixWorld);
  const lab = _a.distanceTo(_b), lbc = _b.distanceTo(_c);
  _d.subVectors(target, _a);
  const L = THREE.MathUtils.clamp(_d.length(), Math.abs(lab - lbc) + 1e-3, lab + lbc - 1e-3);
  _d.normalize();
  const cosA = THREE.MathUtils.clamp((lab * lab + L * L - lbc * lbc) / (2 * lab * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, 1, 0).addScaledVector(_d, -_d.y);
  _p.normalize();
  _t.copy(_a).addScaledVector(_d, cosA * lab).addScaledVector(_p, sinA * lab);      // new elbow / knee
  _v1.subVectors(_b, _a).normalize(); _v2.subVectors(_t, _a).normalize();
  rotateWorld(a, _q.setFromUnitVectors(_v1, _v2));
  _b.setFromMatrixPosition(b.matrixWorld); _c.setFromMatrixPosition(c.matrixWorld);
  _t.copy(_a).addScaledVector(_d, L);                                                // reachable target
  _v1.subVectors(_c, _b).normalize(); _v2.subVectors(_t, _b).normalize();
  rotateWorld(b, _q.setFromUnitVectors(_v1, _v2));
}

// Third-person hold per weapon: gun offset relative to the right shoulder pivot (root space, metres) etc.
const HOLD = {
  ar: { off: [-0.035, -0.035, -0.02], two: true },
  smg: { off: [-0.035, -0.04, -0.03], two: true },
  sniper: { off: [-0.035, -0.02, -0.02], two: true },
  shotgun: { off: [-0.035, -0.005, -0.02], two: true },
  pistol: { off: [-0.17, 0.0, -0.5], two: true, pistol: true },
};

let flashGeo = null, bandGeo = null, glintTex = null;

// Scope glint: a small sun reflection on the front lens of a scoped sniper rifle, so a camping sniper can be spotted.
// Directional like Fortnite's: driven by the angle between the sniper's networked aim (yaw + pitch, not the
// third-person rifle pose) and the direction from the lens to the viewer: full within GLINT_FULL of the aim line,
// gone by GLINT_ZERO, nothing from the side or behind. Fades in/out with the scope (aim.k), keeps a small, roughly
// constant screen size out to long range and never shows through walls. Never drawn for its own player (the local
// player has no third-person body; the scoped kill cam hides the killer's).
function glintTexture() {
  if (glintTex) return glintTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), h = S / 2;
  const g = x.createRadialGradient(h, h, 0, h, h, h);
  // the bright core must stay several texels wide: at range the sprite is only ~20 px and mipmaps average a pin-prick away
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.16, 'rgba(255,250,232,0.95)'); g.addColorStop(0.32, 'rgba(255,236,190,0.4)');
  g.addColorStop(0.6, 'rgba(255,226,170,0.08)'); g.addColorStop(1, 'rgba(255,220,160,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  // thin four-point star rays
  x.globalCompositeOperation = 'lighter';
  for (const [ang, w, l, a] of [[0, 5, h, 0.6], [Math.PI / 2, 5, h, 0.6], [Math.PI / 4, 3, h * 0.55, 0.3], [-Math.PI / 4, 3, h * 0.55, 0.3]]) {
    x.save(); x.translate(h, h); x.rotate(ang);
    const r = x.createLinearGradient(-l, 0, l, 0);
    r.addColorStop(0, 'rgba(255,240,210,0)'); r.addColorStop(0.5, `rgba(255,248,230,${a})`); r.addColorStop(1, 'rgba(255,240,210,0)');
    x.fillStyle = r; x.fillRect(-l, -w / 2, l * 2, w);
    x.restore();
  }
  glintTex = new THREE.CanvasTexture(c);
  glintTex.colorSpace = THREE.SRGBColorSpace;
  return glintTex;
}

const _gl = new THREE.Vector3(), _gc = new THREE.Vector3();
const GLINT_FULL = Math.cos(10 * Math.PI / 180), GLINT_ZERO = Math.cos(24 * Math.PI / 180);
// aim: { dir (world unit vector the sniper is aiming along), k (0..1 scope fade) }, kept up to date by update()
function makeScopeGlint(gun, aim) {
  const mat = new THREE.SpriteMaterial({ map: glintTexture(), color: 0xfff1d6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const sp = new THREE.Sprite(mat);
  sp.position.copy(gun.anchors.lens).add(_v1.set(0, 0, 0.03));
  sp.renderOrder = 12; sp.visible = false;
  const lens = gun.anchors.lens, seed = Math.random() * 10;
  sp.onBeforeRender = (r, s, cam) => {
    gun.root.localToWorld(_gl.copy(lens));
    _gc.setFromMatrixPosition(cam.matrixWorld).sub(_gl);
    const d = _gc.length(); _gc.divideScalar(Math.max(d, 1e-4));
    const facing = seg(aim.dir.dot(_gc), GLINT_ZERO, GLINT_FULL);    // only when the sniper is aiming (nearly) at this camera
    const t = performance.now() / 1000 + seed;
    mat.opacity = aim.k * facing * (0.7 + 0.12 * Math.sin(t * 2.3) + 0.06 * Math.sin(t * 7.1)) * seg(d, 3, 9);   // not in your face up close
    mat.rotation = t * 0.15;
    // ~1.6 deg across (a small star with a few pixels of bright core) at any range out to ~200 m
    const size = THREE.MathUtils.clamp(d * 0.028, 0.3, 5.6) * (0.9 + 0.1 * Math.sin(t * 3.7));
    // Drawn a little toward the viewer so the rifle's own barrel / muzzle (and depth precision at range) can't swallow
    // it, while anything really in between (walls, cover) still hides it. Set on matrixWorld: it is read right after this.
    _gl.addScaledVector(_gc, Math.min(Math.max(0.7, d * 0.012), d * 0.5));
    sp.matrixWorld.makeScale(size, size, size).setPosition(_gl);
  };
  gun.root.add(sp);
  return sp;
}

export function createCharacter({ color = 0xcc3333, name = '', look = null } = {}) {
  let lookId = look;
  const root = new THREE.Group(); root.name = 'character';
  const pivot = new THREE.Group(); root.add(pivot);                 // death fall rotates this about the feet
  const weaponPivot = new THREE.Group(); pivot.add(weaponPivot);
  const gunSlot = new THREE.Group(); weaponPivot.add(gunSlot);

  // name tag
  const tagTex = T.nameTagTexture(name, color);
  const tagMat = new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const tagSprite = new THREE.Sprite(tagMat);
  tagSprite.scale.set(0.84, 0.21, 1); tagSprite.renderOrder = 20;
  tagSprite.onBeforeRender = (r, s, cam) => {
    const d = _v1.setFromMatrixPosition(tagSprite.matrixWorld).distanceTo(_v2.setFromMatrixPosition(cam.matrixWorld));
    tagMat.opacity = 1 - seg(d, 45, 80);
    const k = THREE.MathUtils.clamp(d / 9, 1, 4.5);                 // keep it legible at range
    tagSprite.scale.set(0.84 * k, 0.21 * k, 1);
  };
  const tag = new THREE.Group(); tag.position.y = 2.08; tag.add(tagSprite);       // die()/reset()/finishers toggle this group
  // Viewer-relative relation (setRelation): allies get a green chevron + name that also shows, dimmed, through walls
  // (one depth-tested sprite at full strength + one without depth test at low opacity), and a green fresnel rim.
  const rim = new THREE.Vector4(0.12, 1.0, 0.38, 0);                 // rgb + strength, shared by this character's materials
  let relation = null, tagShown = true, allyTex = null, allyFront = null, allyGhost = null;
  const ALLY = 0x22e05a, ENEMY_ACCENT = 0x56595c;
  const accentColor = () => (relation === 'ally' ? ALLY : relation === 'enemy' ? ENEMY_ACCENT : color);
  function refreshRelation() {
    const ally = relation === 'ally';
    rim.w = ally ? 1.25 : 0;
    tagSprite.visible = relation !== 'ally' && relation !== 'enemy' && tagShown;     // enemies: no tag at all
    if (ally && !allyFront) {
      allyTex = T.allyTagTexture(name);
      const mk = (depthTest, opacity, order) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: allyTex, transparent: true, opacity, depthTest, depthWrite: false, toneMapped: false, fog: false })); sp.center.set(0.5, 0.28); sp.renderOrder = order; tag.add(sp); return sp; };
      allyGhost = mk(false, 0.42, 998); allyFront = mk(true, 1, 999);
      allyFront.onBeforeRender = (r, s, cam) => {
        const d = _v1.setFromMatrixPosition(allyFront.matrixWorld).distanceTo(_v2.setFromMatrixPosition(cam.matrixWorld));
        const k = THREE.MathUtils.clamp(d / 8, 1, 9);                // constant-ish screen size out to ~70 m
        allyFront.scale.set(0.9 * k, 0.394 * k, 1); allyGhost.scale.copy(allyFront.scale);
      };
      allyFront.scale.set(0.9, 0.394, 1); allyGhost.scale.copy(allyFront.scale);
    }
    if (allyFront) allyFront.visible = allyGhost.visible = ally && tagShown;
  }
  root.add(tag);

  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, emissive: color, emissiveIntensity: 0.22, side: THREE.DoubleSide });

  // third-person muzzle flash
  flashGeo ??= new THREE.PlaneGeometry(1, 1);
  const flashMat = new THREE.MeshBasicMaterial({ map: T.flashFront(0), color: new THREE.Color(3, 2.5, 1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const flash = new THREE.Group(); flash.visible = false;
  const f1 = new THREE.Mesh(flashGeo, flashMat), f2 = new THREE.Mesh(flashGeo, flashMat), f3 = new THREE.Mesh(flashGeo, flashMat);
  f2.rotation.y = Math.PI / 2; f3.rotation.x = Math.PI / 2;
  flash.add(f1, f2, f3); gunSlot.add(flash);
  let flashT = 0;

  // speed: horizontal m/s (legacy callers; assumed forward). vx/vy/vz: world velocity. ads: 0..1 aim-down-sights.
  // mode: 0 normal, 1 slide, 2 ladder, 3 mantle, 4 dash. grapple: world-space anchor (Vector3) while reeling, else null.
  const st = { speed: 0, vx: null, vy: 0, vz: 0, crouching: false, aimPitch: 0, weaponId: 'ar', grounded: true, sprinting: false, ads: 0, mode: 0, grapple: null };
  const guns = {};
  let gun = null, gunId = null;
  // Death: the weapon leaves the hands and drops to the ground on its own (root space: y = 0 is the ground at the feet)
  const drop = { on: false, g: new THREE.Group(), v: new THREE.Vector3(), w: new THREE.Vector3(), rest: false, home: null, c: new THREE.Vector3() };
  root.add(drop.g);
  function setGun(id) {
    if (!HOLD[id]) id = 'ar';
    if (id === gunId || drop.on) return;
    if (gun) gun.root.visible = false;
    if (!guns[id]) {
      guns[id] = buildGun(id);
      guns[id].root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
      gunSlot.add(guns[id].root);
    }
    gun = guns[id]; gunId = id; gun.root.visible = true;
    flash.position.copy(gun.anchors.muzzle).add(_v1.set(0, 0, -0.06));
    if (gun.anchors.lens && !glint) glint = makeScopeGlint(gun, glintAim);
  }
  let glint = null;
  const glintAim = { dir: new THREE.Vector3(0, 0, -1), k: 0 };
  setGun('ar');

  // rig (filled in when the model has loaded)
  let rig = null, mixer = null, actions = null;
  let controlled = false;                                           // true while finishers.js puppets this character
  let crouchT = 0, lowT = 0, pitch = 0, dead = false, deathT = 0, deathRoll = 0, airT = 0;
  // death fall: direction in root space (unit, horizontal), how far over the body can go (walls), forwardness 0..1
  const fallDir = new THREE.Vector3(0, 0, 1), fallAxis = new THREE.Vector3(1, 0, 0);
  let fallMax = Math.PI / 2, fallFwd = 0, fallSide = 1;
  let wWalk = 0, wRun = 0, phase = Math.random(), clock = Math.random() * 10;
  // motion state (see update): local velocity and its smoothed copy (lean), leg heading, mode blends, one-shot bursts
  let lf = 0, lr = 0, hs = 0, vyS = 0, svf = 0, svr = 0, prevYaw = null, yawRate = 0, leanF = 0, leanR = 0, flightF = 0, flightR = 0;
  let legOff = 0, rev = false, turning = false, turnK = 0, locoK = 1;
  let adsT = 0, slideT = 0, ladderT = 0, mantleT = 0, mantlePh = 0, grapT = 0, dashK = 0, fireHold = 0, kick = 0;
  let wasAir = false, prevVy = 0, fallV = 0, land = 0, landS = 0, boostT = 0, tuckT = 0, hadGrapple = false, flinchT = 0;
  const flinchAxis = new THREE.Vector3(1, 0, 0), grapDir = new THREE.Vector3(0, 1, 0), pivotW = new THREE.Vector3(), hipW = new THREE.Vector3();
  const qSp = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), tgL = new THREE.Vector3(), tgR = new THREE.Vector3();
  const qBack = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.35));
  let act = null, actT = 0, actDur = 0.5, nade = null;        // 'melee' | 'nade' third-person actions
  const fwdW = new THREE.Vector3(), rightW = new THREE.Vector3(), upW = new THREE.Vector3(0, 1, 0), rootQ = new THREE.Quaternion();
  const footL = new THREE.Vector3(), footR = new THREE.Vector3(), footLQ = new THREE.Quaternion(), footRQ = new THREE.Quaternion();
  const gx = new THREE.Vector3(), gy = new THREE.Vector3(), gz = new THREE.Vector3(), tgt = new THREE.Vector3(), pole = new THREE.Vector3(), fDir = new THREE.Vector3(), pDir = new THREE.Vector3(), gq = new THREE.Quaternion();

  charactersReady.then(() => {
    if (!template || root.userData.disposed) return;
    const model = SkeletonUtils.clone(template.scene);
    model.rotation.y = template.yawFix;
    model.scale.setScalar(template.scale);
    pivot.add(model);
    // per-character copies of the base materials so the ally rim can be switched without touching other players
    model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.material = o.material.clone();
      o.material.onBeforeCompile = (sh) => { sh.uniforms.uLkRim = { value: rim }; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uLkRim;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + RIM_GLSL); };
      o.material.customProgramCacheKey = () => 'charRim1';
    });
    if (lookId) applyLook(model, lookId, { teamColor: accentColor(), rim });
    const g = (n) => model.getObjectByName(B(n)) || model.getObjectByName('mixamorig' + n);
    rig = { model, hips: g('Hips'), spine: [g('Spine'), g('Spine1'), g('Spine2')], neck: g('Neck'), head: g('Head') };
    for (const s of ['Left', 'Right']) {
      rig[s] = { shoulder: g(s + 'Shoulder'), arm: g(s + 'Arm'), fore: g(s + 'ForeArm'), hand: g(s + 'Hand'), up: g(s + 'UpLeg'), leg: g(s + 'Leg'), foot: g(s + 'Foot'), fingers: [] };
      for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) for (let i = 1; i <= 3; i++) {
        const b = g(`${s}Hand${f}${i}`);
        if (!b) continue;
        // closed grip (set once: finger tracks were stripped from the clips)
        const ang = f === 'Thumb' ? 0.25 : s === 'Right' && f === 'Index' ? [0.35, 0.6, 0.3][i - 1] : [0.95, 1.2, 0.8][i - 1];
        b.quaternion.multiply(_q.setFromAxisAngle(template.hand[s].curlAxis, ang));
      }
    }
    // accent: arm bands + helmet band, fitted to the mesh (bone space is centimetres)
    bandGeo ??= new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    for (const [bone, key] of [[rig.Left.arm, 'LeftArm'], [rig.Right.arm, 'RightArm'], [rig.head, 'Head']]) {
      const f = template.bands[key];
      if (!f) continue;
      const band = new THREE.Mesh(bandGeo, accent);
      band.position.set(f.cx, f.y, f.cz); band.scale.set(f.rx * 1.035 + 0.15, f.h, f.rz * 1.035 + 0.15);
      band.castShadow = true;
      bone.add(band);
    }
    // grenade prop in the left hand (bone space is centimetres)
    nade = buildGrenadeModel();
    nade.group.scale.setScalar(100); nade.group.visible = false;
    nade.group.position.copy(template.hand.Left.fL).multiplyScalar(8.5).addScaledVector(template.hand.Left.pL, 3.5);
    rig.Left.hand.add(nade.group);
    // Bones the procedural layer overrides. The mixer only writes a property when its animated value changes, so the
    // animated pose is saved after each mixer update and restored before the next one (no accumulation).
    rig.mod = [rig.hips, ...rig.spine, rig.neck, rig.head];
    for (const s of ['Left', 'Right']) rig.mod.push(rig[s].arm, rig[s].fore, rig[s].hand, rig[s].up, rig[s].leg, rig[s].foot);
    rig.rest = rig.mod.map((b) => b.quaternion.clone());            // bind (T) pose, used by finishers.js as the IK base
    rig.hipsRest = rig.hips.position.clone();
    rig.saved = rig.mod.map((b) => b.quaternion.clone());
    rig.hipsPos = rig.hips.position.clone();
    mixer = new THREE.AnimationMixer(model);
    actions = { idle: mixer.clipAction(template.clips.Idle), walk: mixer.clipAction(template.clips.Walk), run: mixer.clipAction(template.clips.Run) };
    for (const k in actions) { actions[k].play(); actions[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
    actions.walk.timeScale = actions.run.timeScale = 0;             // walk / run are scrubbed by `phase` (see update)
    actions.idle.time = Math.random() * 3;
  });

  function handFrame(side, fingers, palm, out) {
    // world quaternion that points the hand's finger axis along `fingers` with the palm facing `palm`
    _v1.copy(palm).addScaledVector(fingers, -palm.dot(fingers)).normalize();
    _m.makeBasis(fingers, _v1, _v2.crossVectors(fingers, _v1));
    return out.setFromRotationMatrix(_m).multiply(template.hand[side].frameInv);
  }
  // point given in body space (x right, y up, z forward, metres from the feet) -> world
  const body = (out, x, y, z, k) => out.copy(pivotW).addScaledVector(rightW, x * k).addScaledVector(upW, y * k).addScaledVector(fwdW, z * k);

  function procedural(dt) {
    const { hips, spine } = rig, Lf = rig.Left, Rt = rig.Right;
    worldQuat(pivot, _q2);
    fwdW.set(0, 0, -1).applyQuaternion(_q2); rightW.set(1, 0, 0).applyQuaternion(_q2); upW.set(0, 1, 0).applyQuaternion(_q2);
    const scale = _s.setFromMatrixScale(root.matrixWorld).y;
    pivotW.setFromMatrixPosition(pivot.matrixWorld);

    // --- lower body: turn the hips toward the travel direction, drop them (crouch / slide / landing / death buckle)
    // and place the feet: planted where the clip put them, or blended to an airborne / slide / ladder / grapple pose.
    // death: knees buckle first, then the legs stretch out as the body lies down (or stay folded, slumped against a wall)
    const lieK = dead ? seg(deathT, 0.35, 0.85) : 0, slump = dead ? sat((1.25 - fallMax) / 0.9) : 0;
    const dk = dead ? seg(deathT, 0, 0.3) * (0.4 + 0.2 * slump) - lieK * 0.38 * (1 - slump) : 0;
    let drop = (Math.max(crouchT * 0.5 * (1 - slideT), slideT * 0.6) + dk + landS * 0.3) * scale;
    const air = dead ? 0 : airT * (1 - grapT) * (1 - ladderT) * (1 - mantleT) * (1 - slideT);
    const poseW = dead ? 0 : sat(air + slideT + ladderT + grapT + mantleT);
    const yawOn = Math.abs(legOff) > 2e-3;
    // terrain: plant each foot on the slope under it (the hips sink so the downhill leg reaches)
    // (only when the feet are on the terrain itself: not on a roof, bridge, stairs or floor built over it)
    let ikW = 0, rootY = 0;
    if (groundSampler && !dead && poseW < 0.999) {
      _v1.setFromMatrixPosition(root.matrixWorld); rootY = _v1.y;
      ikW = (1 - poseW) * (1 - seg(Math.abs(groundSampler(_v1.x, _v1.z) - rootY), 0.1, 0.2));
    }
    hipW.setFromMatrixPosition(hips.matrixWorld);
    if (drop > 1e-4 || poseW > 1e-3 || yawOn || ikW > 1e-3 || lieK > 1e-3) {
      qYaw.setFromAxisAngle(upW, legOff);
      footL.setFromMatrixPosition(Lf.foot.matrixWorld).sub(hipW).applyQuaternion(qYaw).add(hipW);
      footR.setFromMatrixPosition(Rt.foot.matrixWorld).sub(hipW).applyQuaternion(qYaw).add(hipW);
      worldQuat(Lf.foot, footLQ).premultiply(qYaw); worldQuat(Rt.foot, footRQ).premultiply(qYaw);
      if (ikW > 1e-3) {
        const oL = clamp(groundSampler(footL.x, footL.z) - rootY, -0.25, 0.25) * ikW, oR = clamp(groundSampler(footR.x, footR.z) - rootY, -0.25, 0.25) * ikW;
        footL.y += oL; footR.y += oR; drop += Math.max(0, -Math.min(oL, oR));
      }
      if (yawOn) rotateWorld(hips, qYaw, false);
      hipW.addScaledVector(upW, -drop).addScaledVector(fwdW, -(crouchT * 0.06 * (1 - slideT) + slideT * 0.14 - ladderT * 0.06) * scale);
      hips.position.copy(hips.parent.worldToLocal(_v1.copy(hipW)));
      hips.updateWorldMatrix(false, true);
      if (lieK > 1e-3) {
        // lying: legs stretch out along the body, one knee a little bent (foot lifted behind when face down)
        const w = lieK * (1 - slump), hy = _v1.subVectors(hipW, pivotW).dot(upW) / scale;
        // (z toward the ground: the pivot is lifted by the torso's thickness, the heels rest lower)
        const spread = 1 - 0.6 * Math.abs(fallDir.x);               // on the side the legs lie stacked, not splayed up
        footL.lerp(body(tgL, -0.15 * fallSide * spread, Math.max(0.02, hy - 0.88), -0.08 + 0.16 * fallFwd, scale), w);
        footR.lerp(body(tgR, 0.19 * fallSide * spread, Math.max(0.16, hy - 0.7), -0.05 - 0.1 * fallFwd, scale), w);
      }
      if (drop > 1e-4 || poseW > 1e-3 || ikW > 1e-3 || lieK > 1e-3) {
        if (poseW > 1e-3) {
          const hy = _v1.subVectors(hipW, pivotW).dot(upW) / scale, inv = 1 / Math.max(1e-3, air + slideT + ladderT + grapT + mantleT);
          const rise = seg(vyS, -5, 5), tuck = Math.max(boostT, tuckT, (1 - sat(Math.abs(vyS) / 6)) * 0.45), kick2 = boostT * (1 - boostT) * 4;
          const sl = Math.sin(st._ladY * (TAU / 0.6)), mp = Math.sin(Math.PI * sat(mantlePh));
          let w = air * inv;                                         // airborne: lead knee up while rising, legs reaching down while falling
          let lx = -0.1 * w, ly = (hy - (0.84 - 0.36 * rise - 0.2 * tuck + 0.06 * kick2)) * w, lz = (0.1 + 0.26 * rise + 0.1 * tuck) * w;
          let rx = 0.12 * w, ry = (hy - (0.8 - 0.1 * rise - 0.32 * tuck)) * w, rz = (-0.08 - 0.3 * rise + 0.2 * tuck) * w;
          w = slideT * inv;                                          // slide: lead leg out in front, trailing knee up
          lx += -0.12 * w; ly += 0.1 * w; lz += 0.62 * w; rx += 0.2 * w; ry += 0.07 * w; rz += 0.1 * w;
          w = ladderT * inv;                                         // ladder: alternate rungs with the climb height
          lx += -0.15 * w; ly += (0.22 + 0.14 * sl) * w; lz += 0.3 * w; rx += 0.15 * w; ry += (0.22 - 0.14 * sl) * w; rz += 0.3 * w;
          w = grapT * inv;                                           // grapple: legs hang and trail behind the pull, swinging a little
          const gs = Math.sin(clock * 4.3) * 0.07;
          lx += -0.1 * w; ly += (hy - 0.83) * w; lz += (-0.3 + gs) * w; rx += 0.13 * w; ry += (hy - 0.64) * w; rz += (-0.16 - gs) * w;
          w = mantleT * inv;                                         // mantle: one knee swings up onto the ledge
          lx += -0.12 * w; ly += (hy - 0.82) * w; lz += -0.1 * w; rx += 0.14 * w; ry += (hy - 0.82 + 0.5 * mp) * w; rz += (0.1 + 0.25 * mp) * w;
          footL.lerp(body(tgL, lx, ly, lz, scale), poseW); footR.lerp(body(tgR, rx, ry, rz, scale), poseW);
        }
        const kneeUp = 0.2 + slideT * 0.9;
        pole.copy(fwdW).addScaledVector(rightW, -0.18).addScaledVector(upW, kneeUp);
        solveTwoBone(Lf.up, Lf.leg, Lf.foot, footL, pole);
        pole.copy(fwdW).addScaledVector(rightW, 0.18 + slideT * 0.5).addScaledVector(upW, kneeUp);
        solveTwoBone(Rt.up, Rt.leg, Rt.foot, footR, pole);
        if (poseW < 0.999) {                                        // planted feet keep the clip's foot roll; posed feet follow the shin
          if (poseW > 1e-3) { setWorldQuat(Lf.foot, worldQuat(Lf.foot, _q).slerp(footLQ, 1 - poseW)); setWorldQuat(Rt.foot, worldQuat(Rt.foot, _q).slerp(footRQ, 1 - poseW)); }
          else { setWorldQuat(Lf.foot, footLQ); setWorldQuat(Rt.foot, footRQ); }
        }
      }
    }

    if (dead) {
      // limp: the chest arches back (or curls when falling forward), the head lolls (turned aside when face down),
      // the arms trail the fall and then splay out on the ground
      const k = seg(deathT, 0.05, 0.6), lie = seg(deathT, 0.55, 0.95), fl = seg(deathT, 0.08, 0.4) * (1 - seg(deathT, 0.55, 0.9));
      _q.setFromAxisAngle(rightW, (-0.12 + 0.3 * fallFwd) * k).premultiply(_q2.setFromAxisAngle(upW, -legOff / 3)); for (const sp of spine) rotateWorld(sp, _q);
      _q.setFromAxisAngle(rightW, (-0.25 + 0.4 * fallFwd) * k).multiply(_q2.setFromAxisAngle(fwdW, deathRoll * 0.5 * k));
      rotateWorld(rig.head, _q.premultiply(_q2.setFromAxisAngle(upW, fallFwd * fallSide * 1.0 * lie)));
      const sw = fl * (0.7 - 1.4 * fallFwd);
      rotateWorld(Lf.arm, _q.setFromAxisAngle(fwdW, (0.8 + 0.3 * fl) * k).premultiply(_q2.setFromAxisAngle(rightW, sw)));
      rotateWorld(Rt.arm, _q.setFromAxisAngle(fwdW, -(0.8 + 0.3 * fl) * k).premultiply(_q2.setFromAxisAngle(rightW, sw * 0.8)));
      if (lie > 1e-3) {
        // on the ground the arms flop down onto it (no arm left pointing at the sky after a fall onto the side)
        for (const S of [Lf, Rt]) for (const [bn, en] of [[S.arm, S.fore], [S.fore, S.hand]]) {
          _a.setFromMatrixPosition(bn.matrixWorld); _v1.setFromMatrixPosition(en.matrixWorld).sub(_a).normalize();
          _v2.set(_v1.x, 0, _v1.z);
          if (_v2.lengthSq() < 0.1) _v2.set(upW.x, 0, upW.z);
          _v2.normalize(); _v2.y = -0.3; _v2.normalize();
          rotateWorld(bn, _q.setFromUnitVectors(_v1, _v2.lerp(_v1, 1 - lie).normalize()));
        }
      }
      return;
    }

    // --- melee butt-stroke / grenade throw: torso twist
    let mW = 0, mS = 0, gW = 0, gT = 0, gBlend = 0, ap = 0, tw = 0, bend = 0;
    if (act) {
      ap = actT / actDur;
      if (act === 'melee') { mW = seg(ap, 0, 0.22) * (1 - seg(ap, 0.22, 0.4)); mS = seg(ap, 0.2, 0.42) - seg(ap, 0.6, 1); }
      else { gW = seg(ap, 0.1, 0.38) * (1 - seg(ap, 0.4, 0.55)); gT = seg(ap, 0.4, 0.56) - seg(ap, 0.7, 1); gBlend = seg(ap, 0, 0.18) - seg(ap, 0.78, 1); }
      tw = (mW * 0.35 - mS * 0.5 - gW * 0.4 + gT * 0.45) / 3;
      bend = (mS * 0.25 + gT * 0.3 - gW * 0.15) / 3;
    }

    // --- spine (one combined rotation per bone): keep the chest on the aim while the hips face the travel direction,
    // aim pitch (less the body's own lean), stance leans, breathing, stride counter-twist, hit flinch
    const aim = pitch + flightF + leanF;                            // pitch the gun needs relative to the (leaning) body
    const breath = Math.sin(clock * 1.9) * 0.011 * (1 + lowT);
    const stride = Math.sin(phase * TAU) * locoK * (wWalk * 0.03 + wRun * (0.05 + lowT * 0.05));
    const lean = crouchT * -0.3 * (1 - slideT) + lowT * -0.14 + slideT * 0.3 + adsT * -0.05 + mantleT * -0.3 + grapT * 0.12 + landS * -0.22 + boostT * 0.12 + tuckT * -0.25 + ladderT * 0.06;
    qSp.setFromAxisAngle(rightW, (aim * 0.72 + lean) / 3 + breath - bend);
    qSp.premultiply(_q.setFromAxisAngle(upW, -legOff / 3 + tw + stride));
    if (flinchT > 1e-3) qSp.premultiply(_q.setFromAxisAngle(flinchAxis, flinchT * 0.13));
    for (const sp of spine) rotateWorld(sp, qSp, false);
    spine[0].updateWorldMatrix(false, true);
    // head: level out the leans, look along the aim, cheek to the stock when aiming, snap back with a hit
    _q.setFromAxisAngle(rightW, aim * 0.2 - lean * 0.8 - breath * 2 + ladderT * 0.3);
    if (adsT > 1e-3) _q.premultiply(_q2.setFromAxisAngle(fwdW, adsT * 0.16)).premultiply(_q2.setFromAxisAngle(rightW, adsT * -0.1));
    if (flinchT > 1e-3) _q.premultiply(_q2.setFromAxisAngle(flinchAxis, flinchT * 0.3));
    rotateWorld(rig.neck, _q);

    // --- weapon pivot at the right shoulder, pitched with the aim: relaxed hip-ready hold, tucked in and raised to
    // the eye when aiming (or just after firing), across the chest when sprinting, on the back on a ladder
    const hold = HOLD[gunId];
    _v1.setFromMatrixPosition(Rt.arm.matrixWorld);
    pivot.worldToLocal(_v1);
    weaponPivot.position.copy(_v1);
    const low = Math.max(lowT, mantleT * 0.8) * (hold.pistol ? 0.6 : 1);
    const up = Math.max(adsT, sat(fireHold / 0.25) * 0.55) * (1 - low);    // 0 = ready, 1 = sights up
    const rdy = (1 - up) * (1 - low);
    const bob = Math.sin(phase * TAU * 2) * locoK * (wWalk * 0.006 + wRun * 0.013) * (1 - adsT * 0.6), sway = Math.sin(phase * TAU) * locoK;
    weaponPivot.rotation.set(aim * (1 - low) - low * 0.65 - rdy * 0.07 + kick * 0.035 + Math.sin(clock * 1.9 - 0.6) * 0.006, low * (0.75 + sway * 0.1) + sway * wRun * 0.025 * (1 - up), low * 0.25 + rdy * 0.1 + grapT * 0.22 + flightR * 0.8, 'YXZ');
    gunSlot.position.set(hold.off[0] + rdy * 0.012 - up * 0.022, hold.off[1] - rdy * 0.04 + up * 0.035 + bob, hold.off[2] + kick * 0.03 + up * 0.015 + grapT * 0.06).sub(gun.anchors.butt);
    if (hold.pistol) gunSlot.position.z += low * 0.22;
    if (act === 'melee') {
      // butt-stroke: cock the weapon back, then drive the stock forward across the body as the muzzle swings away
      weaponPivot.rotation.y += -0.35 * mW + 1.25 * mS; weaponPivot.rotation.x += 0.25 * mW + 0.15 * mS; weaponPivot.rotation.z += -0.5 * mS;
      gunSlot.position.z += 0.12 * mW - 0.3 * mS; gunSlot.position.x += -0.12 * mS; gunSlot.position.y += 0.06 * mS;
    } else if (act === 'nade') {
      weaponPivot.rotation.x -= 0.45 * gBlend; weaponPivot.rotation.y += 0.35 * gBlend;
    }
    if (ladderT > 1e-3) {
      _v1.setFromMatrixPosition(spine[2].matrixWorld).addScaledVector(rightW, 0.13 * scale).addScaledVector(upW, -0.3 * scale).addScaledVector(fwdW, -0.15 * scale);
      weaponPivot.position.lerp(pivot.worldToLocal(_v1), ladderT);
      weaponPivot.quaternion.slerp(qBack, ladderT);
    }
    weaponPivot.updateWorldMatrix(false, true);
    worldQuat(gun.root, gq);
    gx.set(1, 0, 0).applyQuaternion(gq); gy.set(0, 1, 0).applyQuaternion(gq); gz.set(0, 0, 1).applyQuaternion(gq);
    const ls = Math.sin(st._ladY * (TAU / 0.6));

    // right hand on the grip: fingers forward, palm facing gun-left
    fDir.copy(gz).multiplyScalar(-0.9).addScaledVector(gy, 0.3).addScaledVector(gx, -0.25).normalize(); pDir.copy(gx).negate();
    tgt.copy(gun.anchors.gripR); gun.root.localToWorld(tgt);
    tgt.addScaledVector(fDir, -0.075 * scale).addScaledVector(gx, 0.03 * scale);
    if (ladderT > 1e-3) {                                             // both hands on the rungs
      tgt.lerp(body(_b, 0.2, 1.46 + 0.16 * ls, 0.4, scale), ladderT);
      fDir.lerp(_c.copy(fwdW).addScaledVector(upW, 0.5), ladderT).normalize(); pDir.lerp(_c.copy(upW).negate(), ladderT).normalize();
    }
    pole.copy(rightW).multiplyScalar(0.7 - adsT * 0.25).addScaledVector(upW, -1);
    solveTwoBone(Rt.arm, Rt.fore, Rt.hand, tgt, pole);
    setWorldQuat(Rt.hand, handFrame('Right', fDir, pDir, _q));

    // left hand: under the handguard (palm up) or wrapped over the right hand for the pistol
    if (hold.pistol) { fDir.copy(gz).multiplyScalar(-0.75).addScaledVector(gx, 0.5).addScaledVector(gy, 0.25).normalize(); pDir.copy(gx); }
    else { fDir.copy(gx).multiplyScalar(0.75).addScaledVector(gz, -0.5).addScaledVector(gy, 0.35).normalize(); pDir.copy(gy); }
    tgt.copy(gun.anchors.gripL); gun.root.localToWorld(tgt);
    tgt.addScaledVector(fDir, -0.08 * scale).addScaledVector(pDir, -0.025 * scale);
    pole.copy(rightW).multiplyScalar(-0.6).addScaledVector(upW, -1);
    if (act === 'nade') {
      // overhand throw with the left arm: cocked behind the head, whipped forward, follow-through
      _a.setFromMatrixPosition(Lf.arm.matrixWorld);
      const back = gW, fwd = seg(ap, 0.4, 0.58), down = seg(ap, 0.58, 0.8);
      _b.copy(_a).addScaledVector(rightW, (-0.12 - 0.1 * back + 0.12 * fwd) * scale)
        .addScaledVector(upW, (0.12 + 0.3 * back + 0.28 * fwd * (1 - down) - 0.3 * down) * scale)
        .addScaledVector(fwdW, (0.2 - 0.38 * back + 0.42 * fwd) * scale);
      tgt.lerp(_b, gBlend);
      fDir.lerp(_c.copy(upW).multiplyScalar(1 - fwd).addScaledVector(fwdW, 0.3 + fwd).addScaledVector(upW, -down), gBlend).normalize();
      pDir.lerp(_c.copy(fwdW).addScaledVector(upW, -fwd * 0.6), gBlend).normalize();
      nade.group.visible = ap > 0.12 && ap < 0.55;
    } else if (grapT > 1e-3) {
      // grapple: the left arm reaches up the cable (the cable mesh starts at handWorldPosition)
      _a.setFromMatrixPosition(Lf.arm.matrixWorld);
      tgt.lerp(_b.copy(_a).addScaledVector(grapDir, 0.6 * scale), grapT);
      fDir.lerp(grapDir, grapT).normalize(); pDir.lerp(_c.copy(upW).negate().addScaledVector(rightW, 0.4), grapT).normalize();
      pole.lerp(_c.copy(rightW).multiplyScalar(-1).addScaledVector(upW, -0.4), grapT);
    } else if (ladderT > 1e-3) {
      tgt.lerp(body(_b, -0.2, 1.46 - 0.16 * ls, 0.4, scale), ladderT);
      fDir.lerp(_c.copy(fwdW).addScaledVector(upW, 0.5), ladderT).normalize(); pDir.lerp(_c.copy(upW).negate(), ladderT).normalize();
    } else if (mantleT > 1e-3) {
      // mantle: left hand plants on the ledge and pushes down as the body comes up
      tgt.lerp(body(_b, -0.22, 1.42 - 0.75 * sat(mantlePh), 0.42, scale), mantleT);
      fDir.lerp(fwdW, mantleT).normalize(); pDir.lerp(_c.copy(upW).negate(), mantleT).normalize();
    }
    solveTwoBone(Lf.arm, Lf.fore, Lf.hand, tgt, pole);
    setWorldQuat(Lf.hand, handFrame('Left', fDir, pDir, _q));
  }

  // Internal hook for finishers.js (cinematic melee kills): direct access to the rig while `controlled` is on.
  const puppet = {
    get rig() { return rig; }, get template() { return template; }, root, pivot, gunSlot, tag,
    get gunId() { return gunId; },
    cleanup: null,                                                  // finishers.js: removes its props (dropped weapon) on reset()/dispose()
    setControlled(on) {
      controlled = !!on;
      if (!controlled) { pivot.position.set(0, 0, 0); pivot.rotation.set(0, 0, 0); gunSlot.visible = true; tag.visible = !dead; act = null; resetMotion(); }
    },
  };
  // ---- dropped weapon (death): tossed out of the hands, tumbles, lands flat on its side ----
  function dropGun() {
    root.updateMatrixWorld(true);
    const g = gun.root;
    drop.home = { p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone() };
    _m.copy(root.matrixWorld).invert().multiply(g.matrixWorld);
    drop.g.add(g);
    _m.decompose(g.position, g.quaternion, g.scale);
    const r = () => Math.random() - 0.5;
    drop.v.set(fallDir.x * 0.8 + r() * 0.8, 0.9 + Math.random() * 0.7, fallDir.z * 0.8 + r() * 0.8);
    drop.w.set(r() * 6, r() * 4, r() * 7);
    drop.c.addVectors(gun.anchors.butt, gun.anchors.muzzle).multiplyScalar(0.5);   // gun-local centre
    drop.on = true; drop.rest = false;
  }
  const _dq = new THREE.Quaternion(), _de = new THREE.Euler(), _dc = new THREE.Vector3(), _dx = new THREE.Vector3(), _dz = new THREE.Vector3(), _dy = new THREE.Vector3();
  const flatQ = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
  function updateDrop(dt) {
    const g = gun.root;
    if (!drop.rest) {
      drop.v.y -= 16 * dt;
      g.position.addScaledVector(drop.v, dt);
      g.quaternion.multiply(_dq.setFromEuler(_de.set(drop.w.x * dt, drop.w.y * dt, drop.w.z * dt)));
      _dc.copy(drop.c).applyQuaternion(g.quaternion).add(g.position);
      if (_dc.y < 0.06 && drop.v.y < 0) {
        // landed: settle flat on whichever side is nearer, keeping the heading
        drop.rest = true; drop.v.y = 0;
        _dz.set(0, 0, 1).applyQuaternion(g.quaternion); _dz.y = 0;
        if (_dz.lengthSq() < 1e-4) _dz.set(0, 0, 1); _dz.normalize();
        _dx.set(0, _dx.set(1, 0, 0).applyQuaternion(g.quaternion).y >= 0 ? 1 : -1, 0);
        _dy.crossVectors(_dz, _dx);
        flatQ.setFromRotationMatrix(_m.makeBasis(_dx, _dy, _dz));
      }
    } else {
      const k = Math.exp(-9 * dt);
      drop.v.x *= k; drop.v.z *= k;
      g.position.x += drop.v.x * dt; g.position.z += drop.v.z * dt;
      g.quaternion.slerp(flatQ, 1 - Math.exp(-14 * dt));
      _dc.copy(drop.c).applyQuaternion(g.quaternion);
      g.position.y = damp(g.position.y, 0.035 - _dc.y, 18, dt);
    }
  }
  function restoreGun() {
    if (!drop.on) return;
    const g = gun.root;
    gunSlot.add(g); g.position.copy(drop.home.p); g.quaternion.copy(drop.home.q); g.scale.copy(drop.home.s);
    drop.on = false;
  }
  function resetMotion() {
    svf = lf; svr = lr; prevYaw = null; yawRate = leanF = leanR = flightF = flightR = 0; legOff = 0; rev = turning = false; turnK = 0;
    slideT = ladderT = mantleT = mantlePh = grapT = dashK = fireHold = kick = 0; airT = 0;
    wasAir = false; prevVy = fallV = land = landS = boostT = tuckT = flinchT = 0; hadGrapple = false;
  }
  return {
    object3D: root,
    _puppet: puppet,
    setState(s) { Object.assign(st, s); if (s.weaponId) setGun(s.weaponId); },
    /** Outfit (see characterLooks.js LOOKS ids); applied now if the model is loaded, else when it loads. */
    setLook(id) { if (id === lookId) return; lookId = id; if (rig?.model) applyLook(rig.model, id, { teamColor: accentColor(), rim }); },
    // Viewer-relative relation: 'ally' (green rim, green chevron + name visible through walls, green outfit accents),
    // 'enemy' (no highlight, no tag or marker at all, neutral grey accents) or 'neutral' / null (team colours + plain tag).
    setRelation(rel) {
      rel = rel === 'ally' || rel === 'enemy' ? rel : rel === 'neutral' ? 'neutral' : null;
      if (rel === relation) return;
      relation = rel; refreshRelation();
      const c = accentColor();
      accent.color.set(c); accent.emissive.set(c); accent.emissiveIntensity = relation === 'enemy' ? 0 : relation === 'ally' ? 0.5 : 0.22;
      if (rig?.model && lookId) applyLook(rig.model, lookId, { teamColor: c, rim });
    },
    get relation() { return relation; },
    // Show/hide the name tag (ally marker or neutral tag). Enemies never show one, so this is a no-op for them.
    setTagVisible(on) { tagShown = !!on; refreshRelation(); },
    // Third-person melee (rifle butt-stroke, ~0.45 s) and overhand frag throw (~0.7 s, grenade leaves the hand at 55 %).
    melee(durationSec = 0.45) { if (!dead) { act = 'melee'; actT = 0; actDur = Math.max(0.2, durationSec); if (nade) nade.group.visible = false; } },
    throwGrenade(durationSec = 0.7) { if (!dead) { act = 'nade'; actT = 0; actDur = Math.max(0.3, durationSec); } },
    /** World position of the left hand (where the grapple cable attaches); valid after update(). */
    handWorldPosition(target) {
      if (!rig) return target.set(-0.25, 1.35, -0.35).applyMatrix4(root.matrixWorld);
      return target.setFromMatrixPosition(rig.Left.hand.matrixWorld).addScaledVector(grapDir, 0.07 * grapT);
    },
    /** Hit reaction: the torso and head snap away along `dir` (world-space travel direction of the bullet). */
    flinch(dir, strength = 1) {
      if (dead) return;
      if (dir) { _v1.set(dir.x, 0, dir.z); if (_v1.lengthSq() > 1e-6) flinchAxis.set(0, 1, 0).cross(_v1.normalize()).normalize(); }
      flinchT = Math.min(1.4, Math.max(flinchT, strength));
    },
    fire() {
      if (dead) return;
      flashT = 0.06; flash.visible = true; fireHold = 0.6; kick = 1;
      flashMat.map = T.flashFront((Math.random() * 4) | 0);
      flash.rotation.z = Math.random() * 6.28;
      flash.scale.setScalar((gunId === 'pistol' ? 0.22 : gunId === 'sniper' || gunId === 'shotgun' ? 0.5 : 0.34) * (0.8 + Math.random() * 0.5));
    },
    /**
     * Death fall. opts.dir: world-space push (away from the killer plus the body's momentum), else backward with a random
     * sideways part. opts.maxAngle: how far over the body can go before it meets a wall (pi/2 = lies flat; less slumps).
     */
    die(opts = {}) {
      if (dead) return;
      dead = true; deathT = 0; deathRoll = (Math.random() - 0.5) * 0.7; tag.visible = false; flash.visible = false;
      const d = opts?.isVector3 ? opts : opts?.dir;
      if (d && d.x * d.x + d.z * d.z > 1e-6) fallDir.set(d.x, 0, d.z).normalize().applyAxisAngle(_up, -root.rotation.y);
      else fallDir.set((Math.random() - 0.5) * 0.8, 0, 1).normalize();
      fallAxis.set(fallDir.z, 0, -fallDir.x);
      fallFwd = sat(-fallDir.z * 1.4); fallSide = fallDir.x >= 0 ? 1 : -1;
      fallMax = clamp(opts?.maxAngle ?? Math.PI / 2, 0.3, Math.PI / 2);
      if (!controlled && rig && gun) dropGun();
    },
    reset() {
      if (puppet.cleanup) { puppet.cleanup(); puppet.cleanup = null; }
      restoreGun();
      controlled = false; gunSlot.visible = true; gunSlot.position.set(0, 0, 0);
      dead = false; deathT = 0; tag.visible = true;
      pivot.rotation.set(0, 0, 0); pivot.position.set(0, 0, 0);
      gunSlot.rotation.set(0, 0, 0);
      resetMotion();
    },
    update(dt) {
      dt = Math.min(dt, 0.1);
      if (flashT > 0) { flashT -= dt; flashMat.opacity = sat(flashT / 0.06); if (flashT <= 0) flash.visible = false; }
      if (act) { actT += dt; if (actT >= actDur || dead) { act = null; if (nade) nade.group.visible = false; } }
      if (drop.on && dt > 0) updateDrop(dt);
      clock += dt;

      // --- motion state from the networked sample: velocity in body space, mode blends, one-shot bursts
      const yaw = root.rotation.y, sy = Math.sin(yaw), cy = Math.cos(yaw), alive = !dead;
      let vx = st.vx, vz = st.vz, vy = st.vy || 0;
      if (vx == null) { vx = -sy * (st.speed || 0); vz = -cy * (st.speed || 0); }       // legacy callers: speed along the facing
      if (dead) vx = vz = vy = 0;
      lf = -vx * sy - vz * cy; lr = vx * cy - vz * sy; hs = Math.hypot(lf, lr);
      const mode = alive ? st.mode | 0 : 0, grap = alive ? st.grapple : null, airborne = alive && st.grounded === false && mode !== 2 && mode !== 3;
      const dyaw = prevYaw === null ? 0 : wrapPi(yaw - prevYaw); prevYaw = yaw;
      if (dt > 1e-5) yawRate = damp(yawRate, clamp(dyaw / dt, -7, 7), 10, dt);
      crouchT = damp(crouchT, st.crouching && alive ? 1 : 0, 10, dt);
      lowT = damp(lowT, st.sprinting && hs > 2 && alive && !grap ? 1 : 0, 8, dt);
      pitch = damp(pitch, clamp(st.aimPitch || 0, -1.4, 1.4), 14, dt);
      airT = damp(airT, airborne ? 1 : 0, airborne ? 9 : 16, dt);
      adsT = damp(adsT, alive && !st.sprinting ? sat(st.ads || 0) : 0, 16, dt);
      slideT = damp(slideT, mode === 1 ? 1 : 0, mode === 1 ? 14 : 8, dt);
      ladderT = damp(ladderT, mode === 2 ? 1 : 0, 12, dt);
      mantleT = damp(mantleT, mode === 3 ? 1 : 0, mode === 3 ? 22 : 9, dt);
      mantlePh = mode === 3 ? mantlePh + dt / 0.35 : 0;
      grapT = damp(grapT, grap ? 1 : 0, grap ? 12 : 7, dt);
      dashK = damp(dashK, mode === 4 ? 1 : 0, mode === 4 ? 20 : 7, dt);
      vyS = damp(vyS, vy, 12, dt);
      if (airborne) {
        if (wasAir && !grap && vy - prevVy > 3) boostT = 1;                               // thruster double jump (or a fling)
        fallV = vy;
      } else if (wasAir && alive) land = clamp(-fallV / 13, 0.3, 1);                      // touchdown: knees take the impact
      if (hadGrapple && !grap && airborne) tuckT = 1;                                     // let go of the cable: tuck
      wasAir = airborne; prevVy = vy; hadGrapple = !!grap;
      land = Math.max(0, land - dt * 3.2); landS = damp(landS, land, land > landS ? 34 : 9, dt);
      boostT = Math.max(0, boostT - dt / 0.42); tuckT = Math.max(0, tuckT - dt / 0.6);
      flinchT = damp(flinchT, 0, 9, dt); kick = damp(kick, 0, 20, dt); fireHold = Math.max(0, fireHold - dt);
      st._ladY = root.position.y;
      if (glint) {
        // fully scoped in with the sniper: quick fade in (~0.1 s) and out; aim line from the networked yaw / pitch
        const on = gunId === 'sniper' && alive && !controlled && adsT > 0.8 && sat(st.ads || 0) > 0.85;
        glintAim.k = on ? Math.min(1, glintAim.k + dt / 0.1) : Math.max(0, glintAim.k - dt / 0.08);
        const cp = Math.cos(pitch);
        glintAim.dir.set(-sy * cp, Math.sin(pitch), -cy * cp);
        glint.visible = glintAim.k > 0.001;
      }
      if (!rig || controlled) return;

      // --- lean: into acceleration and turns on the ground (about the feet); along the cable / dash in the air
      svf = damp(svf, lf, 6, dt); svr = damp(svr, lr, 6, dt);
      const gnd = alive && !airborne ? 1 - Math.max(slideT, ladderT, mantleT) : 0;
      // (+ a slight lean into a climb / back on the way down a slope or stairs)
      const climb = hs > 1 ? clamp(vyS / hs, -0.6, 0.6) * 0.14 : 0;
      leanF = damp(leanF, gnd * clamp((lf - svf) * 0.05, -0.2, 0.24) + gnd * (lowT * 0.05 + climb), 9, dt);
      leanR = damp(leanR, gnd * clamp((lr - svr) * 0.05 - yawRate * Math.min(hs, 8) * 0.008, -0.22, 0.22), 9, dt);
      let ff = 0, fr = 0;
      if (grap) {
        grapDir.copy(grap).sub(_v1.setFromMatrixPosition(root.matrixWorld)); grapDir.y -= 1.45; grapDir.normalize();
        const gf = -grapDir.x * sy - grapDir.z * cy, gr = grapDir.x * cy - grapDir.z * sy, gu = Math.max(0.25, grapDir.y);
        // hang from the cable: the body tips toward the anchor (hand up the rope, legs trailing below / behind)
        ff = clamp(Math.atan2(gf, gu) * 0.8, -0.35, 0.85); fr = clamp(Math.atan2(gr, gu) * 0.55, -0.5, 0.5);
      } else if (alive && hs > 0.5) {
        const k = (airT * 0.012 + dashK * 0.022) / Math.max(1, hs / 13) + tuckT * 0.02;
        ff = clamp(lf * k, -0.3, 0.42); fr = clamp(lr * k, -0.34, 0.34);
      }
      flightF = damp(flightF, ff, 8, dt); flightR = damp(flightR, fr, 8, dt);

      // --- leg heading: toward the travel direction when moving (backpedal past ~115 deg: face the other way and
      // play the cycle in reverse); standing still the feet stay planted while the torso turns, then shuffle round
      const loco = alive && !airborne && mode !== 1 && mode !== 2 && mode !== 3 && !grap;
      if (loco && hs > 0.5) {
        const ang = Math.atan2(lr, lf);
        if (!rev && Math.abs(ang) > 2.0) rev = true; else if (rev && Math.abs(ang) < 1.35) rev = false;
        legOff = damp(legOff, -clamp(rev ? wrapPi(ang - Math.PI) : ang, -1.05, 1.05) * seg(hs, 0.5, 1.6), 11, dt);
        turning = false;
      } else if (loco) {
        rev = false;
        legOff = clamp(wrapPi(legOff - dyaw), -1.2, 1.2);
        if (Math.abs(legOff) > 0.65) turning = true;
        if (turning) { legOff = damp(legOff, 0, 8, dt); if (Math.abs(legOff) < 0.05) turning = false; }
      } else { legOff = damp(legOff, 0, 10, dt); turning = false; }
      turnK = damp(turnK, turning ? 1 : 0, 12, dt);

      // --- locomotion: walk and run kept in step on one stride phase whose rate follows the real ground speed
      const W = template.loco.Walk, R = template.loco.Run;
      const sp = alive ? hs : 0, tRun = seg(sp, W.speed * 1.15, R.speed * 0.8), tWalk = Math.max(seg(sp, 0.15, 0.9) * (1 - tRun), turnK * 0.5 * (1 - tRun));
      locoK = damp(locoK, alive ? 1 - Math.max(airborne ? 0.8 : 0, slideT, ladderT, mantleT, grapT) : 1, 12, dt);
      wWalk = damp(wWalk, tWalk, 10, dt); wRun = damp(wRun, tRun, 10, dt);
      const ww = wWalk * locoK, wr = wRun * locoK, wsum = wWalk + wRun;
      actions.idle.setEffectiveWeight(Math.max(0, 1 - ww - wr)); actions.walk.setEffectiveWeight(ww); actions.run.setEffectiveWeight(wr);
      if (wsum > 1e-3 && alive) {
        const nat = (wWalk * W.speed + wRun * R.speed) / wsum, dur = (wWalk * W.dur + wRun * R.dur) / wsum;
        // cadence: exact foot-speed match up to the clip's own pace, then stride and cadence share the extra speed
        const q = sp / nat, rate = Math.max(q < 1 ? Math.max(q, 0.45) : Math.min(Math.pow(q, 0.62), 1.75), turnK * 1.3) * (airborne ? 0.45 : 1);
        phase = (phase + (rev ? -1 : 1) * dt * rate / dur + 1) % 1;
      }
      actions.walk.time = phase * W.dur; actions.run.time = ((phase + R.phase - W.phase + 2) % 1) * R.dur;
      for (let i = 0; i < rig.mod.length; i++) rig.mod[i].quaternion.copy(rig.saved[i]);
      rig.hips.position.copy(rig.hipsPos);
      mixer.timeScale = dead ? Math.max(0, 1 - deathT * 2) : 1;
      mixer.update(dt);
      for (let i = 0; i < rig.mod.length; i++) rig.saved[i].copy(rig.mod[i].quaternion);
      rig.hipsPos.copy(rig.hips.position);

      if (dead) {
        // topple about the feet under gravity (accelerating, so it lands with weight), a small bounce at impact
        deathT = Math.min(4, deathT + dt);
        const u = sat((deathT - 0.08) / 0.6), b = sat((deathT - 0.68) / 0.32);
        const a = fallMax * (u * u - 0.06 * Math.sin(Math.PI * b) * (1 - b));
        pivot.quaternion.setFromAxisAngle(fallAxis, a).multiply(_q.setFromAxisAngle(_up, deathRoll * u));
        const lk = a / (Math.PI / 2);
        pivot.position.set(0, lk * lk * 0.15, 0);                     // the back / chest rests on the ground, not in it
        weaponPivot.rotation.x = damp(weaponPivot.rotation.x, 0, 6, dt);
        weaponPivot.rotation.y = damp(weaponPivot.rotation.y, 0, 6, dt); weaponPivot.rotation.z = damp(weaponPivot.rotation.z, 0, 6, dt);
      } else {
        // whole-body lean: about the feet on the ground, about the chest in the air (keeps the body over the hitbox)
        const px = -(leanF + flightF), pz = -(leanR + flightR);
        pivot.rotation.set(px, 0, pz, 'YXZ');
        const h = 0.95 * Math.max(airT, grapT);
        if (h > 1e-3) { _v1.set(0, 1, 0).applyEuler(pivot.rotation); pivot.position.set(-_v1.x * h, (1 - _v1.y) * h, -_v1.z * h); } else pivot.position.set(0, 0, 0);
      }
      root.updateWorldMatrix(true, false);
      pivot.updateMatrixWorld(true);
      procedural(dt);
    },
    dispose() {
      if (puppet.cleanup) { puppet.cleanup(); puppet.cleanup = null; }
      root.userData.disposed = true;
      root.removeFromParent();
      mixer?.stopAllAction();
      tagTex.dispose(); tagMat.dispose(); accent.dispose(); flashMat.dispose(); glint?.material.dispose();
      allyTex?.dispose(); allyFront?.material.dispose(); allyGhost?.material.dispose();
      rig?.model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
    },
  };
}
