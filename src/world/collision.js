// Collision meshes (merged per surface type, BVH accelerated) and spawn point selection.
import * as THREE from 'three';
import { Bucket } from './util.js';
import { SAT } from './ground.js';
import { NAV_MAX_GRADE, SPAWN_MAX_GRADE, HELI_MAX_SKID_DROP } from './terrain.js';

const SPAWN_WALL_CLEAR = 1.25;   // m: no spawn closer than this to a wall, fence or prop (the map check warns below 1.2)

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
  if (ctx.terrain) {
    terrainGround(ctx, gb, names);
    names.forEach((n, i) => add(gb[i], n, { isGround: true }));
    for (const [surface, bucket] of ctx.B.collision) {
      const passthrough = surface.endsWith(':mesh');
      add(bucket, passthrough ? surface.split(':')[0] : surface, passthrough ? { bulletPassthrough: true } : null);
    }
    return meshes;
  }
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

// Terrain campuses: the ground collision is the height lattice (src/world/terrain.js), every cell two triangles split the
// same way as the visual ground mesh, tagged by surface class inside the play area (+12 m) and grass outside it, out to
// the satellite edge; beyond that a flat apron at the outside height catches stray rays.
function terrainGround(ctx, gb, names) {
  const T = ctx.terrain, L = T.lattice, H = T.heights, nx = T.nx;
  const xs = L.xs, zs = L.zs, NX = xs.length, NZ = zs.length;
  const y = (a, b) => H[L.zj[b] * nx + L.xi[a]];
  for (let b = 0; b < NZ - 1; b++) for (let a = 0; a < NX - 1; a++) {
    const fine = L.xi[a] >= L.fine.i0 && L.xi[a + 1] <= L.fine.i1 && L.zj[b] >= L.fine.j0 && L.zj[b + 1] <= L.fine.j1;
    const c = fine ? Math.max(0, names.indexOf(ctx.surfaceAt((xs[a] + xs[a + 1]) / 2, (zs[b] + zs[b + 1]) / 2))) : 0;
    const p00 = [xs[a], y(a, b), zs[b]], p10 = [xs[a + 1], y(a + 1, b), zs[b]], p01 = [xs[a], y(a, b + 1), zs[b + 1]], p11 = [xs[a + 1], y(a + 1, b + 1), zs[b + 1]];
    gb[c].tri(p00, p01, p11).tri(p00, p11, p10);   // same diagonal as terrain.groundGeometry()
  }
  const E = 1500, x0 = xs[0], x1 = xs[NX - 1], z0 = zs[0], z1 = zs[NZ - 1];
  const yo = (T.heightAt(x0 - 50, z0 - 50) + T.heightAt(x1 + 50, z1 + 50)) / 2;
  gb[0].quad([-E, yo, z0], [E, yo, z0], [E, yo, -E], [-E, yo, -E]);
  gb[0].quad([-E, yo, E], [E, yo, E], [E, yo, z1], [-E, yo, z1]);
  gb[0].quad([-E, yo, z1], [x0, yo, z1], [x0, yo, z0], [-E, yo, z0]);
  gb[0].quad([x1, yo, z1], [E, yo, z1], [E, yo, z0], [x1, yo, z0]);
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
  const T = ctx.terrain, gy = T ? T.heightAt : () => 0;   // terrain campuses: every test follows the ground height
  const blockedDown = (x, z) => { o.set(x, gy(x, z) + 60, z); d.set(0, -1, 0); rc.set(o, d); rc.far = 59.7; return rc.intersectObjects(solids, false).length > 0; };
  const blockedSeg = (ax, az, bx, bz) => {
    const ga = gy(ax, az), gb = gy(bx, bz);
    if (T && Math.abs(gb - ga) > cell * NAV_MAX_GRADE) return true;   // too steep to walk between the two cells
    for (const y of [0.45, 1.3]) {
      o.set(ax, ga + y, az); d.set(bx - ax, gb - ga, bz - az); const len = d.length(); d.normalize(); rc.set(o, d); rc.far = len;
      if (rc.intersectObjects(solids, false).length > 0) return true;
    }
    return false;
  };
  const state = new Int8Array(nx * nz);  // 0 unknown, 1 reachable, -1 blocked
  const P = (i, j) => [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];
  const L = campusLayout(ctx);
  const seeds = L.walkSeeds;
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
  // Spawns keep their distance from walls and fences: a cell centre can sit a few centimetres from a chain-link run that
  // lies between two grid lines (the flood fill only tests cell-to-cell segments). Tested lazily, on the cells the
  // samplers below actually pick: 16 directions at knee and chest height.
  const wallClear = (x, z, r = SPAWN_WALL_CLEAR) => {
    const g = gy(x, z);
    for (const y of [0.5, 1.3]) for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8; o.set(x, g + y, z); d.set(Math.cos(a), 0, Math.sin(a)); rc.set(o, d); rc.far = r;
      if (rc.intersectObjects(solids, false).length > 0) return false;
    }
    return true;
  };
  // terrain: spawns (and CTF bases / team spawns, which use clearCell below) only on gentle ground
  // (a spawn stands on the drawn mesh: on a twisted lattice cell the mesh and the smooth height differ, and the player would start in the air or in the ground)
  const gentle = T ? (x, z) => T.slopeAt(x, z) <= SPAWN_MAX_GRADE && (!T.meshHeightAt || Math.abs(T.meshHeightAt(x, z) - T.heightAt(x, z)) <= 0.06) : null;
  ctx.walkGrid = { x0, z0, nx, nz, cell, state, wallClear, gentle, groundY: gy, standY: T ? T.standY : gy };
  // optional campus spawn region (keeps FFA spawns near the action without shrinking the play area)
  const sb = ctx.campus?.spawnBounds;
  const inSpawnArea = (x, z) => !sb || (x >= sb.minX && x <= sb.maxX && z >= sb.minZ && z <= sb.maxZ);
  // candidates: reachable cells whose 5x5 neighbourhood is reachable too (some elbow room)
  const cands = [];
  for (let j = 2; j < nz - 2; j += 1) for (let i = 2; i < nx - 2; i += 1) {
    let ok = true;
    for (let b = -2; b <= 2 && ok; b++) for (let a = -2; a <= 2; a++) if (state[(j + b) * nx + i + a] !== 1) { ok = false; break; }
    if (ok) { const c = P(i, j); if (inSpawnArea(c[0], c[1]) && clutterFree(ctx, c[0], c[1]) && (!gentle || gentle(c[0], c[1]))) cands.push(c); }
  }
  const spawns = [];
  if (cands.length) {
    // farthest point sampling, starting near the centre of campus
    const dist = new Float32Array(cands.length).fill(Infinity);
    let cur = 0, best = Infinity;
    cands.forEach((c, k) => { const dd = Math.hypot(c[0] - L.spawnCenter[0], c[1] - L.spawnCenter[1]); if (dd < best) { best = dd; cur = k; } });
    // prefer spots next to something solid (cover) by nudging the score
    const coverBonus = cands.map(([x, z]) => {
      const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell); let near = 0;
      for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && state[jj * nx + ii] === -1) near++; }
      return near > 0 ? 1.25 : 1.0;
    });
    const dead = new Uint8Array(cands.length);   // picked but too close to a wall / fence: skipped, never a spawn
    for (let n = 0, tries = 0; n < count && tries < cands.length; tries++) {
      const [cx, cz] = cands[cur];
      if (!wallClear(cx, cz)) dead[cur] = 1;
      else { spawns.push(new THREE.Vector3(cx, T ? T.standY(cx, cz) : 0, cz)); n++; for (let k = 0; k < cands.length; k++) { const dd = Math.hypot(cands[k][0] - cx, cands[k][1] - cz); if (dd < dist[k]) dist[k] = dd; } }
      let bi = -1, bd = -1;
      for (let k = 0; k < cands.length; k++) {
        if (dead[k]) continue;
        // before the first spawn is placed every distance is still infinite: stay with "nearest to the centre"
        const sc = spawns.length ? dist[k] * coverBonus[k] : -Math.hypot(cands[k][0] - L.spawnCenter[0], cands[k][1] - L.spawnCenter[1]);
        if (bi < 0 || sc > bd) { bd = sc; bi = k; }
      }
      if (bi < 0) break;
      cur = bi;
    }
  }
  // fallback (should not happen): a ring of points on the practice field
  for (let k = spawns.length; k < 24; k++) { const fx = L.navSeed[0] + Math.cos(k) * 20, fz = L.navSeed[1] + Math.sin(k) * 20; spawns.push(new THREE.Vector3(fx, gy(fx, fz), fz)); }
  return spawns;
}

