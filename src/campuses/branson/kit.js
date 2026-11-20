// Branson helpers on top of the Marin kit (src/campuses/marin/kit.js: seating, retaining blocks, hedges, hill fences):
// the campus's own geometry constants, facade styles and a few builders (retaining run, hedge run, graded steps).
import { STYLES, quadFacing as qf } from '../../world/facade.js';
import { ensureCCW, hedgeMass, terraceBlocks, hillFence, guardRail, quadFacing, pointInRing } from '../marin/kit.js';
void qf;

const RAD = Math.PI / 180;
/** Oriented rectangle: centre, w along the bearing `deg` (atan2(z, x)), d across. */
export const obb = (cx, cz, w, d, deg) => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [cx + a * c - b * s, cz + a * s + b * c]); };
/** Point in a rotated frame: `a` along the bearing, `b` across (to the right of it seen from above, i.e. +z for bearing 0). */
export const along = (o, a, b) => { const c = Math.cos(o.ang * RAD), s = Math.sin(o.ang * RAD); return [o.cx + a * c - b * s, o.cz + a * s + b * c]; };

// Tom Ryan Field: painted lines 94.6 x 51.2 m, bearing -8.94 deg (corners from a nadir 3D-tiles view: tools/data/extra.py);
// the turf carpet runs 2.5 m past the goal lines and 2 m past the touchlines
export const FIELD = { cx: -33.2, cz: 92.3, ang: -8.94, L: 94.6, W: 51.2, turfL: 99.6, turfW: 55.2 };
export const fieldRing = (d = 0) => obb(FIELD.cx, FIELD.cz, FIELD.turfL + 2 * d, FIELD.turfW + 2 * d, FIELD.ang);
// Outlines traced from nadir Google 3D-tiles views (the same numbers as tools/data/extra.py, which paints the ground from them)
export const TERRACE = [[-120.4, 26.4], [-112.4, 17.6], [-108.0, 21.2], [-103.2, 23.6], [-98.4, 27.2], [-92.0, 28.8], [-88.0, 34.8], [-95.2, 37.2], [-101.6, 40.8], [-106.8, 44.4], [-109.6, 42.0], [-115.2, 34.0]];
export const TERRACE_TABLES = [[-107.4, 26.0], [-104.0, 29.1], [-99.8, 32.6], [-109.7, 29.8], [-107.0, 32.0], [-103.7, 35.0], [-113.0, 33.0], [-109.7, 35.6], [-106.1, 38.6]];
export const LOOP_GARDEN = [[-103.6, 51.6], [-100.8, 47.6], [-95.2, 44.0], [-87.2, 41.6], [-80.0, 42.0], [-76.2, 45.6], [-77.6, 47.2], [-84.0, 49.2], [-88.0, 51.6], [-92.0, 53.6], [-98.4, 56.0], [-102.8, 54.8]];
export const LOOP_ROWS = [[[-100.0, 57.8], [-84.8, 53.6]], [[-83.2, 52.4], [-78.0, 47.6]], [[-68.0, 52.0], [-75.2, 61.2]], [[-75.2, 61.2], [-84.8, 66.1]], [[-84.8, 66.1], [-92.8, 68.0]]];
export const LOOP_OUTER = [[-106.8, 44.4], [-101.6, 40.8], [-95.2, 37.2], [-87.2, 35.2], [-75.2, 35.6], [-66.4, 37.8], [-62.4, 39.8], [-68.4, 45.2], [-70.3, 47.6], [-65.2, 53.2], [-67.6, 58.8], [-72.8, 64.4], [-79.2, 68.8], [-87.2, 70.4], [-93.6, 70.0], [-95.6, 66.0], [-101.6, 65.3], [-107.2, 62.4], [-109.7, 58.0], [-110.4, 53.2], [-109.2, 47.6]];
export const PAVED_POLYS = [
  [[-156.3, -3.5], [-149.2, -11.8], [-145.3, -8.7], [-137.4, -2.3], [-145.3, 8.3], [-146, 10.7], [-150, 9.9], [-152.4, 5.2], [-157.9, 2]],
  [[-181.5, -27.5], [-153, -43.2], [-110.3, -55.2], [-105.7, -38.8], [-149, -26.8], [-176, -12.5]],
  [[-95.9, -56.5], [-77.8, -60.5], [-75.5, -64.6], [-58.6, -68.1], [-58, -62.9], [-66.1, -58.8], [-51.6, -44.8], [-46.9, -47.7], [-46.3, -36.7], [-53.3, -35.5], [-66.1, -42.5], [-82.4, -53.6], [-92.9, -52.4]],
  [[-30, -26.7], [-16, -33.2], [-12.5, -25], [-5.5, -20.3], [12, -21.5], [13.1, -6.4], [15.5, -1.7], [12, -0.5], [0.3, -5.2], [-16, -8.7], [-23, -13.3], [-30, -22.7]],
  [[-112, 58], [-102.7, 62.7], [-96.8, 70.9], [-109.1, 72.6], [-121.3, 76.7], [-122.5, 93], [-120.7, 95.3], [-126.6, 95.9], [-134.1, 84.3], [-143.5, 88.3], [-144.6, 86], [-134.1, 80.8], [-123.6, 70.9]],
];
export const PAVED_LINES = [[[[-176.9, 5.2], [-166.6, 14.6], [-156.3, 21.0], [-150.0, 30.5]], 3.4], [[[-73.1, 3.0], [-60.3, 3.0], [-48.6, 8.8], [-34.7, 11.7], [-23.0, 20.5]], 3.6]];
export const ARTS_LAWN = [[28.5, -5.9], [32.5, -5.9], [32.5, 1.4], [28.5, 1.4]], ARTS_BRICK = [[35.5, -6.3], [40.6, -6.3], [40.6, -1.0], [35.5, -1.0]];
export const POOL = [[-189, -73], [-183, -71.5], [-186, -60], [-192, -61.5]], POOL_DECK = [[-196, -76], [-179, -73.5], [-181, -69], [-185, -58], [-196, -59.5], [-196.5, -70]], POOL_HOUSE = [[-195, -58], [-188, -58], [-188, -54], [-195, -54]];
export const ARTS_PLAZA = [[27.6, -8.5], [34.3, -11.3], [42.6, -10.0], [45.4, 1.6], [32.3, 4.0], [29.2, 2.0]];
// the two tennis courts north of the Commons (one slab, courts side by side)
export const TENNIS = { cx: -96.7, cz: -27.2, ang: 32.2, w: 36.6, d: 33.5 };
export const tennisRing = (d = 0) => obb(TENNIS.cx, TENNIS.cz, TENNIS.w + 2 * d, TENNIS.d + 2 * d, TENNIS.ang);
// carriageway widths (Ross lanes: no kerb parking, no sidewalks)
export const STREET_W = { tertiary: 7.4, residential: 6.2, unclassified: 6.0 };
export const LOOP_EAST = 570965051;   // the east half of the car-park loop (OSM service): graded with Park Drive
export const isStreet = (r) => !!STREET_W[r.tags.highway] || r.id === LOOP_EAST;
export const streetWidth = (r) => STREET_W[r.tags.highway] || 6.0;

