// Earl of March grounds: the track and its infield pitch, the painted courts in the school yards, the car parks (stall
// rows on the OSM parking aisles, cars), kerbs on every paved outline, lights, the play-area fence, rock outcrops.
import { pointInRing, mulberry32 } from '../../world/util.js';
import { hillFence, onSlope, atGround } from '../marin/kit.js';
import { propKit } from '../../world/props.js';
import { bleachers, landmarkKit } from '../../world/landmarks.js';
import { kerb, meshY, drapePoly } from './lib.js';
import { PAVED } from './paved.js';
import { PLAY_EDGE, lineDist, segDist, SW } from './kit.js';

// The running track (nadir 3D tiles, 5 m grid; mirrored in tools/data/extra.py, which paints it into the baked ground):
// a plain grey oval without lane paint, straights 91 m, inside radius 32 m, 7.5 m wide, long axis 2.4 deg west of south.
export const TRACK = { cx: -117.3, cz: 80.5, ang: -2.4, half: 45.5, r: 32.0, w: 7.5 };
const TA = TRACK.ang * Math.PI / 180, AX = Math.sin(TA), AZ = Math.cos(TA), PX = AZ, PZ = -AX;   // A = along the straights (south), P = across (east)
export const TW = (a, p) => [TRACK.cx + AX * a + PX * p, TRACK.cz + AZ * a + PZ * p];
export function trackRing(off, n = 20) { const R = TRACK.r + off, o = [];
  for (let k = 0; k <= n; k++) { const th = Math.PI * k / n; o.push(TW(TRACK.half + R * Math.sin(th), R * Math.cos(th))); }
  for (let k = 0; k <= n; k++) { const th = Math.PI + Math.PI * k / n; o.push(TW(-TRACK.half + R * Math.sin(th), R * Math.cos(th))); } return o; }
// the infield pitch: goals 102.5 m apart on the oval's axis (nadir tiles: white crossbars at z 31.5 and 134)
const GOALS = [TW(-49.6, 1.2), TW(52.9, 1.2)];
// floodlight masts at the four corners of the track (nadir tiles: mast + shadow)
const MASTS = [[-161.5, 28.5], [-67.5, 30.5], [-167, 135.5], [-68.5, 143]];
// courts painted on the school yards (nadir tiles): [centre x, z, axis angle deg (0 = +x), length, width, colour]
const COURTS = [[125.5, 103.5, -45, 25.6, 14.2, [0.86, 0.86, 0.84]], [68.5, 61.5, 46.7, 22, 12.5, [0.78, 0.66, 0.2]]];
const gY = (ctx) => meshY(ctx);

export function groundPads(ctx) {
  // the track and its infield are one level field (lidar: +-0.25 m over the oval)
  ctx.trackY = ctx.flatten({ outline: trackRing(TRACK.w + 1.5) }, { blend: 5 });
  for (const [cx, cz, deg, L, W] of COURTS) ctx.flatten({ rect: { cx, cz, w: L + 3, d: W + 3, angle: deg * Math.PI / 180 } }, { blend: 4 });
}
/** (x, z) => true where no scanned tree may stand: paving, the track and its infield, the courts. */
export function KEEP_OPEN(ctx) { const tr = trackRing(TRACK.w + 2.5);
  return (x, z) => ctx.surfaceAt(x, z) !== 'grass' || pointInRing(x, z, tr) || [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => ctx.surfaceAt(x + dx, z + dz) === 'asphalt'); }

// painted line on the ground between two points, following the drawn surface
function liner(ctx) { const pt = ctx.B.v('paint', true), g = gY(ctx);
  return (x0, z0, x1, z1, w = 0.1, col = [0.82, 0.82, 0.8]) => { const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.01) return; const n = Math.max(1, Math.ceil(L / 1.6)); const tx = (x1 - x0) / L, tz = (z1 - z0) / L, nx = -tz * w / 2, nz = tx * w / 2; pt.setColor(...col);
    for (let k = 0; k < n; k++) { const ax = x0 + tx * L * k / n, az = z0 + tz * L * k / n, bx = x0 + tx * L * (k + 1) / n, bz = z0 + tz * L * (k + 1) / n; const y = (x, z) => g(x, z) + 0.03; const q = [[ax + nx, y(ax + nx, az + nz), az + nz], [bx + nx, y(bx + nx, bz + nz), bz + nz], [bx - nx, y(bx - nx, bz - nz), bz - nz], [ax - nx, y(ax - nx, az - nz), az - nz]]; pt.quad(q[0], q[1], q[2], q[3]); pt.quad(q[3], q[2], q[1], q[0]); }
    pt.setColor(1, 1, 1); }; }

