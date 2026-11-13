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

// Visual clutter that is not solid (shrubs, low conifer branches) can swallow a player's view at spawn: keep spawns clear.
function clutterFree(ctx, x, z) {
  for (const [sx, , sz, len, , rot] of ctx.shrubs || []) {
    const ux = Math.cos(rot), uz = -Math.sin(rot);
    const t = Math.max(-len / 2, Math.min(len / 2, (x - sx) * ux + (z - sz) * uz));
    if (Math.hypot(x - (sx + ux * t), z - (sz + uz * t)) < 3.0) return false;
  }
  for (const [tx, tz, kind] of ctx.gen?.trees || []) {
    if (Math.hypot(x - tx, z - tz) < (kind === 1 ? 4.5 : 2.5)) return false;
  }
  return true;
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
    if (ok) { const c = P(i, j); if (clutterFree(ctx, c[0], c[1])) cands.push(c); }
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

// Walkable ground cells (from the flood fill in computeSpawns) near a point: used for CTF bases and team spawns.
function clearCell(g, i, j, r) {
  for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz || g.state[jj * g.nx + ii] !== 1) return false; }
  return true;
}
export function nearestOpenGround(ctx, x, z, clear = 2) {
  const g = ctx.walkGrid; if (!g) return new THREE.Vector3(x, 0, z);
  let best = null, bd = Infinity;
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    const cx = g.x0 + (i + 0.5) * g.cell, cz = g.z0 + (j + 0.5) * g.cell; const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bd && clearCell(g, i, j, clear)) { bd = d; best = [cx, cz]; }
  }
  return best ? new THREE.Vector3(best[0], 0, best[1]) : new THREE.Vector3(x, 0, z);
}
export function spawnsNear(ctx, center, rMin, rMax, count, awayFrom) {
  const g = ctx.walkGrid; const out = []; if (!g) return out;
  const cands = [];
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    const cx = g.x0 + (i + 0.5) * g.cell, cz = g.z0 + (j + 0.5) * g.cell; const d = Math.hypot(cx - center.x, cz - center.z);
    if (d < rMin || d > rMax || !clearCell(g, i, j, 1) || !clutterFree(ctx, cx, cz)) continue;
    // must not be closer to the enemy base than to our own, and prefer cells next to something solid (cover)
    if (awayFrom && Math.hypot(cx - awayFrom.x, cz - awayFrom.z) < d + 30) continue;
    let cover = 0; for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < g.nx && jj < g.nz && g.state[jj * g.nx + ii] === -1) cover++; }
    cands.push([cx, cz, cover > 0 ? 1.35 : 1.0]);
  }
  if (!cands.length) return out;
  const dist = new Float32Array(cands.length).fill(Infinity); let cur = 0, bc = -1;
  cands.forEach((c, k) => { if (c[2] > bc) { bc = c[2]; cur = k; } });
  for (let n = 0; n < count && n < cands.length; n++) {
    const [cx, cz] = cands[cur]; out.push(new THREE.Vector3(cx, 0, cz));
    let bi = 0, bd = -1;
    for (let k = 0; k < cands.length; k++) { const dd = Math.hypot(cands[k][0] - cx, cands[k][1] - cz); if (dd < dist[k]) dist[k] = dd; const sc = dist[k] * cands[k][2]; if (sc > bd) { bd = sc; bi = k; } }
    cur = bi;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- bot navigation
// One temporary BVH over every solid (incl. fences/nets) so the ~700k probe rays below stay fast.
function solidBVH(collisionMeshes) {
  let n = 0; const solids = collisionMeshes.filter((m) => !m.userData.isGround);
  for (const m of solids) n += m.geometry.attributes.position.array.length;
  const pos = new Float32Array(n); let o = 0;
  for (const m of solids) { pos.set(m.geometry.attributes.position.array, o); o += m.geometry.attributes.position.array.length; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeBoundsTree();
  const ray = new THREE.Ray();
  // distance to the first solid along a ray, or Infinity
  const cast = (ox, oy, oz, dx, dy, dz, far) => { ray.origin.set(ox, oy, oz); ray.direction.set(dx, dy, dz); const h = g.boundsTree.raycastFirst(ray, THREE.DoubleSide); return h && h.distance <= far ? h.distance : Infinity; };
  return { cast, dispose() { g.disposeBoundsTree(); g.dispose(); } };
}

// Ground-level walk grid for A*: 1.25 m cells, walkable where a standing player fits (nothing solid between 0.3 m and
// 2 m above the cell, no wall/fence between it and its neighbours), flood-filled so every walkable cell is connected.
// cost: 1 next to cover ... 2.5 in the middle of open fields (bots prefer routes along cover).
export function buildNav(ctx, collisionMeshes, mustReach = []) {
  const pb = ctx.playBounds; const cell = 1.25, margin = 1.5;
  const x0 = pb.minX + margin, z0 = pb.minZ + margin;
  const nx = Math.floor((pb.maxX - pb.minX - 2 * margin) / cell), nz = Math.floor((pb.maxZ - pb.minZ - 2 * margin) / cell);
  const S = solidBVH(collisionMeshes);
  const blocked = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell; const k = j * nx + i;
    if (S.cast(x, 2.0, z, 0, -1, 0, 1.7) < Infinity) { blocked[k] = 1; continue; }     // kerbs / low steps (< 0.3 m) stay walkable
    // thin obstacles between cell centres (fences, nets, rails, benches): block the cell on the obstacle's side
    for (const y of [0.45, 1.35]) {
      if (i + 1 < nx) { const d = S.cast(x, y, z, 1, 0, 0, cell); if (d < Infinity) blocked[d < cell / 2 ? k : k + 1] = 1; }
      if (j + 1 < nz) { const d = S.cast(x, y, z, 0, 0, 1, cell); if (d < Infinity) blocked[d < cell / 2 ? k : k + nx] = 1; }
    }
  }
  // connectivity: flood from the main lawn; anything not reached (courtyards, sealed pockets) is not walkable
  const walk = new Uint8Array(nx * nz); const q = [];
  const idxOf = (x, z) => { const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
  const nearestFree = (x, z, arr) => {
    const c = idxOf(x, z); if (c < 0) return -1; if (!arr[c]) return c;
    const ci = c % nx, cj = (c / nx) | 0;
    for (let r = 1; r < 8; r++) for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const i = ci + a, j = cj + b; if (i < 0 || j < 0 || i >= nx || j >= nz) continue; if (!arr[j * nx + i]) return j * nx + i; }
    return -1;
  };
  const seed = nearestFree(-150, 60, blocked); if (seed >= 0) { walk[seed] = 1; q.push(seed); }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % nx, j = (k / nx) | 0;
    if (i > 0 && !blocked[k - 1] && !walk[k - 1]) { walk[k - 1] = 1; q.push(k - 1); }
    if (i < nx - 1 && !blocked[k + 1] && !walk[k + 1]) { walk[k + 1] = 1; q.push(k + 1); }
    if (j > 0 && !blocked[k - nx] && !walk[k - nx]) { walk[k - nx] = 1; q.push(k - nx); }
    if (j < nz - 1 && !blocked[k + nx] && !walk[k + nx]) { walk[k + nx] = 1; q.push(k + nx); }
  }
  // cost from the distance to the nearest solid (chamfer distance transform, in cells)
  const dist = new Float32Array(nx * nz).fill(1e3);
  for (let k = 0; k < dist.length; k++) if (blocked[k]) dist[k] = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i > 0) dist[k] = Math.min(dist[k], dist[k - 1] + 1); if (j > 0) dist[k] = Math.min(dist[k], dist[k - nx] + 1); }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (i < nx - 1) dist[k] = Math.min(dist[k], dist[k + 1] + 1); if (j < nz - 1) dist[k] = Math.min(dist[k], dist[k + nx] + 1); }
  const cost = new Float32Array(nx * nz);
  for (let k = 0; k < cost.length; k++) cost[k] = walk[k] ? 1 + 1.5 * Math.min(1, Math.max(0, (dist[k] * cell - 3) / 14)) : 0;
  let unreachable = 0;
  for (const p of mustReach) { const c = idxOf(p.x, p.z); if (c < 0 || !walk[c]) { const f = nearestFree(p.x, p.z, blocked); if (f < 0 || !walk[f]) unreachable++; } }
  if (unreachable) console.warn('[world] navGrid: ' + unreachable + ' spawn/base points are not connected to the main walk area');
  let nWalk = 0; for (let k = 0; k < walk.length; k++) nWalk += walk[k];
  const grid = { x0, z0, cell, nx, nz, walk, cost, walkableCells: nWalk, unreachable };
  const sample = (x, z) => { const c = idxOf(x, z); return c >= 0 && walk[c] === 1; };
  return { grid, sample, bvh: S };
}

