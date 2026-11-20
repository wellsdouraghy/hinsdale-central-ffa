// Branson grounds: Tom Ryan Field (paint, goals, the retaining wall and ball-stop fences), the tennis courts, parked
// cars in the three car parks, the hedges of Fernhill Ave, the Branson Gate, lamps, the dining terrace, the Alumni
// Steps, bridge rails over Ross Creek and the play-area edge.
import { atGround, onSlope, hillFence, guardRail, wallDecal, edgeFrame, pointInRing, makeCanvas, mulberry32 } from '../marin/kit.js';
import * as THREE from 'three';
import { paintedQuad } from '../../world/fields.js';
import { nameBoard } from './extras.js';
import { lampPost, turfNoise, landmarkKit } from '../../world/landmarks.js';
import { propKit } from '../../world/props.js';
import { TERRACE_TABLES, LOOP_GARDEN, LOOP_ROWS, FIELD, TENNIS, along, fieldRing, tennisRing, retainRun, hedgeRun, buildStairs, isStreet, streetWidth } from './kit.js';

const RAD = Math.PI / 180;
// the Alumni Steps: from Katharine Branson Hall's south lawn down the bank to the car-park loop (graded in sitework)
export const ALUMNI_STEPS = [{ a: [-70, 12], b: [-76, 33], w: 2.4 },
  { a: [-86.6, 27.7], b: [-92.0, 28.6], w: 3.2, brick: true }];   // the red-brick steps from the lawn path down to the dining terrace (nadir tiles)
// open spots the car layout keeps free (flag bases and the practice pad are added by the builder)
export const CAR_FREE = [[-112, 30]];
// The Bridge over Ross Creek (campus map item 12): from the end of Park Drive (a) to the quad path (b); deck level y
export const BRIDGE = { a: [-141.6, 89.6], b: [-147.4, 95.4], y: 1.3, w: 3.2 };
BRIDGE.mid = [(BRIDGE.a[0] + BRIDGE.b[0]) / 2, (BRIDGE.a[1] + BRIDGE.b[1]) / 2]; BRIDGE.span = Math.hypot(BRIDGE.b[0] - BRIDGE.a[0], BRIDGE.b[1] - BRIDGE.a[1]);
BRIDGE.creekAng = Math.atan2(BRIDGE.b[1] - BRIDGE.a[1], BRIDGE.b[0] - BRIDGE.a[0]) - Math.PI / 2;   // the creek runs square to the bridge here (OSM waterway 1286786146)
/** Distance to Ross Creek's centre line (OSM waterway) as a function (x, z) -> metres. */
export function creekSDF(ctx) { const segs = []; for (const r of ctx.data.roads) { if (r.tags.name !== 'Ross Creek') continue; for (let i = 0; i < r.line.length - 1; i++) segs.push([r.line[i], r.line[i + 1]]); }
  return (x, z) => { let m = 1e9; for (const [a, b] of segs) { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); m = Math.min(m, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)); } return m; }; }
const gY = (ctx, x, z) => (ctx.groundY ? ctx.groundY(x, z) : 0);
const TURF_GREEN = '#3a7a3e';