function track(ctx) {
  const { B } = ctx;
  for (let i = 0; i < 2; i++) { const [x, z] = GOALS[i]; atGround(ctx, x, z, () => { landmarkKit.soccerGoal(ctx, x, z, -TA + (i ? Math.PI : 0)); B.c('metal:mesh').box(x, 1.22, z, 7.4, 2.44, 0.12, -TA); }, 1.5, 'max'); }
  for (const [x, z] of MASTS) atGround(ctx, x, z, () => { landmarkKit.lightPole(ctx, x, z, 18, Math.atan2(TRACK.cx - x, TRACK.cz - z), 2); ctx.grapplePoles.push({ x, z, y0: 1.5, y1: 18, r: 0.3 }); }, 0.6, 'min');
  // the aluminium bleachers on the west side (nadir tiles): a long three-row bank beside the track and a ten-row block behind its middle
  const b0 = [-159.2, 53.5], b1 = [-161.6, 71.5];
  atGround(ctx, b0[0], b0[1] + 26, () => bleachers(ctx, { x: b0[0], z: b0[1], dir: Math.PI / 2 - TA, len: 52, rows: 3, run: 0.61, rise: 0.22, frontH: 0 }), 3, 'max');
  atGround(ctx, b1[0], b1[1] + 9, () => bleachers(ctx, { x: b1[0] - 2.0, z: b1[1], dir: Math.PI / 2 - TA, len: 18, rows: 10, run: 0.66, rise: 0.25, frontH: 0.7 }), 3, 'max');
}
function courts(ctx) {
  const line = liner(ctx); const { B } = ctx;
  for (const [cx, cz, deg, L, W, col] of COURTS) { const a = deg * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a); const P = (u, v) => [cx + u * ux - v * uz, cz + u * uz + v * ux];
    const seg = (u0, v0, u1, v1) => { const p = P(u0, v0), q = P(u1, v1); line(p[0], p[1], q[0], q[1], 0.06, col); };
    const arc = (uc, vc, r, a0, a1, n = 18) => { for (let k = 0; k < n; k++) { const t0 = a0 + (a1 - a0) * k / n, t1 = a0 + (a1 - a0) * (k + 1) / n; seg(uc + r * Math.cos(t0), vc + r * Math.sin(t0), uc + r * Math.cos(t1), vc + r * Math.sin(t1)); } };
    seg(-L / 2, -W / 2, L / 2, -W / 2); seg(L / 2, -W / 2, L / 2, W / 2); seg(L / 2, W / 2, -L / 2, W / 2); seg(-L / 2, W / 2, -L / 2, -W / 2); seg(0, -W / 2, 0, W / 2); arc(0, 0, 1.8, 0, Math.PI * 2, 24);
    for (const s of [-1, 1]) { const e = s * L / 2; seg(e, -2.45, e - s * 5.8, -2.45); seg(e, 2.45, e - s * 5.8, 2.45); seg(e - s * 5.8, -2.45, e - s * 5.8, 2.45); arc(e - s * 5.8, 0, 1.8, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2, 12);
      const r3 = Math.min(6.02, W / 2 - 0.5); arc(e - s * 1.575, 0, r3, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2, 20);
      // the hoop: a steel post behind the baseline, an arm, a backboard and a rim
      const p = P(e + s * 0.9, 0), bb = P(e - s * 1.2, 0); const rot = -a;
      atGround(ctx, p[0], p[1], () => { const g = B.v('galv'); g.cyl(p[0], 0, p[1], 0.07, 0.07, 3.3, 8, 1, true); g.tube([p[0], 3.25, p[1]], [bb[0], 3.45, bb[1]], 0.05, 6); B.v('whitePanel').box(bb[0], 3.5, bb[1], 0.05, 1.07, 1.8, rot);
        const rm = P(e - s * 1.45, 0); B.v('paint', true).setColor(0.85, 0.3, 0.1).cyl(rm[0], 3.04, rm[1], 0.23, 0.23, 0.03, 12, 1, false).setColor(1, 1, 1); B.c('metal').box(p[0], 1.65, p[1], 0.2, 3.3, 0.2); B.c('metal').box(bb[0], 3.5, bb[1], 0.08, 1.07, 1.8, rot); ctx.grapplePoles.push({ x: p[0], z: p[1], y0: 1, y1: 3.3, r: 0.07 }); }, 0.5, 'max'); } }
}

