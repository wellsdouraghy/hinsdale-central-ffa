// Practice range layout: a player spawn and a lane of static target dummies with clear line of sight.
import * as THREE from 'three';
import { ctfBases } from './ctf.js';

export function planPractice(world, hitscan) {
  const pts = world.spawnPoints;
  const dir = new THREE.Vector3();
  const eye = new THREE.Vector3();
  let best = null;
  // Try several spawns and headings; keep the one with the longest open sight line.
  for (let i = 0; i < Math.min(pts.length, 12); i++) {
    const sp = pts[i];
    eye.set(sp.x, sp.y + 1.6, sp.z);
    for (let k = 0; k < 16; k++) {
      const yaw = (k / 16) * Math.PI * 2;
      dir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      const hit = hitscan.castWorld(eye, dir, 110);
      const free = hit ? hit.distance : 110;
      if (!best || free > best.free) best = { sp, yaw, free };
    }
    if (best && best.free >= 100) break;
  }
  const { sp, yaw, free } = best;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const dummies = [];
  const lane = [[8, -2], [14, 3], [22, -4], [32, 2], [45, -3], [60, 4], [80, 0]];
  for (const [d, side] of lane) {
    if (d > free - 4) break;
    const p = sp.clone().addScaledVector(fwd, d).addScaledVector(right, side);
    p.y = world.groundY(p.x, p.z);
    dummies.push({ pos: p, yaw: yaw + Math.PI }); // face the player
  }
  if (dummies.length < 3) {
    // Cramped spot: place a ring of dummies around the spawn instead.
    for (let k = 0; k < 4; k++) {
      const a = yaw + (k - 1.5) * 0.5;
      const p = sp.clone().add(new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(6 + k * 2));
      p.y = world.groundY(p.x, p.z);
      dummies.push({ pos: p, yaw: a + Math.PI });
    }
  }
  return { spawn: { pos: sp.clone(), yaw }, dummies };
}

/** CTF practice: blue-team dummies guarding the blue base; the player spawns with the red team. */
export function planCtfPractice(world) {
  const bases = ctfBases(world);
  const blue = bases.blue, red = bases.red;
  const toRed = Math.atan2(-(red.x - blue.x), -(red.z - blue.z));
  const dummies = [];
  const ring = [[6, 0.4], [9, -0.7], [12, 1.3], [16, -1.6], [22, 0.1]];
  for (const [r, a] of ring) {
    const ang = toRed + a;
    const p = new THREE.Vector3(blue.x - Math.sin(ang) * r, 0, blue.z - Math.cos(ang) * r);
    p.y = world.groundY ? world.groundY(p.x, p.z) : 0;
    dummies.push({ pos: p, yaw: toRed + a * 0.3 });
  }
  return { spawn: null, dummies };
}