// ------------------------------------------------------------------------------------------ Tom Ryan Field
function field(ctx) {
  const { B, quality } = ctx; const F = FIELD; const ppm = quality === 'high' ? 16 : quality === 'low' ? 8 : 11; const W = Math.round(F.turfW * ppm), H = Math.round(F.turfL * ppm);
  const c = makeCanvas(W, H), g = c.getContext('2d'); const X = (b) => (b + F.turfW / 2) * ppm, Y = (a) => (F.turfL / 2 - a) * ppm;   // a along the pitch (east +), b across (south +)
  g.fillStyle = TURF_GREEN; g.fillRect(0, 0, W, H);
  for (let a = -F.L / 2, k = 0; a < F.L / 2 - 0.1; a += F.L / 20, k++) if (k % 2) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(X(-F.W / 2), Y(a + F.L / 20), F.W * ppm, F.L / 20 * ppm); }   // mowing bands
  const line = (col, w) => { g.strokeStyle = col; g.lineWidth = Math.max(1.5, w * ppm); };
  const seg = (a0, b0, a1, b1) => { g.beginPath(); g.moveTo(X(b0), Y(a0)); g.lineTo(X(b1), Y(a1)); g.stroke(); };
  const arc = (ac, bc, r, s, e) => { g.beginPath(); g.arc(X(bc), Y(ac), r * ppm, s, e); g.stroke(); };
  const A = F.L / 2, Bh = F.W / 2;
  // soccer (white): touchlines, halfway line, centre circle, penalty and goal areas, arcs, spots (the imagery shows these)
  line('#f1f1ec', 0.12);
  g.strokeRect(X(-Bh), Y(A), F.W * ppm, F.L * ppm); seg(0, -Bh, 0, Bh); arc(0, 0, 9.15, 0, 7);
  for (const s of [-1, 1]) {
    const ae = s * A;
    g.strokeRect(X(-20.16), Y(Math.max(ae, ae - s * 16.5)), 40.32 * ppm, 16.5 * ppm); g.strokeRect(X(-9.16), Y(Math.max(ae, ae - s * 5.5)), 18.32 * ppm, 5.5 * ppm);
    g.beginPath(); g.arc(X(0), Y(ae - s * 11), 9.15 * ppm, s > 0 ? 0.3 * Math.PI : 1.3 * Math.PI, s > 0 ? 0.7 * Math.PI : 1.7 * Math.PI); g.stroke();
    g.fillStyle = '#f1f1ec'; g.beginPath(); g.arc(X(0), Y(ae - s * 11), 0.16 * ppm, 0, 7); g.fill();
  }
  // the second line set (nadir tiles): lacrosse restraining lines, goal circles and the 8 m / 12 m arcs, thinner and yellow
  line('#d9cf6a', 0.07); for (const s of [-1, 1]) { seg(s * 15.6, -Bh, s * 15.6, Bh); const ac = s * (A - 11.8); arc(ac, 0, 2.6, 0, 7);
    g.beginPath(); g.arc(X(0), Y(ac), 10.6 * ppm, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : 2 * Math.PI); g.stroke(); g.beginPath(); g.arc(X(0), Y(ac), 14.6 * ppm, s > 0 ? 0.12 * Math.PI : 1.12 * Math.PI, s > 0 ? 0.88 * Math.PI : 1.88 * Math.PI); g.stroke(); }
  // BRANSON across the centre circle, read from the north touchline (the imagery: blue letters outlined in white)
  g.save(); g.translate(X(0), Y(0)); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = `900 ${Math.round(4.3 * ppm)}px "Arial Black", Arial, sans-serif`; g.strokeStyle = '#f4f4f0'; g.lineWidth = 0.5 * ppm; g.strokeText('BRANSON', 0, 0); g.fillStyle = '#1d4fa3'; g.fillText('BRANSON', 0, 0); g.restore();
  turfNoise(g, W, H, quality === 'low' ? 30 : 12, 23);
  paintedQuad(ctx, c, F.cx, F.cz, F.turfW, F.turfL, F.ang * RAD, { cut: false, y: 0.018, nScale: 0.5, rough: 0.95 });
  // goals
  const cs = Math.cos(F.ang * RAD), sn = Math.sin(F.ang * RAD); const gw = along(F, -A, 0), ge = along(F, A, 0);
  landmarkKit.soccerGoal(ctx, gw[0], gw[1], Math.atan2(-cs, -sn)); landmarkKit.soccerGoal(ctx, ge[0], ge[1], Math.atan2(cs, sn));
  // South side: the pitch is cut into the toe of the wooded hill. A retaining wall (terraced, planted) holds the bank
  // 2 m outside the turf; where there is no bank to hold, a black ball-stop fence.
  const R2 = fieldRing(2.0); const south = [R2[3], R2[2]];
  const nRet = (ctx.retaining || []).length; const panels = retainRun(ctx, south, [F.cx, F.cz], { d: 4.7, frontY: 0, min: 0.7 });
  for (let k = nRet; k < (ctx.retaining || []).length; k++) ctx.retaining[k].allowTall = true;   // the pitch's wall: terraced wherever the bank lets a tread in, one taller riser where the toe of the hill is too steep for one
  { let run = []; const flush = () => { if (run.length > 1) hillFence(ctx, run, { h: 3.0, black: true, every: 3 }); run = []; };
    for (const p of panels) { if (p.top !== null || (ctx.buildingRings || []).some((r) => pointInRing(p.mid[0], p.mid[1], r))) { flush(); continue; } if (!run.length) run.push(p.p); run.push(p.q); } flush(); }
  // east end: a 6 m ball-stop net on four tall posts behind the goal (grapple targets), open at both corners
  { const pts = [-15, -5, 5, 15].map((b) => along(F, F.turfL / 2 + 1.2, b)); const net = B.v('net'); const post = B.v('blackMetal');
    for (const p of pts) atGround(ctx, p[0], p[1], () => { post.cyl(p[0], 0, p[1], 0.09, 0.07, 6.2, 8, 1, true); B.c('metal').box(p[0], 3.1, p[1], 0.24, 6.2, 0.24); ctx.grapplePoles.push({ x: p[0], z: p[1], y0: 1, y1: 6.2, r: 0.09 }); }, 0.3, 'min');
    for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; const y = Math.min(gY(ctx, a[0], a[1]), gY(ctx, b[0], b[1])); net.quad([a[0], y + 0.1, a[1]], [a[0], y + 6.1, a[1]], [b[0], y + 6.1, b[1]], [b[0], y + 0.1, b[1]], [0, 0], [0, 6], [10, 6], [10, 0]);
      B.c('metal:mesh').box((a[0] + b[0]) / 2, y + 3.1, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]), 6, 0.08, Math.atan2(-(b[1] - a[1]), b[0] - a[0])); } }
  // team benches on the north touchline (no bleachers: the school's use permit forbids grandstands and field lights)
  for (const a of [-22, -14, 14, 22]) { const p = along(F, a, -F.turfW / 2 + 1.2); propKit.bench(ctx, p[0], p[1], -F.ang * RAD + Math.PI); }
  { const p = along(F, 49.5, -20); landmarkKit.soccerGoal(ctx, p[0], p[1], 0.9); }
}