// Helicopter parking spots: hidden / out-of-the-way places with ~8 m rotor clearance and open sky, validated against the
// collision world (and tree positions, since canopies are not in collision). Yaw faces the most open direction.
const HELI_CANDIDATES = [
  // ground: courtyards, service yards, behind buildings, lot corners, field edges
  [50, 0, -77], [134, 0, -125], [166, 0, -92], [166, 0, 22], [124, 0, 150], [162, 0, 168], [272, 0, -8], [274, 0, 62], [214, 0, 62],
  [-20, 0, 88], [-46, 0, 152], [-80, 0, 128], [-186, 0, 122], [-198, 0, 30], [-198, 0, -28], [-104, 0, -22], [-66, 0, -52], [-34, 0, -160],
  [272, 0, -182], [228, 0, -20], [262, 0, 150], [228, 0, 196], [30, 0, 196], [-150, 0, 150], [100, 0, 64], [91, 0, -20], [10, 0, 70],
  [-120, 0, 60], [180, 0, -170], [-200, 0, -170], [150, 0, 100], [240, 0, -160], [20, 0, 130], [105, 0, 170],
  // flat rooftops (deck height = wing height - 0.4)
  [140, 13.1, -68], [22, 11.6, 6], [62, 10.6, 30], [138, 15.1, 19], [70, 9.6, -141], [-12, 9.6, -80], [30, 9.6, -45], [126, 9.6, -15],
];
export function pickHeliSpawns(ctx, S, min = 12) {
  const trees = ctx.gen.trees || []; const out = [];
  const tryAll = (clear) => {
    for (const [x, y, z] of HELI_CANDIDATES) {
      if (out.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < 30)) continue;
      // something to stand on right below, open sky above
      const below = S.cast(x, y + 1.0, z, 0, -1, 0, 1.3); if (y > 0.5 && below === Infinity) continue; if (y <= 0.5 && below < 0.9) continue;
      let ok = S.cast(x, y + 0.6, z, 0, 1, 0, 80) === Infinity;
      // rotor disc + skids: nothing solid within the clearance radius at skid, cabin and rotor height
      let bestD = -1, bestA = 0;
      for (let a = 0; a < 16 && ok; a++) {
        const an = (a / 16) * Math.PI * 2, dx = Math.cos(an), dz = Math.sin(an);
        for (const h of [0.5, 1.8, 3.2]) if (S.cast(x, y + h, z, dx, 0, dz, clear) < Infinity) { ok = false; break; }
        // roof spots: the disc may overhang the parapet, but the skids need deck under them
        if (ok && y > 0.5 && S.cast(x + dx * 2.2, y + 1.0, z + dz * 2.2, 0, -1, 0, 1.4) === Infinity) ok = false;
        if (ok) { const d = Math.min(S.cast(x, y + 1.8, z, dx, 0, dz, 60), 60); if (d > bestD) { bestD = d; bestA = an; } }
      }
      if (!ok) continue;
      if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < clear + 2.5)) continue;
      const pb = ctx.playBounds; if (x < pb.minX + 6 || x > pb.maxX - 6 || z < pb.minZ + 6 || z > pb.maxZ - 6) continue;
      // nose (-z at yaw 0) toward the most open direction
      out.push({ pos: new THREE.Vector3(x, y, z), yaw: Math.atan2(-Math.cos(bestA), -Math.sin(bestA)), roof: y > 0.5 });
    }
  };
  tryAll(8); if (out.length < min) tryAll(7); if (out.length < min) tryAll(6);
  return out;
}
