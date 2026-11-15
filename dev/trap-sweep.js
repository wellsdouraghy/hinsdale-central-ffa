// Roof-trap sweep: run in the GAME page (?campus=..&autostart=practice&debug=1&mute=1) console:  const T = await import("/dev/trap-sweep.js"); await T.runAll(); T.simAll(); T.grappleTest()
// scan() top-surface grid -> analyse() pits/voids/candidates -> sim() teleport + leave with the real player.update; wallJump()/grappleTest() look for ways INTO roof voids.
const ST = (window.__sweep = window.__sweep || {});
const CELL = 0.5;
// ground height (terrain campuses; 0 when flat): every "ground level" / "roof" threshold below is relative to it
const gyAt = (x, z) => { const w = window.__game.world; return w.terrain ? w.terrain.heightAt(x, z) : 0; };
const rel = (k) => ST.H[k] - ST.G[k];
export function scan(budget = 25000) {
  const G = window.__game, w = G.world, p = G.player, pb = w.playBounds; const V3 = p.position.constructor;
  if (!ST.H) { ST.nx = Math.ceil((pb.maxX - pb.minX) / CELL); ST.nz = Math.ceil((pb.maxZ - pb.minZ) / CELL); ST.H = new Float32Array(ST.nx * ST.nz); ST.G = new Float32Array(ST.nx * ST.nz); ST.sub = []; ST.row = 0; ST.ray = new p.ray.constructor(); ST.ray.firstHitOnly = false; }
  const ray = ST.ray, o = new V3(), d = new V3(0, -1, 0), t0 = performance.now();
  for (; ST.row < ST.nz && performance.now() - t0 < budget; ST.row++) {
    const z = pb.minZ + (ST.row + 0.5) * CELL;
    for (let i = 0; i < ST.nx; i++) {
      const x = pb.minX + (i + 0.5) * CELL; const gy = gyAt(x, z); o.set(x, gy + 90, z); ray.set(o, d); ray.near = 0; ray.far = 95;
      const hits = ray.intersectObjects(w.collisionMeshes, false); hits.sort((a, b) => a.distance - b.distance);
      let top = gy, above = 1e9, first = true;
      for (const h of hits) { const y = h.point.y; const up = h.face && h.face.normal.y > 0.5;
        if (up && above - y >= 1.0) { if (first) { top = y; } else if (y - gy > 2.0) ST.sub.push([x, y, z, above - y]); }
        if (first && up) first = false; else if (first) { first = false; top = y; }   // top surface even if steep
        above = Math.min(above, y); }
      ST.H[ST.row * ST.nx + i] = top; ST.G[ST.row * ST.nx + i] = gy;
    }
  }
  return { row: ST.row, of: ST.nz, done: ST.row >= ST.nz, sub: ST.sub.length };
}
export function analyse(climb = 1.7) {
  const w = window.__game.world, pb = w.playBounds, { nx, nz, H } = ST; const N = nx * nz;
  // reverse flood from ground cells: A can reach B if H[B] - H[A] <= climb
  const ok = new Uint8Array(N), q = new Int32Array(N); let qh = 0, qt = 0;
  for (let k = 0; k < N; k++) if (rel(k) < 0.6) { ok[k] = 1; q[qt++] = k; }
  while (qh < qt) { const b = q[qh++], bi = b % nx, bj = (b / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ai = bi + di, aj = bj + dj; if (ai < 0 || aj < 0 || ai >= nx || aj >= nz) continue; const a = aj * nx + ai; if (ok[a]) continue; if (H[b] - H[a] <= climb) { ok[a] = 1; q[qt++] = a; } } }
  const P = (k) => [pb.minX + ((k % nx) + 0.5) * CELL, +H[k].toFixed(2), pb.minZ + (((k / nx) | 0) + 0.5) * CELL];
  const pits = []; const seen = new Uint8Array(N);
  for (let k = 0; k < N; k++) { if (ok[k] || seen[k]) continue; let n = 0, sx = 0, sz = 0, hy = 1e9, rep = k; const st = [k]; seen[k] = 1;
    while (st.length) { const c = st.pop(); n++; if (H[c] < hy) { hy = H[c]; rep = c; } const ci = c % nx, cj = (c / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ai = ci + di, aj = cj + dj; if (ai < 0 || aj < 0 || ai >= nx || aj >= nz) continue; const a = aj * nx + ai; if (!ok[a] && !seen[a]) { seen[a] = 1; st.push(a); } } }
    pits.push({ at: P(rep), cells: n }); }
  // slots: roof cells walled (>= 0.5 m higher within 1 m) on an opposite pair of sides
  const cand = new Map(); const add = (x, y, z, why) => { const key = Math.round(x) + ',' + Math.round(y * 2) + ',' + Math.round(z); if (!cand.has(key)) cand.set(key, [x, y, z, why]); };
  const hi = (i, j, h) => { if (i < 0 || j < 0 || i >= nx || j >= nz) return false; return H[j * nx + i] >= h + 0.5; };
  for (let j = 2; j < nz - 2; j++) for (let i = 2; i < nx - 2; i++) { const h = H[j * nx + i]; if (rel(j * nx + i) < 2.0) continue;
    const e = hi(i + 1, j, h) || hi(i + 2, j, h), wv = hi(i - 1, j, h) || hi(i - 2, j, h), s = hi(i, j + 1, h) || hi(i, j + 2, h), n = hi(i, j - 1, h) || hi(i, j - 2, h);
    if ((e && wv) || (s && n)) { const q2 = P(j * nx + i); add(q2[0], q2[1], q2[2], 'slot'); } }
  for (const [x, y, z] of ST.sub) add(x, y, z, 'under');
  for (const pt of pits) add(pt.at[0], pt.at[1], pt.at[2], 'pit');
  for (let j = 3; j < nz; j += 6) for (let i = 3; i < nx; i += 6) { if (rel(j * nx + i) >= 2.0) { const q2 = P(j * nx + i); add(q2[0], q2[1], q2[2], 'grid'); } }
  ST.cand = [...cand.values()]; ST.ci = 0; ST.traps = []; ST.pits = pits;
  let roof = 0; for (let k = 0; k < N; k++) if (rel(k) >= 2.0) roof++;
  return { roofCells: roof, pits: pits.filter((p2) => p2.at[1] >= 1.0).slice(0, 40), nPits: pits.length, cand: ST.cand.length, byWhy: ST.cand.reduce((m, c) => { m[c[3]] = (m[c[3]] || 0) + 1; return m; }, {}) };
}
// try to leave a spot using walk + jump + double jump (+ the automatic step-up / mantle): 8 headings x 1.25 s
export function tryLeave(x, y, z, secs = 10) {
  const p = window.__game.player; p.ladder = null; p.grapple = null; p.mantle = null; p.ladderCooldown = 5; p.crouching = false; p.sliding = false; p.dashT = 0;
  p.position.set(x, y + 0.08, z); p.velocity.set(0, 0, 0); p.grounded = false;
  const inp = { forward: 0, strafe: 0, jump: false, sprint: false, crouchToggle: false };
  for (let i = 0; i < 20; i++) p.update(1 / 60, inp);          // settle
  const sx = p.position.x, sy = p.position.y, sz = p.position.z; let best = 0, bestDy = 0; const covered = topAt(sx, sz) - sy > 0.9; if (covered) secs = 12;
  const steps = Math.round(secs * 60);
  for (let i = 0; i < steps; i++) {
    const seg = Math.floor(i / 75), k = i % 75; p.yaw = seg * Math.PI * 0.75 + 0.3;   // 0.3, 135.3, 270.3 ... covers 8 headings
    inp.forward = 1; inp.jump = k === 8 || k === 26; p.ladderCooldown = 5;
    p.update(1 / 60, inp);
    const dh = Math.hypot(p.position.x - sx, p.position.z - sz), dy = p.position.y - sy; best = Math.max(best, dh); if (Math.abs(dy) > Math.abs(bestDy)) bestDy = dy;
    if (covered) { if (p.position.y - gyAt(p.position.x, p.position.z) < 0.6 || (i % 6 === 0 && topAt(p.position.x, p.position.z) - p.position.y < 0.6)) return { ok: true, t: +(i / 60).toFixed(1) }; }
    else if (dh > 4 || (p.grounded && Math.abs(dy) > 1.2)) return { ok: true, t: +(i / 60).toFixed(1) };
  }
  return { ok: false, covered, start: [+sx.toFixed(2), +sy.toFixed(2), +sz.toFixed(2)], moved: +best.toFixed(2), dy: +bestDy.toFixed(2) };
}
export function sim(budget = 25000) {
  const t0 = performance.now();
  for (; ST.ci < ST.cand.length && performance.now() - t0 < budget; ST.ci++) { const [x, y, z, why] = ST.cand[ST.ci]; const r = tryLeave(x, y, z); if (!r.ok) ST.traps.push({ why, ...r }); }
  return { i: ST.ci, of: ST.cand.length, done: ST.ci >= ST.cand.length, traps: ST.traps.length };
}
export function traps() { // cluster to ~2 m
  const out = []; for (const t of ST.traps) { if (!out.some((o) => Math.hypot(o.start[0] - t.start[0], o.start[2] - t.start[2]) < 2.5 && Math.abs(o.start[1] - t.start[1]) < 1)) out.push({ ...t, n: 1 }); else out.find((o) => Math.hypot(o.start[0] - t.start[0], o.start[2] - t.start[2]) < 2.5 && Math.abs(o.start[1] - t.start[1]) < 1).n++; }
  return out;
}
export function topAt(x, z) { const G = window.__game, p = G.player; const V3 = p.position.constructor; const gy = gyAt(x, z); const r = (ST.ray1 = ST.ray1 || new p.ray.constructor()); r.firstHitOnly = true; r.set(new V3(x, gy + 90, z), new V3(0, -1, 0)); r.near = 0; r.far = 95; const h = r.intersectObjects(G.world.collisionMeshes, false)[0]; return h ? h.point.y : gy; }
// roof points whose top surface is sloped (pitched roofs)
export function slopedPoints(max = 400, seed = 1) {
  const w = window.__game.world, pb = w.playBounds, { nx, nz, H } = ST; const out = []; let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let t = 0; t < 200000 && out.length < max; t++) { const i = 2 + Math.floor(rnd() * (nx - 4)), j = 2 + Math.floor(rnd() * (nz - 4)); const h = H[j * nx + i]; if (rel(j * nx + i) < 2.5) continue;
    const gx = Math.abs(H[j * nx + i + 1] - H[j * nx + i - 1]), gz = Math.abs(H[(j + 1) * nx + i] - H[(j - 1) * nx + i]); const g = Math.max(gx, gz); if (g < 0.08 || g > 1.2) continue;
    out.push([pb.minX + (i + 0.5) * CELL, h, pb.minZ + (j + 0.5) * CELL]); }
  return out;
}
// walk / jump / drop around on pitched roofs and report whenever the player ends up UNDER the roof surface or stops moving
export function roofWalk(points, dt = 1 / 60, secs = 6, mode = 'walk') {
  const p = window.__game.player; const bad = []; let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (const [x, y, z] of points) {
    p.ladder = null; p.grapple = null; p.mantle = null; p.crouching = false; p.sliding = false; p.dashT = 0; p.ladderCooldown = 9;
    p.position.set(x, y + (mode === 'drop' ? 25 : 0.1), z); p.velocity.set(0, 0, 0); p.grounded = false;
    const inp = { forward: 1, strafe: 0, jump: false, sprint: mode === 'sprint', crouchToggle: false }; const n = Math.round(secs / dt); let stuck = 0, lx = x, lz = z, ly = y, res = null;
    for (let i = 0; i < n; i++) {
      if (i % Math.round(0.8 / dt) === 0) p.yaw = rnd() * 6.283;
      inp.jump = mode !== 'walk' && mode !== 'drop' && rnd() < dt * 2.5; p.ladderCooldown = 9;
      p.update(dt, inp);
      const top = 0;
      if (p.position.y - gyAt(p.position.x, p.position.z) < 0.6) break;   // left the roof
      const mv = Math.hypot(p.position.x - lx, p.position.z - lz) + Math.abs(p.position.y - ly); if (mv < 0.002) stuck++; else stuck = 0; lx = p.position.x; lz = p.position.z; ly = p.position.y;
      if (stuck * dt > 1.5) { res = { kind: 'stuck', at: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)], top: +top.toFixed(2), from: [x, +y.toFixed(2), z], grounded: p.grounded }; break; }
    }
    if (!res && p.position.y - gyAt(p.position.x, p.position.z) > 1.5) { const e = [p.position.x, p.position.y, p.position.z]; const r = tryLeave(e[0], e[1] - 0.08, e[2], 8); if (!r.ok) res = { kind: r.covered ? 'inside' : 'cantLeave', at: e.map((v) => +v.toFixed(2)), top: +topAt(e[0], e[2]).toFixed(2), from: [x, +y.toFixed(2), z] }; }
    if (res) bad.push(res);
  }
  return bad;
}
// jump / double-jump / mantle at walls from the ground and from low roofs: reports when the player ends up inside a roof
export function wallJump(max = 400, seed = 11, minH = -1, maxH = 0.6) {
  const w = window.__game.world, pb = w.playBounds, { nx, nz, H } = ST, p = window.__game.player; let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const bad = []; let n = 0, climbed = 0;
  for (let t = 0; t < 400000 && n < max; t++) { const i = 3 + Math.floor(rnd() * (nx - 6)), j = 3 + Math.floor(rnd() * (nz - 6)); const h = H[j * nx + i]; if (rel(j * nx + i) < minH || rel(j * nx + i) > maxH) continue;
    let dir = null; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const h2 = H[(j + dj * 2) * nx + i + di * 2]; if (h2 >= h + 2.3 && h2 <= h + 9.5 && H[(j + dj) * nx + i + di] < h + 0.5) dir = [di, dj]; } if (!dir) continue; n++;
    const x = pb.minX + (i + 0.5) * CELL, z = pb.minZ + (j + 0.5) * CELL;
    p.ladder = null; p.grapple = null; p.mantle = null; p.crouching = false; p.sliding = false; p.dashT = 0;
    p.position.set(x, h + 0.08, z); p.velocity.set(0, 0, 0); p.yaw = Math.atan2(-dir[0], -dir[1]) + (rnd() - 0.5) * 0.5;
    const inp = { forward: 1, strafe: 0, jump: false, sprint: false, crouchToggle: false }; const j2 = 14 + Math.floor(rnd() * 26);
    for (let k = 0; k < 200; k++) { inp.jump = k === 12 || k === 12 + j2; p.ladderCooldown = 9; p.update(1 / 60, inp); }
    const e = [p.position.x, p.position.y, p.position.z]; const top = topAt(e[0], e[2]);
    if (e[1] > h + 1.5 && top - e[1] < 0.5) climbed++;
    if (e[1] > h + 1.2 && top - e[1] > 0.9) { const r = tryLeave(e[0], e[1] - 0.08, e[2], 8); if (!r.ok) bad.push({ from: [x, +h.toFixed(2), z], at: e.map((v) => +v.toFixed(2)), top: +top.toFixed(2), crouch: p.crouching }); }
  }
  return { tested: n, climbed, bad };
}

