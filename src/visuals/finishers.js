// Cinematic melee finishers (original choreography). Two characters from createCharacter() are puppeteered with a
// small pose rig: hips transform + spine lean/twist + four IK limbs, keyframed in "scene space".
//
// Scene space: the victim starts at the origin facing -z; +x is the victim's right; metres. setOrigin(position, yaw)
// places the scene in the world (position = victim's feet, yaw = victim's facing, same convention as object3D.rotation.y).
// Nothing here needs props or walls. Each FINISHERS entry lists the free space the scene needs:
//   clearance   radius (m) around the origin that must be free of walls (covers the attacker's approach and landing)
//   heightClear vertical space (m) above the ground that must be free (flips / leaps)
import * as THREE from 'three';
import { rotateWorld, setWorldQuat, solveTwoBone, worldQuat } from './character.js';
import { buildKnife } from './weapons.js';

const D = {   // default standing pose (body frame: +x right, +y up, -z forward, origin at the hips)
  p: [0, 1.0, 0], yaw: 0, pitch: 0, roll: 0, lean: 0, twist: 0, head: 0,
  hl: [-0.3, -0.22, -0.06], hr: [0.3, -0.22, -0.06], fl: [-0.11, -0.9, 0], fr: [0.11, -0.9, 0], kd: [0, 0.35, -1],
};
const FWD = [-0.3, 1.5, -0.3], FWDR = [0.3, 1.5, -0.3];

