// Branson grounds: Tom Ryan Field (paint, goals, the retaining wall and ball-stop fences), the tennis courts, parked
// cars in the three car parks, the hedges of Fernhill Ave, the Branson Gate, lamps, the dining terrace, the Alumni
// Steps, bridge rails over Ross Creek and the play-area edge.
import { atGround, onSlope, hillFence, guardRail, wallDecal, edgeFrame, pointInRing, makeCanvas, mulberry32, hipRoof } from '../marin/kit.js';
import * as THREE from 'three';
import { paintedQuad } from '../../world/fields.js';
import { nameBoard, kerb, lineRing, plainBlock, WHITE, drapePoly } from './extras.js';
import { lampPost, turfNoise, landmarkKit } from '../../world/landmarks.js';
import { propKit } from '../../world/props.js';
import { TERRACE, ARTS_PLAZA, ARTS_LAWN, ARTS_BRICK, LOOP_OUTER, PAVED_POLYS, PAVED_LINES, POOL, POOL_DECK, POOL_HOUSE, TERRACE_TABLES, LOOP_GARDEN, LOOP_ROWS, LOOP_ISLAND_ROWS, LOT_ISLANDS, LOOP_SWALE, STEPS_WALK, WALKS, PATIO, ENTR_COURT, GARDEN, SUNDIAL, obb, FIELD, TENNIS, along, fieldRing, tennisRing, retainRun, hedgeRun, buildStairs, isStreet, streetWidth, KBH_TERR, KBH_TERR_Y, KBH_STEPS, QUAD_PATHS } from './kit.js';
import { KBH_TILE } from './school.js';

const RAD = Math.PI / 180;
// the Alumni Steps: from Katharine Branson Hall's south lawn down the bank to the car-park loop (graded in sitework)
// (the first build's long grey flight at (-70, 12) -> (-76, 33) is in no tiles view: removed, rule A1)
export const ALUMNI_STEPS = [{ a: [-87.5, 19.0], b: [-88.3, 28.3], w: 2.4, brick: true, head: 3.6 }];   // the red-brick flight down the bank: north-south at x ~ -88, from the lawn walk (z 19) to the brick landing on the terrace (z 28.5): nadir tiles, QA round 4
// open spots the car layout keeps free (flag bases and the practice pad are added by the builder)
export const CAR_FREE = [[-112, 30]];
const ARTS_BRICK_TONE = [0.93, 0.88, 0.99];   // the arts court's brick square: sampled beside the tiles (fix round 8)
// (fix round 6) stalls a door's walk lands on stay empty: [x, z, radius]
const WALK_LANDINGS = [[-5.2, -7.3, 1.75], [2.45, -5.2, 1.75], [-107.8, 73.9, 4.0]];   // (fix round 8: one stall each, at the walk's end: the wide circles emptied four stalls of a full row)   // (+ the walk from the terrace steps, the store by the gym's north wall)
export const SHED = obb(-154.2, -8.4, 11.6, 2.9, -46.5);   // the white storage shed on the north-west edge of the Commons' service yard
// The Bridge over Ross Creek (campus map item 12): from the end of Park Drive (a) to the quad path (b); deck level y
export const BRIDGE = { a: [-141.6, 89.6], b: [-147.4, 95.4], y: 1.13, w: 3.2 };   // deck level = the designed end of Park Drive (a pad 0.16 m above it was a hump on the road end: map check `mounds`)
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
  // South side: the pitch is NOT cut into a hill; its south side falls to Ross Creek, which runs behind it (the wooded hill starts beyond the creek).
  // So the run below finds no bank to hold (map check `retaining`: skip) and a black ball-stop fence stands 2 m outside the turf; a retaining panel
  // is built only where the ground really stands above the pitch.
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
  const keep = [...(ctx.keepClear || []), ...WALK_LANDINGS]; const trunks = ctx.gen.trees || []; const placed = []; let n = 0; const S = ctx.streets;
  let loose = false; const car = (x, z, heading, fill = 0.7) => {
    const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(); if (r4 > fill) return;
    if (x < pb.minX + 3 || x > pb.maxX - 3 || z < pb.minZ + 3 || z > pb.maxZ - 3) return;
    if (keep.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r)) return;
    if (ctx.surfaceAt(x, z) !== 'asphalt' || (S && !loose && S.inRoad(x, z, 1.2))) return;
    if (ctx.terrain && (ctx.terrain.slopeAt(x, z) > (loose ? 0.16 : 0.1) || ctx.terrain.maxIn(x, z, 2.4) - ctx.terrain.minIn(x, z, 2.4) > (loose ? 0.7 : 0.45))) return;   // (the loop's rim and the gym drive's bays fall with the drive: a car stands on a 1 in 7 grade)
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
  // (QA round 4: a full lot, ~20 stalls: nose-in on the north edge, along the shed's north wall, a bay by the courts, a bay by the hall)
  row([-81.0, -59.9], [-57.0, -64.4], -1, 1); row([-80.5, -52.4], [-64.0, -42.0], 1, 0.95); row([-89.6, -52.6], [-83.4, -45.9], 1, 1); row([-59.5, -44.6], [-50.6, -42.4], -1, 1);
  // visitor parking in front of Katharine Branson Hall: the long row on the south kerb, the island side, the bay by the hall
  row([-13, -10.5], [13, -3.6], 1, 1); row([-21.9, -15.6], [-14.6, -10.8], 1, 1);   /* (fix round 8, rule F46: the tiles show a full row of ~12 cars along the south kerb, on round the bend to the hall's north-east door; it had five) */ row([-5, -19.8], [9, -18.6], -1, 0.75); row([-26.1, -24.7], [-19.1, -33.2], 1, 1);   // (fix round 5: the bay by the hall is four stalls 2.7 m inside the kerb of the hall's green strip; two cars hung over the old kerb)
  // the Commons' service yard under its west gable (nadir tiles: cars along the gable)
  row([-144.9, -5.0], [-151.1, 7.4], 1, 1);   // (four vehicles in the tiles)
  // the gym service drive: along the gym's west wall and the bank north of it
  row([-125.6, 84.0], [-122.9, 93.8], -1, 0.85);
  // (fix round 5: the stalls open straight off the graded drive, so the road test emptied them; the tiles show eight cars in two groups)
  loose = true; row([-119.6, 74.4], [-108.0, 65.0], -1, 1); row([-105.8, 73.4], [-94.8, 66.8], -1, 1); loose = false;
  // the loop: a stall row inside the island's south half and one on the outer south-east kerb (nadir tiles)
  loose = true; LOOP_ROWS.forEach(([p, q], i) => { const isl = i < LOOP_ISLAND_ROWS; const o = isl ? [0.35, 1.25] : [0, 0]; row([p[0] + o[0], p[1] + o[1]], [q[0] + o[0], q[1] + o[1]], isl ? -1 : 1, isl ? 0.9 : 1); });   // (the island row: noses stop at the garden kerb) loose = false;
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
    const southOk = (p) => clearOf(p) && ((p[0] > -99 && p[0] < -13) || (p[0] > 5 && p[0] < 76) || p[0] < -199.5 || (p[0] > -193.6 && p[0] < -187.0)) && inPlay(p[0], p[1], 1);   // (+ the screen along the wood west of the faculty lot, open at its two drives)
    for (const run of cut(offset(line, -sideN * (w / 2 + 2.0)), southOk)) hedgeRun(ctx, run, { h: 3.6, d: 1.5, seed: 29 });
  }
  // (no centre line on Fernhill Ave: the tiles show a bare lane; QA round 4)
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
  const turfRing = fieldRing(4.5); const lamp = (x, z) => { if (pointInRing(x, z, turfRing) || ctx.surfaceAt(x, z) === 'asphalt') return; if (!inPlay(x, z) || (S && S.inRoad(x, z, 0.5)) || (ctx.buildingRings || []).some((r) => pointInRing(x, z, r)) || lamps.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 12)) return; atGround(ctx, x, z, () => lampPost(ctx, x, z), 0.3, 'min'); lamps.push([x, z]); };
  for (const r of data.roads) {
    if (!(r.tags.name === 'Park Drive' || r.id === 570965051)) continue; const w = streetWidth(r); let side = 1, carry = 9;
    for (let i = 0; i < r.line.length - 1; i++) { const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; let d = carry; for (; d < L; d += 24) { lamp(a[0] + tx * d - tz * side * (w / 2 + 1.1), a[1] + tz * d + tx * side * (w / 2 + 1.1)); side = -side; } carry = d - L; }
  }
  for (const [x, z] of [[-128, -30.5], [-110, -55], [-152, -46], [-2, -6], [-24, -30], [-118, 36], [-94.5, 32.8], [-153.6, 98.4], [-176, 142], [40, -30], [22, -6], [-66, 70], [-20, 62], [20, 64]]) lamp(x, z);
}