export function simplify(ring, tol = 0.6) {
  let r = ensureCCW(ring).slice(); let changed = true;
  while (changed && r.length > 4) {
    changed = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length], b = r[i], c = r[(i + 1) % r.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1e-6; const dist = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / L;
      if (dist < tol && r.length > 4) { r.splice(i, 1); changed = true; break; }
    }
  }
  return r;
}
export const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };

export function addStyles() {
  Object.assign(STYLES, {
    brKbh: { kind: 'class', bay: 4.4, frame: 'frame', top: 'stone', tint: [0.86, 0.75, 0.52], beds: true },          // cream stucco, clay tile roofs
    brQuadLow: { kind: 'lowmod', bay: 4.4, frame: 'frame', top: 'stone', tint: [0.86, 0.75, 0.52], beds: true },
    brGym: { kind: 'gym', bay: 6.0, frame: 'frame', top: 'stone', tint: [0.5, 0.38, 0.27], clerestory: true },      // brown wood siding
    brCommons: { kind: 'lowmod', bay: 4.6, frame: 'frameAlu', top: 'panel', tint: [0.6, 0.59, 0.56] },                // board-formed concrete wings
    brHall: { kind: 'modern', bay: 4.8, frame: 'frameAlu', top: 'panel', tint: [0.66, 0.6, 0.5] },                   // the Commons hall: glass under a metal gable
    brArts: { kind: 'modern', bay: 4.9, frame: 'frameAlu', top: 'panel', tint: [0.9, 0.89, 0.86] },
    brNewHouse: { kind: 'class', bay: 3.6, frame: 'frame', top: 'stone', tint: [0.6, 0.62, 0.64] },                     // New House: grey clapboard, white trim
    brArtsLow: { kind: 'lowmod', bay: 4.4, frame: 'frameAlu', top: 'panel', tint: [0.62, 0.62, 0.6] },
  });
}