// Keys: { t, e?: 'in' | 'out' (ease into this key; default smooth), ...pose fields (omitted fields carry over) }
// pitch > 0 tips the body forward (face-down = +PI/2, on the back = -PI/2); lean bends the spine forward.
const SCENES = [
  {
    id: 'backstab', name: 'Silent Blade', duration: 2.0, clearance: 2.2, heightClear: 2.2,
    a: [
      { t: 0, p: [0.15, 1.0, 1.35] },
      { t: 0.35, p: [0.1, 0.94, 0.58], lean: 0.12, hl: [-0.18, 0.42, -0.45], hr: [0.38, 0.12, 0.22], kd: [0, 0.2, -1] },
      { t: 0.5, p: [0.08, 0.95, 0.44], hl: [-0.14, 0.5, -0.42] },
      { t: 0.72, e: 'in', p: [0.06, 0.95, 0.4], lean: 0.2, twist: -0.25, hr: [0.1, 0.22, -0.42], kd: [0, 0.1, -1] },
      { t: 1.05, hr: [0.08, 0.26, -0.44], twist: -0.3 },
      { t: 1.4, p: [0.12, 1.0, 0.62], lean: 0, twist: 0, hl: [-0.3, -0.2, -0.1], hr: [0.36, 0.0, 0.08], kd: [0, 0.6, -1] },
      { t: 2.0, p: [0.15, 1.0, 0.78], hr: [0.32, -0.2, -0.05], kd: [0, 1, -0.4] },
    ],
    v: [
      { t: 0 },
      { t: 0.45 },
      { t: 0.55, p: [0, 1.0, 0.05], lean: -0.16, head: -0.4, hl: [-0.3, 0.3, -0.28], hr: [0.3, 0.32, -0.28] },
      { t: 0.75, e: 'in', p: [0, 1.03, 0.02], lean: -0.34, head: -0.55, hl: [-0.36, 0.38, -0.2], hr: [0.36, 0.36, -0.2] },
      { t: 1.05, lean: -0.3 },
      { t: 1.45, p: [0, 0.56, -0.05], lean: 0.25, head: 0.4, hl: [-0.28, -0.3, -0.1], hr: [0.28, -0.3, -0.1], fl: [-0.16, -0.46, 0.34], fr: [0.16, -0.46, 0.34] },
      { t: 1.9, e: 'in', p: [0, 0.17, -0.55], pitch: 1.5, lean: 0, head: 0.1, hl: [-0.34, 0.45, -0.05], hr: [0.3, 0.2, -0.05], fl: [-0.14, -0.9, 0.02], fr: [0.16, -0.9, 0.02] },
      { t: 2.0, p: [0, 0.16, -0.55] },
    ],
    cam: [
      { t: 0, pos: [1.9, 1.65, 2.9], tgt: [0, 1.2, 0.4], fov: 55 },
      { t: 0.75, pos: [2.2, 1.3, 0.5], tgt: [0, 1.2, 0.15], fov: 44 },
      { t: 1.3, pos: [2.3, 1.1, -0.4], tgt: [0, 1.0, 0.1], fov: 44 },
      { t: 2.0, pos: [1.9, 0.75, -2.3], tgt: [0, 0.5, -0.2], fov: 50 },
    ],
    events: [{ t: 0.5, type: 'whoosh', bone: 'LeftHand' }, { t: 0.72, type: 'impact', bone: 'Spine1' }, { t: 0.76, type: 'blood', bone: 'Spine1' }, { t: 1.9, type: 'thud', bone: 'Hips' }],
    end: { p: [0.15, 0, 0.78], yaw: 0 },
  },
  {
    id: 'flipkick', name: 'Reaper Flip', duration: 2.2, clearance: 3.2, heightClear: 3.0,
    a: [
      { t: 0, p: [0, 1.0, 2.5] },
      { t: 0.3, p: [0, 0.8, 1.7], lean: 0.35, hl: [-0.3, -0.1, 0.25], hr: [0.3, -0.1, 0.25], fl: [-0.12, -0.72, 0.1], fr: [0.12, -0.72, -0.1] },
      { t: 0.5, p: [0, 1.75, 1.3], pitch: 3.1, lean: 0.5, hl: [-0.3, 0.1, -0.3], hr: [0.3, 0.1, -0.3], fl: [-0.12, -0.5, -0.25], fr: [0.12, -0.5, -0.25] },
      { t: 0.7, e: 'in', p: [0, 1.4, 0.84], pitch: 5.7, lean: -0.1, hl: [-0.45, 0.2, 0.2], hr: [0.45, 0.2, 0.2], fl: [-0.1, -0.55, -0.72], fr: [0.1, -0.6, -0.72] },
      { t: 0.98, p: [0, 0.62, -0.5], pitch: 6.2832, lean: 0.3, hl: [-0.35, 0.0, -0.3], hr: [0.35, 0.05, -0.2], fl: [-0.3, -0.52, 0.12], fr: [0.3, -0.52, 0.12] },
      { t: 1.18, p: [0, 0.7, -0.5], lean: 0.05, hl: [0.06, 0.72, -0.14], hr: [0.2, 0.78, -0.1], kd: [0, -1, -0.2] },
      { t: 1.35, e: 'in', p: [0, 0.5, -0.55], lean: 0.75, hl: [0.0, -0.18, -0.42], hr: [0.06, -0.24, -0.46], kd: [0, -1, -0.3] },
      { t: 1.65, lean: 0.8 },
      { t: 2.2, p: [0, 1.0, -0.35], lean: 0, hl: [-0.3, -0.22, -0.06], hr: [0.32, -0.2, -0.05], fl: [-0.2, -0.9, 0], fr: [0.2, -0.9, 0], kd: [0, 1, -0.4] },
    ],
    v: [
      { t: 0 }, { t: 0.66 },
      { t: 0.84, e: 'in', p: [0, 0.95, -0.4], pitch: 0.55, lean: 0.3, head: -0.35, hl: [-0.4, 0.3, -0.35], hr: [0.4, 0.3, -0.35] },
      { t: 1.08, p: [0, 0.18, -1.05], pitch: 1.52, lean: 0, head: 0.1, hl: [-0.32, 0.5, -0.05], hr: [0.34, 0.42, -0.05], fl: [-0.16, -0.9, 0.02], fr: [0.14, -0.9, 0.02] },
      { t: 1.35 }, { t: 1.4, p: [0, 0.14, -1.05] }, { t: 1.55, p: [0, 0.17, -1.05] }, { t: 2.2 },
    ],
    cam: [
      { t: 0, pos: [3.3, 1.3, 2.4], tgt: [0, 1.1, 1.6], fov: 55 },
      { t: 0.7, pos: [3.2, 1.5, 0.4], tgt: [0, 1.3, 0.3], fov: 50 },
      { t: 1.35, pos: [1.9, 1.5, -2.7], tgt: [0, 0.4, -0.8], fov: 44 },
      { t: 2.2, pos: [1.5, 1.8, -3.1], tgt: [0, 0.7, -0.6], fov: 48 },
    ],
    events: [{ t: 0.4, type: 'whoosh', bone: 'Hips' }, { t: 0.72, type: 'impact', bone: 'Spine2' }, { t: 1.08, type: 'thud', bone: 'Hips' }, { t: 1.35, type: 'impact', bone: 'Spine1' }, { t: 1.37, type: 'blood', bone: 'Spine1' }],
    end: { p: [0, 0, -0.35], yaw: 0 },
  },
  {
    id: 'throw', name: 'Shoulder Slam', duration: 2.1, clearance: 2.6, heightClear: 2.6,
    a: [
      { t: 0, p: [0.2, 1.0, 1.25] },
      { t: 0.35, p: [0.12, 0.95, 0.4], hl: [-0.1, 0.42, -0.42], hr: [0.22, 0.4, -0.4] },
      { t: 0.6, p: [0, 0.8, -0.32], lean: 0.4, hl: [0.1, 0.5, 0.12], hr: [0.22, 0.48, 0.08], fl: [-0.2, -0.72, 0.05], fr: [0.2, -0.72, 0.05] },
      { t: 0.86, e: 'in', p: [0, 0.7, -0.42], lean: 0.95, hl: [0.0, -0.05, -0.5], hr: [0.12, -0.05, -0.5], fl: [-0.22, -0.62, 0.1], fr: [0.22, -0.62, 0.1] },
      { t: 1.1, lean: 1.05, hl: [-0.02, -0.4, -0.55], hr: [0.1, -0.4, -0.55] },
      { t: 1.4, p: [0, 0.76, -0.45], lean: 0.25, hl: [-0.2, -0.1, -0.35], hr: [0.24, 0.66, -0.16], kd: [0, -1, -0.25] },
      { t: 1.6, e: 'in', p: [0, 0.56, -0.5], lean: 0.85, hr: [0.05, -0.3, -0.58], kd: [0, -1, -0.3] },
      { t: 1.8 },
      { t: 2.1, p: [0, 1.0, -0.4], lean: 0, hl: [-0.3, -0.22, -0.06], hr: [0.32, -0.2, -0.05], fl: [-0.18, -0.9, 0], fr: [0.18, -0.9, 0], kd: [0, 1, -0.4] },
    ],
    v: [
      { t: 0 }, { t: 0.4 },
      { t: 0.6, p: [0, 1.06, -0.12], lean: 0.3, hl: [-0.3, 0.1, -0.3], hr: [0.18, 0.5, -0.42] },
      { t: 0.86, p: [0, 1.6, -0.6], pitch: 2.4, lean: 0.3, hl: [-0.4, 0.4, -0.2], hr: [0.2, 0.6, -0.3], fl: [-0.16, -0.6, -0.2], fr: [0.16, -0.7, 0.1] },
      { t: 1.1, e: 'in', p: [0, 0.18, -1.3], pitch: 4.712, lean: 0, head: -0.15, hl: [-0.55, 0.25, 0.0], hr: [0.55, 0.3, 0.0], fl: [-0.2, -0.86, -0.04], fr: [0.22, -0.8, -0.14] },
      { t: 1.2, p: [0, 0.24, -1.3] }, { t: 1.35, p: [0, 0.17, -1.3] }, { t: 1.6 },
      { t: 1.66, p: [0, 0.13, -1.3], head: -0.35 }, { t: 1.85, p: [0, 0.17, -1.3], head: 0.1 }, { t: 2.1 },
    ],
    cam: [
      { t: 0, pos: [-2.7, 1.5, 1.9], tgt: [0, 1.1, 0.4], fov: 55 },
      { t: 0.86, pos: [-3.1, 1.2, -0.5], tgt: [0, 1.25, -0.5], fov: 50 },
      { t: 1.12, pos: [-2.5, 0.55, -1.7], tgt: [0, 0.4, -1.0], fov: 46 },
      { t: 2.1, pos: [-1.9, 1.5, -3.1], tgt: [0, 0.6, -0.9], fov: 48 },
    ],
    events: [{ t: 0.7, type: 'whoosh', bone: 'Hips' }, { t: 1.1, type: 'thud', bone: 'Spine1' }, { t: 1.6, type: 'impact', bone: 'Spine2' }, { t: 1.62, type: 'blood', bone: 'Spine2' }],
    end: { p: [0, 0, -0.4], yaw: 0 },
  },
  {
    id: 'backhand', name: 'Spin Cutter', duration: 1.9, clearance: 2.4, heightClear: 2.2,
    a: [
      { t: 0, p: [0.1, 1.0, 1.35] },
      { t: 0.3, p: [0, 1.0, 0.95], hl: [-0.2, 0.32, -0.46] },
      { t: 0.45, yaw: -1.4, twist: -0.5, p: [0, 0.96, 0.92], hl: [-0.5, 0.36, 0.1] },
      { t: 0.7, e: 'in', yaw: -5.7, twist: 0.4, hl: [-0.62, 0.5, -0.3] },
      { t: 0.82, yaw: -6.2832, twist: 0, hl: [-0.4, 0.2, -0.2] },
      { t: 0.96, p: [0, 0.95, 0.85], hr: [0.38, 0.26, 0.2], kd: [0, 0.15, -1] },
      { t: 1.1, e: 'in', p: [0, 0.92, 0.58], lean: 0.25, hr: [0.05, 0.32, -0.6], hl: [-0.3, 0.1, -0.25], kd: [0, 0.1, -1] },
      { t: 1.4 },
      { t: 1.6, p: [0, 0.98, 0.68], lean: 0, hr: [0.32, 0.1, 0.0] },
      { t: 1.9, p: [0, 1.0, 0.72], hl: [-0.3, -0.22, -0.06], hr: [0.32, -0.2, -0.05], kd: [0, 1, -0.4] },
    ],
    v: [
      { t: 0 }, { t: 0.25 },
      { t: 0.45, yaw: 3.1416, hl: [-0.3, 0.25, -0.3], hr: [0.3, 0.25, -0.3] },
      { t: 0.66 },
      { t: 0.76, e: 'in', p: [0.12, 0.96, -0.12], twist: 0.7, roll: 0.16, head: 0.2, hl: [-0.45, 0.3, -0.1], hr: [0.4, 0.1, -0.3] },
      { t: 0.98, p: [0.05, 1.0, -0.1], twist: 0.2, roll: 0 },
      { t: 1.12, e: 'in', p: [0, 0.97, -0.14], lean: 0.3, twist: 0, head: 0.3, hl: [-0.15, 0.2, -0.35], hr: [0.15, 0.2, -0.35] },
      { t: 1.4, p: [0, 0.95, -0.16] },
      { t: 1.82, e: 'in', p: [0, 0.18, -0.98], pitch: -1.5, lean: 0, head: -0.1, hl: [-0.55, 0.25, 0], hr: [0.5, 0.35, 0], fl: [-0.2, -0.86, -0.04], fr: [0.2, -0.8, -0.14] },
      { t: 1.9 },
    ],
    cam: [
      { t: 0, pos: [2.5, 1.5, 2.4], tgt: [0, 1.2, 0.6], fov: 55 },
      { t: 0.7, pos: [2.9, 1.4, 0.5], tgt: [0, 1.3, 0.35], fov: 48 },
      { t: 1.1, pos: [2.2, 1.3, -0.7], tgt: [0, 1.2, 0.2], fov: 44 },
      { t: 1.9, pos: [2.3, 1.0, -2.3], tgt: [0, 0.5, -0.5], fov: 50 },
    ],
    events: [{ t: 0.55, type: 'whoosh', bone: 'LeftHand' }, { t: 0.7, type: 'impact', bone: 'Head' }, { t: 1.0, type: 'whoosh', bone: 'RightHand' }, { t: 1.1, type: 'impact', bone: 'Spine2' }, { t: 1.12, type: 'blood', bone: 'Spine2' }, { t: 1.82, type: 'thud', bone: 'Hips' }],
    end: { p: [0, 0, 0.72], yaw: 0 },
  },
  {
    id: 'knee', name: 'Hammer Knee', duration: 2.2, clearance: 3.0, heightClear: 2.7,
    a: [
      { t: 0, p: [-1.3, 1.0, 2.1], yaw: -0.5 },
      { t: 0.3, p: [-0.8, 0.78, 1.35], lean: 0.3, hl: [-0.3, -0.05, 0.25], hr: [0.3, 0.0, -0.3], fl: [-0.12, -0.7, 0.15], fr: [0.12, -0.7, -0.15] },
      { t: 0.52, p: [-0.45, 1.55, 0.8], lean: 0.1, pitch: -0.15, hl: [-0.4, 0.45, 0.05], hr: [0.4, 0.5, 0.0], fl: [-0.12, -0.75, 0.25], fr: [0.12, -0.35, -0.3] },
      { t: 0.72, e: 'in', p: [-0.2, 1.42, 0.4], pitch: 0.25, lean: 0.2, hl: [-0.25, 0.2, -0.4], hr: [0.25, 0.2, -0.4], fl: [-0.12, -0.8, 0.35], fr: [0.1, -0.28, -0.42] },
      { t: 1.0, p: [-0.05, 0.6, -0.5], yaw: -0.2, pitch: 0, lean: 0.4, hl: [-0.3, -0.1, -0.35], hr: [0.3, 0.0, -0.2], fl: [-0.3, -0.5, 0.15], fr: [0.28, -0.5, 0.05] },
      { t: 1.25, p: [-0.05, 0.72, -0.55], yaw: 0, lean: 0.05, hl: [0.05, 0.7, -0.14], hr: [0.2, 0.78, -0.1], kd: [0, -1, -0.2] },
      { t: 1.45, e: 'in', p: [-0.02, 0.5, -0.6], lean: 0.75, hl: [0, -0.18, -0.42], hr: [0.06, -0.24, -0.46], kd: [0, -1, -0.3] },
      { t: 1.75 },
      { t: 2.2, p: [0, 1.0, -0.4], lean: 0, hl: [-0.3, -0.22, -0.06], hr: [0.32, -0.2, -0.05], fl: [-0.2, -0.9, 0], fr: [0.2, -0.9, 0], kd: [0, 1, -0.4] },
    ],
    v: [
      { t: 0 }, { t: 0.68 },
      { t: 0.84, e: 'in', p: [0.02, 0.9, -0.4], pitch: 0.5, lean: 0.35, head: -0.4, hl: [-0.42, 0.3, -0.3], hr: [0.42, 0.3, -0.3] },
      { t: 1.1, p: [0.03, 0.18, -1.1], pitch: 1.52, lean: 0, head: 0.1, hl: [-0.34, 0.5, -0.05], hr: [0.3, 0.4, -0.05], fl: [-0.16, -0.9, 0.02], fr: [0.14, -0.9, 0.02] },
      { t: 1.45 }, { t: 1.5, p: [0.03, 0.14, -1.1] }, { t: 1.65, p: [0.03, 0.17, -1.1] }, { t: 2.2 },
    ],
    cam: [
      { t: 0, pos: [2.2, 1.2, 3.3], tgt: [-0.6, 1.2, 1.2], fov: 55 },
      { t: 0.6, pos: [2.6, 0.9, 2.0], tgt: [-0.3, 1.5, 0.6], fov: 50 },
      { t: 0.84, pos: [2.7, 1.3, 0.6], tgt: [0, 1.2, 0.1], fov: 46 },
      { t: 1.45, pos: [2.2, 1.3, -2.4], tgt: [0, 0.4, -0.9], fov: 44 },
      { t: 2.2, pos: [1.7, 1.7, -3.0], tgt: [0, 0.7, -0.7], fov: 48 },
    ],
    events: [{ t: 0.45, type: 'whoosh', bone: 'Hips' }, { t: 0.74, type: 'impact', bone: 'Spine2' }, { t: 1.1, type: 'thud', bone: 'Hips' }, { t: 1.45, type: 'impact', bone: 'Spine1' }, { t: 1.47, type: 'blood', bone: 'Spine1' }],
    end: { p: [0, 0, -0.4], yaw: 0 },
  },
];