export async function runAll() {
  const t0 = Date.now(); while (!(window.__game && window.__game.world && window.__game.player) && Date.now() - t0 < 25000) await new Promise((r) => setTimeout(r, 500));
  scan(12000); const out = {}; const p = window.__game.player;
  const a = wallJump(1500, 11, -1, 0.6), b = wallJump(1500, 5, 2.0, 12);
  out.wallJumpGround = { tested: a.tested, climbed: a.climbed, inside: a.bad.length, ex: a.bad.slice(0, 6).map((x) => x.at) }; out.wallJumpRoof = { tested: b.tested, climbed: b.climbed, inside: b.bad.length, ex: b.bad.slice(0, 6).map((x) => x.at) };
  const pts = slopedPoints(200, 5); out.sloped = pts.length;
  for (const [name, dt, mode] of [['walk60', 1 / 60, 'walk'], ['jump60', 1 / 60, 'jump'], ['sprint30', 1 / 30, 'sprint'], ['drop60', 1 / 60, 'drop'], ['drop20', 1 / 20, 'drop']]) { const r = roofWalk(pts, dt, 4, mode); out[name] = { bad: r.length, ex: r.slice(0, 4) }; }
  const an = analyse(); ST.underAll = ST.cand.filter((c) => c[3] === 'under'); ST.cand = ST.cand.filter((c) => c[3] !== 'under'); ST.ci = 0; ST.traps = [];
  out.analyse = { roofCells: an.roofCells, pits: an.pits, cand: ST.cand.length, voidCells: ST.underAll.length };
  out.unstuck = p._stuck ? p._stuck.count : 'n/a';
  return out;
}
export function simAll(budget = 30000) { const r = sim(budget); return r.done ? { ...r, clusters: traps().slice(0, 40), unstuck: window.__game.player._stuck ? window.__game.player._stuck.count : 'n/a' } : r; }
// grapple from the ground (or a lower roof) onto pitched roofs and eaves; reports players that end up inside a roof
export function grappleTest(max = 400, seed = 31) {
  const w = window.__game.world, pb = w.playBounds, { nx, nz, H } = ST, p = window.__game.player; const V3 = p.position.constructor; let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pts = slopedPoints(max, seed); const bad = []; let n = 0, arrived = 0;
  for (const [ax, ay, az] of pts) {
    let start = null; for (let t = 0; t < 30 && !start; t++) { const a = rnd() * 6.283, r = 7 + rnd() * 16; const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r; const i = Math.floor((x - pb.minX) / CELL), j = Math.floor((z - pb.minZ) / CELL); if (i < 1 || j < 1 || i >= nx - 1 || j >= nz - 1) continue; const h = H[j * nx + i]; if (h < ay - 1.5 && (rel(j * nx + i) < 0.6 || rnd() < 0.5)) start = [x, h, z]; }
    if (!start) continue; n++;
    p.ladder = null; p.grapple = null; p.mantle = null; p.crouching = false; p.sliding = false; p.dashT = 0; p.position.set(start[0], start[1] + 0.08, start[2]); p.velocity.set(0, 0, 0);
    p.yaw = Math.atan2(-(ax - start[0]), -(az - start[2])); const inp = { forward: 1, strafe: 0, jump: false, sprint: false, crouchToggle: false };
    for (let k = 0; k < 10; k++) p.update(1 / 60, inp);
    p.startGrapple(new V3(ax, topAt(ax, az), az));
    for (let k = 0; k < 240; k++) { p.ladderCooldown = 9; p.update(1 / 60, inp); }
    const e = [p.position.x, p.position.y, p.position.z]; const top = topAt(e[0], e[2]);
    if (e[1] > ay - 1.5 && top - e[1] < 0.5) arrived++;
    if (e[1] > start[1] + 1.2 && top - e[1] > 0.9) { const r = tryLeave(e[0], e[1] - 0.08, e[2], 8); if (!r.ok) bad.push({ from: start.map((v) => +v.toFixed(2)), anchor: [ax, +ay.toFixed(2), az], at: e.map((v) => +v.toFixed(2)), top: +top.toFixed(2) }); }
  }
  return { tested: n, arrived, inside: bad.length, ex: bad.slice(0, 6) };
}
