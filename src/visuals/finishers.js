// Cinematic melee finishers (original choreography). Two characters from createCharacter() are puppeteered through the
// character rig hook (`_puppet`): hips transform + spine lean / twist / side bend + head + four IK limbs, keyframed in
// "scene space", with contact links (a hand or foot pinned to a bone of the other character), a weapon in the
// attacker's hands (combat knife, or the rifle they carry; otherwise the rifle rides on their back), the victim's
// weapon dropping to the ground, slow-motion beats and a cut / spline camera with punch-in and shake.
//
// Scene space: the victim starts at the origin; -z is "away from the attacker", +x is to the attacker's right; metres.
// setOrigin(position, yaw) places the scene in the world (position = victim's feet, yaw = scene heading, same
// convention as object3D.rotation.y; the attacker starts at +z looking down -z). Nothing here needs props or walls.
// Each FINISHERS entry lists the free space the scene needs:
//   clearance   radius (m) around the origin that must be free of walls (attacker's approach, the body's landing spot)
//   heightClear vertical space (m) above the ground that must be free (lifts / kicks)
// Scene keys are written in scene time; `slow` beats stretch it, so `duration` and the event times of the public API
// are in real seconds.
import * as THREE from 'three';
import { rotateWorld, setWorldQuat, solveTwoBone, worldQuat } from './character.js';
import { buildKnife } from './weapons.js';
import { buildGun } from './guns.js';

const PI = Math.PI;
// Default standing pose. Body frame: +x right, +y up, -z forward, origin at the hips.
//   p hips (scene space); yaw / pitch / roll body (pitch > 0 tips forward: face-down = +PI/2, on the back = -PI/2;
//   roll > 0 tips to the body's left); lean (spine forward bend), twist (> 0 turns the chest left), side (> 0 bends left);
//   head (nod down), hy (turn left), hz (tilt left); hl / hr hand targets and el / er elbow hints (body frame);
//   fl / fr ankle targets, in scene space when wl / wr = 1 (planted feet) else in the body frame; kl / kr knee hints;
//   kd knife blade direction; gp / gd / gu right grip position, muzzle direction and up hint of a held gun (body frame),
//   lf = 1 frees the left hand from the gun (it follows hl).
const D = {
  p: [0, 1.0, 0], yaw: 0, pitch: 0, roll: 0, lean: 0, twist: 0, side: 0, head: 0, hy: 0, hz: 0,
  hl: [-0.3, -0.22, -0.06], hr: [0.3, -0.22, -0.06], el: [-0.6, -0.7, 0.45], er: [0.6, -0.7, 0.45],
  fl: [-0.11, -0.9, 0], fr: [0.11, -0.9, 0], wl: 0, wr: 0, kl: [-0.2, 0.15, -1], kr: [0.2, 0.15, -1],
  kd: [0, 0.35, -1], gp: [0.2, 0.25, -0.22], gd: [-0.35, -0.1, -1], gu: [0, 1, 0], lf: 0,
};
const GUNHANDS = { hl: [-0.16, 0.02, -0.3], hr: [0.24, -0.06, -0.2] };   // the victim's start pose: weapon held low