/**
 * Retaining wall along a polyline (the face line), holding ground that stands above `frontY` on the side away from
 * `inside` ([x, z], a point on the low side). Built from the Marin kit's terraceBlocks in panels of ~8 m: at most 1.5 m
 * per riser on long runs, copings, planting, a guard rail over 1.2 m. A panel whose bank is under `min` gets nothing.
 * opts: d (depth behind the face, default 4.7: the pad's blend + a lattice cell), frontY, min, fence { h } on the top
 * edge (black ball-stop mesh). Returns the panels built: [{ mid, top }].
 */
export function retainRun(ctx, pts, inside, opts = {}) {
  const d = opts.d || 4.7, frontY = opts.frontY ?? 0, min = opts.min ?? 0.7; const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const n = Math.max(1, Math.round(L / 8)); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    let fx = -tz, fz = tx; if (fx * (inside[0] - a[0]) + fz * (inside[1] - a[1]) < 0) { fx = -fx; fz = -fz; }   // out of the face, toward the low side
    for (let k = 0; k < n; k++) {
      const w = L / n, mx = a[0] + tx * w * (k + 0.5), mz = a[1] + tz * w * (k + 0.5);
      let top = -Infinity; for (let u = -w / 2; u <= w / 2 + 1e-6; u += w / 6) for (let v = 0.3; v <= d + 0.21; v += 0.4) top = Math.max(top, ctx.groundY(mx + tx * u - fx * v, mz + tz * u - fz * v));
      if (top - frontY < min) { out.push({ mid: [mx, mz], top: null, p: [mx - tx * w / 2, mz - tz * w / 2], q: [mx + tx * w / 2, mz + tz * w / 2] }); continue; }
      terraceBlocks(ctx, { x: mx, z: mz, tx, tz, fx, fz, w: w + 0.04, regW: w, d, frontY, plant: true });
      out.push({ mid: [mx, mz], top: top + 0.1, p: [mx - tx * w / 2, mz - tz * w / 2], q: [mx + tx * w / 2, mz + tz * w / 2] });
    }
  }
  return out;
}

/**
 * Tall clipped hedge along a polyline (Ross: every lot on Fernhill Ave hides behind one). Pieces of ~4.7 m standing on
 * their lowest ground, each tested against the street design (nothing on a carriageway or within `clear` of it), the
 * building footprints and the keep-clear circles; a piece without a neighbour is dropped. opts: h, d, gaps [[d0, d1]]
 * along the line, seed, oneRow.
 */
/**
 * One piece of a continuous clipped hedge WALL (rule F28): a box section with a chamfered top whose base and top follow
 * the ground at its two ends, so neighbouring pieces (which share end points) join without steps or gaps. Solid as drawn.
 */
