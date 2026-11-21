// Earl of March grounds: the track and its infield pitch, the painted courts in the school yards, the car parks (stall
// rows on the OSM parking aisles, cars), kerbs on every paved outline, lights, the play-area fence, rock outcrops.
import { pointInRing, mulberry32 } from '../../world/util.js';
import { hillFence, onSlope, atGround } from '../marin/kit.js';
import { propKit } from '../../world/props.js';
import { bleachers, landmarkKit } from '../../world/landmarks.js';
import { kerb, meshY, drapePoly, earclip } from './lib.js';
import { PAVED } from './paved.js';
import { PLAY_EDGE, lineDist, segDist, SW } from './kit.js';
import { SCHOOL_RING } from './blocks.js';
const SCHOOL_LOOP = [...SCHOOL_RING, SCHOOL_RING[0]];

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
  // the aluminium bleachers on the west side (fix round 1, nadir tiles ref_trk on a 20 m grid + the view from the infield): a three-row bank 53 m long
  // beside the track from z 53 to z 106, and a six-row block right behind its middle (z 71..90). Both FACE EAST, onto the track: u runs south along the
  // straight (dir = TA - 90 deg), the rows step back to the west. (They had been drawn facing west and the long bank ran north from z 53.)
  const dir = TA - Math.PI / 2, b0 = [-160.0, 53.2], b1 = [b0[0] + AX * 18 - PX * 1.9, b0[1] + AZ * 18 - PZ * 1.9];
  atGround(ctx, b0[0] + AX * 26.5, b0[1] + AZ * 26.5, () => bleachers(ctx, { x: b0[0], z: b0[1], dir, len: 53, rows: 3, run: 0.61, rise: 0.22, frontH: 0 }), 3, 'max');
  atGround(ctx, b1[0] + AX * 9.5, b1[1] + AZ * 9.5, () => bleachers(ctx, { x: b1[0], z: b1[1], dir, len: 19, rows: 6, run: 0.72, rise: 0.28, frontH: 0 }), 3, 'max');
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
// Stall rows on both sides of every OSM parking aisle inside the fence (the aisles match the painted rows of the nadir tiles).
// How many cars (rule F46, fix round 1: a deliberate count, not a fill factor picked for looks). The tiles were flown in the summer holidays (the north
// lot holds a handful of cars); the map is the school on a SCHOOL DAY, and the September 2019 Street View frames taken on one (n2, n3, p2) show it: the
// rows within ~45 m of the building are full bumper to bumper, the outer two thirds of the lot hold a few scattered cars. So: stalls within 45 m of
// the school's walls 85 % full, the rest of the north lot 10 %, about 70 cars there instead of 150. The Mlacak / library lots (public, in use all day in
// the same frames) stay about half full.
function vehicles(ctx) {
  const rnd = mulberry32(1971); const line = liner(ctx); const S = ctx.streets;
  const tpls = [propKit.buildCarTemplate(propKit.CAR_TYPES.suv), propKit.buildCarTemplate(propKit.CAR_TYPES.sedan), propKit.buildCarTemplate(propKit.CAR_TYPES.hatch)];
  const keep = ctx.keepClear || []; const trunks = ctx.gen.trees || []; const placed = []; let n = 0, stalls = 0; const asph = (x, z) => ctx.surfaceAt(x, z) === 'asphalt';
  const edge = [...PLAY_EDGE, PLAY_EDGE[0]];
  const car = (x, z, nx, nz, fill) => { const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(); if (r4 > fill(x, z)) return;
    if (!pointInRing(x, z, PLAY_EDGE) || lineDist(x, z, edge) < 3.5) return; if (keep.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r)) return;
    const hd = Math.atan2(-nz, nx); const c = Math.cos(hd), s = Math.sin(hd); const corners = [[2.35, 1.0], [2.35, -1.0], [-2.35, 1.0], [-2.35, -1.0]].map(([l, w]) => [x + l * c + w * s, z - l * s + w * c]);
    if (corners.some(([px, pz]) => !asph(px, pz) || (ctx.buildingRings || []).some((r) => pointInRing(px, pz, r)) || (S && S.inRoad(px, pz, 0.3)))) return;
    if (ctx.terrain && ctx.terrain.maxIn(x, z, 2.4) - ctx.terrain.minIn(x, z, 2.4) > 0.4) return;
    if (placed.some(([px, pz, qx, qz]) => { const dd = Math.hypot(px - x, pz - z); return dd < 2.5 || (dd < 5.3 && (Math.abs(qx * nx + qz * nz) < 0.96 || Math.abs((px - x) * nx + (pz - z) * nz) > 1.2)); }) || trunks.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.2)) return;
    const tpl = r1 < 0.45 ? tpls[0] : r1 < 0.8 ? tpls[1] : tpls[2]; const col = propKit.CAR_COLORS[Math.floor(r2 * propKit.CAR_COLORS.length)];
    onSlope(ctx, x, z, 2.0, () => propKit.placeCar(ctx, tpl, x, z, hd + (r3 - 0.5) * 0.05 + (r1 < 0.5 ? Math.PI : 0), col)); placed.push([x, z, nx, nz]); n++; };
  const W = 2.7, D = 5.2; let lot = { stalls: 0, cars: 0 };
  const row = (a, b, sd, fill) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 6) return; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L, nx = -tz * sd, nz = tx * sd; const nS = Math.floor((L - 2) / W), o = (L - nS * W) / 2; let run = 0;
    for (let k = 0; k <= nS; k++) { const x = a[0] + tx * (o + k * W) + nx * (3.3 + D / 2), z = a[1] + tz * (o + k * W) + nz * (3.3 + D / 2); const p0 = [x - nx * D / 2, z - nz * D / 2], p1 = [x + nx * D / 2, z + nz * D / 2];
      const ok = asph(p0[0], p0[1]) && asph(p1[0], p1[1]) && asph(x, z) && asph(p1[0] + nx * 0.5, p1[1] + nz * 0.5) === asph(p1[0] + nx * 0.5, p1[1] + nz * 0.5) && pointInRing(p1[0], p1[1], PLAY_EDGE) && !(ctx.buildingRings || []).some((r) => pointInRing(p1[0], p1[1], r));
      if (ok) { line(p0[0], p0[1], p1[0], p1[1]); run++; } else run = 0;
      if (ok && run > 1) { stalls++; lot.stalls++; const n0 = n; car(x - tx * W / 2, z - tz * W / 2, nx, nz, fill); lot.cars += n - n0; } } };
  for (const r of ctx.data.roads) { if (r.tags.highway !== 'service' || r.tags.service !== 'parking_aisle') continue; const c = r.line[Math.floor(r.line.length / 2)]; if (!pointInRing(c[0], c[1], PLAY_EDGE)) continue;
    const north = c[1] < -40; const fill = north ? (x, z) => (lineDist(x, z, SCHOOL_LOOP) < 45 ? 0.85 : 0.1) : () => 0.5; lot = (ctx.lots = ctx.lots || {})[r.id] = { at: [Math.round(c[0]), Math.round(c[1])], stalls: 0, cars: 0 };
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

// The salmon brick pavers in front of the main entrance (nadir tiles g_60_-30, Street View d_78): a strip 5 m deep along the glazed front in the
// notch between the north wing and the east block.
const ENTR_A = [71.61, -23.62], ENTR_B = [93.39, -0.59];
function entrancePavers(ctx) {
  const L = Math.hypot(ENTR_B[0] - ENTR_A[0], ENTR_B[1] - ENTR_A[1]), tx = (ENTR_B[0] - ENTR_A[0]) / L, tz = (ENTR_B[1] - ENTR_A[1]) / L, nx = tz, nz = -tx;
  const r = [[ENTR_A[0] + nx * 0.08, ENTR_A[1] + nz * 0.08], [ENTR_B[0] + nx * 0.08 - tx * 0.3, ENTR_B[1] + nz * 0.08 - tz * 0.3], [ENTR_B[0] + nx * 5 - tx * 0.3, ENTR_B[1] + nz * 5 - tz * 0.3], [ENTR_A[0] + nx * 5, ENTR_A[1] + nz * 5]];
  const bk = ctx.B.v('stucco', true); bk.setColor(0.62, 0.3, 0.22); drapePoly(ctx, bk, r, 0.035, (x, z) => [x / 0.9, z / 0.9]); bk.setColor(1, 1, 1); kerb(ctx, r, { color: [0.5, 0.25, 0.19], h: 0.05, w: 0.14, step: 1.0, all: true, skip: (px, pz) => (ctx.buildingRings || []).some((q) => pointInRing(px, pz, q)) });
  ctx.gen.trees = (ctx.gen.trees || []).filter((t) => !pointInRing(t[0], t[1], r)); ctx.entrancePavers = r;
}
// The March Tennis Club's cedar hedges south of the fence (rule F28: one continuous clipped wall each, at the lidar's height): about 4.5 m along the
// courts' north and north-east sides (seen from the Mlacak lots, Street View t_hedge), 9 m along the Campeau Drive side. Outside the play area.
const HEDGES = [[[-53.7, 253.8], [-27.2, 228.2], 4.5], [[-27.2, 228.2], [16.2, 272.8], 4.5], [[16.2, 272.8], [-10.2, 298.4], 9], [[-11.6, 299.8], [-38.1, 325.5], 9], [[-81.6, 280.9], [-53.7, 253.8], 4.2]];
function hedges(ctx) {
  const hb = ctx.B.v('maHedge', true); const edge = [...PLAY_EDGE, PLAY_EDGE[0]]; const g = gY(ctx);
  for (const [a, b, h] of HEDGES) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; let nx = tz, nz = -tx; const c = [(-53.7 + 16.2) / 2, (253.8 + 272.8) / 2]; if ((a[0] + nx - c[0]) ** 2 + (a[1] + nz - c[1]) ** 2 < (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2) { nx = -nx; nz = -nz; }
    const n = Math.max(1, Math.round(L / 2)); const P = (u, o) => [a[0] + tx * u + nx * o, a[1] + tz * u + nz * o];
    for (let k = 0; k < n; k++) { const u0 = L * k / n, u1 = L * (k + 1) / n; const q = [P(u0, 1.0), P(u1, 1.0), P(u1, 2.6), P(u0, 2.6)]; if (q.some((p) => pointInRing(p[0], p[1], PLAY_EDGE) || lineDist(p[0], p[1], edge) < 0.8)) continue;
      const tone = 0.62 + 0.12 * Math.sin(k * 1.7); hb.setColor(0.5 * tone, 0.62 * tone, 0.42 * tone); const Y = (p, y) => [p[0], g(p[0], p[1]) + y, p[1]];
      const quad = (p0, p1, y0, y1, nr) => { const v = [Y(p0, y0), Y(p1, y0), Y(p1, y1), Y(p0, y1)]; const ux = v[1][0] - v[0][0], uz = v[1][2] - v[0][2]; if ((uz * nr[0] - ux * nr[2]) * 1 > 0) hb.quad(v[0], v[1], v[2], v[3], [u0 / 2, 0], [u1 / 2, 0], [u1 / 2, h / 2], [u0 / 2, h / 2]); else hb.quad(v[1], v[0], v[3], v[2], [u1 / 2, 0], [u0 / 2, 0], [u0 / 2, h / 2], [u1 / 2, h / 2]); };
      quad(q[0], q[1], -0.3, h, [-nx, 0, -nz]); quad(q[3], q[2], -0.3, h, [nx, 0, nz]); hb.quad(Y(q[0], h), Y(q[1], h), Y(q[2], h), Y(q[3], h), [0, 0], [1, 0], [1, 1], [0, 1]); hb.quad(Y(q[3], h), Y(q[2], h), Y(q[1], h), Y(q[0], h), [0, 0], [1, 0], [1, 1], [0, 1]);
      if (k === 0) quad(q[3], q[0], -0.3, h, [-tx, 0, -tz]); if (k === n - 1) quad(q[1], q[2], -0.3, h, [tx, 0, tz]); } }
  hb.setColor(1, 1, 1);
}

// (fix round 1, rules F34 / F42) Paver plazas as the tiles show them, laid as draped pavers on the concrete class the ground mask already has there
// (outlines mirrored from tools/data/extra.py: ML_PLAZA without its two planting beds, SE_FORECOURT):
//   the Mlacak Centre / library forecourt: buff pavers in ~6.6 m squares between darker bands that follow the library's walls (nadir ref_m1);
//   the grades 7-8 forecourt at the end of the two sweeping walks: plain buff pavers (ref_s1).
const ML_PAVERS = [[53.6, 124.6], [58, 127.2], [55.5, 132], [54.2, 138], [54.3, 145], [56, 150.5], [59.5, 154.5], [62, 157.5], [56.5, 163.5], [52.5, 167], [51, 174], [47.5, 175], [47.2, 166.5], [48.5, 164], [51, 160],
  [49.5, 155.5], [45.5, 157], [40, 153.5], [44.6, 143.5], [48.5, 136], [51.5, 137], [54, 131], [53.5, 126]];
const SE_PAVERS = [[167, 41], [176.5, 37.5], [178.4, 45], [178.6, 56.8], [163.5, 56.6], [160, 50]];
const clipConvex = (poly, clip) => { let out = poly; const n = clip.length; let ar = 0; for (let i = 0; i < n; i++) { const p = clip[i], q = clip[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1]; } const sg = ar >= 0 ? 1 : -1;
  for (let i = 0; i < n && out.length; i++) { const a = clip[i], b = clip[(i + 1) % n]; const side = (p) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * sg; const nx = [];
    for (let k = 0; k < out.length; k++) { const p = out[k], q = out[(k + 1) % out.length]; const dp = side(p), dq = side(q); if (dp >= 0) nx.push(p); if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); nx.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } out = nx; } return out; };