// Walkable ground cells (from the flood fill in computeSpawns) near a point: used for CTF bases and team spawns.
function clearCell(g, i, j, r) {
  for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz || g.state[jj * g.nx + ii] !== 1) return false; }
  if (g.gentle && !g.gentle(g.x0 + (i + 0.5) * g.cell, g.z0 + (j + 0.5) * g.cell)) return false;
  return true;
}
export function nearestOpenGround(ctx, x, z, clear = 2) {
  const g = ctx.walkGrid; if (!g) return new THREE.Vector3(x, ctx.groundY ? ctx.groundY(x, z) : 0, z);
  let best = null, bd = Infinity;
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
    const cx = g.x0 + (i + 0.5) * g.cell, cz = g.z0 + (j + 0.5) * g.cell; const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bd && clearCell(g, i, j, clear)) { bd = d; best = [cx, cz]; }
  }
  const sy = g.standY || (() => 0);
  return best ? new THREE.Vector3(best[0], sy(best[0], best[1]), best[1]) : new THREE.Vector3(x, sy(x, z), z);
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
  const wallClear = g.wallClear || (() => true); const dead = new Uint8Array(cands.length);   // see computeSpawns
  for (let n = 0, tries = 0; n < count && tries < cands.length; tries++) {
    const [cx, cz] = cands[cur];
    if (!wallClear(cx, cz)) dead[cur] = 1;
    else { out.push(new THREE.Vector3(cx, g.standY ? g.standY(cx, cz) : 0, cz)); n++; for (let k = 0; k < cands.length; k++) { const dd = Math.hypot(cands[k][0] - cx, cands[k][1] - cz); if (dd < dist[k]) dist[k] = dd; } }
    let bi = -1, bd = -1;
    for (let k = 0; k < cands.length; k++) { if (dead[k]) continue; const sc = out.length ? dist[k] * cands[k][2] : cands[k][2]; if (bi < 0 || sc > bd) { bd = sc; bi = k; } }
    if (bi < 0) break;
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
  // exact distance (up to maxR) from the vertical segment (x, y0..y1, z) to the nearest solid, ignoring contact points at
  // or below yMin (the deck / ground the segment stands on). Rays can pass between small things; this cannot.
  const seg = new THREE.Line3(), box = new THREE.Box3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const clearance = (x, y0, y1, z, maxR, yMin = -Infinity) => {
    seg.start.set(x, y0, z); seg.end.set(x, y1, z); box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end).expandByScalar(maxR);
    let best = maxR;
    g.boundsTree.shapecast({
      intersectsBounds: (bb) => bb.intersectsBox(box),
      intersectsTriangle: (tri) => { const dd = tri.closestPointToSegment(seg, p1, p2); if (dd < best && p1.y > yMin) best = dd; return false; },
    });
    return best;
  };
  return { cast, clearance, dispose() { g.disposeBoundsTree(); g.dispose(); } };
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
  const T = ctx.terrain, gy = T ? T.heightAt : () => 0;   // terrain: probes follow the ground, steep cells are blocked
  let steepCells = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell; const k = j * nx + i; const g = gy(x, z);
    if (T && T.slopeAt(x, z) > NAV_MAX_GRADE) { blocked[k] = 1; steepCells++; continue; }
    if (S.cast(x, g + 2.0, z, 0, -1, 0, 1.7) < Infinity) { blocked[k] = 1; continue; }     // kerbs / low steps (< 0.3 m) stay walkable
    // thin obstacles between cell centres (fences, nets, rails, benches): block the cell on the obstacle's side
    for (const y of [0.45, 1.35]) {
      if (i + 1 < nx) { const dh = T ? gy(x + cell, z) - g : 0, L = T ? Math.hypot(cell, dh) : cell; const d = S.cast(x, g + y, z, cell / L, dh / L, 0, L); if (d < Infinity) blocked[d < L / 2 ? k : k + 1] = 1; }
      if (j + 1 < nz) { const dh = T ? gy(x, z + cell) - g : 0, L = T ? Math.hypot(cell, dh) : cell; const d = S.cast(x, g + y, z, 0, dh / L, cell / L, L); if (d < Infinity) blocked[d < L / 2 ? k : k + nx] = 1; }
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
  const ns = campusLayout(ctx).navSeed;
  const seed = nearestFree(ns[0], ns[1], blocked); if (seed >= 0) { walk[seed] = 1; q.push(seed); }
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
  if (T) grid.steepCells = steepCells;
  const sample = (x, z) => { const c = idxOf(x, z); return c >= 0 && walk[c] === 1; };
  return { grid, sample, bvh: S };
}