// Expand keys so every key carries every field.
for (const s of SCENES) for (const track of [s.a, s.v]) {
  let prev = D;
  for (const k of track) { for (const f in D) if (k[f] === undefined) k[f] = prev[f]; prev = k; }
}
for (const s of SCENES) { let pf = 50; for (const k of s.cam) { k.fov ??= pf; pf = k.fov; } s.cameraRadius = Math.max(...s.cam.map((k) => Math.hypot(k.pos[0], k.pos[2]))) + 0.3; }

export const FINISHERS = SCENES.map(({ id, name, duration, clearance, heightClear }) => ({ id, name, duration, clearance, heightClear }));

const FIELDS = Object.keys(D);
function sample(track, t, out) {
  let i = 0;
  while (i < track.length - 2 && t > track[i + 1].t) i++;
  const a = track[i], b = track[i + 1];
  let u = Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-4, b.t - a.t)));
  u = b.e === 'in' ? u * u * u : b.e === 'out' ? 1 - (1 - u) * (1 - u) : u * u * (3 - 2 * u);
  for (const f of FIELDS) {
    const x = a[f], y = b[f];
    if (typeof x === 'number') out[f] = x + (y - x) * u;
    else { const o = out[f] || (out[f] = [0, 0, 0]); o[0] = x[0] + (y[0] - x[0]) * u; o[1] = x[1] + (y[1] - x[1]) * u; o[2] = x[2] + (y[2] - x[2]) * u; }
  }
  return out;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const _h = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _tg = new THREE.Vector3(), _pole = new THREE.Vector3();