// Keys: { t, e?: 'in' (accelerate into the key: strikes) | 'out' (decelerate: recoil) | 'lin'; default smooth, ...pose }
// (omitted fields carry over). Links: { limb, bone, off, t: [from, to], in?, out?, self? } pin a limb target to a bone
// of the other character (off in that character's body frame) between the two scene times.
// Events: { t, s?: sound type, i?: intensity, fx?: 'blood'|'gush'|'dust'|'puff'|'pool', pulse?, shake?, punch?, bone, who }.
const SCENES = [
  // ------------------------------------------------------------------------------------------------------------------
  {
    id: 'backstab', name: 'Silent Blade', len: 2.75, clearance: 2.2, heightClear: 2.2, weapon: 'knife', facing: 'back', drop: 0.42,
    slow: [{ t: 1.26, len: 0.08, rate: 0.22 }],
    a: [
      { t: 0, p: [0.12, 0.92, 1.55], lean: 0.2, wl: 1, wr: 1, fl: [-0.1, 0.1, 1.7], fr: [0.3, 0.1, 1.45], hl: [-0.22, 0.25, -0.35], hr: [0.34, 0.02, 0.1], kd: [0, -0.3, -1] },
      { t: 0.2, p: [0.14, 0.9, 1.05], fl: [-0.1, 0.1, 1.0], hl: [-0.2, 0.5, -0.42] },
      { t: 0.36, e: 'in', p: [0.16, 0.95, 0.54], fr: [0.38, 0.1, 0.8], fl: [-0.08, 0.1, 0.6], hl: [-0.1, 0.6, -0.45], hr: [0.45, -0.02, 0.28], lean: 0.1, twist: -0.3 },
      { t: 0.6, p: [0.16, 0.94, 0.54], hr: [0.5, 0.0, 0.38], twist: -0.5, kd: [-1, 0.05, -0.4], er: [1, -0.2, 0.6] },
      { t: 0.72, e: 'in', p: [0.14, 0.93, 0.52], hr: [0.25, 0.08, -0.3], twist: 0.3, lean: 0.2, kd: [-1, 0.05, -0.2] },
      { t: 0.95, twist: 0.36 },
      { t: 1.08, hr: [0.5, 0.15, 0.25], twist: -0.2, lean: 0.05, kd: [-0.6, -0.3, -0.6], er: D.er },
      { t: 1.22, p: [0.14, 0.98, 0.52], hr: [0.32, 0.98, 0.05], kd: [0, -1, -0.2], twist: -0.3, lean: -0.05, er: [1, 0.3, 0.5] },
      { t: 1.3, e: 'in', p: [0.14, 0.92, 0.5], hr: [0.12, 0.7, -0.35], twist: 0.2, lean: 0.25, kd: [0, -1, -0.1] },
      { t: 1.44 },
      { t: 1.52, hl: [-0.2, 0.3, -0.42], hr: [0.4, 0.5, 0.1], twist: -0.1, lean: 0.15, kd: [0.2, -0.6, -0.7], er: D.er },
      { t: 1.66, p: [0.14, 0.98, 0.58], hl: [-0.3, 0.0, -0.15], hr: [0.38, 0.15, -0.1], twist: 0, lean: 0, kd: [0.3, -0.6, -0.7] },
      { t: 2.0, p: [0.14, 1.0, 0.75], fr: [0.34, 0.1, 0.95], hl: [-0.3, -0.2, -0.05], hr: [0.42, -0.12, 0.0], kd: [0.2, -1, -0.3], head: 0.3 },
      { t: 2.75, head: 0.34 },
    ],
    v: [
      { t: 0, wl: 1, wr: 1, fl: [-0.13, 0.1, 0], fr: [0.13, 0.1, 0], ...GUNHANDS },
      { t: 0.34 },
      { t: 0.42, e: 'in', p: [0, 1.0, 0.08], lean: -0.3, head: -0.45, hl: [-0.25, 0.5, -0.3], hr: [0.25, 0.5, -0.3] },
      { t: 0.62, p: [0, 1.0, 0.1], lean: -0.32 },
      { t: 0.74, e: 'in', p: [-0.04, 1.04, 0.06], lean: -0.5, head: -0.6, side: -0.25 },
      { t: 0.95, p: [-0.03, 0.98, 0.08], lean: -0.4 },
      { t: 1.08, p: [0, 0.94, 0.08], lean: -0.25, side: 0 },
      { t: 1.22, head: -0.5, lean: -0.28 },
      { t: 1.32, e: 'in', p: [0, 0.88, 0.06], head: -0.2, lean: -0.1, hy: -0.4, side: 0.15 },
      { t: 1.44 },
      { t: 1.56, p: [0, 0.86, -0.12], lean: 0.15, head: 0.3, side: 0 },
      { t: 1.8, p: [0, 0.56, -0.3], lean: 0.3, fl: [-0.14, 0.08, 0.05], fr: [0.13, 0.08, 0.07] },
      { t: 2.2, e: 'in', p: [0, 0.17, -0.95], pitch: 1.5, lean: -0.08, head: 0.1, hy: 0.6, wl: 0, wr: 0, fl: [-0.15, -0.9, 0.04], fr: [0.13, -0.88, 0.04], hl: [-0.3, 0.35, -0.06], hr: [0.25, 0.15, -0.06] },
      { t: 2.3, e: 'out', p: [0, 0.21, -0.97] }, { t: 2.42, e: 'in', p: [0, 0.165, -0.97] }, { t: 2.75 },
    ],
    la: [
      { limb: 'hl', bone: 'Head', off: [0.02, -0.02, -0.11], t: [0.3, 1.46] },
      { limb: 'hr', bone: 'Spine', off: [0.21, 0.02, 0.05], t: [0.64, 0.98], out: 0.08 },
      { limb: 'hr', bone: 'Neck', off: [0.07, 0.2, 0.03], t: [1.25, 1.44], in: 0.05, out: 0.06 },
      { limb: 'hl', bone: 'Spine2', off: [0, 0, 0.15], t: [1.46, 1.56], out: 0.12 },
    ],
    lv: [
      { limb: 'hl', bone: 'LeftForeArm', off: [0, 0.03, 0], t: [0.42, 1.3], in: 0.14 },
      { limb: 'hr', bone: 'LeftArm', off: [0, -0.05, -0.05], t: [0.42, 1.3], in: 0.14 },
      { limb: 'hl', bone: 'Neck', off: [-0.03, 0, -0.1], t: [1.44, 2.05], self: 1, in: 0.12, out: 0.2 },
      { limb: 'hr', bone: 'Neck', off: [0.06, 0.04, -0.08], t: [1.44, 2.05], self: 1, in: 0.12, out: 0.2 },
    ],
    cam: [
      { t: 0, pos: [1.9, 1.5, 3.1], f: 0.5, fov: 50 },
      { t: 0.45, pos: [2.3, 1.4, 1.3], f: 0.4, fov: 46 },
      { t: 1.0, pos: [2.5, 1.3, 0.2], f: 0.4, fov: 44 },
      { t: 1.0, cut: 1, pos: [1.5, 1.35, -2.2], tgt: [0.08, 1.4, 0.15], fov: 44 },
      { t: 1.45, pos: [1.0, 1.25, -2.4], tgt: [0.08, 1.35, 0.1], fov: 40 },
      { t: 2.2, pos: [-1.9, 0.5, -2.6], f: 0.3, fov: 50 },
      { t: 2.75, pos: [-2.4, 0.7, -2.2], f: 0.5, fov: 48 },
    ],
    events: [
      { t: 0.38, s: 'grab', i: 0.5, bone: 'Head' },
      { t: 0.62, s: 'whoosh', i: 0.35, bone: 'RightHand', who: 'a' },
      { t: 0.73, s: 'stab', i: 0.55, bone: 'Spine', fx: 'blood', side: 1, shake: 0.3 },
      { t: 0.92, s: 'gear', i: 0.3, bone: 'Hips' },
      { t: 1.08, s: 'slash', i: 0.35, bone: 'Spine', fx: 'blood', side: 1 },
      { t: 1.2, s: 'sting', i: 0.55, bone: 'Neck' },
      { t: 1.3, s: 'stab', i: 0.8, bone: 'Neck', fx: 'gush', up: 1, pulse: 1, shake: 0.35, punch: 1 },
      { t: 1.5, s: 'slash', i: 0.4, bone: 'Neck', fx: 'blood', up: 1 },
      { t: 1.8, s: 'gear', i: 0.35, bone: 'LeftLeg', fx: 'puff' },
      { t: 2.2, s: 'slam', i: 0.5, bone: 'Spine1', fx: 'dust', shake: 0.2 },
      { t: 2.3, fx: 'pool', bone: 'Neck' },
      { t: 2.45, s: 'exhale', i: 0.3, bone: 'Head', who: 'a' },
    ],
    end: { p: [0.14, 0, 0.75], yaw: 0 },
  },
  // ------------------------------------------------------------------------------------------------------------------
  {
    id: 'neckbreak', name: 'Widowmaker', len: 2.5, clearance: 1.8, heightClear: 2.2, weapon: 'none', facing: 'back', drop: 0.44,
    slow: [{ t: 1.1, len: 0.07, rate: 0.2 }],
    a: [
      { t: 0, p: [0.1, 0.95, 1.6], lean: 0.15, wl: 1, wr: 1, fl: [-0.12, 0.1, 1.7], fr: [0.25, 0.1, 1.5], hl: [-0.2, 0.3, -0.3], hr: [0.25, 0.25, -0.25] },
      { t: 0.22, p: [0.1, 0.95, 0.95], fl: [-0.15, 0.1, 0.95], fr: [0.25, 0.1, 1.3] },
      { t: 0.3, p: [0.05, 1.0, 0.85], lean: -0.1, fr: [0.2, 0.5, 0.75] },
      { t: 0.42, e: 'in', p: [0.03, 0.98, 0.72], lean: -0.2, fr: [0.13, 0.42, 0.16] },
      { t: 0.6, p: [0.02, 0.92, 0.5], lean: 0.1, fr: [0.22, 0.1, 0.5] },
      { t: 0.8, p: [0, 0.86, 0.36], lean: 0.3, fl: [-0.2, 0.1, 0.55], hl: [-0.15, 0.3, -0.4], hr: [0.15, 0.5, -0.3] },
      { t: 1.02, p: [0, 0.84, 0.36], twist: 0.3 },
      { t: 1.12, e: 'in', p: [0.02, 0.9, 0.38], twist: -0.55, lean: 0.2, el: [-1, 0.1, 0.3], er: [1, 0.2, 0.3] },
      { t: 1.3 },
      { t: 1.5, p: [0.04, 0.96, 0.45], hl: [-0.35, 0.15, -0.25], hr: [0.35, 0.15, -0.25], twist: -0.1, lean: 0.05, el: D.el, er: D.er },
      { t: 1.9, p: [0.08, 1.0, 0.7], fr: [0.24, 0.1, 0.85], hl: [-0.3, -0.2, -0.05], hr: [0.3, -0.2, -0.05], head: 0.3, twist: 0, hy: 0.25 },
      { t: 2.5, hz: 0.12 },
    ],
    v: [
      { t: 0, wl: 1, wr: 1, fl: [-0.13, 0.1, 0], fr: [0.13, 0.1, 0], ...GUNHANDS },
      { t: 0.38 },
      { t: 0.46, e: 'in', p: [0.04, 0.82, -0.06], roll: -0.12, lean: 0.1, hl: [-0.5, 0.3, -0.2], hr: [0.45, 0.2, -0.25], fr: [0.13, 0.1, 0.12] },
      { t: 0.66, e: 'in', p: [0, 0.55, -0.22], roll: 0, lean: 0.15, head: 0.2, fl: [-0.14, 0.08, 0.2], fr: [0.13, 0.08, 0.22], hl: [-0.35, -0.1, -0.25], hr: [0.35, -0.1, -0.25] },
      { t: 0.8, lean: -0.05, head: -0.2, hl: [-0.2, 0.5, -0.1], hr: [0.2, 0.5, -0.1] },
      { t: 1.02, hy: 0.35, head: -0.25, lean: -0.1 },
      { t: 1.12, e: 'in', hy: -1.35, hz: -0.35, head: -0.1, twist: -0.25 },
      { t: 1.3, p: [0, 0.53, -0.22], hl: [-0.28, -0.3, -0.05], hr: [0.28, -0.3, -0.05], lean: 0.05 },
      { t: 1.5, roll: 0.12, lean: 0.2, hy: -1.2 },
      { t: 1.95, e: 'in', p: [-0.5, 0.2, -0.4], roll: 1.45, lean: 0.2, hz: 0.3, wl: 0, wr: 0, fl: [-0.14, -0.62, 0.42], fr: [0.12, -0.7, 0.3], hl: [-0.2, 0.2, -0.3], hr: [0.15, -0.1, -0.35] },
      { t: 2.05, e: 'out', p: [-0.5, 0.24, -0.4] }, { t: 2.15, p: [-0.5, 0.2, -0.4] }, { t: 2.5 },
    ],
    la: [
      { limb: 'hl', bone: 'Head', off: [-0.03, -0.08, -0.11], t: [0.68, 1.42], in: 0.12, out: 0.12 },
      { limb: 'hr', bone: 'Head', off: [0.06, 0.11, 0.07], t: [0.68, 1.42], in: 0.12, out: 0.12 },
    ],
    lv: [
      { limb: 'hl', bone: 'LeftForeArm', off: [0, 0, 0], t: [0.8, 1.14], in: 0.15, out: 0.15 },
      { limb: 'hr', bone: 'RightForeArm', off: [0, 0, 0], t: [0.8, 1.14], in: 0.15, out: 0.15 },
    ],
    cam: [
      { t: 0, pos: [-2.0, 1.4, 3.0], f: 0.5, fov: 50 },
      { t: 0.45, pos: [-2.7, 0.9, 1.2], f: 0.4, fov: 48 },
      { t: 0.8, pos: [-2.6, 0.9, 0.1], f: 0.4, fov: 46 },
      { t: 0.8, cut: 1, pos: [1.1, 0.8, -2.5], tgt: [0, 1.05, 0.15], fov: 44 },
      { t: 1.3, pos: [1.4, 0.75, -2.3], tgt: [0, 1.0, 0.15], fov: 40 },
      { t: 1.95, pos: [2.0, 0.6, -2.3], f: 0.3, fov: 48 },
      { t: 2.5, pos: [2.4, 0.9, -1.9], f: 0.6, fov: 48 },
    ],
    events: [
      { t: 0.3, s: 'whoosh', i: 0.35, bone: 'RightFoot', who: 'a' },
      { t: 0.42, s: 'impact', i: 0.5, bone: 'RightLeg', shake: 0.25 },
      { t: 0.66, s: 'gear', i: 0.35, bone: 'RightLeg', fx: 'puff' },
      { t: 0.8, s: 'grab', i: 0.45, bone: 'Head' },
      { t: 1.04, s: 'sting', i: 0.55, bone: 'Head' },
      { t: 1.12, s: 'crack', i: 0.8, bone: 'Head', pulse: 1, shake: 0.4, punch: 1 },
      { t: 1.95, s: 'slam', i: 0.5, bone: 'Spine1', fx: 'dust', shake: 0.2 },
      { t: 2.06, s: 'gear', i: 0.3, bone: 'Hips' },
      { t: 2.25, s: 'exhale', i: 0.3, bone: 'Head', who: 'a' },
    ],
    end: { p: [0.08, 0, 0.7], yaw: 0 },
  },
  // ------------------------------------------------------------------------------------------------------------------
  {
    id: 'slam', name: 'Gravedigger', len: 2.8, clearance: 2.6, heightClear: 2.8, weapon: 'none', facing: 'back', drop: 0.32,
    slow: [{ t: 1.39, len: 0.05, rate: 0.2 }],
    a: [
      { t: 0, p: [0, 0.9, 1.5], lean: 0.25, wl: 1, wr: 1, fl: [-0.14, 0.1, 1.6], fr: [0.2, 0.1, 1.4], hl: [-0.25, 0.2, -0.35], hr: [0.25, 0.2, -0.35] },
      { t: 0.3, e: 'in', p: [0, 0.88, 0.48], fl: [-0.2, 0.1, 0.5], fr: [0.22, 0.1, 0.62] },
      { t: 0.55, p: [0, 0.68, 0.45], lean: 0.35 },
      { t: 0.95, e: 'out', p: [0, 1.02, 0.4], lean: -0.1, head: -0.35, hl: [-0.2, 1.0, -0.05], hr: [0.2, 1.0, 0.1], el: [-1, 0, 0.2], er: [1, 0, 0.2] },
      { t: 1.25, p: [0, 1.02, 0.2], fl: [-0.2, 0.1, 0.1], fr: [0.22, 0.1, 0.5], lean: -0.18 },
      { t: 1.43, e: 'in', p: [0, 0.78, 0.05], lean: 1.0, head: 0.2, hl: [-0.2, -0.1, -0.6], hr: [0.2, -0.1, -0.6], el: D.el, er: D.er },
      { t: 1.62, p: [0, 0.8, 0.05], lean: 0.7, hl: [-0.3, 0.0, -0.35], hr: [0.3, 0.0, -0.35] },
      { t: 1.95, p: [-0.05, 1.0, -0.3], lean: -0.05, fl: [-0.22, 0.1, -0.15], fr: [0.1, 0.8, -0.55], hl: [-0.4, 0.2, -0.1], hr: [0.4, 0.3, 0.1] },
      { t: 2.1, e: 'in', p: [-0.05, 0.9, -0.42], lean: 0.3, head: 0.4, fr: [-0.15, 0.34, -0.95] },
      { t: 2.3, p: [-0.05, 0.88, -0.42], lean: 0.4, hl: [-0.1, -0.12, -0.4], hr: [0.35, -0.15, 0.0] },
      { t: 2.8 },
    ],
    v: [
      { t: 0, wl: 1, wr: 1, fl: [-0.13, 0.1, 0], fr: [0.13, 0.1, 0], ...GUNHANDS },
      { t: 0.26 },
      { t: 0.32, e: 'in', p: [0, 1.0, 0.05], lean: -0.15, head: -0.3, hl: [-0.4, 0.2, -0.3], hr: [0.4, 0.2, -0.3] },
      { t: 0.55, p: [0, 0.97, 0.1], lean: -0.2 },
      { t: 0.75, e: 'in', p: [0.05, 1.55, 0.02], pitch: -0.6, yaw: -0.5, wl: 0, wr: 0, fl: [-0.15, -0.8, -0.25], fr: [0.15, -0.85, -0.1] },
      { t: 0.95, e: 'out', p: [0.17, 2.03, 0.38], pitch: -1.5708, yaw: -1.5708, lean: -0.1, head: -0.3, fl: [-0.15, -0.85, -0.2], fr: [0.15, -0.8, -0.35], hl: [-0.55, 0.3, -0.2], hr: [0.55, 0.3, -0.2] },
      { t: 1.1, fl: [-0.15, -0.8, -0.4], fr: [0.15, -0.85, -0.15] },
      { t: 1.25, p: [0.17, 2.06, 0.2], fl: [-0.15, -0.85, -0.15], fr: [0.15, -0.75, -0.45] },
      { t: 1.45, e: 'in', p: [0.15, 0.2, -0.95], lean: 0, head: 0, fl: [-0.2, -0.88, -0.05], fr: [0.22, -0.85, -0.08], hl: [-0.6, 0.3, 0.0], hr: [0.6, 0.35, 0.0] },
      { t: 1.53, e: 'out', p: [0.15, 0.34, -0.95], lean: 0.2, head: 0.3, fl: [-0.2, -0.85, -0.25], fr: [0.22, -0.85, -0.2] },
      { t: 1.68, e: 'in', p: [0.15, 0.19, -0.95], lean: 0, head: -0.1, fl: [-0.2, -0.88, -0.05], fr: [0.22, -0.85, -0.08] },
      { t: 2.08 },
      { t: 2.14, e: 'out', lean: 0.25, head: 0.35, fl: [-0.2, -0.8, -0.3], fr: [0.22, -0.8, -0.25], hl: [-0.5, 0.2, -0.25], hr: [0.5, 0.2, -0.25] },
      { t: 2.36, lean: 0, head: -0.15, hy: 0.5, fl: [-0.2, -0.88, -0.03], fr: [0.24, -0.85, -0.05], hl: [-0.6, 0.3, 0.0], hr: [0.6, 0.2, 0.0] },
      { t: 2.8 },
    ],
    la: [
      { limb: 'hl', bone: 'Spine2', off: [-0.04, 0.08, 0.15], t: [0.22, 1.4], out: 0.06 },
      { limb: 'hr', bone: 'Hips', off: [0.05, 0.0, 0.15], t: [0.22, 1.4], out: 0.06 },
      { limb: 'fr', bone: 'Spine2', off: [0, 0, -0.17], t: [2.04, 3], in: 0.06 },
    ],
    lv: [],
    cam: [
      { t: 0, pos: [2.6, 1.3, 2.8], f: 0.5, fov: 50 },
      { t: 0.55, pos: [3.0, 0.9, 1.4], f: 0.5, fov: 50 },
      { t: 0.95, pos: [2.9, 0.4, -1.7], f: 0.4, ty: 0.45, fov: 56 },
      { t: 1.25, pos: [2.5, 0.4, -2.2], f: 0.4, ty: 0.45, fov: 54 },
      { t: 1.25, cut: 1, pos: [-2.2, 0.3, -2.8], tgt: [0, 1.2, -0.3], fov: 56 },
      { t: 1.45, pos: [-2.1, 0.25, -2.7], tgt: [0, 0.4, -0.8], fov: 48 },
      { t: 2.1, pos: [-2.4, 0.8, -2.5], f: 0.4, fov: 46 },
      { t: 2.8, pos: [-2.7, 1.1, -2.1], f: 0.5, fov: 46 },
    ],
    events: [
      { t: 0.3, s: 'grab', i: 0.5, bone: 'Spine2' },
      { t: 0.7, s: 'whoosh', i: 0.3, bone: 'Hips' },
      { t: 0.84, s: 'gear', i: 0.3, bone: 'Hips' },
      { t: 1.25, s: 'whoosh', i: 0.5, bone: 'Hips' },
      { t: 1.37, s: 'sting', i: 0.55, bone: 'Hips' },
      { t: 1.45, s: 'slam', i: 0.8, bone: 'Spine1', fx: 'dust', big: 1, pulse: 1, shake: 0.55, punch: 1 },
      { t: 1.56, s: 'gear', i: 0.35, bone: 'Hips' },
      { t: 2.1, s: 'land', i: 0.6, bone: 'Spine2', fx: 'puff', shake: 0.3 },
      { t: 2.16, fx: 'blood', bone: 'Head', up: 1 },
      { t: 2.3, fx: 'pool', bone: 'Head' },
      { t: 2.5, s: 'exhale', i: 0.3, bone: 'Head', who: 'a' },
    ],
    end: { p: [-0.05, 0, -0.3], yaw: 0 },
  },
  // ------------------------------------------------------------------------------------------------------------------
  {
    id: 'buttstroke', name: 'Stock Breaker', len: 2.35, clearance: 2.4, heightClear: 2.3, weapon: 'gun', facing: 'front', drop: 0.44,
    slow: [{ t: 0.87, len: 0.06, rate: 0.2 }],
    a: [
      { t: 0, p: [0.05, 0.96, 1.7], lean: 0.12, wl: 1, wr: 1, fl: [-0.1, 0.1, 1.75], fr: [0.25, 0.1, 1.6] },
      { t: 0.18, p: [0.05, 0.95, 1.2], fl: [-0.15, 0.1, 1.1], gp: [0.3, 0.3, 0.05], gd: [1, 0.2, 0] },
      { t: 0.3, p: [0.05, 0.94, 1.0], twist: -0.4, gp: [0.34, 0.2, 0.2], gd: [0.3, 0.3, 1], fr: [0.25, 0.1, 1.3] },
      { t: 0.42, e: 'in', p: [0.03, 0.92, 0.78], fl: [-0.15, 0.1, 0.55], twist: 0.35, lean: 0.3, gp: [0.1, 0.18, -0.3], gd: [0.15, 0.3, 1] },
      { t: 0.6, p: [0.05, 0.9, 0.85], gp: [0.3, 0.0, -0.05], gd: [0.2, 0.8, 0.6], twist: -0.2, lean: 0.2 },
      { t: 0.8, p: [0.05, 0.8, 0.8], twist: -0.5, lean: 0.3, gp: [0.3, -0.12, 0.0], gd: [0.1, 1, 0.3] },
      { t: 0.9, e: 'in', p: [0.02, 1.03, 0.62], twist: 0.4, lean: -0.1, gp: [0.08, 0.5, -0.3], gd: [0, -0.6, 0.8], gu: [0, 0.8, 0.6] },
      { t: 1.1, e: 'out', p: [0.02, 1.02, 0.6], twist: 0.5, gp: [0.05, 0.6, -0.2], gd: [0, -0.8, 0.6] },
      { t: 1.3, gp: [0.2, 0.4, -0.15], gd: [1, -0.3, 0], gu: [0, 1, 0], twist: 0.2 },
      { t: 1.5, p: [0.03, 0.98, 0.45], fl: [-0.15, 0.1, 0.3], fr: [0.22, 0.1, 0.65], gp: [0.2, 0.25, -0.22], gd: [-0.2, -0.2, -1], twist: 0, lean: 0.05 },
      { t: 1.9, p: [0.02, 0.98, 0.15], fl: [-0.15, 0.1, 0.0], fr: [0.22, 0.1, 0.35], gp: [0.2, 0.32, -0.25], gd: [-0.05, -0.75, -1], lean: 0.15, head: 0.35 },
      { t: 2.35 },
    ],
    v: [
      { t: 0, yaw: PI, wl: 1, wr: 1, fl: [0.13, 0.1, 0], fr: [-0.13, 0.1, 0], ...GUNHANDS },
      { t: 0.3, hl: [-0.25, 0.3, -0.35], hr: [0.25, 0.3, -0.35] },
      { t: 0.38 },
      { t: 0.44, e: 'in', p: [0, 0.9, -0.2], lean: 0.75, head: 0.35, hl: [-0.1, 0.05, -0.3], hr: [0.1, 0.05, -0.3], fl: [0.15, 0.1, -0.15], fr: [-0.15, 0.1, -0.05] },
      { t: 0.8, p: [0, 0.86, -0.22], lean: 0.85, head: 0.5 },
      { t: 0.9, e: 'in', p: [0, 1.05, -0.4], lean: -0.45, head: -0.8, hl: [-0.5, 0.5, -0.2], hr: [0.5, 0.5, -0.2] },
      { t: 1.08, e: 'out', p: [0, 1.1, -0.9], pitch: -0.8, lean: -0.3, wl: 0, wr: 0, fl: [-0.15, -0.85, -0.15], fr: [0.15, -0.8, -0.3], hl: [-0.6, 0.5, -0.1], hr: [0.6, 0.5, -0.1] },
      { t: 1.26, e: 'in', p: [0, 0.2, -1.4], pitch: -1.5708, lean: 0, head: -0.1, fl: [-0.2, -0.88, -0.04], fr: [0.22, -0.85, -0.06], hl: [-0.6, 0.3, 0], hr: [0.55, 0.4, 0] },
      { t: 1.34, e: 'out', p: [0, 0.3, -1.42], lean: 0.15, head: 0.25 }, { t: 1.48, e: 'in', p: [0, 0.19, -1.42], lean: 0, head: -0.1, hy: 0.4 }, { t: 2.35 },
    ],
    la: [], lv: [],
    cam: [
      { t: 0, pos: [2.5, 1.4, 2.4], f: 0.5, fov: 50 },
      { t: 0.42, pos: [2.7, 1.2, 0.9], f: 0.45, fov: 46 },
      { t: 0.8, pos: [2.5, 0.9, 0.4], f: 0.45, fov: 46 },
      { t: 0.8, cut: 1, pos: [-2.3, 0.8, 1.6], tgt: [0, 1.3, 0.2], fov: 46 },
      { t: 1.0, pos: [-2.5, 0.7, 1.2], tgt: [0, 1.4, -0.2], fov: 42 },
      { t: 1.3, pos: [-3.0, 0.5, -0.5], f: 0.45, fov: 54 },
      { t: 2.35, pos: [-2.2, 0.7, -3.0], f: 0.5, fov: 48 },
    ],
    events: [
      { t: 0.32, s: 'whoosh', i: 0.4, bone: 'RightHand', who: 'a' },
      { t: 0.42, s: 'heavy', i: 0.6, bone: 'Spine', shake: 0.3 },
      { t: 0.78, s: 'whoosh', i: 0.45, bone: 'RightHand', who: 'a' },
      { t: 0.85, s: 'sting', i: 0.55, bone: 'Head' },
      { t: 0.9, s: 'crack', i: 0.8, bone: 'Head', fx: 'blood', up: 1, pulse: 1, shake: 0.45, punch: 1 },
      { t: 1.26, s: 'slam', i: 0.6, bone: 'Spine1', fx: 'dust', shake: 0.3 },
      { t: 1.36, s: 'gear', i: 0.35, bone: 'Hips' },
      { t: 1.6, fx: 'pool', bone: 'Head' },
      { t: 2.0, s: 'exhale', i: 0.3, bone: 'Head', who: 'a' },
    ],
    end: { p: [0.02, 0, 0.15], yaw: 0 },
  },
  // ------------------------------------------------------------------------------------------------------------------
  {
    id: 'heelkick', name: 'Guillotine Kick', len: 2.3, clearance: 2.5, heightClear: 2.3, weapon: 'none', facing: 'front', drop: 0.52,
    slow: [{ t: 1.04, len: 0.06, rate: 0.2 }],
    a: [
      { t: 0, p: [0, 0.95, 1.75], lean: 0.15, wl: 1, wr: 1, fl: [-0.12, 0.1, 1.85], fr: [0.2, 0.1, 1.65], hl: [-0.2, 0.35, -0.3], hr: [0.22, 0.3, -0.25] },
      { t: 0.25, p: [0, 0.97, 0.95], fl: [-0.15, 0.1, 0.85], fr: [0.2, 0.1, 1.25], hl: [-0.15, 0.55, -0.45], hr: [0.15, 0.55, -0.45] },
      { t: 0.4, p: [0, 0.98, 0.85], lean: 0.1, fr: [0.2, 0.1, 1.2] },
      { t: 0.52, e: 'in', p: [0, 1.05, 0.75], lean: -0.15, fr: [0.1, 0.5, 0.62], hl: [-0.15, 0.2, -0.4], hr: [0.15, 0.2, -0.4] },
      { t: 0.62, p: [0, 0.98, 0.75], lean: 0, fr: [0.25, 0.1, 1.05], hl: [-0.25, 0.3, -0.3], hr: [0.25, 0.3, -0.3] },
      { t: 0.78, p: [0, 0.9, 0.7], yaw: 0.5, twist: 0.3, fl: [-0.1, 0.1, 0.58], hl: [-0.3, 0.3, -0.2], hr: [0.3, 0.3, -0.25] },
      { t: 0.92, e: 'in', p: [0, 1.0, 0.62], yaw: -2.3, twist: -0.3, lean: 0.2, wr: 0, fr: [0.25, -0.3, 0.3] },
      { t: 1.05, e: 'lin', p: [0, 1.08, 0.55], yaw: -4.0, twist: 0, lean: 0.45, fr: [0.56, 0.5, 0.48], kr: [0.5, 0.6, -0.3], hl: [-0.4, 0.2, -0.3], hr: [0.3, 0.1, -0.3] },
      { t: 1.2, e: 'out', yaw: -5.4, lean: 0.15, fr: [0.5, -0.1, 0.2], kr: D.kr },
      { t: 1.32, e: 'in', p: [0, 0.8, 0.72], yaw: -2 * PI, lean: 0.3, wr: 1, fr: [0.28, 0.1, 1.05], hl: [-0.25, 0.3, -0.3], hr: [0.25, 0.25, -0.3] },
      { t: 1.7, p: [0, 0.78, 0.72] },
      { t: 2.3, p: [0, 0.98, 0.75], lean: 0.05, hl: [-0.3, -0.2, -0.05], hr: [0.3, -0.2, -0.05], head: 0.2, hy: -0.6 },
    ],
    v: [
      { t: 0, yaw: PI, wl: 1, wr: 1, fl: [0.13, 0.1, 0], fr: [-0.13, 0.1, 0], ...GUNHANDS },
      { t: 0.25, hl: [-0.25, 0.3, -0.35], hr: [0.25, 0.3, -0.35] },
      { t: 0.4, p: [0, 0.95, 0.12], lean: 0.6, head: 0.3 },
      { t: 0.52, e: 'in', p: [0, 0.92, 0.15], lean: 0.9, head: 0.4 },
      { t: 0.62, e: 'out', p: [0, 1.0, -0.05], lean: -0.2, head: -0.5, hl: [-0.5, 0.3, -0.2], hr: [0.5, 0.3, -0.2], fl: [0.15, 0.1, -0.15], fr: [-0.13, 0.1, 0.0] },
      { t: 0.95, p: [0, 0.88, 0.0], lean: 0.35, head: 0.15, roll: 0.06, hl: [-0.3, -0.25, -0.15], hr: [0.3, -0.25, -0.15] },
      { t: 1.05, head: 0.1 },
      { t: 1.09, e: 'out', p: [0.15, 0.95, -0.08], hy: 0.9, hz: 0.35, roll: 0.3, lean: 0.1 },
      { t: 1.25, e: 'lin', p: [0.6, 0.95, -0.2], yaw: PI + 0.9, pitch: 0.9, roll: 0.5, wl: 0, wr: 0, fl: [-0.2, -0.8, 0.2], fr: [0.15, -0.85, -0.1], hl: [-0.6, 0.3, -0.1], hr: [0.5, 0.5, -0.2] },
      { t: 1.42, e: 'in', p: [1.1, 0.18, -0.3], yaw: 1.5 * PI, pitch: 1.5, roll: 0, head: 0.1, hy: 0.6, hz: 0, fl: [-0.16, -0.9, 0.02], fr: [0.2, -0.85, 0.02], hl: [-0.4, 0.4, -0.05], hr: [0.35, 0.5, -0.05] },
      { t: 1.5, e: 'out', p: [1.12, 0.25, -0.3] }, { t: 1.62, e: 'in', p: [1.12, 0.17, -0.3] }, { t: 2.3 },
    ],
    la: [
      { limb: 'hl', bone: 'Head', off: [0.1, 0.03, 0.06], t: [0.22, 0.58], out: 0.06 },
      { limb: 'hr', bone: 'Head', off: [-0.1, 0.03, 0.06], t: [0.22, 0.58], out: 0.06 },
      { limb: 'fr', bone: 'Head', off: [0.13, 0.0, 0.0], t: [1.0, 1.07], in: 0.05, out: 0.05 },
    ],
    lv: [],
    cam: [
      { t: 0, pos: [-2.4, 1.4, 2.6], f: 0.5, fov: 50 },
      { t: 0.52, pos: [-2.7, 1.1, 0.9], f: 0.45, fov: 46 },
      { t: 0.8, pos: [-2.8, 1.0, 0.5], f: 0.5, fov: 46 },
      { t: 0.8, cut: 1, pos: [-2.3, 0.8, -1.9], tgt: [0, 1.3, 0.3], fov: 48 },
      { t: 1.06, pos: [-2.6, 0.8, -1.5], tgt: [0.1, 1.35, 0.2], fov: 44 },
      { t: 1.45, pos: [-1.2, 0.5, -2.9], f: 0.3, fov: 52 },
      { t: 2.3, pos: [0.4, 0.9, -3.1], f: 0.5, fov: 50 },
    ],
    events: [
      { t: 0.3, s: 'grab', i: 0.45, bone: 'Head' },
      { t: 0.52, s: 'impact', i: 0.55, bone: 'Head', fx: 'blood', shake: 0.3 },
      { t: 0.9, s: 'whoosh', i: 0.5, bone: 'RightFoot', who: 'a' },
      { t: 1.0, s: 'sting', i: 0.55, bone: 'Head' },
      { t: 1.06, s: 'heavy', i: 0.8, bone: 'Head', fx: 'blood', pulse: 1, shake: 0.45, punch: 1 },
      { t: 1.32, s: 'land', i: 0.4, bone: 'RightFoot', who: 'a' },
      { t: 1.42, s: 'slam', i: 0.55, bone: 'Spine1', fx: 'dust', shake: 0.25 },
      { t: 1.52, s: 'gear', i: 0.3, bone: 'Hips' },
      { t: 2.0, s: 'exhale', i: 0.3, bone: 'Head', who: 'a' },
    ],
    end: { p: [0, 0, 0.75], yaw: 0 },
  },
];