// ------------------------------------------------------------------------------------------ tennis courts
function tennis(ctx) {
  const { B } = ctx; const T = TENNIS; const y0 = ctx.tennisY ?? gY(ctx, T.cx, T.cz); const ppm = ctx.quality === 'low' ? 8 : 12; const W = Math.round(T.d * ppm), H = Math.round(T.w * ppm);
  const c = makeCanvas(W, H), g = c.getContext('2d'); const X = (b) => (b + T.d / 2) * ppm, Y = (a) => (T.w / 2 - a) * ppm;
  g.fillStyle = '#4f7f55'; g.fillRect(0, 0, W, H);
  for (const bc of [-7.9, 7.9]) {
    g.fillStyle = '#3a66b0'; g.fillRect(X(bc - 5.485), Y(11.885), 10.97 * ppm, 23.77 * ppm);
    g.strokeStyle = '#f4f4f0'; g.lineWidth = Math.max(1.5, 0.05 * ppm);
    g.strokeRect(X(bc - 5.485), Y(11.885), 10.97 * ppm, 23.77 * ppm); g.strokeRect(X(bc - 4.115), Y(11.885), 8.23 * ppm, 23.77 * ppm);
    g.strokeRect(X(bc - 4.115), Y(6.4), 8.23 * ppm, 12.8 * ppm); g.beginPath(); g.moveTo(X(bc), Y(6.4)); g.lineTo(X(bc), Y(-6.4)); g.moveTo(X(bc - 5.485), Y(0)); g.lineTo(X(bc + 5.485), Y(0)); g.stroke();
  }
  turfNoise(g, W, H, 10, 5);
  paintedQuad(ctx, c, T.cx, T.cz, T.d, T.w, T.ang * RAD, { y: y0 + 0.018, nScale: 0.6, rough: 0.9 });
  const rot = -T.ang * RAD;
  for (const bc of [-7.9, 7.9]) {   // nets: posts 0.91 m outside the doubles lines, 1.07 m high
    const a = along(T, 0, bc - 6.4), b = along(T, 0, bc + 6.4), m = along(T, 0, bc);
    B.v('net').quad([a[0], y0 + 0.05, a[1]], [a[0], y0 + 1.0, a[1]], [b[0], y0 + 1.0, b[1]], [b[0], y0 + 0.05, b[1]], [0, 0], [0, 2], [24, 2], [24, 0]);
    B.v('whitePanel').box(m[0], y0 + 1.02, m[1], 0.05, 0.06, 12.8, rot);
    for (const p of [a, b]) B.v('blackMetal').cyl(p[0], y0, p[1], 0.04, 0.04, 1.07, 8, 1, true);
    B.c('metal:mesh').box(m[0], y0 + 0.52, m[1], 0.08, 1.05, 12.8, rot);
  }
  // 3 m black chain-link all round, gates on three sides
  const R = tennisRing(0.4); hillFence(ctx, [...R, R[0]], { h: 3.0, black: true, every: 3, gaps: [[16, 18.4], [37.4 + 15.5, 37.4 + 17.9], [37.4 + 34.3 + 17, 37.4 + 34.3 + 19.4]] });
  // a bench between the courts
  { const p = along(T, -14.5, 0); atGround(ctx, p[0], p[1], () => 0, 0.3); propKit.bench(ctx, p[0], p[1], rot); }
}