export function hedgeWall(ctx, mx, mz, w, d, h, rot, seed = 1) {
  const { B } = ctx; const tx = Math.cos(rot), tz = -Math.sin(rot), nx = -tz, nz = tx; const e = [[mx - tx * w / 2, mz - tz * w / 2], [mx + tx * w / 2, mz + tz * w / 2]];
  const g = e.map((p) => Math.min(ctx.groundY(p[0], p[1]), ctx.groundY(p[0] + nx * d / 2, p[1] + nz * d / 2), ctx.groundY(p[0] - nx * d / 2, p[1] - nz * d / 2)));
  const gm = e.map((p) => Math.max(ctx.groundY(p[0], p[1]), ctx.groundY(p[0] + nx * d / 2, p[1] + nz * d / 2), ctx.groundY(p[0] - nx * d / 2, p[1] - nz * d / 2)));
  const oy = B.off ? B.off.y : 0; const bk = B.v('maHedge', true); const v = 0.82 + ((seed * 37) % 10) * 0.012; bk.setColor(0.74 * v, 0.92 * v, 0.66 * v);
  const P = (k, o, y) => [e[k][0] + nx * o, y - oy, e[k][1] + nz * o]; const top = (k) => gm[k] + h, sh = (k) => gm[k] + h - 0.35, bot = (k) => g[k] - 0.3; const S = 0.5, hd = d / 2, td = d / 2 - 0.3;
  const q = (p0, p1, p2, p3, n, u0, u1, v0, v1) => quadFacing(bk, p0, p1, p2, p3, n, [[u0 * S, v0 * S], [u1 * S, v0 * S], [u1 * S, v1 * S], [u0 * S, v1 * S]]);
  const u0 = (mx * tx + mz * tz) - w / 2, u1 = u0 + w;
  for (const sd of [-1, 1]) { q(P(0, sd * hd, bot(0)), P(1, sd * hd, bot(1)), P(1, sd * hd, sh(1)), P(0, sd * hd, sh(0)), [sd * nx, 0, sd * nz], u0, u1, 0, h); q(P(0, sd * hd, sh(0)), P(1, sd * hd, sh(1)), P(1, sd * td, top(1)), P(0, sd * td, top(0)), [sd * nx, 0.7, sd * nz], u0, u1, h, h + 0.45); }
  q(P(0, -td, top(0)), P(1, -td, top(1)), P(1, td, top(1)), P(0, td, top(0)), [0, 1, 0], u0, u1, 0, d);
  for (const k of [0, 1]) { const n = [k ? tx : -tx, 0, k ? tz : -tz]; q(P(k, -hd, bot(k)), P(k, hd, bot(k)), P(k, hd, sh(k)), P(k, -hd, sh(k)), n, 0, d, 0, h); q(P(k, -hd, sh(k)), P(k, hd, sh(k)), P(k, td, top(k)), P(k, -td, top(k)), n, 0, d, h, h + 0.4); }
  bk.setColor(1, 1, 1);
  const yb = Math.min(bot(0), bot(1)), yt = Math.min(top(0), top(1)); B.c('wood').box(mx, (yb + yt) / 2 - oy, mz, w, yt - yb, d, rot);
  if (ctx.shrubs && false) ctx.shrubs.push([mx, yt, mz]);
}