// ---- scene preprocessing -------------------------------------------------------------------------------------------
const FIELDS = Object.keys(D);
const sat = (x) => Math.min(1, Math.max(0, x)), smooth = (x) => { x = sat(x); return x * x * (3 - 2 * x); };
for (const s of SCENES) {
  for (const track of [s.a, s.v]) { let prev = D; for (const k of track) { for (const f of FIELDS) if (k[f] === undefined) k[f] = prev[f]; prev = k; } }
  let pf = 50, shot = 0; for (const k of s.cam) { k.fov ??= pf; pf = k.fov; k.roll ??= 0; k.f ??= 0.4; k.ty ??= 0; if (k.cut) shot++; k.shot = shot; }
  s.shots = shot + 1;
  s.cameraRadius = Math.max(...s.cam.map((k) => Math.hypot(k.pos[0], k.pos[2]))) + 0.3;
  // time warp: scene time <-> real time (slow-motion beats)
  const segs = []; let st = 0, rt = 0;
  for (const w of [...(s.slow || [])].sort((a, b) => a.t - b.t)) {
    if (w.t > st) { segs.push({ s0: st, s1: w.t, r0: rt, rate: 1 }); rt += w.t - st; }
    segs.push({ s0: w.t, s1: w.t + w.len, r0: rt, rate: w.rate }); rt += w.len / w.rate; st = w.t + w.len;
  }
  if (s.len > st) { segs.push({ s0: st, s1: s.len, r0: rt, rate: 1 }); rt += s.len - st; }
  s.segs = segs; s.duration = Math.ceil(rt * 100) / 100;
  s.toScene = (r) => { let g = segs[0]; for (const x of segs) if (r >= x.r0) g = x; return Math.min(g.s1, g.s0 + Math.max(0, r - g.r0) * g.rate); };
  s.toReal = (t) => { let g = segs[0]; for (const x of segs) if (t >= x.s0) g = x; return g.r0 + Math.min(t - g.s0, g.s1 - g.s0) / g.rate; };
  s.rateAt = (r) => { let g = segs[0]; for (const x of segs) if (r >= x.r0) g = x; return g.rate; };
  s.pub = s.events.map((e) => ({ ...e, t: Math.round(s.toReal(e.t) * 1000) / 1000, st: e.t, type: e.s || null, intensity: e.i ?? 0.5, who: e.who === 'a' ? 'attacker' : 'victim' }));
}