// ------------------------------------------------------------------------------------------ parked cars
function vehicles(ctx) {
  const { playBounds: pb } = ctx; const rnd = mulberry32(1920);
  const tpls = [propKit.buildCarTemplate(propKit.CAR_TYPES.suv), propKit.buildCarTemplate(propKit.CAR_TYPES.sedan), propKit.buildCarTemplate(propKit.CAR_TYPES.hatch)];
  const keep = ctx.keepClear || []; const trunks = ctx.gen.trees || []; const placed = []; let n = 0; const S = ctx.streets;
  let loose = false; const car = (x, z, heading, fill = 0.7) => {
    const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(); if (r4 > fill) return;
    if (x < pb.minX + 3 || x > pb.maxX - 3 || z < pb.minZ + 3 || z > pb.maxZ - 3) return;
    if (keep.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r)) return;
    if (ctx.surfaceAt(x, z) !== 'asphalt' || (S && !loose && S.inRoad(x, z, 1.2))) return;
    if (ctx.terrain && (ctx.terrain.slopeAt(x, z) > 0.1 || ctx.terrain.maxIn(x, z, 2.4) - ctx.terrain.minIn(x, z, 2.4) > 0.45)) return;
    const c = Math.cos(heading), s = Math.sin(heading); const corners = [[2.3, 1.0], [2.3, -1.0], [-2.3, 1.0], [-2.3, -1.0]].map(([l, w]) => [x + l * c + w * s, z - l * s + w * c]);
    if (ctx.terrain && ctx.terrain.meshHeightAt) { const g = ctx.groundY, y0 = g(x, z), gx = (g(x + 2, z) - g(x - 2, z)) / 4, gz = (g(x, z + 2) - g(x, z - 2)) / 4; if (corners.some(([px, pz]) => Math.abs(ctx.terrain.meshHeightAt(px, pz) - (y0 + gx * (px - x) + gz * (pz - z))) > 0.3)) return; }
    if (corners.some(([px, pz]) => (ctx.buildingRings || []).some((r) => pointInRing(px, pz, r)) || (S && !loose && S.inRoad(px, pz, 0.3)))) return;
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.55) || trunks.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.4)) return;
    const tpl = r1 < 0.45 ? tpls[0] : r1 < 0.8 ? tpls[1] : tpls[2]; const col = propKit.CAR_COLORS[Math.floor(r2 * propKit.CAR_COLORS.length)];
    onSlope(ctx, x, z, 2.0, () => propKit.placeCar(ctx, tpl, x, z, heading + (r3 - 0.5) * 0.05, col)); placed.push([x, z]); n++;
  };
  // painted line on the ground between two points (0.1 m wide), following the surface
  const pt = ctx.B.v('paint', true); const gline = (x0, z0, x1, z1, w = 0.1, col = [0.82, 0.82, 0.8]) => { const L = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.ceil(L / 1.6)); const tx = (x1 - x0) / L, tz = (z1 - z0) / L, nx = -tz * w / 2, nz = tx * w / 2; pt.setColor(...col);
    for (let k = 0; k < n; k++) { const ax = x0 + tx * L * k / n, az = z0 + tz * L * k / n, bx = x0 + tx * L * (k + 1) / n, bz = z0 + tz * L * (k + 1) / n; const y = (x, z) => gY(ctx, x, z) + 0.03; pt.quad([ax + nx, y(ax + nx, az + nz), az + nz], [bx + nx, y(bx + nx, bz + nz), bz + nz], [bx - nx, y(bx - nx, bz - nz), bz - nz], [ax - nx, y(ax - nx, az - nz), az - nz]); pt.quad([ax - nx, y(ax - nx, az - nz), az - nz], [bx - nx, y(bx - nx, bz - nz), bz - nz], [bx + nx, y(bx + nx, bz + nz), bz + nz], [ax + nx, y(ax + nx, az + nz), az + nz]); }
    pt.setColor(1, 1, 1); };
  ctx.gline = gline;
  // a row of 2.75 m stalls along a -> b (the cars' centre line), nose toward `side`; stall lines 5 m long on asphalt only
  const row = (a, b, side, fill) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const hd = Math.atan2(-(tx * side), -tz * side);   // nose along the row's normal
    const nS = Math.max(1, Math.floor(L / 2.75)), o = (L - nS * 2.75) / 2; let stalls = 0;
    for (let k = 0; k <= nS; k++) { const x = a[0] + tx * (o + k * 2.75), z = a[1] + tz * (o + k * 2.75); const p0 = [x - tz * 2.45, z + tx * 2.45], p1 = [x + tz * 2.45, z - tx * 2.45]; if (ctx.surfaceAt(p0[0], p0[1]) === 'asphalt' && ctx.surfaceAt(p1[0], p1[1]) === 'asphalt' && ctx.surfaceAt(x, z) === 'asphalt' && !(S && !loose && S.inRoad(x, z, 0.2))) { gline(p0[0], p0[1], p1[0], p1[1]); stalls++; } }
    for (let k = 0; k < nS; k++) car(a[0] + tx * (o + (k + 0.5) * 2.75), a[1] + tz * (o + (k + 0.5) * 2.75), hd, fill);
    ctx.stallCount = (ctx.stallCount || 0) + Math.max(0, stalls - 1); };
  // faculty / staff car park along Fernhill Ave: an aisle (OSM service way 570965048) with stalls on both sides
  row([-149.2, -29.9], [-107.2, -41.6], 1, 0.85); row([-150.6, -40.2], [-110.6, -51.4], -1, 0.85);
  row([-176.5, -15.3], [-150.5, -29.3], 1, 0.8); row([-181.5, -24.7], [-154.5, -39.2], -1, 0.8);
  // the car park north of the tennis shed (nadir 3D tiles: a row nose-in on the north edge, one along the shed)
  row([-79.5, -62.9], [-59.7, -66.4], -1, 0.9); row([-82.4, -53.0], [-73.1, -47.7], 1, 0.8);
  // visitor parking in front of Katharine Branson Hall: the long row on the south kerb, the island side, the bay by the hall
  row([-13, -10.5], [13, -3.6], 1, 0.9); row([-5, -19.8], [9, -18.6], -1, 0.75); row([-25.3, -28.5], [-17.8, -32], -1, 0.8);
  // the gym service drive: along the gym's west wall and the bank north of it
  row([-125.6, 84.0], [-122.9, 93.8], -1, 0.85); row([-119.6, 74.4], [-110.2, 66.8], -1, 0.8);
  // the loop: a stall row inside the island's south half and one on the outer south-east kerb (nadir tiles)
  loose = true; LOOP_ROWS.forEach(([p, q], i) => row(p, q, i < 2 ? -1 : 1, 0.9)); loose = false;
  ctx.carCount = n;
}