// ------------------------------------------------------------------------------------------ car parks
// Stall rows on both sides of every OSM parking aisle inside the fence (the aisles match the painted rows of the nadir
// tiles); the tiles were flown in the summer holidays (a handful of cars), Street View on a school day shows the lots
// full: the staff lot north of the school and the Mlacak lots are filled to about two thirds (rule F46).
function vehicles(ctx) {
  const rnd = mulberry32(1971); const line = liner(ctx); const S = ctx.streets;
  const tpls = [propKit.buildCarTemplate(propKit.CAR_TYPES.suv), propKit.buildCarTemplate(propKit.CAR_TYPES.sedan), propKit.buildCarTemplate(propKit.CAR_TYPES.hatch)];
  const keep = ctx.keepClear || []; const trunks = ctx.gen.trees || []; const placed = []; let n = 0, stalls = 0; const asph = (x, z) => ctx.surfaceAt(x, z) === 'asphalt';
  const edge = [...PLAY_EDGE, PLAY_EDGE[0]];
  const car = (x, z, nx, nz, fill) => { const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(); if (r4 > fill) return;
    if (!pointInRing(x, z, PLAY_EDGE) || lineDist(x, z, edge) < 3.5) return; if (keep.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r)) return;
    const hd = Math.atan2(-nz, nx); const c = Math.cos(hd), s = Math.sin(hd); const corners = [[2.35, 1.0], [2.35, -1.0], [-2.35, 1.0], [-2.35, -1.0]].map(([l, w]) => [x + l * c + w * s, z - l * s + w * c]);
    if (corners.some(([px, pz]) => !asph(px, pz) || (ctx.buildingRings || []).some((r) => pointInRing(px, pz, r)) || (S && S.inRoad(px, pz, 0.3)))) return;
    if (ctx.terrain && ctx.terrain.maxIn(x, z, 2.4) - ctx.terrain.minIn(x, z, 2.4) > 0.4) return;
    if (placed.some(([px, pz, qx, qz]) => { const dd = Math.hypot(px - x, pz - z); return dd < 2.5 || (dd < 5.3 && (Math.abs(qx * nx + qz * nz) < 0.96 || Math.abs((px - x) * nx + (pz - z) * nz) > 1.2)); }) || trunks.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.2)) return;
    const tpl = r1 < 0.45 ? tpls[0] : r1 < 0.8 ? tpls[1] : tpls[2]; const col = propKit.CAR_COLORS[Math.floor(r2 * propKit.CAR_COLORS.length)];
    onSlope(ctx, x, z, 2.0, () => propKit.placeCar(ctx, tpl, x, z, hd + (r3 - 0.5) * 0.05 + (r1 < 0.5 ? Math.PI : 0), col)); placed.push([x, z, nx, nz]); n++; };
  const W = 2.7, D = 5.2;
  const row = (a, b, sd, fill) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 6) return; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L, nx = -tz * sd, nz = tx * sd; const nS = Math.floor((L - 2) / W), o = (L - nS * W) / 2; let run = 0;
    for (let k = 0; k <= nS; k++) { const x = a[0] + tx * (o + k * W) + nx * (3.3 + D / 2), z = a[1] + tz * (o + k * W) + nz * (3.3 + D / 2); const p0 = [x - nx * D / 2, z - nz * D / 2], p1 = [x + nx * D / 2, z + nz * D / 2];
      const ok = asph(p0[0], p0[1]) && asph(p1[0], p1[1]) && asph(x, z) && asph(p1[0] + nx * 0.5, p1[1] + nz * 0.5) === asph(p1[0] + nx * 0.5, p1[1] + nz * 0.5) && pointInRing(p1[0], p1[1], PLAY_EDGE) && !(ctx.buildingRings || []).some((r) => pointInRing(p1[0], p1[1], r));
      if (ok) { line(p0[0], p0[1], p1[0], p1[1]); run++; } else run = 0;
      if (ok && run > 1) { stalls++; car(x - tx * W / 2, z - tz * W / 2, nx, nz, fill); } } };
  for (const r of ctx.data.roads) { if (r.tags.highway !== 'service' || r.tags.service !== 'parking_aisle') continue; const c = r.line[Math.floor(r.line.length / 2)]; if (!pointInRing(c[0], c[1], PLAY_EDGE)) continue;
    const fill = c[1] < -40 ? 0.7 : 0.62;
    for (let i = 0; i < r.line.length - 1; i++) { row(r.line[i], r.line[i + 1], 1, fill); row(r.line[i], r.line[i + 1], -1, fill); } }
  ctx.carCount = n; ctx.stallCount = stalls;
  // school buses at the bus loop in front of the main entrance (Street View: the loop is the bus bay)
  for (const [x, z, deg] of ctx.BUSES || []) { if (keep.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r + 4)) continue; onSlope(ctx, x, z, 5, () => propKit.placeBus(ctx, x, z, deg * Math.PI / 180)); }
}
function lights(ctx) {
  // car-park lighting: a mast on the island ends of every aisle (nadir tiles: mast shadows in the north lot), 8.5 m
  const rnd = mulberry32(44); const got = [];
  for (const r of ctx.data.roads) { if (r.tags.highway !== 'service' || r.tags.service !== 'parking_aisle') continue;
    for (const p of [r.line[0], r.line[r.line.length - 1]]) { let best = null; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = p[0] + Math.cos(a) * 7.5, z = p[1] + Math.sin(a) * 7.5; if (ctx.surfaceAt(x, z) === 'grass' && [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].every(([dx, dz]) => ctx.surfaceAt(x + dx, z + dz) === 'grass')) { best = [x, z]; break; } }
      if (!best || !pointInRing(best[0], best[1], PLAY_EDGE) || lineDist(best[0], best[1], [...PLAY_EDGE, PLAY_EDGE[0]]) < 3 || got.some((q) => Math.hypot(q[0] - best[0], q[1] - best[1]) < 22) || (ctx.buildingRings || []).some((rg) => pointInRing(best[0], best[1], rg)) || (ctx.keepClear || []).some(([kx, kz, kr]) => Math.hypot(best[0] - kx, best[1] - kz) < kr)) continue;
      got.push(best); atGround(ctx, best[0], best[1], () => { landmarkKit.lotLight(ctx, best[0], best[1], 8.5); ctx.grapplePoles.push({ x: best[0], z: best[1], y0: 1, y1: 8.5, r: 0.09 }); }, 0.4, 'min'); } }
  void rnd; ctx.lotLights = got;
}
function kerbs(ctx) {
  const col = [0.56, 0.55, 0.52];
  for (const p of PAVED.asphalt) { kerb(ctx, p.outer, { color: col, step: 1.2 }); for (const h of p.holes) kerb(ctx, h, { color: col, step: 1.2, all: true }); }
}