export const FINISHERS = SCENES.map(({ id, name, duration, clearance, heightClear, facing, weapon }) => ({ id, name, duration, clearance, heightClear, facing, weapon }));

function sample(track, t, out) {
  let i = 0;
  while (i < track.length - 2 && t > track[i + 1].t) i++;
  const a = track[i], b = track[i + 1];
  let u = sat((t - a.t) / Math.max(1e-4, b.t - a.t));
  u = b.e === 'in' ? u * u * u : b.e === 'out' ? 1 - (1 - u) * (1 - u) * (1 - u) : b.e === 'lin' ? u : u * u * (3 - 2 * u);
  for (const f of FIELDS) {
    const x = a[f], y = b[f];
    if (typeof x === 'number') out[f] = x + (y - x) * u;
    else { const o = out[f] || (out[f] = [0, 0, 0]); o[0] = x[0] + (y[0] - x[0]) * u; o[1] = x[1] + (y[1] - x[1]) * u; o[2] = x[2] + (y[2] - x[2]) * u; }
  }
  out._a = a; out._b = b; out._u = u;
  return out;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _tg = new THREE.Vector3(), _pole = new THREE.Vector3(), _lk = new THREE.Vector3();
const _F = new THREE.Vector3(), _N = new THREE.Vector3(), _T = new THREE.Vector3(), _gx = new THREE.Vector3(), _gy = new THREE.Vector3(), _gz = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gp = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), GRAV = 14, CARRY = [-0.3, -0.45, -1];