// Helicopter parking spots: hidden / out-of-the-way places with ~8 m rotor clearance and open sky, validated against the
// collision world (and tree positions, since canopies are not in collision). Yaw faces the most open direction.
/**
 * Per-campus layout hints (CAMPUSES.md): walkable flood-fill seeds, spawn sampling centre, nav-grid seed and hidden
 * helicopter candidates ([x, y, z]; y = 0 ground, y = deck height on flat roofs). Defaults derive from ctf / bounds.
 */
function campusLayout(ctx) {
  const c = ctx.campus || {}, pb = ctx.playBounds;
  const ctf = c.ctf || { red: [0, 0], blue: [0, 0] };
  const heliPark = c.heliPark || [];
  return {
    walkSeeds: c.walkSeeds || [ctf.red, ctf.blue, ...(c.practiceHeli ? [[c.practiceHeli.x, c.practiceHeli.z]] : []), ...heliPark.filter((p) => p[1] <= 0.5).map((p) => [p[0], p[2]])],
    spawnCenter: c.spawnCenter || [(pb.minX + pb.maxX) / 2, (pb.minZ + pb.maxZ) / 2],
    navSeed: c.navSeed || ctf.red,
    heliPark,
  };
}
export function pickHeliSpawns(ctx, S, min = 12) {
  const trees = ctx.gen.trees || []; const out = []; const T = ctx.terrain;
  const tryAll = (clear) => {
    for (const [x, y0, z] of campusLayout(ctx).heliPark) {
      // terrain campuses: a ground entry (y <= 0.5) stands on the terrain (highest ground under the skids, nearly level,
      // and no hill inside the rotor disc); roof entries keep their absolute deck height
      let y = y0;
      if (T && y0 <= 0.5) {
        y = T.maxIn(x, z, 2.6);
        if (y - T.minIn(x, z, 2.6) > HELI_MAX_SKID_DROP) continue;
        if (T.maxIn(x, z, clear + 0.5) > y + 1.6) continue;
      }
      if (out.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < 30)) continue;
      // something to stand on right below, open sky above
      const roof = T ? y0 > 0.5 : y > 0.5;
      const below = S.cast(x, y + 1.0, z, 0, -1, 0, 1.3); if (roof && below === Infinity) continue; if (!roof && below < 0.9) continue;
      let ok = S.cast(x, y + 0.6, z, 0, 1, 0, 80) === Infinity;
      // rotor disc + skids: nothing solid within the clearance radius at skid, cabin and rotor height
      let bestD = -1, bestA = 0;
      for (let a = 0; a < 16 && ok; a++) {
        const an = (a / 16) * Math.PI * 2, dx = Math.cos(an), dz = Math.sin(an);
        for (const h of [0.5, 1.8, 3.2]) if (S.cast(x, y + h, z, dx, 0, dz, clear) < Infinity) { ok = false; break; }
        // roof spots: the disc may overhang the parapet, but the skids need deck under them
        if (ok && roof && S.cast(x + dx * 2.2, y + 1.0, z + dz * 2.2, 0, -1, 0, 1.4) === Infinity) ok = false;
        if (ok) { const d = Math.min(S.cast(x, y + 1.8, z, dx, 0, dz, 60), 60); if (d > bestD) { bestD = d; bestA = an; } }
      }
      if (!ok) continue;
      // exact rotor-disc test (the 16 rays above miss roof units, lamp heads and fence ends between them), with half a
      // metre in hand so no accepted spot sits right at the limit
      if (S.clearance && S.clearance(x, y + 0.5, y + 3.4, z, clear + 0.6, y + 0.3) < clear + 0.5) continue;
      if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < clear + 2.5)) continue;
      if ((ctx.trunks || []).some((t) => Math.hypot(t[0] - x, t[1] - z) < clear + 2.5)) continue;   // builder-planted trees too
      const pb = ctx.playBounds; if (x < pb.minX + 6 || x > pb.maxX - 6 || z < pb.minZ + 6 || z > pb.maxZ - 6) continue;
      // nose (-z at yaw 0) toward the most open direction
      out.push({ pos: new THREE.Vector3(x, y, z), yaw: Math.atan2(-Math.cos(bestA), -Math.sin(bestA)), roof });
    }
  };
  tryAll(8); if (out.length < min) tryAll(7); if (out.length < min) tryAll(6);
  return out;
}
