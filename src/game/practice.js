// Practice range layout: a player spawn and a lane of static target dummies with clear line of sight.
import * as THREE from 'three';

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