// One puppeteered character. role 'a' (attacker) or 'v' (victim).
function makeActor(character, role, scene) {
  const pup = character._puppet;
  const A = {
    pup, role, pose: {}, ready: false, other: null, links: (role === 'a' ? scene.la : scene.lv) || [],
    startQ: null, puppetQ: null, startPos: new THREE.Vector3(), startRot: new THREE.Quaternion(), startPivotP: new THREE.Vector3(), startPivotQ: new THREE.Quaternion(),
    h0: new THREE.Vector3(), footQ: {}, rq: new THREE.Quaternion(), rootQ: new THREE.Quaternion(), hip: new THREE.Vector3(),
    right: new THREE.Vector3(), up: new THREE.Vector3(), fw: new THREE.Vector3(), bones: new Map(),
    knife: null, gun: null, back: null, dropped: null,
  };
  A.bone = (name) => {
    let b = A.bones.get(name);
    if (b === undefined) { const m = pup.rig.model; b = m.getObjectByName('mixamorig' + name) || m.getObjectByName('mixamorig:' + name) || pup.rig.hips; A.bones.set(name, b); }
    return b;
  };
  A.init = () => {
    const rig = pup.rig, root = pup.root, pivot = pup.pivot;
    if (!rig) return false;
    A.startQ = rig.mod.map((b) => b.quaternion.clone()); A.puppetQ = rig.mod.map(() => new THREE.Quaternion());
    A.startHips = rig.hips.position.clone();
    A.startPos.copy(root.position); A.startRot.copy(root.quaternion); A.startPivotP.copy(pivot.position); A.startPivotQ.copy(pivot.quaternion);
    // measure the rest pose: hips offset from the character origin, foot orientation relative to the body
    const sp = root.position.clone(), sq = root.quaternion.clone();
    root.position.set(0, 0, 0); root.quaternion.identity(); pivot.position.set(0, 0, 0); pivot.quaternion.identity();
    rig.mod.forEach((b, i) => b.quaternion.copy(rig.rest[i])); rig.hips.position.copy(rig.hipsRest);
    root.updateMatrixWorld(true);
    A.h0.setFromMatrixPosition(rig.hips.matrixWorld); root.worldToLocal(A.h0);
    worldQuat(root, _q2).invert();
    for (const s of ['Left', 'Right']) A.footQ[s] = worldQuat(rig[s].foot, new THREE.Quaternion()).premultiply(_q2);
    const gunId = pup.gunId || 'ar', shadow = (o) => o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    if (role === 'a' && scene.weapon !== 'gun' && gunId !== 'pistol') {
      // the rifle rides across the back (muzzle up over the left shoulder) while the hands are busy
      const g = buildGun(gunId); shadow(g.root);
      _gz.set(0.42, -0.9, -0.05).normalize(); _gx.set(0, 0, 1).addScaledVector(_gz, -_gz.z).normalize(); _gy.crossVectors(_gz, _gx);
      const holder = new THREE.Group(); holder.matrixAutoUpdate = false;
      holder.matrix.copy(rig.spine[2].matrixWorld).invert().multiply(_m.makeBasis(_gx, _gy, _gz).setPosition(0.1, 1.2, 0.27));
      holder.add(g.root); rig.spine[2].add(holder); A.back = holder;
    }
    rig.mod.forEach((b, i) => b.quaternion.copy(A.startQ[i])); rig.hips.position.copy(A.startHips);
    root.position.copy(sp); root.quaternion.copy(sq);
    pup.setControlled(true); pup.gunSlot.visible = false;
    if (role === 'a' && scene.weapon === 'knife') {
      const tpl = pup.template.hand.Right, X = tpl.fL.clone().cross(tpl.pL).normalize(), Z = tpl.fL.clone().negate(), Yv = Z.clone().cross(X);
      const holder = new THREE.Group(); holder.matrixAutoUpdate = false;
      const sc = 1 / (0.01 * pup.template.scale);
      holder.matrix.makeBasis(X, Yv, Z).scale(new THREE.Vector3(sc, sc, sc)).setPosition(tpl.fL.clone().multiplyScalar(8.5).addScaledVector(tpl.pL, 3.2));
      const k = buildKnife(); shadow(k);
      holder.add(k); rig.Right.hand.add(holder); A.knife = holder;
    }
    if ((role === 'a' && scene.weapon === 'gun') || role === 'v') {
      A.gun = buildGun(gunId); shadow(A.gun.root);
      (role === 'v' && root.parent ? root.parent : root).add(A.gun.root);
    }
    if (role === 'v') {
      const prev = pup.cleanup;
      pup.cleanup = () => { prev?.(); A.gun?.root.removeFromParent(); A.gun = null; };
    }
    A.ready = true;
    return true;
  };
  const toWorld = (a, out) => out.set(a[0], a[1], a[2]).applyQuaternion(A.rq).add(A.hip);
  const dirWorld = (a, out) => out.set(a[0], a[1], a[2]).applyQuaternion(A.rq);
  const linkW = (L, st) => smooth((st - L.t[0]) / (L.in ?? 0.08)) * (1 - smooth((st - L.t[1]) / (L.out ?? 0.1)));
  // blends `target` (world) toward every active link of this limb
  function applyLinks(limb, st, target) {
    for (const L of A.links) {
      if (L.limb !== limb) continue;
      const w = linkW(L, st);
      if (w <= 1e-4) continue;
      const T = L.self ? A : A.other;
      if (!T?.ready) continue;
      _lk.set(L.off[0], L.off[1], L.off[2]).applyQuaternion(T.rq).add(_v3.setFromMatrixPosition(T.bone(L.bone).matrixWorld));
      target.lerp(_lk, w);
    }
  }
  const setGunWorld = (g, pos, q) => {
    const par = g.root.parent;
    par.updateWorldMatrix(true, false);
    g.root.position.copy(par.worldToLocal(_v3.copy(pos)));
    g.root.quaternion.copy(worldQuat(par, _q2).invert()).multiply(q);
    g.root.updateMatrixWorld(true);
  };
  function handFrame(side, fingers, palm, out) {
    _v.copy(palm).addScaledVector(fingers, -palm.dot(fingers)).normalize();
    _m.makeBasis(fingers, _v, _v2.crossVectors(fingers, _v));
    return out.setFromRotationMatrix(_m).multiply(pup.template.hand[side].frameInv);
  }

  // Phase 1: root, body transform, spine and head.  wp / wq = blend-in weights (position / heading) from the pose the
  // character had when the scene started.
  A.body = (P, origin, yaw, wp, wq) => {
    const rig = pup.rig, root = pup.root, pivot = pup.pivot;
    root.position.copy(origin); root.rotation.set(0, yaw, 0);
    _bq.setFromEuler(_e.set(-P.pitch, P.yaw, P.roll, 'YXZ'));                      // body orientation in scene space
    pivot.quaternion.copy(_bq);
    pivot.position.set(P.p[0], P.p[1], P.p[2]).sub(_v.copy(A.h0).applyQuaternion(_bq));
    if (wp < 1) { root.position.lerpVectors(A.startPos, origin, wp); pivot.position.lerpVectors(A.startPivotP, pivot.position, wp); }
    if (wq < 1) { root.quaternion.slerpQuaternions(A.startRot, root.quaternion, wq); pivot.quaternion.slerpQuaternions(A.startPivotQ, pivot.quaternion, wq); }
    rig.mod.forEach((b, i) => b.quaternion.copy(rig.rest[i])); rig.hips.position.copy(rig.hipsRest);
    root.updateMatrixWorld(true);
    worldQuat(pivot, A.rq); worldQuat(root, A.rootQ);                               // body / scene orientation in world space
    A.right.set(1, 0, 0).applyQuaternion(A.rq); A.up.set(0, 1, 0).applyQuaternion(A.rq); A.fw.set(0, 0, -1).applyQuaternion(A.rq);
    A.hip.setFromMatrixPosition(rig.hips.matrixWorld);
    if (Math.abs(P.lean) > 1e-3) { _q.setFromAxisAngle(A.right, -P.lean / 3); for (const sp of rig.spine) rotateWorld(sp, _q); }
    if (Math.abs(P.twist) > 1e-3) { _q.setFromAxisAngle(A.up, P.twist / 3); for (const sp of rig.spine) rotateWorld(sp, _q); }
    if (Math.abs(P.side) > 1e-3) { _q.setFromAxisAngle(A.fw, -P.side / 3); for (const sp of rig.spine) rotateWorld(sp, _q); }
    if (Math.abs(P.hy) > 1e-3) rotateWorld(rig.neck, _q.setFromAxisAngle(A.up, P.hy * 0.5));
    if (Math.abs(P.head) > 1e-3 || Math.abs(P.hy) > 1e-3 || Math.abs(P.hz) > 1e-3) {
      _q.setFromAxisAngle(A.up, P.hy * 0.5).multiply(_q2.setFromAxisAngle(A.right, -P.head)).multiply(_q2.setFromAxisAngle(A.fw, -P.hz));
      rotateWorld(rig.head, _q);
    }
  };
  // Phase 2: legs and arms (IK), contact links, held gun.  st = scene time.
  A.limbs = (P, st) => {
    const rig = pup.rig, root = pup.root, a = P._a, b = P._b, u = P._u;
    for (const [s, key, wk, pk] of [['Left', 'fl', 'wl', 'kl'], ['Right', 'fr', 'wr', 'kr']]) {
      const L = rig[s];
      // each key's ankle target is in scene space (planted) or in the body frame: resolve both, then blend
      const ka = a[key], kb = b[key];
      if (a[wk]) root.localToWorld(_tg.set(ka[0], ka[1], ka[2])); else toWorld(ka, _tg);
      if (b[wk]) root.localToWorld(_v.set(kb[0], kb[1], kb[2])); else toWorld(kb, _v);
      _tg.lerp(_v, u);
      applyLinks(key, st, _tg);
      dirWorld(P[pk], _pole);
      solveTwoBone(L.up, L.leg, L.foot, _tg, _pole);
      // planted feet stay flat on the ground (heading follows the body), free feet follow the whole body
      _q.copy(A.rq);
      if (P[wk] > 1e-3) _q.slerp(_q2.copy(A.rootQ).multiply(_bq.setFromAxisAngle(Y, P.yaw)), P[wk]);
      setWorldQuat(L.foot, _q.multiply(A.footQ[s]));
    }
    let gunOn = false;
    if (A.gun && A.role === 'a') {
      // held gun: muzzle along gd, right hand on the grip, left under the handguard (unless lf frees it)
      const an = A.gun.anchors;
      dirWorld(P.gd, _gz).normalize().negate(); dirWorld(P.gu, _gy);
      _gx.crossVectors(_gy, _gz); if (_gx.lengthSq() < 1e-4) _gx.copy(A.right); _gx.normalize(); _gy.crossVectors(_gz, _gx);
      _gq.setFromRotationMatrix(_m.makeBasis(_gx, _gy, _gz));
      toWorld(P.gp, _gp).sub(_v.copy(an.gripR).applyQuaternion(_gq));
      setGunWorld(A.gun, _gp, _gq);
      gunOn = true;
    }
    for (const [s, key, pk, sx] of [['Left', 'hl', 'el', -1], ['Right', 'hr', 'er', 1]]) {
      const L = rig[s];
      toWorld(P[key], _tg);
      let grip = 0;
      if (gunOn) {
        const an = A.gun.anchors;
        if (s === 'Right') {
          _F.copy(_gz).multiplyScalar(-0.9).addScaledVector(_gy, 0.3).addScaledVector(_gx, -0.25).normalize(); _N.copy(_gx).negate();
          _tg.copy(an.gripR).applyQuaternion(_gq).add(_gp).addScaledVector(_F, -0.075).addScaledVector(_gx, 0.03); grip = 1;
        } else {
          _F.copy(_gx).multiplyScalar(0.75).addScaledVector(_gz, -0.5).addScaledVector(_gy, 0.35).normalize(); _N.copy(_gy);
          _v.copy(an.gripL).applyQuaternion(_gq).add(_gp).addScaledVector(_F, -0.08).addScaledVector(_N, -0.025);
          grip = 1 - sat(P.lf); _tg.lerp(_v, grip);
        }
      }
      applyLinks(key, st, _tg);
      dirWorld(P[pk], _pole);
      solveTwoBone(L.arm, L.fore, L.hand, _tg, _pole);
      if (grip > 0.5) { setWorldQuat(L.hand, handFrame(s, _F, _N, _q)); continue; }
      _F.setFromMatrixPosition(L.hand.matrixWorld).sub(_v.setFromMatrixPosition(L.fore.matrixWorld)).normalize();
      if (s === 'Right' && A.knife) {
        // fist around the knife: blade (thumb side) along kd, knuckles along the forearm
        dirWorld(P.kd, _T).normalize();
        _F.addScaledVector(_T, -_F.dot(_T));
        if (_F.lengthSq() < 1e-4) _F.copy(A.fw).addScaledVector(_T, -A.fw.dot(_T));
        _F.normalize(); _N.crossVectors(_T, _F);
      } else { _N.copy(A.up).negate().addScaledVector(A.right, -sx * 0.6); _N.addScaledVector(_F, -_N.dot(_F)).normalize(); }
      _m.makeBasis(_F, _N, _v3.crossVectors(_F, _N));
      setWorldQuat(L.hand, _q.setFromRotationMatrix(_m).multiply(pup.template.hand[s].frameInv));
    }
  };
  A.blend = (w) => { if (w < 1) pup.rig.mod.forEach((b, i) => { A.puppetQ[i].copy(b.quaternion); b.quaternion.copy(A.startQ[i]).slerp(A.puppetQ[i], w); b.updateWorldMatrix(false, true); }); };
  // The victim's weapon: carried in the right hand, then let go at scene.drop (ballistic fall, comes to rest on its side).
  A.victimGun = (st, origin, oq) => {
    const g = A.gun; if (!g) return;
    const rig = pup.rig, an = g.anchors, d = A.dropped;
    if (st < scene.drop || !d) {
      dirWorld(CARRY, _gz).normalize().negate();
      _gx.copy(A.right).addScaledVector(_gz, -A.right.dot(_gz)).normalize(); _gy.crossVectors(_gz, _gx);
      _gq.setFromRotationMatrix(_m.makeBasis(_gx, _gy, _gz));
      _gp.setFromMatrixPosition(rig.Right.hand.matrixWorld).addScaledVector(_gz, -0.07).sub(_v.copy(an.gripR).applyQuaternion(_gq));
      setGunWorld(g, _gp, _gq);
      if (st >= scene.drop) {
        const v0 = new THREE.Vector3(0.9, 0.5, -0.25).applyQuaternion(oq), gy = origin.y + 0.04;
        const flat = new THREE.Quaternion();
        _gz.y = 0; if (_gz.lengthSq() < 1e-3) _gz.set(1, 0, 0); _gz.normalize(); _gx.set(0, 1, 0); _gy.crossVectors(_gz, _gx);
        flat.setFromRotationMatrix(_m.makeBasis(_gx, _gy, _gz));
        const c = _gp.clone().add(_v.set(0, 0, -0.15).applyQuaternion(_gq)), h = Math.max(0, c.y - gy);     // rough centre of the gun
        A.dropped = { p0: c, q0: _gq.clone(), v0, flat, gy, th: (v0.y + Math.sqrt(v0.y * v0.y + 2 * GRAV * h)) / GRAV };
      }
      return;
    }
    const tau = st - scene.drop, tf = Math.min(tau, d.th), k = smooth(tau / d.th);
    _gp.copy(d.p0).addScaledVector(d.v0, tf); _gp.y = d.p0.y + d.v0.y * tf - 0.5 * GRAV * tf * tf;
    if (tau > d.th) { const s = (1 - Math.exp(-9 * (tau - d.th))) * 0.1; _gp.x += d.v0.x * s; _gp.z += d.v0.z * s; _gp.y = d.gy + Math.abs(Math.sin((tau - d.th) * 18)) * 0.05 * Math.exp(-9 * (tau - d.th)); }
    _gq.copy(d.q0).slerp(d.flat, k);
    _gp.sub(_v.set(0, 0, -0.15).applyQuaternion(_gq));
    setGunWorld(g, _gp, _gq);
  };
  A.dispose = () => {
    A.knife?.removeFromParent(); A.back?.removeFromParent(); A.knife = A.back = null;
    if (A.role === 'a') { A.gun?.root.removeFromParent(); A.gun = null; }
  };
  return A;
}