// ------------------------------------------------------------------------------------------ streets: hedges, gate, lamps, bridge rails
function streetscape(ctx) {
  const { B, data, playBounds: pb } = ctx; const S = ctx.streets;
  const inPlay = (x, z, m = 2) => x > pb.minX + m && x < pb.maxX - m && z > pb.minZ + m && z < pb.maxZ - m;
  const offset = (line, d) => { const out = []; for (let i = 0; i < line.length; i++) { const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; out.push([line[i][0] - (b[1] - a[1]) / L * d, line[i][1] + (b[0] - a[0]) / L * d]); } return out; };
  // Fernhill Ave: 2.5-3 m clipped hedges on both sides (Street View 2025: the houses and Katharine Branson Hall cannot be
  // seen from the road). North side: gaps at the driveways; south side: along the school's frontage, open at the
  // faculty car park, the gate and the service entrance.
  const fern = data.roads.find((r) => r.tags.name === 'Fernhill Avenue');
  if (fern) {
    const w = streetWidth(fern); const line = fern.line.filter((p) => p[0] > pb.minX - 12 && p[0] < pb.maxX + 6);
    // which side is north: offset +d moves to the right of the line's direction; test with the first segment
    const sideN = offset(line, 1)[1][1] < line[1][1] ? 1 : -1;
    const drives = [[-176, -44, 4], [-140, -58, 3.5], [-93, -72, 3.5], [-55, -82, 3.5], [-22, -90, 3.5], [14, -100, 4], [31, -102, 4]];
    const cut = (pts, keep) => { const runs = []; let cur = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / 2.35)); for (let k = 0; k <= n; k++) { const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]; if (keep(p)) cur.push(p); else { if (cur.length > 1) runs.push(cur); cur = []; } } } if (cur.length > 1) runs.push(cur); return runs; };
    const clearOf = (p) => !drives.some(([x, z, r]) => Math.hypot(p[0] - x, p[1] - z) < r) && inPlay(p[0], p[1], -6);
    for (const run of cut(offset(line, sideN * (w / 2 + 2.0)), clearOf)) hedgeRun(ctx, run, { h: 3.4, d: 1.5, seed: 11 });
    const southOk = (p) => clearOf(p) && ((p[0] > -99 && p[0] < -13) || (p[0] > 5 && p[0] < 76)) && inPlay(p[0], p[1], 1);
    for (const run of cut(offset(line, -sideN * (w / 2 + 2.0)), southOk)) hedgeRun(ctx, run, { h: 3.6, d: 1.5, seed: 29 });
  }
  // Fernhill Ave: a double yellow centre line (Street View), on the designed carriageway
  if (fern && ctx.gline) { const L = fern.line.filter((p) => p[0] > pb.minX - 2 && p[0] < pb.maxX + 2 && p[1] > pb.minZ - 1); for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const nx = -(b[1] - a[1]) / d * 0.11, nz = (b[0] - a[0]) / d * 0.11; for (const sd of [-1, 1]) ctx.gline(a[0] + nx * sd, a[1] + nz * sd, b[0] + nx * sd, b[1] + nz * sd, 0.1, [0.78, 0.6, 0.08]); } }
  // The Branson Gate on Fernhill Ave: two cream piers with lanterns where Park Drive enters, low wing walls, the name on the east one
  const park = data.roads.find((r) => r.id === 12187517);
  if (park) {
    const a = park.line[0], b = park.line[1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const nx = -tz, nz = tx; const c = [a[0] + tx * 8.5, a[1] + tz * 8.5]; const rot = Math.atan2(-nz, nx);
    const st = B.v('stucco', true);
    for (const sd of [-1, 1]) {
      const px = c[0] + nx * sd * 4.6, pz = c[1] + nz * sd * 4.6;
      atGround(ctx, px, pz, () => { st.setColor(0.93, 0.86, 0.66); st.box(px, 1.4, pz, 0.95, 2.8, 0.95, rot, 0.45); B.v('limestone').box(px, 2.86, pz, 1.15, 0.12, 1.15, rot, 1 / 3); B.v('blackMetal').box(px, 3.0, pz, 0.3, 0.16, 0.3, rot); B.v('lightEmit').box(px, 3.3, pz, 0.34, 0.44, 0.34, rot); B.v('blackMetal').box(px, 3.56, pz, 0.42, 0.08, 0.42, rot);
        B.c('concrete').box(px, 1.5, pz, 0.95, 3.0, 0.95, rot); ctx.grapplePoles.push({ x: px, z: pz, y0: 1, y1: 3.5, r: 0.5 }); }, 0.6, 'min');
      // wing wall 4.4 m long, 1.2 m high, running away from the drive
      const wx = c[0] + nx * sd * 7.3, wz = c[1] + nz * sd * 7.3;
      atGround(ctx, wx, wz, () => { st.setColor(0.93, 0.86, 0.66); st.box(wx, -0.1, wz, 4.4, 2.6, 0.4, rot, 0.45); B.v('limestone').box(wx, 1.23, wz, 4.5, 0.08, 0.5, rot, 1 / 3); B.c('concrete').box(wx, -0.1, wz, 4.4, 2.6, 0.4, rot);
        if (sd > 0) { const p0 = [wx - nx * 2.2 - tx * 0.2, wz - nz * 2.2 - tz * 0.2], p1 = [wx + nx * 2.2 - tx * 0.2, wz + nz * 2.2 - tz * 0.2]; let Fr = edgeFrame(p0[0], p0[1], p1[0], p1[1]); if (Fr.nx * -tx + Fr.nz * -tz < 0) Fr = edgeFrame(p1[0], p1[1], p0[0], p0[1]);   // face toward Fernhill
          wallDecal(ctx, ctx.M.textDecal(['THE BRANSON SCHOOL'], { w: 1536, h: 192, font: 118, color: '#1d3f7a', align: 'center', weight: 700, spacing: '8px' }), Fr, Fr.L / 2, 0.66, 3.9, 0.49, 0.02); } }, 2.3, 'max');
      st.setColor(1, 1, 1);
    }
  }
  // lamps: the globe posts of the car parks and the drive (sparse: Ross lanes are barely lit). Never on a carriageway.
  const lamps = [];
  const turfRing = fieldRing(4.5); const lamp = (x, z) => { if (pointInRing(x, z, turfRing)) return; if (!inPlay(x, z) || (S && S.inRoad(x, z, 0.5)) || (ctx.buildingRings || []).some((r) => pointInRing(x, z, r)) || lamps.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 12)) return; atGround(ctx, x, z, () => lampPost(ctx, x, z), 0.3, 'min'); lamps.push([x, z]); };
  for (const r of data.roads) {
    if (!(r.tags.name === 'Park Drive' || r.id === 570965051)) continue; const w = streetWidth(r); let side = 1, carry = 9;
    for (let i = 0; i < r.line.length - 1; i++) { const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; let d = carry; for (; d < L; d += 24) { lamp(a[0] + tx * d - tz * side * (w / 2 + 1.1), a[1] + tz * d + tx * side * (w / 2 + 1.1)); side = -side; } carry = d - L; }
  }
  for (const [x, z] of [[-128, -30.5], [-110, -55], [-152, -46], [-2, -6], [-24, -30], [-118, 36], [-96, 30], [-150, 100], [-176, 142], [40, -30], [22, -6], [-66, 70], [-20, 62], [20, 64]]) lamp(x, z);
}