const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _F = new THREE.Vector3(), _N = new THREE.Vector3(), _T = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// One puppeteered character.
function makeActor(character, withKnife) {
  const pup = character._puppet;
  const A = { pup, pose: {}, ready: false, startQ: null, startPos: new THREE.Vector3(), startRot: new THREE.Quaternion(), startPivotP: new THREE.Vector3(), startPivotQ: new THREE.Quaternion(), h0: new THREE.Vector3(), footQ: {}, knife: null, puppetQ: null };
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
    worldQuat(root, _rq).invert();
    for (const s of ['Left', 'Right']) A.footQ[s] = worldQuat(rig[s].foot, new THREE.Quaternion()).premultiply(_rq);
    rig.mod.forEach((b, i) => b.quaternion.copy(A.startQ[i])); rig.hips.position.copy(A.startHips);
    root.position.copy(sp); root.quaternion.copy(sq);
    pup.setControlled(true); pup.gunSlot.visible = false;
    if (withKnife) {
      const tpl = pup.template.hand.Right, X = tpl.fL.clone().cross(tpl.pL).normalize(), Z = tpl.fL.clone().negate(), Yv = Z.clone().cross(X);
      const holder = new THREE.Group(); holder.matrixAutoUpdate = false;
      const sc = 1 / (0.01 * pup.template.scale);
      holder.matrix.makeBasis(X, Yv, Z).scale(new THREE.Vector3(sc, sc, sc)).setPosition(tpl.fL.clone().multiplyScalar(8.5).addScaledVector(tpl.pL, 3.2));
      const k = buildKnife(); k.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      holder.add(k); rig.Right.hand.add(holder); A.knife = holder;
    }
    A.ready = true;
    return true;
  };
  // Apply pose P with the scene placed at (origin, yaw); w = blend-in weight from the pose the character had before.
  A.apply = (P, origin, yaw, w) => {
    const rig = pup.rig, root = pup.root, pivot = pup.pivot;
    root.position.copy(origin); root.rotation.set(0, yaw, 0);
    _bq.setFromEuler(_e.set(-P.pitch, P.yaw, P.roll, 'YXZ'));                      // body orientation in scene space
    pivot.quaternion.copy(_bq);
    pivot.position.set(P.p[0], P.p[1], P.p[2]).sub(_v.copy(A.h0).applyQuaternion(_bq));
    if (w < 1) {
      root.position.lerpVectors(A.startPos, origin, w); root.quaternion.slerpQuaternions(A.startRot, root.quaternion, w);
      pivot.position.lerpVectors(A.startPivotP, pivot.position, w); pivot.quaternion.slerpQuaternions(A.startPivotQ, pivot.quaternion, w);
    }
    rig.mod.forEach((b, i) => b.quaternion.copy(rig.rest[i])); rig.hips.position.copy(rig.hipsRest);
    root.updateMatrixWorld(true);
    worldQuat(pivot, _rq);                                                          // body orientation in world space
    _right.set(1, 0, 0).applyQuaternion(_rq); _up.set(0, 1, 0).applyQuaternion(_rq); _fw.set(0, 0, -1).applyQuaternion(_rq);
    _h.setFromMatrixPosition(rig.hips.matrixWorld);
    const toWorld = (a, out) => out.set(a[0], a[1], a[2]).applyQuaternion(_rq).add(_h);
    // spine
    if (Math.abs(P.lean) > 1e-3) { _q.setFromAxisAngle(_right, -P.lean / 3); for (const sp of rig.spine) rotateWorld(sp, _q); }
    if (Math.abs(P.twist) > 1e-3) { _q.setFromAxisAngle(_up, P.twist / 3); for (const sp of rig.spine) rotateWorld(sp, _q); }
    if (Math.abs(P.head) > 1e-3) rotateWorld(rig.head, _q.setFromAxisAngle(_right, -P.head));
    // arms
    for (const [s, key, sx] of [['Left', 'hl', -1], ['Right', 'hr', 1]]) {
      const L = rig[s];
      toWorld(P[key], _tg);
      _pole.set(sx * 0.6, -0.7, 0.45).applyQuaternion(_rq);
      solveTwoBone(L.arm, L.fore, L.hand, _tg, _pole);
      _F.setFromMatrixPosition(L.hand.matrixWorld).sub(_v.setFromMatrixPosition(L.fore.matrixWorld)).normalize();
      if (s === 'Right') {
        // fist around the knife: handle (thumb side) along kd, knuckles along the forearm
        _T.set(P.kd[0], P.kd[1], P.kd[2]).normalize().applyQuaternion(_rq);
        _F.addScaledVector(_T, -_F.dot(_T));
        if (_F.lengthSq() < 1e-4) _F.copy(_fw).addScaledVector(_T, -_fw.dot(_T));
        _F.normalize(); _N.crossVectors(_T, _F);
      } else { _N.copy(_up).negate().addScaledVector(_right, 0.6); _N.addScaledVector(_F, -_N.dot(_F)).normalize(); }
      _m.makeBasis(_F, _N, _v3.crossVectors(_F, _N));
      setWorldQuat(L.hand, _q.setFromRotationMatrix(_m).multiply(pup.template.hand[s].frameInv));
    }
    // legs
    for (const [s, key, sx] of [['Left', 'fl', -1], ['Right', 'fr', 1]]) {
      const L = rig[s];
      toWorld(P[key], _tg);
      _pole.set(sx * 0.2, 0.15, -1).applyQuaternion(_rq);
      solveTwoBone(L.up, L.leg, L.foot, _tg, _pole);
      setWorldQuat(L.foot, _q.copy(_rq).multiply(A.footQ[s]));
    }
    if (w < 1) rig.mod.forEach((b, i) => { A.puppetQ[i].copy(b.quaternion); b.quaternion.copy(A.startQ[i]).slerp(A.puppetQ[i], w); });
  };
  return A;
}