// ------------------------------------------------------------------------------------------ the play-area edge
// Chain-link on the whole fence line (kit.js PLAY_EDGE = ctx.playEdge, the player clamp: rule F48), a green windscreen
// where it crosses paving, and striped concrete barriers in front of it where a street or a drive leaves the map.
function boundary(ctx) {
  const ring = PLAY_EDGE; const N = ring.length; const paved = (x, z) => ctx.surfaceAt(x, z) !== 'grass' || (ctx.streets && ctx.streets.inRoad(x, z, 0.5));
  const inBld = (x, z) => (ctx.buildingRings || []).some((r) => pointInRing(x, z, r));
  for (let e = 0; e < N; e++) { const a = ring[e], b = ring[(e + 1) % N]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) continue; const n = Math.max(1, Math.round(L / 3)); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const rot = Math.atan2(-tz, tx);
    // inward normal: toward the polygon's inside
    let nx = -tz, nz = tx; if (!pointInRing((a[0] + b[0]) / 2 + nx * 0.5, (a[1] + b[1]) / 2 + nz * 0.5, ring)) { nx = -nx; nz = -nz; }
    let run = null, screen = false; const flush = () => { if (run && run.length > 1) hillFence(ctx, run, screen ? { h: 2.4, screen: 2.0, every: 3 } : { h: 2.4, every: 3 }); run = null; };
    for (let i = 0; i < n; i++) { const p0 = [a[0] + tx * L * i / n, a[1] + tz * L * i / n], p1 = [a[0] + tx * L * (i + 1) / n, a[1] + tz * L * (i + 1) / n], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if (inBld(mid[0], mid[1])) { flush(); continue; }
      const pv = paved(mid[0] + nx * 0.8, mid[1] + nz * 0.8) && paved(mid[0] - nx * 0.8, mid[1] - nz * 0.8);
      if (run && pv !== screen) { const last = run[run.length - 1]; flush(); run = [last]; } if (!run) run = [p0]; screen = pv; run.push(p1);
      if (pv && !(ctx.barriers = ctx.barriers || []).some((q) => Math.hypot(q[0] - (mid[0] + nx * 0.75), q[1] - (mid[1] + nz * 0.75)) < 2.7)) { const bx = mid[0] + nx * 0.75, bz = mid[1] + nz * 0.75, bl = Math.min(2.6, L / n - 0.3); ctx.barriers.push([bx, bz]); onSlope(ctx, bx, bz, bl / 2, () => { propKit.barrier(ctx, bx, bz, rot, bl); const pt = ctx.B.v('paint', true); pt.setColor(0.95, 0.45, 0.05).box(bx, 1.0, bz, bl - 0.3, 0.22, 0.06, rot); pt.setColor(0.9, 0.9, 0.88).box(bx, 0.72, bz, bl - 0.3, 0.16, 0.06, rot); pt.setColor(1, 1, 1); }); } }
    flush(); }
}
// Canadian Shield outcrops: where the lidar ground stands proud and steep in the woods and lawns (the knolls beside the
// track, west of the portables and by the east drive), bare pink-grey gneiss shows through (Street View). Low rounded
// ledges with unequal axes, in groups, solid.
function rocks(ctx) {
  const T = ctx.terrain; if (!T) return; const rnd = mulberry32(1867); const bk = ctx.B.v('eomRock', true); const col = ctx.B.c('concrete'); const pb = ctx.playBounds; const spots = [];
  for (let z = pb.minZ + 6; z < pb.maxZ - 6; z += 7) for (let x = pb.minX + 6; x < pb.maxX - 6; x += 7) { const px = x + (rnd() - 0.5) * 5, pz = z + (rnd() - 0.5) * 5, k = rnd();
    if (!pointInRing(px, pz, PLAY_EDGE) || lineDist(px, pz, [...PLAY_EDGE, PLAY_EDGE[0]]) < 4) continue; const sl = T.slopeAt(px, pz); if (sl < 0.3 || k > 0.7 || ctx.surfaceAt(px, pz) !== 'grass' || [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]].some(([dx, dz]) => ctx.surfaceAt(px + dx, pz + dz) !== 'grass')) continue;
    if ((ctx.buildingRings || []).some((r) => pointInRing(px, pz, r)) || (ctx.streets && ctx.streets.inRoad(px, pz, 3)) || (ctx.keepClear || []).some(([kx, kz, kr]) => Math.hypot(px - kx, pz - kz) < kr + 2)) continue;
    if ((ctx.gen.trees || []).some((t) => Math.hypot(t[0] - px, t[1] - pz) < 2.2)) continue; spots.push([px, pz]); }
  for (const [x, z] of spots) { const rx = 1.6 + rnd() * 2.6, rz = 1.1 + rnd() * 1.8, h = 0.2 + rnd() * 0.4, rot = rnd() * Math.PI, y0 = T.minIn(x, z, Math.max(rx, rz)) - 0.25; const c = Math.cos(rot), s = Math.sin(rot); const tone = 0.8 + rnd() * 0.3; const tc = [0.42 * tone, 0.36 * tone, 0.34 * tone];
    const N = 7, ring = [], top = []; for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2, j = 0.8 + rnd() * 0.35; const u = Math.cos(a) * rx * j, v = Math.sin(a) * rz * j; ring.push([x + u * c - v * s, z + u * s + v * c]); top.push([x + (u * c - v * s) * 0.8 + 0.2, z + (u * s + v * c) * 0.8]); }
    const yT = T.maxIn(x, z, Math.max(rx, rz) * 0.6) + h; const lean = (rnd() - 0.5) * 0.25;
    for (let k = 0; k < N; k++) { const a = ring[k], b = ring[(k + 1) % N], ta = top[k], tb = top[(k + 1) % N]; const ya = yT + lean * (ta[0] - x), yb = yT + lean * (tb[0] - x); bk.setColor(tc[0] * (0.8 + 0.3 * (k % 3) / 2), tc[1] * (0.8 + 0.3 * (k % 3) / 2), tc[2] * (0.8 + 0.3 * (k % 3) / 2));
      bk.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [ta[0], ya, ta[1]], [tb[0], yb, tb[1]]); col.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [ta[0], ya, ta[1]], [tb[0], yb, tb[1]]);
      bk.setColor(tc[0] * 1.12, tc[1] * 1.12, tc[2] * 1.12); bk.tri([x + 0.2, yT + 0.08, z], [tb[0], yb, tb[1]], [ta[0], ya, ta[1]]); col.tri([x + 0.2, yT + 0.08, z], [tb[0], yb, tb[1]], [ta[0], ya, ta[1]]); } }
  bk.setColor(1, 1, 1); ctx.rockCount = spots.length;
}