// ------------------------------------------------------------------------------------------ dining terrace, steps
function campusLife(ctx) {
  const { B } = ctx;
  // the Commons' dining terrace: tables under white market umbrellas (the imagery shows about ten)
  const y = ctx.terraceY ?? gY(ctx, -106, 31);
  for (const [x, z] of TERRACE_TABLES) {
    propKit.picnicTable(ctx, x, z, 0.724);
  }
  for (const st of ALUMNI_STEPS) { const r = buildStairs(ctx, st); (ctx.stairNotes = ctx.stairNotes || []).push({ ...st, ...r }); }
  // benches on Katharine Branson Hall's south lawn and by the quad
  for (const [x, z, rot] of [[-46, 14, 0.6], [-18, 26, -0.7], [-172, 128, 1.1]]) { if ((ctx.buildingRings || []).some((r) => pointInRing(x, z, r)) || (ctx.terrain && ctx.terrain.maxIn(x, z, 1.1) - ctx.terrain.minIn(x, z, 1.1) > 0.15)) continue; propKit.bench(ctx, x, z, rot); }
}

// ------------------------------------------------------------------------------------------ the play-area edge
// Chain-link along the bounds (plain through lawns and woods, a green windscreen along pavement), striped barriers plus
// a fence panel where a street leaves the map, nothing where a building forms the edge. Laid out in whole 3 m panels.
function boundary(ctx) {
  const { data, playBounds: pb } = ctx; const m = 1.2;
  const corners = [[pb.minX - m, pb.minZ - m], [pb.maxX + m, pb.minZ - m], [pb.maxX + m, pb.maxZ + m], [pb.minX - m, pb.maxZ + m]];
  const segs = []; for (const r of data.roads) { if (!isStreet(r)) continue; for (let i = 0; i < r.line.length - 1; i++) segs.push([r.line[i], r.line[i + 1], streetWidth(r) / 2 + 1.0]); }
  const onStreet = (x, z) => segs.some(([a, b, w]) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < w; });
  const inBld = (x, z) => (ctx.buildingRings || []).some((r) => pointInRing(x, z, r));
  const trunks = (ctx.gen.trees || []).filter((t) => t[0] > pb.minX - 8 && t[0] < pb.maxX + 8 && t[1] > pb.minZ - 8 && t[1] < pb.maxZ + 8);
  const cxm = (pb.minX + pb.maxX) / 2, czm = (pb.minZ + pb.maxZ) / 2;
  for (let e = 0; e < 4; e++) {
    const a = corners[e], b = corners[(e + 1) % 4]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.ceil(L / 6); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const rot = Math.atan2(-tz, tx);
    let run = null, runScreen = true; const flush = () => { if (run && run.length > 1) hillFence(ctx, run, runScreen ? { h: 2.4, screen: 2.0, every: 3 } : { h: 2.4, every: 3 }); run = null; };
    const ox = e % 2 ? Math.sign(a[0] - cxm) : 0, oz = e % 2 ? 0 : Math.sign(a[1] - czm); const panel = (p0, p1) => hillFence(ctx, [[p0[0] + ox * 0.5, p0[1] + oz * 0.5], [p1[0] + ox * 0.5, p1[1] + oz * 0.5]], { h: 2.4, every: 3 });
    for (let i = 0; i < n; i++) {
      const p0 = [a[0] + tx * (i * L / n), a[1] + tz * (i * L / n)], p1 = [a[0] + tx * ((i + 1) * L / n), a[1] + tz * ((i + 1) * L / n)], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if (inBld(mid[0], mid[1])) { flush(); continue; }
      if (onStreet(mid[0], mid[1])) {
        flush(); panel(p0, p1); const bl = L / n - 0.3; const steep = ctx.terrain && ctx.terrain.maxIn(mid[0], mid[1], 2.8) - ctx.terrain.minIn(mid[0], mid[1], 2.8) > 0.38;
        if (steep) { onSlope(ctx, mid[0], mid[1], bl / 2, () => { ctx.B.solidBox('concrete', 'concrete', mid[0], 0.3, mid[1], bl, 1.0, 0.6, rot, 1 / 3); const pt = ctx.B.v('paint', true); for (const sd of [-0.31, 0.31]) { pt.setColor(0.95, 0.45, 0.05).box(mid[0] + tz * sd, 0.55, mid[1] - tx * sd, bl - 0.3, 0.22, 0.02, rot); pt.setColor(0.9, 0.9, 0.88).box(mid[0] + tz * sd, 0.27, mid[1] - tx * sd, bl - 0.3, 0.16, 0.02, rot); } pt.setColor(1, 1, 1); }); continue; }
        const clearOfTrunks = (x, z) => !trunks.some((t) => { const dx = t[0] - x, dz = t[1] - z; return Math.hypot(Math.max(0, Math.abs(dx * tx + dz * tz) - bl / 2), Math.max(0, Math.abs(dx * tz - dz * tx) - 0.3)) < 1.1; });
        for (const o of [0, 0.3, -0.3, 0.6, -0.6]) if (clearOfTrunks(mid[0] + tz * o, mid[1] - tx * o)) { mid[0] += tz * o; mid[1] -= tx * o; break; }
        onSlope(ctx, mid[0], mid[1], bl / 2, () => { propKit.barrier(ctx, mid[0], mid[1], rot, bl); const pt = ctx.B.v('paint', true); pt.setColor(0.95, 0.45, 0.05).box(mid[0], 1.0, mid[1], L / n - 0.6, 0.22, 0.06, rot); pt.setColor(0.9, 0.9, 0.88).box(mid[0], 0.72, mid[1], L / n - 0.6, 0.16, 0.06, rot); pt.setColor(1, 1, 1); }); continue;
      }
      { const ix = mid[0] + Math.sign(cxm - mid[0]) * (e % 2 ? 4 : 0), iz = mid[1] + Math.sign(czm - mid[1]) * (e % 2 ? 0 : 4); const sc = ctx.surfaceAt(ix, iz) === 'asphalt'; if (run && sc !== runScreen) { const last = run[run.length - 1]; flush(); run = [last]; } if (!run) run = [p0]; runScreen = sc; run.push(p1); }
    }
    flush();
  }
}