// Where a character can stand at the end of a scene: `spot` pulled back toward the scene origin if world geometry is in
// the way (castWorld(origin, dir, maxDist) -> { distance } | null, as in src/game/hitscan.js). Returns a new Vector3.
export function clearSpot(castWorld, origin, spot) {
  const out = new THREE.Vector3(spot.x, origin.y, spot.z), from = new THREE.Vector3(), dir = new THREE.Vector3(out.x - origin.x, 0, out.z - origin.z);
  const d = dir.length();
  if (d < 1e-3) return out;
  dir.divideScalar(d);
  let free = d;
  for (const y of [0.5, 1.3]) { const h = castWorld(from.set(origin.x, origin.y + y, origin.z), dir, d + 0.45); if (h) free = Math.min(free, Math.max(0, h.distance - 0.45)); }
  return out.set(origin.x + dir.x * free, origin.y, origin.z + dir.z * free);
}

// createFinisher({ id, attacker, victim }): id = FINISHERS id or index. Call setOrigin(), then update(t) every frame with
// t = real seconds since the start (do not move either character's object3D yourself meanwhile; character.update(dt)
// may keep being called, it idles while a finisher has control). When t >= duration call finish().
export function createFinisher({ id = 0, attacker, victim }) {
  const scene = typeof id === 'number' ? SCENES[((id % SCENES.length) + SCENES.length) % SCENES.length] : SCENES.find((s) => s.id === id) || SCENES[0];
  const A = makeActor(attacker, 'a', scene), V = makeActor(victim, 'v', scene);
  A.other = V; V.other = A;
  const origin = new THREE.Vector3(), oq = new THREE.Quaternion();
  let yaw = 0, finished = false, lastT = -1;
  const shotYaw = new Array(scene.shots).fill(0), _sq = new THREE.Quaternion();
  const end = { position: new THREE.Vector3(), yaw: 0 }, start = { position: new THREE.Vector3(), yaw: 0 };
  const _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _c0 = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3();
  const focus = (k, out) => {
    if (k.tgt) return out.set(k.tgt[0], k.tgt[1], k.tgt[2]).applyQuaternion(oq).add(origin);
    if (!A.ready || !V.ready) return out.set(0, 1, 0).add(origin);
    out.setFromMatrixPosition(V.bone('Spine2').matrixWorld).lerp(_ca.setFromMatrixPosition(A.bone('Spine2').matrixWorld), k.f); out.y += k.ty;
    return out;
  };
  const api = {
    id: scene.id, name: scene.name, duration: scene.duration, events: scene.pub, cameraRadius: scene.cameraRadius,
    clearance: scene.clearance, heightClear: scene.heightClear, weapon: scene.weapon,
    // Where the attacker stands when the scene starts / ends (world space); set by setOrigin(). Put the player at
    // attackerEnd afterwards.
    attackerEnd: end, attackerStart: start,
    // position = victim's feet (world), yaw = scene heading (the attacker comes in along -z of that heading)
    setOrigin(position, yawRad = 0) {
      origin.copy(position); yaw = yawRad; oq.setFromAxisAngle(Y, yaw);
      end.position.set(scene.end.p[0], 0, scene.end.p[2]).applyQuaternion(oq).add(origin); end.yaw = yaw + scene.end.yaw;
      const p0 = scene.a[0].p; start.position.set(p0[0], 0, p0[2]).applyQuaternion(oq).add(origin); start.yaw = yaw;
    },
    /** Scene time (choreography clock) at real time t, and the playback rate there (< 1 during a slow-motion beat). */
    sceneTime: (t) => scene.toScene(Math.min(Math.max(t, 0), scene.duration)),
    rate: (t) => scene.rateAt(Math.min(Math.max(t, 0), scene.duration)),
    // Poses both characters at real time t (seconds). Blends in from their current poses over the first 0.15-0.3 s.
    update(t) {
      if (finished) return;
      if (!A.ready && !A.init()) return;
      if (!V.ready && !V.init()) return;
      lastT = t = Math.min(Math.max(t, 0), scene.duration);
      const st = scene.toScene(t), w = smooth(t / 0.15);
      sample(scene.a, st, A.pose); sample(scene.v, st, V.pose);
      A.pose.lean += Math.sin(t * 4.4) * 0.012;                                        // breathing
      A.body(A.pose, origin, yaw, smooth(t / 0.2), smooth(t / 0.2)); V.body(V.pose, origin, yaw, w, smooth(t / 0.3));
      A.limbs(A.pose, st); V.limbs(V.pose, st);
      A.blend(w); V.blend(w);
      V.victimGun(st, origin, oq);
      V.pup.tag.visible = false; A.pup.tag.visible = false;
    },
    // Cinematic camera at real time t, world space: { pos, target, fov, roll }. Cuts, spline moves, punch-in and shake
    // are included; call it after update(t).
    camera(t, out = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, roll: 0 }) {
      t = Math.min(Math.max(t, 0), scene.duration);
      const k = scene.cam, st = scene.toScene(t); let i = 0;
      while (i < k.length - 2 && st >= k[i + 1].t) i++;
      const a = k[i], b = k[i + 1], u = sat((st - a.t) / Math.max(1e-4, b.t - a.t)), us = u * u * (3 - 2 * u);
      const p0 = a.cut || i === 0 ? a : k[i - 1], p3 = i + 2 >= k.length || k[i + 2].cut ? b : k[i + 2];
      _c0.fromArray(p0.pos); _c1.fromArray(a.pos); _c2.fromArray(b.pos); _c3.fromArray(p3.pos);
      const u2 = u * u, u3 = u2 * u;                                                    // Catmull-Rom through the shot's keys
      out.pos.set(0, 0, 0).addScaledVector(_c0, -0.5 * u3 + u2 - 0.5 * u).addScaledVector(_c1, 1.5 * u3 - 2.5 * u2 + 1).addScaledVector(_c2, -1.5 * u3 + 2 * u2 + 0.5 * u).addScaledVector(_c3, 0.5 * u3 - 0.5 * u2);
      if (shotYaw[b.shot]) out.pos.applyQuaternion(_sq.setFromAxisAngle(Y, shotYaw[b.shot]));
      out.pos.applyQuaternion(oq).add(origin);
      focus(a, out.target).lerp(focus(b, _cb), us);
      out.fov = a.fov + (b.fov - a.fov) * us; out.roll = a.roll + (b.roll - a.roll) * us;
      for (const e of scene.pub) {
        const d = t - e.t;
        if (d < 0 || d > 0.6) continue;
        if (e.punch) out.fov -= 5 * e.punch * Math.exp(-d * 7);
        if (e.shake) {
          const s = e.shake * Math.exp(-d * 11);
          out.pos.x += Math.sin(t * 83 + 1) * 0.035 * s; out.pos.y += Math.sin(t * 71) * 0.045 * s; out.pos.z += Math.sin(t * 67 + 2) * 0.035 * s;
          out.roll += Math.sin(t * 59 + 0.5) * 0.02 * s;
        }
      }
      return out;
    },
    // Walls nearby: swing each camera shot around the scene (in 45 degree steps, smallest swing first) to where its
    // whole move has a clear line to the fight. castWorld(origin, dir, maxDist) -> { distance } | null. Call after setOrigin().
    fitCamera(castWorld) {
      const from = _c0.copy(origin); from.y += 1.2;
      for (let sh = 0; sh < scene.shots; sh++) {
        let best = 0, bestScore = -1;
        for (const ang of [0, 0.785, -0.785, 1.571, -1.571, 2.356, -2.356, 3.1416]) {
          let score = 1;
          for (const k of scene.cam) {
            if (k.shot !== sh) continue;
            _c1.fromArray(k.pos).applyQuaternion(_sq.setFromAxisAngle(Y, ang)).applyQuaternion(oq).add(origin).sub(from);
            const d = _c1.length(), h = castWorld(from, _c1.divideScalar(d), d + 0.5);
            if (h) score = Math.min(score, Math.max(0, h.distance - 0.5) / d);
          }
          if (score > bestScore + 0.08) { bestScore = score; best = ang; }
          if (bestScore >= 0.999) break;
        }
        shotYaw[sh] = best;
      }
    },
    // World position of a victim (or attacker) bone, for placing effects from the events timeline.
    bonePosition(bone, out = new THREE.Vector3(), who = 'victim') {
      const T = who === 'attacker' ? A : V;
      return T.ready ? out.setFromMatrixPosition(T.bone(bone).matrixWorld) : out.copy(origin);
    },
    // Hands the attacker back to normal animation (standing at attackerEnd) and leaves the victim lying where it fell
    // (with its dropped weapon) until victim.reset() / dispose().
    finish() {
      if (finished) return;
      if (A.ready && V.ready && lastT < scene.duration) api.update(scene.duration);
      finished = true;
      if (A.ready) {
        A.dispose();
        A.pup.setControlled(false);
        A.pup.root.position.copy(end.position); A.pup.root.rotation.set(0, end.yaw, 0);
      }
      if (V.ready) V.pup.tag.visible = false;       // stays controlled (frozen in the final pose) until reset()
    },
    get finished() { return finished; },
  };
  return api;
}
