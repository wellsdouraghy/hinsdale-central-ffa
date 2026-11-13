// Collision meshes (merged per surface type, BVH accelerated) and spawn point selection.
import * as THREE from 'three';
import { Bucket } from './util.js';
import { SAT } from './ground.js';

export function buildCollision(ctx, group) {
  const meshes = [];
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const add = (bucket, surface, extra) => {
    if (!bucket.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bucket.pos), 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    g.computeBoundsTree();
    const m = new THREE.Mesh(g, mat);
    m.name = 'collision:' + surface; m.userData.surface = surface; Object.assign(m.userData, extra || {});
    m.matrixAutoUpdate = false; m.updateMatrixWorld(true);
    group.add(m); meshes.push(m);
    return m;
  };
  // ---- ground: 2 m cells inside the play area tagged by surface class, plus a big grass apron outside
  const names = ['grass', 'asphalt', 'concrete', 'rubber', 'dirt'];
  const gb = names.map(() => new Bucket());
  const pb = ctx.playBounds; const cell = 2;
  const x0 = Math.floor((pb.minX - 12) / cell) * cell, x1 = Math.ceil((pb.maxX + 12) / cell) * cell;
  const z0 = Math.floor((pb.minZ - 12) / cell) * cell, z1 = Math.ceil((pb.maxZ + 12) / cell) * cell;
  const nx = (x1 - x0) / cell, nz = (z1 - z0) / cell;
  const cls = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) cls[j * nx + i] = Math.max(0, names.indexOf(ctx.surfaceAt(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)));
  // greedy row merge to keep the triangle count down
  for (let j = 0; j < nz; j++) {
    let i = 0;
    while (i < nx) {
      const c = cls[j * nx + i]; let k = i + 1;
      while (k < nx && cls[j * nx + k] === c) k++;
      const ax = x0 + i * cell, bx = x0 + k * cell, az = z0 + j * cell, bz = az + cell;
      gb[c].quad([ax, 0, bz], [bx, 0, bz], [bx, 0, az], [ax, 0, az]);
      i = k;
    }
  }
  // apron (outside the play rectangle, never walked on but bullets can land there)
  const E = 1500;
  gb[0].quad([-E, 0, z0], [E, 0, z0], [E, 0, -E], [-E, 0, -E]);
  gb[0].quad([-E, 0, E], [E, 0, E], [E, 0, z1], [-E, 0, z1]);
  gb[0].quad([-E, 0, z1], [x0, 0, z1], [x0, 0, z0], [-E, 0, z0]);
  gb[0].quad([x1, 0, z1], [E, 0, z1], [E, 0, z0], [x1, 0, z0]);
  names.forEach((n, i) => add(gb[i], n, { isGround: true }));
  // ---- everything else
  for (const [surface, bucket] of ctx.B.collision) {
    const passthrough = surface.endsWith(':mesh');     // chain-link: solid for players, bullets may pass
    add(bucket, passthrough ? surface.split(':')[0] : surface, passthrough ? { bulletPassthrough: true } : null);
  }
  return meshes;
}

// Flood-fill the walkable area on a 2 m grid (horizontal ray tests between cells) and pick well-spread spawns.
export function computeSpawns(ctx, collisionMeshes, count = 32) {
  const pb = ctx.playBounds; const cell = 2, margin = 6;
  const x0 = pb.minX + margin, z0 = pb.minZ + margin;
  const nx = Math.floor((pb.maxX - pb.minX - 2 * margin) / cell), nz = Math.floor((pb.maxZ - pb.minZ - 2 * margin) / cell);
  const solids = collisionMeshes.filter((m) => !m.userData.isGround);
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  const blockedDown = (x, z) => { o.set(x, 60, z); d.set(0, -1, 0); rc.set(o, d); rc.far = 59.7; return rc.intersectObjects(solids, false).length > 0; };
  const blockedSeg = (ax, az, bx, bz) => {
    for (const y of [0.45, 1.3]) {
      o.set(ax, y, az); d.set(bx - ax, 0, bz - az); const len = d.length(); d.normalize(); rc.set(o, d); rc.far = len;
      if (rc.intersectObjects(solids, false).length > 0) return true;
    }
    return false;
  };
  const state = new Int8Array(nx * nz);  // 0 unknown, 1 reachable, -1 blocked
  const P = (i, j) => [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];
  const seeds = [[-150, 60], [0, -175], [240, 20], [60, 150]];
  const queue = [];
  for (const [sx, sz] of seeds) {
    const i = Math.floor((sx - x0) / cell), j = Math.floor((sz - z0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
    const [x, z] = P(i, j); if (blockedDown(x, z)) continue;
    if (state[j * nx + i] === 0) { state[j * nx + i] = 1; queue.push(i, j); }
  }
  let qi = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (qi < queue.length) {
    const i = queue[qi++], j = queue[qi++]; const [ax, az] = P(i, j);
    for (const [di, dj] of dirs) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const idx = b * nx + a; if (state[idx] !== 0) continue;
      const [bx, bz] = P(a, b);
      if (blockedDown(bx, bz)) { state[idx] = -1; continue; }
      if (blockedSeg(ax, az, bx, bz)) continue;   // may still be reached from another side
      state[idx] = 1; queue.push(a, b);
    }
  }
  ctx.walkGrid = { x0, z0, nx, nz, cell, state };
  // candidates: reachable cells whose 5x5 neighbourhood is reachable too (some elbow room)
  const cands = [];
  for (let j = 2; j < nz - 2; j += 1) for (let i = 2; i < nx - 2; i += 1) {
    let ok = true;
    for (let b = -2; b <= 2 && ok; b++) for (let a = -2; a <= 2; a++) if (state[(j + b) * nx + i + a] !== 1) { ok = false; break; }
    if (ok) cands.push(P(i, j));
  }
  const spawns = [];
  if (cands.length) {
    // farthest point sampling, starting near the centre of campus
    const dist = new Float32Array(cands.length).fill(Infinity);
    let cur = 0, best = Infinity;
    cands.forEach((c, k) => { const dd = Math.hypot(c[0] - 35, c[1] - 0); if (dd < best) { best = dd; cur = k; } });
    // prefer spots next to something solid (cover) by nudging the score
    const coverBonus = cands.map(([x, z]) => {
      const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell); let near = 0;
      for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && state[jj * nx + ii] === -1) near++; }
      return near > 0 ? 1.25 : 1.0;
    });
    for (let n = 0; n < count; n++) {
      const [cx, cz] = cands[cur]; spawns.push(new THREE.Vector3(cx, 0, cz));
      let bi = 0, bd = -1;
      for (let k = 0; k < cands.length; k++) {
        const dd = Math.hypot(cands[k][0] - cx, cands[k][1] - cz); if (dd < dist[k]) dist[k] = dd;
        const sc = dist[k] * coverBonus[k]; if (sc > bd) { bd = sc; bi = k; }
      }
      cur = bi;
    }
  }
  // fallback (should not happen): a ring of points on the practice field
  for (let k = spawns.length; k < 24; k++) spawns.push(new THREE.Vector3(-150 + Math.cos(k) * 20, 0, 60 + Math.sin(k) * 20));
  return spawns;
}