// Every door gets its level apron and a concrete walk to the nearest paving (rule F47): from the threshold straight out until the
// ground is no longer lawn (16 m at most), painted into the surface classes and laid as a draped slab.
function doorWalks(ctx) {
  const walks = []; for (const d of ctx.doors || []) { let L = 2.6; for (let t = 0.8; t <= 16; t += 0.5) { L = t + 0.8; if (ctx.surfaceAt(d.x + d.nx * t, d.z + d.nz * t) !== 'grass') break; }
    const w = Math.max(2.0, (d.w || 1.9) + 0.8) / 2, tx = -d.nz, tz = d.nx; walks.push([[d.x + tx * w + d.nx * 0.05, d.z + tz * w + d.nz * 0.05], [d.x + tx * w + d.nx * L, d.z + tz * w + d.nz * L], [d.x - tx * w + d.nx * L, d.z - tz * w + d.nz * L], [d.x - tx * w + d.nx * 0.05, d.z - tz * w + d.nz * 0.05]]); }
  // (painted 0.45 m inside the slab's outline: the mask is 4 px / m and bleeds; the slab's own edge is the hard edge, rule F42)
  const inner = walks.map((r) => { const c = [(r[0][0] + r[2][0]) / 2, (r[0][1] + r[2][1]) / 2]; return r.map((p) => { const L = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1; return [p[0] + (c[0] - p[0]) * 0.62 / L, p[1] + (c[1] - p[1]) * 0.62 / L]; }); });
  if (ctx.paintSurface) ctx.paintSurface((x, z) => (ctx.surfaceAt(x, z) === 'grass' && inner.some((r) => pointInRing(x, z, r)) ? 'concrete' : null));
  const c = ctx.B.v('concrete'); for (const r of walks) drapePoly(ctx, c, r, 0.03, (x, z) => [x / 3, z / 3]);
  ctx.gen.trees = (ctx.gen.trees || []).filter((t) => !walks.some((r) => pointInRing(t[0], t[1], r) || pointInRing(t[0] + 1.2, t[1], r) || pointInRing(t[0] - 1.2, t[1], r) || pointInRing(t[0], t[1] + 1.2, r) || pointInRing(t[0], t[1] - 1.2, r)));
  ctx.doorWalks = walks;
}

export function buildGrounds(ctx) {
  doorWalks(ctx); track(ctx); courts(ctx); kerbs(ctx); lights(ctx); vehicles(ctx); rocks(ctx); boundary(ctx);
  void segDist; void SW;
}