// ------------------------------------------------------------------------------------------ the Bridge
// A short timber-decked footbridge on concrete abutments with white rails (nadir 3D tiles: a pale deck ~3 m wide with
// light rails under the trees, from the end of the service drive to the quad path)
function bridge(ctx) {
  const { B } = ctx; const b = BRIDGE; const L = b.span + 1.6; const tx = (b.b[0] - b.a[0]) / b.span, tz = (b.b[1] - b.a[1]) / b.span, nx = -tz, nz = tx; const rot = Math.atan2(-tz, tx); const [mx, mz] = b.mid;
  B.solidBox('concrete', 'concrete', mx, b.y - 0.14, mz, L, 0.3, b.w, rot, 1 / 2);
  const cn = B.v('concrete');
  for (const sd of [-1, 1]) { const ax = mx + tx * sd * (b.span / 2 + 0.2), az = mz + tz * sd * (b.span / 2 + 0.2); cn.box(ax, b.y - 2.3, az, 1.3, 4.0, b.w + 1.6, rot, 1 / 3); B.c('concrete').box(ax, b.y - 2.3, az, 1.3, 4.0, b.w + 1.6, rot); }
  const st = B.v('blackMetal'); for (const v of [-1, 1]) st.box(mx + nx * v * (b.w / 2 - 0.5), b.y - 0.5, mz + nz * v * (b.w / 2 - 0.5), b.span, 0.42, 0.2, rot);
  const pt = B.v('paint', true); pt.setColor(0.8, 0.8, 0.77);
  for (const v of [-1, 1]) { const ox = nx * v * (b.w / 2 - 0.08), oz = nz * v * (b.w / 2 - 0.08); const n = 6;
    for (let k = 0; k <= n; k++) { const u = -L / 2 + 0.15 + (L - 0.3) * k / n; pt.box(mx + tx * u + ox, b.y + 0.55, mz + tz * u + oz, 0.1, 1.1, 0.1, rot); }
    for (const y of [1.08, 0.6, 0.2]) pt.box(mx + ox, b.y + y, mz + oz, L, y > 1 ? 0.09 : 0.05, y > 1 ? 0.12 : 0.05, rot);
    B.c('metal').box(mx + ox, b.y + 0.56, mz + oz, L, 1.12, 0.1, rot); }
  pt.setColor(1, 1, 1);
}

// ------------------------------------------------------------------------------------------ boulders, sundial, sculpture
/** A boulder: a squashed, jittered octahedron on the ground (grey-tan, vertex-coloured); solid when over half a metre. */
function boulder(ctx, x, z, r, rnd) {
  const { B } = ctx; const y0 = gY(ctx, x, z) - r * 0.25; const pt = B.v('paint', true); const j = () => 0.75 + rnd() * 0.5; const hgt = r * (0.55 + rnd() * 0.35);
  const eq = [0, 1, 2, 3, 4].map((k) => { const a = k / 5 * Math.PI * 2 + rnd(); return [x + Math.cos(a) * r * j(), y0 + hgt * (0.35 + rnd() * 0.2), z + Math.sin(a) * r * j()]; }); const top = [x + (rnd() - 0.5) * r * 0.4, y0 + hgt * 1.15, z + (rnd() - 0.5) * r * 0.4], bot = [x, y0 - 0.1, z];
  for (let k = 0; k < 5; k++) { const p = eq[k], q = eq[(k + 1) % 5]; const v = 0.2 + rnd() * 0.08; pt.setColor(v * 1.04, v, v * 0.9); pt.tri(p, top, q); pt.tri(q, top, p); pt.setColor(v * 0.75, v * 0.72, v * 0.66); pt.tri(q, bot, p); pt.tri(p, bot, q); }
  pt.setColor(1, 1, 1); if (hgt > 0.5) { B.c('concrete').box(x, y0 + hgt * 0.5, z, r * 1.3, hgt, r * 1.3, rnd() * 3); }
}
function rocks(ctx) {
  const rnd = mulberry32(4107); let n = 0;
  // the island's boulder garden (the planted north half of the loop island)
  for (let k = 0; k < 400 && n < 16; k++) { const x = -104 + rnd() * 28, z = 41 + rnd() * 15; if (!pointInRing(x, z, LOOP_GARDEN) || !pointInRing(x + 1, z, LOOP_GARDEN) || !pointInRing(x - 1, z, LOOP_GARDEN) || !pointInRing(x, z + 1, LOOP_GARDEN) || !pointInRing(x, z - 1, LOOP_GARDEN)) continue; boulder(ctx, x, z, 0.35 + rnd() * 0.5, rnd); n++; }
  // Ross Creek: cobbles and boulders in the dry bed (OSM waterway, only where the lidar channel is)
  const pb = ctx.playBounds; let m = 0;
  for (const r of ctx.data.roads) { if (r.tags.name !== 'Ross Creek') continue; for (let i = 0; i < r.line.length - 1; i++) { const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = 0; d < L; d += 2.2) { const x = a[0] + (b[0] - a[0]) * d / L + (rnd() - 0.5) * 2.4, z = a[1] + (b[1] - a[1]) * d / L + (rnd() - 0.5) * 2.4; const rr = 0.18 + rnd() * rnd() * 0.5;
        if (x < pb.minX + 2 || x > pb.maxX - 2 || z < pb.minZ + 2 || z > pb.maxZ - 2 || ctx.surfaceAt(x, z) === 'asphalt' || gY(ctx, x, z) > Math.max(gY(ctx, x + 6, z), gY(ctx, x - 6, z), gY(ctx, x, z + 6), gY(ctx, x, z - 6)) - 0.9 || Math.hypot(x - BRIDGE.mid[0], z - BRIDGE.mid[1]) < 1.5) continue;
        boulder(ctx, x, z, Math.min(rr, 0.42), rnd); m++; } } }
  ctx.rockCount = n + m;
}
function landmarks(ctx) {
  const { B } = ctx;
  // the blue apron strip along the gym (nadir tiles)
  if (ctx.gline) ctx.gline(-86.2, 104.5, -82.4, 124.5, 1.1, [0.1, 0.25, 0.6]);
  // the lawn sundial south of Katharine Branson Hall (nadir tiles: a pale stone disc ~3 m across with a gnomon)
  { const x = -41.6, z = 20.4; atGround(ctx, x, z, () => { B.v('limestone').cyl(x, -0.2, z, 1.6, 1.6, 0.42, 20, 1 / 3, true); B.c('concrete').cyl(x, -0.2, z, 1.6, 1.6, 0.42, 10, 1, true); const pt = B.v('paint', true); pt.setColor(0.42, 0.33, 0.2); pt.tri([x - 0.03, 0.22, z + 0.7], [x - 0.03, 1.0, z - 0.5], [x - 0.03, 0.22, z - 0.5]); pt.tri([x + 0.03, 0.22, z - 0.5], [x + 0.03, 1.0, z - 0.5], [x + 0.03, 0.22, z + 0.7]); pt.setColor(1, 1, 1); propKit.registerProp(ctx, 'sundial', x, z, 0, 3.2, 3.2, 0.3); }, 1.7, 'max'); }
  // the sculpture on the brick square of the arts court: a weathered-steel upright on a low plinth
  { const x = 38.0, z = -3.6; atGround(ctx, x, z, () => { B.solidBox('concrete', 'concrete', x, 0.15, z, 1.4, 0.3, 1.4, 0.3, 1 / 3); const pt = B.v('paint', true); pt.setColor(0.36, 0.2, 0.12); pt.box(x, 1.3, z, 0.5, 2.0, 0.18, 0.5); pt.box(x + 0.15, 1.9, z + 0.1, 0.18, 1.4, 0.6, 0.5); pt.setColor(1, 1, 1); B.c('metal').box(x, 1.3, z, 0.6, 2.0, 0.6, 0.5); propKit.registerProp(ctx, 'sculpture', x, z, 0.3, 1.4, 1.4, 2.4); }, 0.8, 'max'); }
}