// ------------------------------------------------------------------------------------------ dining terrace, steps
/** A market umbrella at a terrace table, CLOSED (fix round 6: the nadir tiles show the nine tables dark and bare, no open white canopies): a pole
 * with the furled charcoal canopy strapped round it; collision on the pole only. */
function umbrella(ctx, x, z, y) {
  const { B } = ctx; B.v('blackMetal').cyl(x, y, z, 0.03, 0.03, 2.5, 6, 1, true); const pt = B.v('paint', true);
  pt.setColor(0.17, 0.18, 0.2); pt.cyl(x, y + 1.05, z, 0.13, 0.055, 1.3, 8, 1, true); pt.setColor(0.1, 0.1, 0.11); pt.cyl(x, y + 1.5, z, 0.11, 0.11, 0.05, 8, 1, true);
  pt.setColor(1, 1, 1); B.c('metal').box(x, y + 1.25, z, 0.1, 2.5, 0.1);
}
function campusLife(ctx) {
  const { B } = ctx;
  // the Commons' dining terrace: nine tables, each with its (closed) market umbrella
  const y = ctx.terraceY ?? gY(ctx, -106, 31);
  for (const [x, z] of TERRACE_TABLES) {
    propKit.picnicTable(ctx, x, z, 0.724); umbrella(ctx, x, z, y);
  }
  for (const st of [...ALUMNI_STEPS, KBH_STEPS]) { const r = buildStairs(ctx, st); (ctx.stairNotes = ctx.stairNotes || []).push({ ...st, ...r }); }   // (+ fix round 7: the flight from the hall's south-east terrace up to the visitor lot)
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
  // (fix round 8) where a neighbour's court or pool straddles the edge, the fence goes ROUND it (the bounds themselves are a straight line: player.js clamps);
  // it ran across the court and stopped on the pool's coping. Detours: { e: edge, s0..s1: metres along the edge, path: fence line from s0 to s1 }
  const DET = []; { const [qx, qz, qr] = NB_POOL, R = qr + 1.3, zs = pb.maxZ + m, xw = pb.minX - m; const a0 = Math.asin((zs - qz) / R), a1 = Math.atan2(zs - qz, xw - qx); const na = Math.ceil((a1 - a0) / 0.4); const arc = [];
    for (let k = 0; k < na; k++) { const an = a0 + (a1 - a0) * k / na; arc.push([qx + Math.cos(an) * R, qz + Math.sin(an) * R]); } arc.push([xw, zs]); DET.push({ e: 2, s0: pb.maxX + m - arc[0][0], s1: 1e9, path: arc });
    const c = NB_COURT, z1 = c.slab[3] + 0.8, z0 = c.slab[2] - 0.3, xo = c.slab[0] - 0.8; DET.push({ e: 3, s0: zs - z1, s1: zs - z0, path: [[xw, z1], [xo, z1], [xo, z0], [xw, z0]] }); }
  for (let e = 0; e < 4; e++) {
    const a = corners[e], b = corners[(e + 1) % 4]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.ceil(L / 6); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const rot = Math.atan2(-tz, tx);
    let run = null, runScreen = true; const flush = () => { if (run && run.length > 1) hillFence(ctx, run, runScreen ? { h: 2.4, screen: 2.0, every: 3 } : { h: 2.4, every: 3 }); run = null; };
    const ox = e % 2 ? Math.sign(a[0] - cxm) : 0, oz = e % 2 ? 0 : Math.sign(a[1] - czm); const panel = (p0, p1) => hillFence(ctx, [[p0[0] + ox * 0.5, p0[1] + oz * 0.5], [p1[0] + ox * 0.5, p1[1] + oz * 0.5]], { h: 2.4, every: 3 });
    for (let i = 0; i < n; i++) {
      const p0 = [a[0] + tx * (i * L / n), a[1] + tz * (i * L / n)], p1 = [a[0] + tx * ((i + 1) * L / n), a[1] + tz * ((i + 1) * L / n)], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      { const s0p = i * L / n, s1p = (i + 1) * L / n; const det = DET.find((d) => d.e === e && s1p > d.s0 && s0p < d.s1);
        if (det) { const P = (sv) => [a[0] + tx * sv, a[1] + tz * sv]; if (s0p < det.s0 - 0.3) { if (!run) { run = [p0]; runScreen = false; } run.push(P(det.s0)); } flush(); if (!det.done) { hillFence(ctx, det.path, { h: 2.4, every: 3 }); det.done = true; } if (s1p > det.s1 + 0.3) { run = [P(det.s1), p1]; runScreen = false; } continue; } }
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
/** A boulder: a smooth, slightly lopsided dome (rings of jittered radii, shared vertex normals: no facets), stone-textured,
 * bedded a third into the ground; solid over half a metre. */
function boulder(ctx, x, z, r, rnd, tone = [0.56, 0.53, 0.48]) {
  // (fix round 5: every stone has its own plan (two unequal axes, three or four lobes), a flat or leaning top and its own height, so a group never
  // reads as a row of hemispheres)
  const { B } = ctx; const y0 = gY(ctx, x, z) - r * 0.3; const bk = B.v('concrete', true); const hgt = r * (0.4 + rnd() * 0.6); const N = 11, M = 4; const sx = 0.6 + rnd() * 0.8, sz = 0.65 + rnd() * 0.6, rot = rnd() * 6.3; const v0 = 0.8 + rnd() * 0.3;
  const ja = []; for (let k = 0; k < N; k++) ja.push(0.62 + rnd() * 0.62); const jb = ja.map((v, k) => (v * 3 + ja[(k + 1) % N]) / 4); const lob = rnd() * 6, la = 0.12 + rnd() * 0.2, nl = 2 + Math.floor(rnd() * 3); const lean = [(rnd() - 0.5) * r * 0.7, (rnd() - 0.5) * r * 0.7], flat = 0.55 + rnd() * 0.45;
  const V = (i, k) => { const ph = (i / M) * Math.PI / 2, a = (k % N) / N * Math.PI * 2 + rot; const j = jb[k % N] * (1 + la * Math.sin(nl * a + lob + i * 0.9)); const rr = r * Math.pow(Math.cos(ph), 0.6) * j; const cx = Math.cos(a), sn = Math.sin(a); const up = Math.pow(Math.sin(ph), flat);
    const p = [x + cx * rr * sx + lean[0] * up, y0 + hgt * up * (0.86 + 0.28 * j), z + sn * rr * sz + lean[1] * up]; const pn = ph * 0.8 + 0.25; const sh = v0 * (0.66 + 0.46 * Math.sin(ph)) * (0.9 + 0.2 * j); return { p, n: [cx * Math.cos(pn), Math.sin(pn), sn * Math.cos(pn)], c: [tone[0] * sh, tone[1] * sh, tone[2] * sh], uv: [(k / N) * r * 3, ph * r] }; };
  const put = (v) => { bk.setColor(v.c[0], v.c[1], v.c[2]); bk._v(v.p[0], v.p[1], v.p[2], v.n[0], v.n[1], v.n[2], v.uv[0], v.uv[1]); };
  for (let i = 0; i < M; i++) for (let k = 0; k < N; k++) { const a = V(i, k), b = V(i, k + 1), c = V(i + 1, k + 1), d = V(i + 1, k); for (const t of [[a, c, b], [a, d, c], [a, b, c], [a, c, d]]) t.forEach(put); }
  bk.setColor(1, 1, 1); if (hgt > 0.5) B.c('concrete').box(x, y0 + hgt * 0.5, z, r * 1.2 * sx, hgt, r * 1.2 * sz, -rot);
}
function rocks(ctx) {
  const rnd = mulberry32(4107); let n = 0; const inG = (x, z, m) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([dx, dz]) => pointInRing(x + dx, z + dz, LOOP_GARDEN));
  // the loop island's north half: a planted boulder garden (nadir tiles): low shrub masses from the shrub kit between a few boulders
  // (QA round 4, nadir tiles: no trees on it; a dry garden on decomposed granite: low shrub tufts from the shrub kit, a few boulders, a dry creek of pale cobbles)
  const swale = (x, z) => { let m = 1e9; for (let i = 0; i < LOOP_SWALE.length - 1; i++) { const a = LOOP_SWALE[i], b = LOOP_SWALE[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); m = Math.min(m, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)); } return m; };
  const placed = []; for (let k = 0; k < 900 && n < 34; k++) { const x = -104 + rnd() * 28, z = 41 + rnd() * 15; if (!inG(x, z, 1.1) || swale(x, z) < 1.5 || placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < 2.0)) continue; placed.push([x, z]);
    if (rnd() < 0.26) { boulder(ctx, x, z, 0.3 + rnd() * rnd() * 0.75, rnd); if (rnd() < 0.5) boulder(ctx, x + 0.5 + rnd() * 0.5, z + (rnd() - 0.5), 0.15 + rnd() * 0.2, rnd); } else ctx.shrubs.push([x, gY(ctx, x, z) + 0.02, z, 0.9 + rnd() * 0.9, 0.3 + rnd() * 0.3, rnd() * 3]); n++; }
  // the dry creek: loose groups of mixed cobbles and a few larger stones scattered over the whole width of the bed, irregular gaps between the groups
  for (let i = 0; i < LOOP_SWALE.length - 1; i++) { const a = LOOP_SWALE[i], b = LOOP_SWALE[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = rnd() * 1.2; d < L; d += 0.7 + rnd() * 1.9) { const g = 1 + Math.floor(rnd() * 4), cx = a[0] + (b[0] - a[0]) * d / L + (rnd() - 0.5) * 2.2, cz = a[1] + (b[1] - a[1]) * d / L + (rnd() - 0.5) * 2.2;
      for (let q = 0; q < g; q++) { const x = cx + (rnd() - 0.5) * 1.3, z = cz + (rnd() - 0.5) * 1.3; if (inG(x, z, 0.4)) boulder(ctx, x, z, q === 0 && rnd() < 0.35 ? 0.3 + rnd() * 0.3 : 0.09 + rnd() * 0.17, rnd, [0.7, 0.68, 0.63]); } } }
  // the arts court's lawn panel: two pale boulders (nadir tiles)
  boulder(ctx, 27.2, -1.9, 0.55, rnd, [0.66, 0.63, 0.58]); boulder(ctx, 28.6, -3.4, 0.4, rnd, [0.66, 0.63, 0.58]);
  // Ross Creek: cobbles and boulders only on the gravel bed itself (the 'dirt' class tools/ground_fix.py painted along the waterway)
  const pb = ctx.playBounds; let m = 0;
  for (const r of ctx.data.roads) { if (r.tags.name !== 'Ross Creek') continue; for (let i = 0; i < r.line.length - 1; i++) { const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // (fix round 5: no stone every two metres on the centre line: groups at irregular intervals, anywhere across the gravel bed, one large stone among small ones)
      for (let d = rnd() * 3; d < L; d += 1.6 + rnd() * rnd() * 9) { const g = 1 + Math.floor(rnd() * 3.5); const cx = a[0] + (b[0] - a[0]) * d / L + (rnd() - 0.5) * 3.0, cz = a[1] + (b[1] - a[1]) * d / L + (rnd() - 0.5) * 3.0;
        for (let q = 0; q < g; q++) { const x = cx + (rnd() - 0.5) * 1.8, z = cz + (rnd() - 0.5) * 1.8; const rr = q === 0 ? 0.25 + rnd() * 0.3 : 0.1 + rnd() * 0.2;
          if (x < pb.minX + 2 || x > pb.maxX - 2 || z < pb.minZ + 2 || z > pb.maxZ - 2 || ctx.surfaceAt(x, z) !== 'dirt' || pointInRing(x, z, LOOP_GARDEN) || Math.hypot(x - BRIDGE.mid[0], z - BRIDGE.mid[1]) < 1.5) continue;
          boulder(ctx, x, z, Math.min(rr, 0.45), rnd); m++; } } } }
  ctx.rockCount = n + m;
  // understory of the wood west of the faculty car park (planned in sitework): shrub-kit clumps standing on their lowest ground
  for (const [x, z, len, h, rot] of ctx.understory || []) { const c = Math.cos(rot) * len / 2, sn = Math.sin(rot) * len / 2; const y = Math.min(gY(ctx, x, z), gY(ctx, x + c, z - sn), gY(ctx, x - c, z + sn)); if (Math.max(gY(ctx, x + c, z - sn), gY(ctx, x - c, z + sn)) - y > 0.7 || (ctx.buildingRings || []).some((r) => pointInRing(x, z, r))) continue; ctx.shrubs.push([x, y + 0.02, z, len, h, rot]); }
}
// ------------------------------------------------------------------------------------------ hard paving edges, plazas, the pool
// Rule F42: every paved outline ends on a kerb; the flat plazas are real paver / brick surfaces with their own edges.
function paving(ctx) {
  const { B } = ctx; const uv = (x, z) => [x / 3, z / 3];
  const inB = (x, z) => (ctx.buildingRings || []).some((r) => pointInRing(x, z, r));
  // (fix round 6: no kerb piece across a walk, and none of a walk's own kerb on a car park or on another walk)
  // (fix round 8) the quad's paved strips are walks too (pavers + kerb); a walk's kerb is laid by geometry: none where the far side is a car park or a
  // drive (asphalt), another walk, the terrace, the patio or a plaza. The 1 m surface-class map broke it at every kink of the walk's own painted strip.
  const AW = [...WALKS, ...QUAD_PATHS];
  const patioRing = Array.from({ length: 16 }, (_, k) => [PATIO[0] + Math.cos(k / 16 * 6.2832) * PATIO[2], PATIO[1] + Math.sin(k / 16 * 6.2832) * PATIO[2]]); const walkRings = [...AW.map(([pts, w]) => lineRing(pts, w + 0.1)), KBH_TERR, patioRing]; const onWalk = (x, z, not = -1) => walkRings.some((r, i) => i !== not && pointInRing(x, z, r)); const onLot = (x, z) => [...PAVED_POLYS, LOOP_OUTER].some((r) => pointInRing(x, z, r));
  const plazas = [TERRACE, ARTS_PLAZA, ENTR_COURT]; const farPaved = (wi) => (x, z, sf) => sf === 'asphalt' || onWalk(x, z, wi) || onLot(x, z) || plazas.some((r) => pointInRing(x, z, r));
  for (const r of [...PAVED_POLYS, LOOP_OUTER]) kerb(ctx, r, { skip: inB, off: (x, z) => onWalk(x, z) });
  for (const [pts, w] of PAVED_LINES) kerb(ctx, lineRing(pts, w), { off: (x, z) => onWalk(x, z) });
  for (const [x, z, r] of LOT_ISLANDS) kerb(ctx, Array.from({ length: 10 }, (_, k) => [x + Math.cos(k / 10 * 6.2832) * r, z + Math.sin(k / 10 * 6.2832) * r]), { all: true, h: 0.14, w: 0.24 });
  // the loop's north edge against the dining terrace: a red-brick band kerb (nadir tiles), and the paved walk from the head of the steps
  kerb(ctx, lineRing([LOOP_OUTER[0], LOOP_OUTER[1], LOOP_OUTER[2], LOOP_OUTER[3], [-86.6, 35.2]], 0.3), { all: true, h: 0.1, w: 0.12, color: [0.5, 0.27, 0.21] });
  // (fix round 8, nadir tiles) the same red band runs on round the loop's west end; the drive's painted shoulder used to spill a metre past the traced edge there and fade into the lawn
  kerb(ctx, lineRing([LOOP_OUTER[0], LOOP_OUTER[24], LOOP_OUTER[23], LOOP_OUTER[22]], 0.22), { all: true, h: 0.14, w: 0.14, step: 0.8, color: [0.5, 0.27, 0.21] });
  { const ring = lineRing(STEPS_WALK, 2.0); drapePoly(ctx, B.v('maPaver'), lineRing(STEPS_WALK, 2.16), 0.036, uv); kerb(ctx, ring, { h: 0.05, w: 0.16, step: 0.5, color: [0.56, 0.54, 0.5], paved: (x, z, sf) => sf === 'asphalt' || pointInRing(x, z, TERRACE) }); }
  kerb(ctx, LOOP_GARDEN, { all: true, h: 0.16, w: 0.28 });
  // fix round 5 (F8 / F42): every door's apron and walk, the lane along the hall's east wall, the terrace at its south-east end and the walk from the
  // Bridge are painted as paving in the ground mask (tools/data/extra.py WALKS) and get a low hard edge here; the hall's red tile forecourt too
  // (fix round 6, F42: a walk only painted in the mask met asphalt on a blurred edge. Every walk is laid as real pavers over its painted strip, a
  // flush stone band closes each end that lands on asphalt, and the kerb runs along its grass sides)
  const band = (pts) => kerb(ctx, lineRing(pts, 0.1), { all: true, h: 0.045, w: 0.1, color: [0.62, 0.6, 0.55] });
  AW.forEach(([pts, w], wi) => { drapePoly(ctx, B.v('maPaver'), lineRing(pts, w + 0.16), 0.036, uv); kerb(ctx, lineRing(pts, w), { h: 0.045, w: 0.16, step: 0.5, color: [0.6, 0.57, 0.5], skip: inB, paved: farPaved(wi), off: (x, z) => onWalk(x, z, wi) || onLot(x, z) });
    for (const [e, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) { const d = Math.hypot(e[0] - q[0], e[1] - q[1]) || 1, tx = (e[0] - q[0]) / d, tz = (e[1] - q[1]) / d; if (ctx.surfaceAt(e[0] + tx * 0.7, e[1] + tz * 0.7) !== 'asphalt' || inB(e[0] + tx * 0.7, e[1] + tz * 0.7) || onWalk(e[0] + tx * 0.7, e[1] + tz * 0.7, wi)) continue; band([[e[0] - tz * (w / 2 + 0.1) + tx * 0.05, e[1] + tx * (w / 2 + 0.1) + tz * 0.05], [e[0] + tz * (w / 2 + 0.1) + tx * 0.05, e[1] - tx * (w / 2 + 0.1) + tz * 0.05]]); } });
  // (fix round 7) the round patio and the hall's south-east terrace are real pavers on their level pads, with a hard edge; a square drain grate on the terrace (tiles)
  drapePoly(ctx, B.v('maPaver'), patioRing, 0.036, uv); kerb(ctx, patioRing, { h: 0.045, w: 0.16, step: 0.5, color: [0.6, 0.57, 0.5], paved: farPaved(AW.length + 1), off: (x, z) => onWalk(x, z, AW.length + 1) || onLot(x, z) });
  drapePoly(ctx, B.v('maPaver'), KBH_TERR, 0.04, uv); kerb(ctx, KBH_TERR, { h: 0.05, w: 0.16, step: 0.5, color: [0.6, 0.57, 0.5], skip: inB, paved: farPaved(AW.length), off: (x, z) => onWalk(x, z, AW.length) });
  { const m = B.v('blackMetal'); const [gx, gz] = [-2.3, 14.3], rot = Math.atan2(0.783, 0.622); m.box(gx, KBH_TERR_Y + 0.05, gz, 1.5, 0.02, 1.5, rot); const pt = B.v('paint', true); pt.setColor(0.42, 0.42, 0.41); for (let k = -2; k <= 2; k++) pt.box(gx + Math.cos(rot) * k * 0.3, KBH_TERR_Y + 0.062, gz - Math.sin(rot) * k * 0.3, 0.05, 0.012, 1.4, rot); pt.setColor(1, 1, 1); }
  { const tl = B.v('stucco', true); tl.setColor(...KBH_TILE); drapePoly(ctx, tl, ENTR_COURT, 0.04, (x, z) => [x / 2.2, z / 2.2]); tl.setColor(1, 1, 1); }   // (fix round 7: pale salmon tile, sampled beside the tiles; the brick red was far more saturated)
  void 0; kerb(ctx, ENTR_COURT, { h: 0.05, w: 0.16, color: [0.62, 0.47, 0.4], skip: inB }); band([ENTR_COURT[2], ENTR_COURT[3], ENTR_COURT[4]]);   // (real red tile up to the drive's edge, a pale stone band on the join)
  for (const [x, z, len, rot] of [[-43.9, 2.4, 2.6, 0.93], [-36.6, 4.6, 2.2, -0.64], [-34.6, 5.6, 1.6, -0.64]]) ctx.shrubs.push([x, gY(ctx, x, z) + 0.02, z, len, 1.05, rot]);   // the clipped shrubs either side of the entrance steps
  for (const [x, z, r] of [[-12.5, 28.3, 1.65], [-10.0, 28.6, 1.65]]) { propKit.picnicTable(ctx, x, z, r); umbrella(ctx, x, z, gY(ctx, x, z)); }   // the round patio's two tables, side by side on its south rim, each with its (closed) umbrella (fix round 7: gridded nadir tiles)
  { const y = (ctx.terraceY ?? gY(ctx, -106, 31)) + 0.03; B.v('maPaver').poly(TERRACE, null, y, uv); kerb(ctx, TERRACE, { h: 0.06, w: 0.3, color: [0.56, 0.54, 0.5] }); B.v('brickRed').poly([[-92.0, 28.5], [-87.1, 28.7], [-86.9, 31.8], [-91.6, 31.5]], null, y + 0.015, (x, z) => [x / 2.2, z / 2.2]); }   // (the brick landing at the foot of the Alumni Steps)
  { const y = gY(ctx, 38.7, -4.3) + 0.045; drapePoly(ctx, B.v('maPaver'), ARTS_PLAZA, 0.045, uv); { const bk = B.v('brick', true); bk.setColor(...ARTS_BRICK_TONE); drapePoly(ctx, bk, ARTS_BRICK, 0.06, (x, z) => [x / 2.2, z / 2.2]); bk.setColor(1, 1, 1); }   /* (fix round 8: a dull, pale brick as in the tiles, draped on the court like the pavers; it was a saturated orange slab half under them) */ void y; kerb(ctx, ARTS_PLAZA, { all: true, h: 0.05, w: 0.25, color: [0.56, 0.54, 0.5] }); }
  // the neighbour's swimming pool north of Fernhill Ave (nadir tiles): water in a coped basin on a paved deck, a small pool house
  { const y = ctx.poolY ?? gY(ctx, -188, -67); B.v('maPaver').poly(POOL_DECK, [POOL], y + 0.03, uv); B.v('water').poly(POOL, null, y - 0.12, uv); kerb(ctx, POOL, { all: true, h: 0.1, w: 0.4, color: [0.7, 0.69, 0.66] }); kerb(ctx, POOL_DECK, { all: true, h: 0.05, w: 0.25, color: [0.56, 0.54, 0.5] });
    atGround(ctx, -191.5, -56, () => { plainBlock(ctx, POOL_HOUSE, -0.4, 2.6, WHITE, [0.3, 0.3, 0.3]); hipRoof(ctx, POOL_HOUSE, 2.6, 1.1, { tint: [3.2, 3.2, 3.3], overhang: 0.4, fill: true }); (ctx.buildingRings = ctx.buildingRings || []).push(POOL_HOUSE); }, 3, 'max'); }
}
// Fix round 7 (off campus, inside the play area; nadir tiles): the neighbour's tennis court west of the Commons and the round pool of the gravel garden in
// the south-west corner. Fix round 8 (gridded nadir tiles): the court's slab is x -219.6..-203.6, z 19.5..52.8 (ground paint, tools/ground_fix.py), its
// lines and its net are centred on (-211.8, 38.5); the helicopter spot beside it moved 2.5 m north to keep its rotor clear of the net (campus.js).
// The pool is a raised round basin on a level spot (sitework), whole: the play-area fence goes round its south side.
export const NB_COURT = { cx: -211.8, cz: 38.5, slab: [-219.6, -203.6, 19.5, 52.8] }, NB_POOL = [-209.3, 183.0, 6.0];
function neighbours(ctx) {
  const { B } = ctx; const g = ctx.gline; const c = NB_COURT; if (g) { const W = [0.86, 0.86, 0.83]; const L = (x0, z0, x1, z1) => g(c.cx + x0, c.cz + z0, c.cx + x1, c.cz + z1, 0.06, W);
    for (const x of [-5.485, -4.115, 4.115, 5.485]) L(x, -11.885, x, 11.885); for (const z of [-11.885, 11.885]) L(-5.485, z, 5.485, z); for (const z of [-6.4, 6.4]) L(-4.115, z, 4.115, z); L(0, -6.4, 0, 6.4); }
  { const y0 = Math.max(gY(ctx, c.cx - 6.4, c.cz), gY(ctx, c.cx, c.cz), gY(ctx, c.cx + 6.4, c.cz));   // the net: posts 0.91 m outside the doubles lines, 1.07 m high (as on the school's courts)
    B.v('net').quad([c.cx - 6.4, y0 + 0.05, c.cz], [c.cx - 6.4, y0 + 1.0, c.cz], [c.cx + 6.4, y0 + 1.0, c.cz], [c.cx + 6.4, y0 + 0.05, c.cz], [0, 0], [0, 2], [24, 2], [24, 0]);
    B.v('whitePanel').box(c.cx, y0 + 1.02, c.cz, 12.8, 0.06, 0.05); for (const sx of [-6.4, 6.4]) B.v('blackMetal').cyl(c.cx + sx, y0 - 0.1, c.cz, 0.04, 0.04, 1.17, 8, 1, true);
    B.c('metal:mesh').box(c.cx, y0 + 0.52, c.cz, 12.8, 1.05, 0.08); }
  const [px, pz, pr] = NB_POOL; const y = ctx.nbPoolY ?? gY(ctx, px, pz - 3);   /* (a low coping, 0.14 m: under the height a helicopter spot 13 m away counts as an obstacle) */ const n = 28; const ring = Array.from({ length: n }, (_, k) => [px + Math.cos(k / n * 6.2832) * pr, pz + Math.sin(k / n * 6.2832) * pr]);
  { const wt = B.v('paint', true); wt.setColor(0.05, 0.08, 0.15); wt.poly(ring, null, y + 0.07, (x, z) => [x / 3, z / 3]); wt.setColor(1, 1, 1); }   /* (a dark, still pool in the tiles) */ const lm = B.v('limestone'), col = B.c('concrete');
  for (let k = 0; k < n; k++) { const a = (k + 0.5) / n * 6.2832, x = px + Math.cos(a) * pr, z = pz + Math.sin(a) * pr, len = 6.2832 * pr / n + 0.06; lm.box(x, y - 0.23, z, 0.5, 0.74, len, -a, 1 / 3); col.box(x, y - 0.23, z, 0.5, 0.74, len, -a); }
  for (let k = 0; k < 7; k++) { const t = (k - 3) / 3; lm.box(px - 1.9 + t * 0.9, y + 0.07, pz + t * 5.0, 0.9, 0.1, 1.3, 0.18 + 0.1 * (k % 2), 1 / 3); }   // the line of stepping slabs across the water
}
export const GYM_SHED = obb(-107.8, 73.9, 3.5, 2.8, -12.3);   // the brown store by the gym's north wall (nadir tiles + oblique: a rust-brown flat top, ~3.5 x 2.8 m)
function landmarks(ctx) {
  const { B } = ctx;
  { const sh = GYM_SHED; atGround(ctx, -107.8, 73.9, () => { plainBlock(ctx, sh, -0.5, 2.5, [0.36, 0.25, 0.18], [0.5, 0.31, 0.22], 'maP_wood_siding'); (ctx.buildingRings = ctx.buildingRings || []).push(sh);
      let F = edgeFrame(sh[0][0], sh[0][1], sh[1][0], sh[1][1]); if (pointInRing((sh[0][0] + sh[1][0]) / 2 + F.nx, (sh[0][1] + sh[1][1]) / 2 + F.nz, sh)) F = edgeFrame(sh[1][0], sh[1][1], sh[0][0], sh[0][1]);
      const pt = B.v('paint', true); for (const u of [F.L / 2 - 0.47, F.L / 2 + 0.47]) { const c = F.P(u, 1.02, 0.04); pt.setColor(0.3, 0.21, 0.15); pt.box(c[0], c[1], c[2], 0.9, 2.0, 0.05, F.rotY); } pt.setColor(1, 1, 1);
      (ctx.footprints = ctx.footprints || []).push({ id: 'Gym store', ring: sh, roof: gY(ctx, -107.8, 73.9) + 2.5, floor: Math.max(...sh.map((q) => gY(ctx, q[0], q[1]))) }); }, 1.6, 'min'); }
  // the blue apron strip along the gym (nadir tiles)
  if (ctx.gline) ctx.gline(-86.2, 104.5, -82.4, 124.5, 1.1, [0.1, 0.25, 0.6]);
  // the lawn sundial south of Katharine Branson Hall (nadir tiles, fix round 6: a pale stone disc 4 m across at (-43.3, 21.7) with a slender
  // gnomon rod that throws a shadow several metres long: an inclined rod toward the north at the latitude angle, on two struts)
  { const [x, z, r] = SUNDIAL; atGround(ctx, x, z, () => { B.v('limestone').cyl(x, -0.2, z, r, r, 0.42, 24, 1 / 3, true); B.c('concrete').cyl(x, -0.2, z, r, r, 0.42, 12, 1, true);
      const m = B.v('blackMetal'); const a = [x, 0.22, z + 1.0], b = [x, 2.42, z - 1.8]; m.tube(a, b, 0.035, 6, 1); m.tube([x - 0.5, 0.22, z - 0.9], [x, 1.63, z - 0.8], 0.02, 5, 1); m.tube([x + 0.5, 0.22, z - 0.9], [x, 1.63, z - 0.8], 0.02, 5, 1);
      B.c('metal').box(x, 1.0, z - 0.75, 0.9, 1.6, 0.12); propKit.registerProp(ctx, 'sundial', x, z, 0, 2 * r, 2 * r, 0.3); }, r + 0.1, 'max'); }
  // the sculpture on the brick square of the arts court (nadir tiles: a dark, open, spindly metal piece ~2.5 m across, lower than
  // a person; no photo of it found): three dark bronze bars leaning into an open tripod with a ring, on the bricks, no plinth
  { const x = 38.7, z = -4.3; atGround(ctx, x, z, () => { const m = B.v('blackMetal'); const ft = [[-1.15, 0.5], [1.05, 0.75], [0.1, -1.2]], ap = [[0.35, 1.75, 0.1], [-0.3, 1.55, -0.2], [0.05, 1.95, 0.3]];
      ft.forEach((f, k) => { m.tube([x + f[0], 0.02, z + f[1]], [x + ap[k][0], ap[k][1], z + ap[k][2]], 0.045, 6, 1); });
      for (let k = 0; k < 10; k++) { const a0 = k / 10 * 6.2832, a1 = (k + 1) / 10 * 6.2832; m.tube([x + Math.cos(a0) * 0.42, 1.25 + Math.sin(a0) * 0.42, z + Math.cos(a0) * 0.1], [x + Math.cos(a1) * 0.42, 1.25 + Math.sin(a1) * 0.42, z + Math.cos(a1) * 0.1], 0.03, 5, 1); }
      B.c('metal').box(x, 0.9, z, 0.9, 1.8, 0.9, 0.4); propKit.registerProp(ctx, 'sculpture', x, z, 0.4, 1.2, 1.2, 1.9); }, 0.8, 'max'); }
  // the white storage shed along the north-west edge of the Commons' service yard (nadir tiles: a white roof ~12 x 3 m)
  { const sh = SHED; atGround(ctx, -154.2, -8.4, () => { plainBlock(ctx, sh, -0.8, 2.7, WHITE, [0.74, 0.74, 0.72]); (ctx.buildingRings = ctx.buildingRings || []).push(sh);
      { let F = edgeFrame(sh[3][0], sh[3][1], sh[2][0], sh[2][1]); if (pointInRing((sh[2][0] + sh[3][0]) / 2 + F.nx, (sh[2][1] + sh[3][1]) / 2 + F.nz, sh)) F = edgeFrame(sh[2][0], sh[2][1], sh[3][0], sh[3][1]);   // the yard side: a pair of doors and two windows (no long blank wall, rule F41)
        // (fix round 5: plain painted service doors, two pairs and a single, with a louvre over each; the glazed shop-front doors were wrong for a store)
        const pt = B.v('paint', true); const leaf = (u, w) => { const c = F.P(u, 1.07, 0.04); pt.setColor(0.42, 0.45, 0.44); pt.box(c[0], c[1], c[2], w, 2.1, 0.05, F.rotY); const fr = F.P(u, 2.2, 0.05); pt.setColor(0.6, 0.6, 0.58); pt.box(fr[0], fr[1], fr[2], w + 0.16, 0.1, 0.07, F.rotY); const h = F.P(u + w / 2 - 0.12, 1.05, 0.08); pt.setColor(0.12, 0.12, 0.12); pt.box(h[0], h[1], h[2], 0.04, 0.16, 0.04, F.rotY); const lv = F.P(u, 2.45, 0.04); pt.setColor(0.5, 0.5, 0.49); pt.box(lv[0], lv[1], lv[2], Math.min(w, 0.8), 0.22, 0.04, F.rotY); };
        for (const uc of [F.L * 0.24, F.L * 0.62]) { leaf(uc - 0.47, 0.9); leaf(uc + 0.47, 0.9); } leaf(F.L * 0.9, 0.9); pt.setColor(1, 1, 1); } const g = Math.max(...sh.map((p) => gY(ctx, p[0], p[1])), gY(ctx, -154.2, -8.4)); (ctx.footprints = ctx.footprints || []).push({ id: 'Commons yard shed', ring: sh, roof: gY(ctx, -154.2, -8.4) + 2.7, floor: g }); }, 0.5, 'min'); }
}

// ------------------------------------------------------------------------------------------ name boards, the organic garden
// One board per named item of the school's campus map (branson.org/about/campus-map: the legend is the source of every name),
// standing by that building's entrance, beside the door and never in front of it (rule F47; QA round 6 moved the Music Hall's to the lawn
// east of its real north door and New Oaks' across the quad path, 5 m to the side of the door). Skipped if the spot is on a road or in a footprint.
const BOARDS = [
  [-13.4, -7.2, -36, ['KATHARINE', 'BRANSON HALL']], [-97, 24.5, 40, ['THE COMMONS']], [26, 14, 90, ['DOUGLAS', 'FINE ARTS CENTER']], [64.3, 7.3, 189, ['MAXWELL', 'MUSIC HALL']],
  [47.5, 2.2, 15, ['NEW HOUSE']], [30, -44, -20, ['CROSSWAYS']], [-86.5, 70.5, 12, ['GYM COMPLEX']], [-40, 61, 9, ['TOM RYAN FIELD']],
  [-155.5, 108, 60, ['STUDY HALL']], [-153.8, 124, 65, ['RICHARDSON HALL']], [-164.0, 144.2, -45, ['NEW OAKS']], [-140.6, 156.4, 0, ['TALLANT', 'SCIENCE CENTER']],
  [-91.4, 29.4, 20, ['ALUMNI STEPS']], [-58.2, 12.6, 180, ['ORGANIC GARDEN']],
];
function boards(ctx) {
  const S = ctx.streets; let n = 0;
  for (const [x, z, deg, lines] of BOARDS) { if ((S && S.inRoad(x, z, 1.2)) || (ctx.buildingRings || []).some((r) => pointInRing(x, z, r)) || (ctx.gen.trees || []).some((t) => Math.hypot(t[0] - x, t[1] - z) < 1.6)) { console.warn('[branson] name board skipped', lines.join(' '), x, z); continue; } nameBoard(ctx, x, z, deg, lines); n++; }
  ctx.boardCount = n;
  // Organic Garden (campus map item 9), fix round 6 from a nadir tiles shot: a fenced plot of 10.7 x 7.5 m on the hall's south-west lawn, bark mulch
  // (painted by tools/ground_fix.py), six square raised beds in two rows, a low wire fence with a gate on the north and the south side
  const pt = ctx.B.v('paint', true); const Gd = GARDEN, rot = -Gd.ang * RAD;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const [x, z] = along(Gd, (i - 1) * 4.2, (j - 0.5) * 3.6);   /* (fix round 7: the gates stand on the aisle between the middle and the east column) */ atGround(ctx, x, z, () => { pt.setColor(0.42, 0.3, 0.2).box(x, 0.2, z, 2.5, 0.5, 2.2, rot); pt.setColor(0.07, 0.12, 0.045).box(x, 0.47, z, 2.3, 0.06, 2.0, rot); pt.setColor(1, 1, 1); ctx.B.c('wood').box(x, 0.2, z, 2.5, 0.5, 2.2, rot); propKit.registerProp(ctx, 'bed', x, z, rot, 2.5, 2.2, 0.5); }, 1.7, 'min'); }
  { const R = obb(Gd.cx, Gd.cz, Gd.w, Gd.d, Gd.ang); hillFence(ctx, [...R, R[0]], { h: 1.2, black: true, every: 3, gaps: [[Gd.w / 2 + Gd.gate - 0.8, Gd.w / 2 + Gd.gate + 0.8], [Gd.w + Gd.d + Gd.w / 2 - Gd.gate - 0.8, Gd.w + Gd.d + Gd.w / 2 - Gd.gate + 0.8]] }); }
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
  neighbours(ctx);
  paving(ctx);
  boards(ctx);
  boundary(ctx);
  ctx.B.v('paint', true).setColor(1, 1, 1); ctx.B.v('stucco', true).setColor(1, 1, 1);
}