// createFinisher({ id, attacker, victim }): id = FINISHERS id or index. Call setOrigin(), then update(t) every frame with
// t = seconds since the start (do not move either character's object3D yourself meanwhile; character.update(dt) may keep
// being called, it idles while a finisher has control). When t >= duration call finish().
export function createFinisher({ id = 0, attacker, victim }) {
  const scene = typeof id === 'number' ? SCENES[((id % SCENES.length) + SCENES.length) % SCENES.length] : SCENES.find((s) => s.id === id) || SCENES[0];
  const A = makeActor(attacker, true), V = makeActor(victim, false);
  const origin = new THREE.Vector3(), oq = new THREE.Quaternion();
  let yaw = 0, finished = false, lastT = 0;
  const end = { position: new THREE.Vector3(), yaw: 0 };
  const api = {
    id: scene.id, name: scene.name, duration: scene.duration, events: scene.events, cameraRadius: scene.cameraRadius,
    clearance: scene.clearance, heightClear: scene.heightClear,
    // Where the attacker stands when the scene ends (world space); set by setOrigin(). Put the player there afterwards.
    attackerEnd: end,
    // position = victim's feet (world), yaw = victim's facing (same convention as character.object3D.rotation.y)
    setOrigin(position, yawRad = 0) {
      origin.copy(position); yaw = yawRad; oq.setFromAxisAngle(Y, yaw);
      end.position.set(scene.end.p[0], 0, scene.end.p[2]).applyQuaternion(oq).add(origin); end.yaw = yaw + scene.end.yaw;
    },
    // Poses both characters at time t (seconds). Crossfades in from their current poses over the first 0.12 s.
    update(t) {
      if (finished) return;
      if (!A.ready && !A.init()) return;
      if (!V.ready && !V.init()) return;
      lastT = t = Math.min(Math.max(t, 0), scene.duration);
      const w = Math.min(1, t / 0.12);
      A.apply(sample(scene.a, t, A.pose), origin, yaw, w);
      V.apply(sample(scene.v, t, V.pose), origin, yaw, w);
      V.pup.tag.visible = false; A.pup.tag.visible = false;
    },
    // Cinematic camera at time t, world space. out = { pos: Vector3, target: Vector3, fov }.
    camera(t, out = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 }) {
      const k = scene.cam; let i = 0;
      t = Math.min(Math.max(t, 0), scene.duration);
      while (i < k.length - 2 && t > k[i + 1].t) i++;
      const a = k[i], b = k[i + 1]; let u = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))); u = u * u * (3 - 2 * u);
      out.pos.set(a.pos[0] + (b.pos[0] - a.pos[0]) * u, a.pos[1] + (b.pos[1] - a.pos[1]) * u, a.pos[2] + (b.pos[2] - a.pos[2]) * u).applyQuaternion(oq).add(origin);
      out.target.set(a.tgt[0] + (b.tgt[0] - a.tgt[0]) * u, a.tgt[1] + (b.tgt[1] - a.tgt[1]) * u, a.tgt[2] + (b.tgt[2] - a.tgt[2]) * u).applyQuaternion(oq).add(origin);
      out.fov = a.fov + (b.fov - a.fov) * u;
      return out;
    },
    // World position of a victim (or attacker) bone, for placing effects from the events timeline.
    bonePosition(bone, out = new THREE.Vector3(), who = 'victim') {
      const rig = (who === 'attacker' ? A : V).pup.rig;
      const b = rig && (rig.hips.parent.getObjectByName('mixamorig' + bone) || rig.hips);
      return b ? out.setFromMatrixPosition(b.matrixWorld) : out.copy(origin);
    },
    // Hands the attacker back to normal animation (standing at attackerEnd) and leaves the victim lying where it fell
    // until victim.reset() is called.
    finish() {
      if (finished) return;
      if (A.ready && V.ready && lastT < scene.duration) api.update(scene.duration);
      finished = true;
      if (A.ready) {
        if (A.knife) { A.knife.removeFromParent(); A.knife = null; }
        A.pup.setControlled(false);
        A.pup.root.position.copy(end.position); A.pup.root.rotation.set(0, end.yaw, 0);
      }
      if (V.ready) V.pup.tag.visible = false;       // stays controlled (frozen in the final pose) until reset()
    },
    get finished() { return finished; },
  };
  return api;
}