export function hedgeRun(ctx, pts, opts = {}) {
  const h = opts.h || 2.7, dp = opts.d || 1.5, clear = opts.clear ?? 0.5, step = 4.7; const S = ctx.streets; const pb = ctx.playBounds; let dist = 0; const cand = [];
  const half = dp / 2;   // half depth as DRAWN (a solid mass is as deep as it is drawn)
  const bad = (x, z) => (S && S.inRoad(x, z, clear)) || (ctx.buildingRings || []).some((r) => pointInRing(x, z, r)) || (ctx.keepClear || []).some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r) || (opts.inBounds && (x < pb.minX - 3 || x > pb.maxX + 3 || z < pb.minZ - 3 || z > pb.maxZ + 3));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1.5) { dist += L; continue; } const n = Math.max(1, Math.round(L / step)); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const w = L / n;
    for (let k = 0; k < n; k++) {
      const d0 = dist + w * k, d1 = d0 + w; const mx = a[0] + tx * w * (k + 0.5), mz = a[1] + tz * w * (k + 0.5);
      if ((opts.gaps || []).some(([g0, g1]) => d1 > g0 && d0 < g1)) continue;
      let ok = true, y = Infinity, yMax = -Infinity; for (const u of [-w / 2, 0, w / 2]) for (const v of [-half, 0, half]) { const x = mx + tx * u - tz * v, z = mz + tz * u + tx * v; if (bad(x, z)) ok = false; const g = ctx.groundY(x, z); y = Math.min(y, g); yMax = Math.max(yMax, g); }
      if (!ok || yMax - y > 2.2) continue;
      cand.push({ mx, mz, y, yMax, w, rot: Math.atan2(-tz, tx), idx: cand.length, key: i * 1000 + k });
    }
    dist += L;
  }
  let nBuilt = 0;
  cand.forEach((c, j) => { const nb = (o) => o && Math.abs(o.key - c.key) === 1 || (o && Math.hypot(o.mx - c.mx, o.mz - c.mz) < step * 1.4); if (!nb(cand[j - 1]) && !nb(cand[j + 1])) return;
    hedgeWall(ctx, c.mx, c.mz, c.w, dp, h, c.rot, (opts.seed || 0) + j); nBuilt++; });
  return nBuilt;
}

/**
 * Flight of steps down a graded ramp (the ground itself is the ramp: sitework cut it with `stairGrade`). Risers are
 * drawn on the ground line; the collision is the plane through the nosings (MAP_NOTES: walk every stair with __walk),
 * with a low cheek kerb and a handrail each side. spec: { a: [x, z] top, b: [x, z] bottom, w }.
 */
