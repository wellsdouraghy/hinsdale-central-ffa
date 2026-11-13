// Third-person player characters: rigged soldier (Soldier.glb, Mixamo "Vanguard") with blended idle/walk/run clips
// plus a procedural layer: crouch (leg IK), aim pitch (spine), two-hand weapon hold (arm IK onto the gun), death fall.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildGun } from './guns.js';
import { buildGrenadeModel } from './grenade.js';
import { ASSET_BASE } from './hands.js';
import * as T from './textures.js';

const B = (n) => 'mixamorig:' + n;
const sat = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => { const t = sat((p - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

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
  template = { scene, clips, yawFix, hand, bands, scale: 1.8 / height };
}
export const charactersReady = load().catch((e) => { console.warn('[visuals] soldier model failed to load', e); });

// ---- IK helpers (world space) ---------------------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
const _p = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
const _m = new THREE.Matrix4();

function worldQuat(obj, out) { obj.matrixWorld.decompose(_s, out, _v2); return out; }
// Apply a world-space rotation to a bone (its matrixWorld and its parent's must be current).
function rotateWorld(bone, q) {
  worldQuat(bone.parent, _pq); worldQuat(bone, _wq);
  bone.quaternion.copy(_pq.invert()).multiply(q).multiply(_wq);
  bone.updateWorldMatrix(false, true);
}
function setWorldQuat(bone, q) {
  worldQuat(bone.parent, _pq);
  bone.quaternion.copy(_pq.invert()).multiply(q);
  bone.updateWorldMatrix(false, true);
}
function solveTwoBone(a, b, c, target, pole) {
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

let flashGeo = null, bandGeo = null;

export function createCharacter({ color = 0xcc3333, name = '' } = {}) {
  const root = new THREE.Group(); root.name = 'character';
  const pivot = new THREE.Group(); root.add(pivot);                 // death fall rotates this about the feet
  const weaponPivot = new THREE.Group(); pivot.add(weaponPivot);
  const gunSlot = new THREE.Group(); weaponPivot.add(gunSlot);

  // name tag
  const tagTex = T.nameTagTexture(name, color);
  const tagMat = new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const tag = new THREE.Sprite(tagMat);
  tag.position.y = 2.08; tag.scale.set(0.84, 0.21, 1); tag.renderOrder = 20;
  tag.onBeforeRender = (r, s, cam) => {
    const d = _v1.setFromMatrixPosition(tag.matrixWorld).distanceTo(_v2.setFromMatrixPosition(cam.matrixWorld));
    tagMat.opacity = 1 - seg(d, 45, 80);
    const k = THREE.MathUtils.clamp(d / 9, 1, 4.5);                 // keep it legible at range
    tag.scale.set(0.84 * k, 0.21 * k, 1);
  };
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

  const st = { speed: 0, crouching: false, aimPitch: 0, weaponId: 'ar', grounded: true, sprinting: false };
  const guns = {};
  let gun = null, gunId = null;
  function setGun(id) {
    if (!HOLD[id]) id = 'ar';
    if (id === gunId) return;
    if (gun) gun.root.visible = false;
    if (!guns[id]) {
      guns[id] = buildGun(id);
      guns[id].root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
      gunSlot.add(guns[id].root);
    }
    gun = guns[id]; gunId = id; gun.root.visible = true;
    flash.position.copy(gun.anchors.muzzle).add(_v1.set(0, 0, -0.06));
  }
  setGun('ar');

  // rig (filled in when the model has loaded)
  let rig = null, mixer = null, actions = null;
  let crouchT = 0, lowT = 0, pitch = 0, dead = false, deathT = 0, deathRoll = 0, airT = 0;
  const wIdle = { v: 1 }, wWalk = { v: 0 }, wRun = { v: 0 };
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
    rig.saved = rig.mod.map((b) => b.quaternion.clone());
    rig.hipsPos = rig.hips.position.clone();
    mixer = new THREE.AnimationMixer(model);
    actions = { idle: mixer.clipAction(template.clips.Idle), walk: mixer.clipAction(template.clips.Walk), run: mixer.clipAction(template.clips.Run) };
    for (const k in actions) { actions[k].play(); actions[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
    actions.walk.time = Math.random(); actions.idle.time = Math.random() * 3;
  });

  function handFrame(side, fingers, palm, out) {
    // world quaternion that points the hand's finger axis along `fingers` with the palm facing `palm`
    _v1.copy(palm).addScaledVector(fingers, -palm.dot(fingers)).normalize();
    _m.makeBasis(fingers, _v1, _v2.crossVectors(fingers, _v1));
    return out.setFromRotationMatrix(_m).multiply(template.hand[side].frameInv);
  }

  function procedural(dt) {
    const { model, hips, spine } = rig;
    worldQuat(pivot, _q2);
    fwdW.set(0, 0, -1).applyQuaternion(_q2); rightW.set(1, 0, 0).applyQuaternion(_q2); upW.set(0, 1, 0).applyQuaternion(_q2);
    const scale = _s.setFromMatrixScale(root.matrixWorld).y;

    // --- crouch / death buckle: drop the hips, keep the feet planted with leg IK
    const dk = dead ? seg(deathT, 0, 0.35) * 0.42 - seg(deathT, 0.45, 1) * 0.2 : 0;
    const drop = (crouchT * 0.5 + dk) * scale;
    if (drop > 1e-4) {
      footL.setFromMatrixPosition(rig.Left.foot.matrixWorld); footR.setFromMatrixPosition(rig.Right.foot.matrixWorld);
      worldQuat(rig.Left.foot, footLQ); worldQuat(rig.Right.foot, footRQ);
      _v1.setFromMatrixPosition(hips.matrixWorld).addScaledVector(upW, -drop).addScaledVector(fwdW, -crouchT * 0.06 * scale);
      hips.position.copy(hips.parent.worldToLocal(_v1));
      hips.updateWorldMatrix(false, true);
      pole.copy(fwdW).addScaledVector(upW, 0.25);
      for (const [s, ft, fq] of [['Left', footL, footLQ], ['Right', footR, footRQ]]) {
        const L = rig[s];
        pole.copy(fwdW).addScaledVector(rightW, s === 'Left' ? -0.18 : 0.18).addScaledVector(upW, 0.2);
        solveTwoBone(L.up, L.leg, L.foot, ft, pole);
        setWorldQuat(L.foot, fq);
      }
    }

    // --- spine: aim pitch, crouch lean, sprint lean
    const lean = crouchT * -0.3 + lowT * -0.12;
    const per = (pitch * 0.72 + lean) / 3;
    if (!dead && Math.abs(per) > 1e-4) {
      _q.setFromAxisAngle(rightW, per);
      for (const sp of spine) rotateWorld(sp, _q);
      rotateWorld(rig.neck, _q.setFromAxisAngle(rightW, pitch * 0.2 - lean * 0.8));
    }
    if (dead) {
      const k = seg(deathT, 0.05, 0.6);
      _q.setFromAxisAngle(rightW, -0.12 * k); for (const sp of spine) rotateWorld(sp, _q);
      rotateWorld(rig.head, _q.setFromAxisAngle(rightW, -0.25 * k).multiply(_q2.setFromAxisAngle(fwdW, deathRoll * 0.5 * k)));
      rotateWorld(rig.Left.arm, _q.setFromAxisAngle(fwdW, 0.75 * k));
      rotateWorld(rig.Right.arm, _q.setFromAxisAngle(fwdW, -0.75 * k));
      return;
    }

    // --- melee butt-stroke / grenade throw: torso twist
    let mW = 0, mS = 0, gW = 0, gT = 0, gBlend = 0, ap = 0;
    if (act) {
      ap = actT / actDur;
      if (act === 'melee') { mW = seg(ap, 0, 0.22) * (1 - seg(ap, 0.22, 0.4)); mS = seg(ap, 0.2, 0.42) - seg(ap, 0.6, 1); }
      else { gW = seg(ap, 0.1, 0.38) * (1 - seg(ap, 0.4, 0.55)); gT = seg(ap, 0.4, 0.56) - seg(ap, 0.7, 1); gBlend = seg(ap, 0, 0.18) - seg(ap, 0.78, 1); }
      const tw = (mW * 0.35 - mS * 0.5 - gW * 0.4 + gT * 0.45) / 3;
      if (Math.abs(tw) > 1e-4) { _q.setFromAxisAngle(upW, tw); for (const sp of spine) rotateWorld(sp, _q); }
      const bend = (mS * 0.25 + gT * 0.3 - gW * 0.15) / 3;
      if (Math.abs(bend) > 1e-4) { _q.setFromAxisAngle(rightW, -bend); for (const sp of spine) rotateWorld(sp, _q); }
    }

    // --- weapon pivot at the right shoulder, pitched with the aim
    const hold = HOLD[gunId];
    _v1.setFromMatrixPosition(rig.Right.arm.matrixWorld);
    pivot.worldToLocal(_v1);
    weaponPivot.position.copy(_v1);
    const low = lowT * (hold.pistol ? 0.6 : 1);
    weaponPivot.rotation.set(pitch * (1 - low) - low * 0.65, low * 0.75, low * 0.25, 'YXZ');
    gunSlot.position.set(hold.off[0], hold.off[1], hold.off[2]).sub(gun.anchors.butt);
    if (hold.pistol) gunSlot.position.z += low * 0.22;
    if (act === 'melee') {
      // butt-stroke: cock the weapon back, then drive the stock forward across the body as the muzzle swings away
      weaponPivot.rotation.y += -0.35 * mW + 1.25 * mS; weaponPivot.rotation.x += 0.25 * mW + 0.15 * mS; weaponPivot.rotation.z += -0.5 * mS;
      gunSlot.position.z += 0.12 * mW - 0.3 * mS; gunSlot.position.x += -0.12 * mS; gunSlot.position.y += 0.06 * mS;
    } else if (act === 'nade') {
      weaponPivot.rotation.x -= 0.45 * gBlend; weaponPivot.rotation.y += 0.35 * gBlend;
    }
    weaponPivot.updateWorldMatrix(false, true);
    worldQuat(gun.root, gq);
    gx.set(1, 0, 0).applyQuaternion(gq); gy.set(0, 1, 0).applyQuaternion(gq); gz.set(0, 0, 1).applyQuaternion(gq);

    // right hand on the grip: fingers forward, palm facing gun-left
    fDir.copy(gz).multiplyScalar(-0.9).addScaledVector(gy, 0.3).addScaledVector(gx, -0.25).normalize(); pDir.copy(gx).negate();
    tgt.copy(gun.anchors.gripR); gun.root.localToWorld(tgt);
    tgt.addScaledVector(fDir, -0.075 * scale).addScaledVector(gx, 0.03 * scale);
    pole.copy(rightW).multiplyScalar(0.7).addScaledVector(upW, -1);
    solveTwoBone(rig.Right.arm, rig.Right.fore, rig.Right.hand, tgt, pole);
    setWorldQuat(rig.Right.hand, handFrame('Right', fDir, pDir, _q));

    // left hand: under the handguard (palm up) or wrapped over the right hand for the pistol
    if (hold.pistol) { fDir.copy(gz).multiplyScalar(-0.75).addScaledVector(gx, 0.5).addScaledVector(gy, 0.25).normalize(); pDir.copy(gx); }
    else { fDir.copy(gx).multiplyScalar(0.75).addScaledVector(gz, -0.5).addScaledVector(gy, 0.35).normalize(); pDir.copy(gy); }
    tgt.copy(gun.anchors.gripL); gun.root.localToWorld(tgt);
    tgt.addScaledVector(fDir, -0.08 * scale).addScaledVector(pDir, -0.025 * scale);
    if (act === 'nade') {
      // overhand throw with the left arm: cocked behind the head, whipped forward, follow-through
      _a.setFromMatrixPosition(rig.Left.arm.matrixWorld);
      const back = gW, fwd = seg(ap, 0.4, 0.58), down = seg(ap, 0.58, 0.8);
      _b.copy(_a).addScaledVector(rightW, (-0.12 - 0.1 * back + 0.12 * fwd) * scale)
        .addScaledVector(upW, (0.12 + 0.3 * back + 0.28 * fwd * (1 - down) - 0.3 * down) * scale)
        .addScaledVector(fwdW, (0.2 - 0.38 * back + 0.42 * fwd) * scale);
      tgt.lerp(_b, gBlend);
      fDir.lerp(_c.copy(upW).multiplyScalar(1 - fwd).addScaledVector(fwdW, 0.3 + fwd).addScaledVector(upW, -down), gBlend).normalize();
      pDir.lerp(_c.copy(fwdW).addScaledVector(upW, -fwd * 0.6), gBlend).normalize();
      nade.group.visible = ap > 0.12 && ap < 0.55;
    }
    pole.copy(rightW).multiplyScalar(-0.6).addScaledVector(upW, -1);
    solveTwoBone(rig.Left.arm, rig.Left.fore, rig.Left.hand, tgt, pole);
    setWorldQuat(rig.Left.hand, handFrame('Left', fDir, pDir, _q));
  }

  return {
    object3D: root,
    setState(s) { Object.assign(st, s); if (s.weaponId) setGun(s.weaponId); },
    // Third-person melee (rifle butt-stroke, ~0.45 s) and overhand frag throw (~0.7 s, grenade leaves the hand at 55 %).
    melee(durationSec = 0.45) { if (!dead) { act = 'melee'; actT = 0; actDur = Math.max(0.2, durationSec); if (nade) nade.group.visible = false; } },
    throwGrenade(durationSec = 0.7) { if (!dead) { act = 'nade'; actT = 0; actDur = Math.max(0.3, durationSec); } },
    fire() {
      if (dead) return;
      flashT = 0.06; flash.visible = true;
      flashMat.map = T.flashFront((Math.random() * 4) | 0);
      flash.rotation.z = Math.random() * 6.28;
      flash.scale.setScalar((gunId === 'pistol' ? 0.22 : gunId === 'sniper' || gunId === 'shotgun' ? 0.5 : 0.34) * (0.8 + Math.random() * 0.5));
    },
    die() {
      if (dead) return;
      dead = true; deathT = 0; deathRoll = (Math.random() - 0.5) * 0.7; tag.visible = false; flash.visible = false;
    },
    reset() {
      dead = false; deathT = 0; tag.visible = true;
      pivot.rotation.set(0, 0, 0); pivot.position.set(0, 0, 0);
      gunSlot.rotation.set(0, 0, 0);
    },
    update(dt) {
      dt = Math.min(dt, 0.1);
      if (flashT > 0) { flashT -= dt; flashMat.opacity = sat(flashT / 0.06); if (flashT <= 0) flash.visible = false; }
      crouchT = damp(crouchT, st.crouching && !dead ? 1 : 0, 10, dt);
      lowT = damp(lowT, st.sprinting && st.speed > 2 ? 1 : 0, 8, dt);
      pitch = damp(pitch, THREE.MathUtils.clamp(st.aimPitch || 0, -1.4, 1.4), 14, dt);
      airT = damp(airT, st.grounded === false ? 1 : 0, 8, dt);
      if (act) { actT += dt; if (actT >= actDur || dead) { act = null; if (nade) nade.group.visible = false; } }
      if (!rig) return;

      // locomotion blend
      const sp = dead ? 0 : Math.abs(st.speed || 0);
      const tRun = seg(sp, 2.6, 4.6), tWalk = seg(sp, 0.15, 1.0) * (1 - tRun);
      wIdle.v = damp(wIdle.v, 1 - tWalk - tRun, 10, dt); wWalk.v = damp(wWalk.v, tWalk, 10, dt); wRun.v = damp(wRun.v, tRun, 10, dt);
      actions.idle.setEffectiveWeight(wIdle.v); actions.walk.setEffectiveWeight(wWalk.v); actions.run.setEffectiveWeight(wRun.v);
      actions.walk.timeScale = THREE.MathUtils.clamp(sp / 1.6, 0.6, 1.7) * (1 - airT * 0.7);
      actions.run.timeScale = THREE.MathUtils.clamp(sp / 4.6, 0.75, 1.45) * (1 - airT * 0.7);
      for (let i = 0; i < rig.mod.length; i++) rig.mod[i].quaternion.copy(rig.saved[i]);
      rig.hips.position.copy(rig.hipsPos);
      mixer.timeScale = dead ? Math.max(0, 1 - deathT * 2) : 1;
      mixer.update(dt);
      for (let i = 0; i < rig.mod.length; i++) rig.saved[i].copy(rig.mod[i].quaternion);
      rig.hipsPos.copy(rig.hips.position);

      if (dead) {
        deathT = Math.min(1, deathT + dt / 0.95);
        const fall = seg(deathT, 0.12, 0.8), e = fall * fall;
        pivot.rotation.set(e * Math.PI * 0.5, 0, deathRoll * e, 'YXZ');
        pivot.position.y = e * 0.16 + Math.sin(sat((deathT - 0.8) / 0.2) * Math.PI) * 0.02;
        // weapon slips out of the hands
        const g = seg(deathT, 0.1, 0.75);
        gunSlot.rotation.set(0, -1.35 * g - deathRoll, 0);
        gunSlot.position.lerp(_v1.set(0.32, -0.3, 0.125), 1 - Math.exp(-7 * dt * g));
        weaponPivot.rotation.x = damp(weaponPivot.rotation.x, 0, 6, dt);
        weaponPivot.rotation.y = damp(weaponPivot.rotation.y, 0, 6, dt); weaponPivot.rotation.z = damp(weaponPivot.rotation.z, 0, 6, dt);
      }
      root.updateWorldMatrix(true, false);
      pivot.updateMatrixWorld(true);
      procedural(dt);
    },
    dispose() {
      root.userData.disposed = true;
      root.removeFromParent();
      mixer?.stopAllAction();
      tagTex.dispose(); tagMat.dispose(); accent.dispose(); flashMat.dispose();
      rig?.model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
    },
  };
}