// ------------------------------------------------------------------------------------------ name boards, the organic garden
// One board per named item of the school's campus map (branson.org/about/campus-map: the legend is the source of every name),
// standing by that building's entrance. Skipped if the spot is on a road or in a footprint.
const BOARDS = [
  [-9.5, -5.5, -36, ['KATHARINE', 'BRANSON HALL']], [-97, 24.5, 40, ['THE COMMONS']], [26, 14, 90, ['DOUGLAS', 'FINE ARTS CENTER']], [62, 25.5, 9, ['MAXWELL', 'MUSIC HALL']],
  [47.5, 2.2, 15, ['NEW HOUSE']], [30, -44, -20, ['CROSSWAYS']], [-86.5, 70.5, 12, ['GYM COMPLEX']], [-40, 61, 9, ['TOM RYAN FIELD']],
  [-155.5, 108, 60, ['STUDY HALL']], [-153.8, 124, 65, ['RICHARDSON HALL']], [-162.9, 149.9, -45, ['NEW OAKS']], [-146, 155.3, 0, ['TALLANT', 'SCIENCE CENTER']],
  [-66.5, 9.5, 20, ['ALUMNI STEPS']], [-64, 13.2, 0, ['ORGANIC GARDEN']],
];
function boards(ctx) {
  const S = ctx.streets; let n = 0;
  for (const [x, z, deg, lines] of BOARDS) { if ((S && S.inRoad(x, z, 1.2)) || (ctx.buildingRings || []).some((r) => pointInRing(x, z, r)) || (ctx.gen.trees || []).some((t) => Math.hypot(t[0] - x, t[1] - z) < 1.6)) { console.warn('[branson] name board skipped', lines.join(' '), x, z); continue; } nameBoard(ctx, x, z, deg, lines); n++; }
  ctx.boardCount = n;
  // Organic Garden (campus map item 9): raised timber beds on Katharine Branson Hall's south-west lawn (nadir tiles)
  const pt = ctx.B.v('paint', true);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const x = -66.5 + i * 2.6, z = 16.6 + j * 4.2; atGround(ctx, x, z, () => { pt.setColor(0.42, 0.3, 0.2).box(x, 0.2, z, 1.3, 0.5, 3.2, 0.1); pt.setColor(0.22, 0.34, 0.14).box(x, 0.47, z, 1.1, 0.06, 3.0, 0.1); pt.setColor(1, 1, 1); ctx.B.c('wood').box(x, 0.2, z, 1.3, 0.5, 3.2, 0.1); propKit.registerProp(ctx, 'bed', x, z, 0.1, 1.3, 3.2, 0.5); }, 1.6, 'min'); }
}

export function buildGrounds(ctx) {
  field(ctx);
  bridge(ctx);
  tennis(ctx);
  vehicles(ctx);
  streetscape(ctx);
  campusLife(ctx);
  rocks(ctx);
  landmarks(ctx);
  boards(ctx);
  boundary(ctx);
  ctx.B.v('paint', true).setColor(1, 1, 1); ctx.B.v('stucco', true).setColor(1, 1, 1);
}