export function stairGrade(ctx, spec) {
  const T = ctx.terrain; if (!T) return; const { a, b, w } = spec; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
  const ya = T.heightAt(a[0] - tx * 1.5, a[1] - tz * 1.5), yb = T.heightAt(b[0] + tx * 1.5, b[1] + tz * 1.5); spec.ya = ya; spec.yb = yb;
  const rect = { cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, w: L + 3.0, d: w + 0.8, angle: Math.atan2(tz, tx) };
  ctx.flatten({ rect }, { blend: 1.6, y: (x, z) => { const t = Math.max(0, Math.min(1, ((x - a[0]) * tx + (z - a[1]) * tz) / L)); return ya + (yb - ya) * t; } });
}
export function buildStairs(ctx, spec) {
  const { B } = ctx; const { a, b, w } = spec; if (spec.ya === undefined) return null; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const nx = -tz, nz = tx;
  const drop = spec.ya - spec.yb; const n = Math.max(2, Math.round(drop / 0.16)); const riser = drop / n, tread = L / n; const rot = Math.atan2(-tz, tx);
  const conc = B.v(spec.brick ? 'brickRed' : 'concrete'), lime = B.v('limestone');
  // steps: each a box from below the ramp up to its tread level (the nosing line runs from (a, ya) to (b, yb))
  for (let k = 0; k < n; k++) { const u = tread * (k + 0.5), yTop = spec.ya - riser * k; const cx = a[0] + tx * u, cz = a[1] + tz * u;
    conc.box(cx, yTop - 0.35, cz, tread + 0.02, 0.7, w, rot, 1 / 3); lime.box(a[0] + tx * (tread * (k + 1) - 0.05), yTop + 0.006, a[1] + tz * (tread * (k + 1) - 0.05), 0.1, 0.012, w, rot, 1 / 3); }
  // collision: the plane through the nosings, 0.02 above the top tread at the head, meeting the ground at the foot
  const P = (u, v, y) => [a[0] + tx * u + nx * v, y, a[1] + tz * u + nz * v]; const y0 = spec.ya + 0.01, y1 = spec.yb + 0.01; const col = B.c('concrete');
  { const yn = spec.yb + riser + 0.01;   // level head, the nosing plane, a short lead-out onto the ground at the foot
    quadFacing(col, P(-0.3, -w / 2, y0), P(-0.3, w / 2, y0), P(tread, w / 2, y0), P(tread, -w / 2, y0), [0, 1, 0]);
    quadFacing(col, P(tread, -w / 2, y0), P(tread, w / 2, y0), P(L, w / 2, yn), P(L, -w / 2, yn), [0, 1, 0]);
    quadFacing(col, P(L, -w / 2, yn), P(L, w / 2, yn), P(L + 0.7, w / 2, y1 - 0.06), P(L + 0.7, -w / 2, y1 - 0.06), [0, 1, 0]); }
  // cheek kerbs (sloping) + handrails
  for (const sd of [-1, 1]) { const v = sd * (w / 2 + 0.12);
    if (spec.brick) { const ww = 0.45, up = 0.6, vv = sd * (w / 2 + ww / 2); for (const bk of [conc, col]) { quadFacing(bk, P(-0.4, vv - ww / 2, y0 + up), P(-0.4, vv + ww / 2, y0 + up), P(L + 0.5, vv + ww / 2, y1 + up), P(L + 0.5, vv - ww / 2, y1 + up), [0, 1, 0]); for (const o of [-1, 1]) quadFacing(bk, P(-0.4, vv + o * ww / 2, y0 - 1.2), P(L + 0.5, vv + o * ww / 2, y1 - 1.2), P(L + 0.5, vv + o * ww / 2, y1 + up), P(-0.4, vv + o * ww / 2, y0 + up), [o * nx, 0, o * nz]); for (const [u, yy] of [[-0.4, y0], [L + 0.5, y1]]) quadFacing(bk, P(u, vv - ww / 2, yy - 1.2), P(u, vv + ww / 2, yy - 1.2), P(u, vv + ww / 2, yy + up), P(u, vv - ww / 2, yy + up), [u < 0 ? -tx : tx, 0, u < 0 ? -tz : tz]); } continue; }   // brick cheek walls stepping with the flight, no steel rails
    for (const bk of [conc, col]) { quadFacing(bk, P(0, v - 0.12, y0 + 0.25), P(0, v + 0.12, y0 + 0.25), P(L, v + 0.12, y1 + 0.25), P(L, v - 0.12, y1 + 0.25), [0, 1, 0]);
      quadFacing(bk, P(0, v - sd * 0.12, y0 - 0.8), P(L, v - sd * 0.12, y1 - 0.8), P(L, v - sd * 0.12, y1 + 0.25), P(0, v - sd * 0.12, y0 + 0.25), [-sd * nx, 0, -sd * nz]);
      quadFacing(bk, P(0, v + sd * 0.12, y0 - 0.8), P(L, v + sd * 0.12, y1 - 0.8), P(L, v + sd * 0.12, y1 + 0.25), P(0, v + sd * 0.12, y0 + 0.25), [sd * nx, 0, sd * nz]); }
    const m = B.v('blackMetal'); const np = Math.max(2, Math.round(L / 1.8)); for (let k = 0; k <= np; k++) { const u = L * k / np, y = y0 + (y1 - y0) * k / np; const p = P(u, v, y + 0.25); m.box(p[0], p[1] + 0.45, p[2], 0.04, 0.9, 0.04, rot); }
    m.tube(P(0, v, y0 + 1.15), P(L, v, y1 + 1.15), 0.025, 6);
    const c0 = P(L / 2, v, (y0 + y1) / 2 + 0.7); const len = Math.hypot(L, drop); const g = new Float32Array(0); void g;
    // rail collision: a thin sloping slab (two quads back to back are enough for the capsule)
    quadFacing(B.c('metal'), P(0, v, y0 + 0.25), P(L, v, y1 + 0.25), P(L, v, y1 + 1.15), P(0, v, y0 + 1.15), [sd * nx, 0, sd * nz]); quadFacing(B.c('metal'), P(L, v, y1 + 0.25), P(0, v, y0 + 0.25), P(0, v, y0 + 1.15), P(L, v, y1 + 1.15), [-sd * nx, 0, -sd * nz]); void c0; void len; }
  return { n, riser, tread, drop };
}
export { hillFence, guardRail, hedgeMass, terraceBlocks };