function plazas(ctx) {
  const bk = ctx.B.v('stucco', true); const inB = (x, z) => (ctx.buildingRings || []).some((q) => pointInRing(x, z, q));
  bk.setColor(0.66, 0.58, 0.5); drapePoly(ctx, bk, ML_PAVERS, 0.03, (x, z) => [x / 0.8, z / 0.8]); drapePoly(ctx, bk, SE_PAVERS, 0.03, (x, z) => [x / 0.8, z / 0.8]);
  // the darker bands: a 6.6 m grid in the library's own frame (27.4 deg), each strip clipped to the plaza
  const a = 0.47822, ux = Math.cos(a), uz = Math.sin(a); const W = (u, v) => [10 + u * ux - v * uz, 170 + u * uz + v * ux]; bk.setColor(0.42, 0.33, 0.28);
  for (let k = -12; k <= 12; k++) for (const strip of [[W(-80, k * 6.6 - 0.4), W(80, k * 6.6 - 0.4), W(80, k * 6.6 + 0.4), W(-80, k * 6.6 + 0.4)], [W(k * 6.6 - 0.4, -80), W(k * 6.6 + 0.4, -80), W(k * 6.6 + 0.4, 80), W(k * 6.6 - 0.4, 80)]]) {
    // (the plaza outline is concave: clip the convex strip against each ear of it)
    for (const tri of earclip(ML_PAVERS)) { const q = clipConvex(strip, tri); if (q.length >= 3) drapePoly(ctx, bk, q, 0.042, (x, z) => [x / 0.8, z / 0.8]); } }
  bk.setColor(1, 1, 1);
  kerb(ctx, SE_PAVERS, { color: [0.5, 0.44, 0.38], h: 0.05, w: 0.14, step: 1.0, all: true, skip: inB });
  ctx.gen.trees = (ctx.gen.trees || []).filter((t) => !pointInRing(t[0], t[1], ML_PAVERS) && !pointInRing(t[0], t[1], SE_PAVERS));
}

export function buildGrounds(ctx) {
  doorWalks(ctx); entrancePavers(ctx); plazas(ctx); hedges(ctx); track(ctx); courts(ctx); kerbs(ctx); lights(ctx); vehicles(ctx); rocks(ctx); boundary(ctx);
  void segDist; void SW;
}
