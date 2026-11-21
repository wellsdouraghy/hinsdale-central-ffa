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
export const TERRACE = [[-120.4, 26.4], [-112.4, 17.6], [-108.0, 21.2], [-103.2, 23.6], [-98.4, 27.2], [-92.5, 28.2], [-87.0, 28.5], [-86.6, 35.2], [-95.2, 37.2], [-101.6, 40.8], [-106.8, 44.4], [-109.6, 42.0], [-115.2, 34.0]];
export const TERRACE_TABLES = [[-107.4, 26.0], [-104.0, 29.1], [-99.8, 32.6], [-109.7, 29.8], [-107.0, 32.0], [-103.7, 35.0], [-113.0, 33.0], [-109.7, 35.6], [-106.1, 38.6]];
export const LOOP_GARDEN = [[-95.8, 44.5], [-90.2, 42.5], [-86.4, 41.8], [-82.7, 41.8], [-79.6, 42.5], [-77.1, 43.6], [-76.3, 44.3], [-75.8, 45.1], [-75.7, 45.9], [-75.9, 46.7], [-76.5, 47.4], [-77.6, 48.0], [-82.8, 49.1], [-85.5, 50.1], [-90.5, 52.9], [-98.4, 54.9], [-99.5, 55.5], [-100.2, 57.0], [-101.0, 58.2], [-102.3, 58.4], [-103.5, 57.5], [-104.3, 55.8], [-104.5, 53.6], [-103.9, 51.4], [-102.6, 49.3], [-100.8, 47.5], [-98.4, 45.8]];   // (fix round 7: the west end is a broad round lobe, radius ~4 m, reaching z 58.4 beside the first stall: gridded nadir tiles; it was a narrow point)
// the island's two stall rows, then one stall per pair of points round the south-east rim (fix round 5: a round sweep of cars nose-out, nadir tiles)
export const LOOP_ISLAND_ROWS = 2;
export const LOOP_ROWS = [[[-100.0, 57.8], [-84.8, 53.6]], [[-83.2, 52.4], [-78.0, 47.6]], [[-68.6, 51.32], [-68.86, 54.06]], [[-68.86, 54.06], [-69.66, 56.68]], [[-69.66, 56.68], [-71.06, 59.04]], [[-71.06, 59.04], [-73.15, 60.92]], [[-73.15, 60.92], [-75.31, 62.62]], [[-75.31, 62.62], [-77.6, 64.12]], [[-77.6, 64.12], [-80.03, 65.4]], [[-80.03, 65.4], [-82.58, 66.43]], [[-82.58, 66.43], [-85.25, 67.2]], [[-85.25, 67.2], [-88.01, 67.59]], [[-88.01, 67.59], [-90.79, 67.44]]];
export const LOOP_OUTER = [[-106.8, 44.4], [-101.6, 40.8], [-95.2, 37.2], [-87.2, 35.2], [-75.2, 35.6], [-66.4, 37.8], [-62.4, 39.8], [-68.4, 45.2], [-67.6, 48.3], [-66.0, 51.0], [-66.5, 55.4], [-68.1, 59.4], [-71.1, 62.5], [-74.4, 65.0], [-77.7, 67.1], [-81.3, 68.7], [-85.0, 69.8], [-89.0, 70.2], [-93.1, 69.6], [-95.6, 66.0], [-101.6, 65.3], [-107.2, 62.4], [-109.7, 58.0], [-110.4, 53.2], [-109.2, 47.6]];   // (fix round 5: the south-east rim is an arc round (-87, 51), not three chamfers)
export const PAVED_POLYS = [
  [[-156.3, -3.5], [-149.2, -11.8], [-145.3, -8.7], [-137.4, -2.3], [-145.3, 8.3], [-146, 10.7], [-150, 9.9], [-152.4, 5.2], [-157.9, 2]],
  [[-181.5, -27.5], [-153, -43.2], [-110.3, -55.2], [-105.7, -38.8], [-149, -26.8], [-176, -12.5]],
  [[-95.9, -56.5], [-88, -57.6], [-82.5, -62], [-76, -64.8], [-58.6, -68.6], [-50, -68.9], [-43.5, -69.2], [-40.2, -64], [-42.3, -60.2], [-46.2, -54.5], [-46.3, -36.7], [-53.3, -35.5], [-57.5, -34], [-59.5, -36.5], [-70.3, -45.2], [-71.7, -44], [-75, -46.6], [-79.2, -41.5], [-81.5, -42.5], [-90.5, -48.5], [-92.9, -52.4]],
  [[-29, -25.5], [-19.5, -37], [-16.5, -37.5], [-14, -34.5], [-12.5, -25], [-5.5, -20.3], [12, -21.5], [13.1, -6.4], [15.5, -1.7], [12, -0.5], [0.3, -5.2], [-16, -8.7], [-23, -13.3], [-30, -22.7]],   // (fix round 5: the lot runs on north along the hall's green strip to the lane, nadir tiles)
  [[-112, 58], [-102.7, 62.7], [-96.8, 70.9], [-93.9, 72.9], [-99.1, 75.5], [-122.3, 80.6], [-122.5, 93], [-120.7, 95.3], [-126.6, 95.9], [-134.1, 84.3], [-143.5, 88.3], [-144.6, 86], [-134.1, 80.8], [-123.6, 70.9]],
];
export const PAVED_LINES = [[[[-176.9, 5.2], [-166.6, 14.6], [-156.3, 21.0], [-150.0, 30.5]], 3.4], [[[-73.1, 3.0], [-62, 1.4], [-56, 2.6], [-50, 4.9], [-44, 6.6], [-38, 7.7], [-32, 9.2], [-27, 12], [-22.5, 15.8], [-17.5, 23.5], [-14.0, 26.3]], 3.0]];
export const ARTS_LAWN = [[22.6, -5.0], [32.7, -5.5], [33.0, 3.2], [24.0, 4.6]], ARTS_BRICK = [[36.0, -7.0], [41.5, -7.0], [41.5, -1.5], [36.0, -1.5]];
export const POOL = [[-189, -73], [-183, -71.5], [-186, -60], [-192, -61.5]], POOL_DECK = [[-196, -76], [-179, -73.5], [-181, -69], [-185, -58], [-196, -59.5], [-196.5, -70]], POOL_HOUSE = [[-195, -58], [-188, -58], [-188, -54], [-195, -54]];
export const ARTS_PLAZA = [[19.6, -9.3], [21.5, -9.6], [36.5, -10.2], [37.0, -12.6], [42.5, -13.0], [46.0, -11.5], [45.8, -1.0], [47.3, 8.0], [44.5, 8.4], [43.6, 1.6], [33.5, 3.6], [33.2, -6.0], [22.0, -5.5], [19.8, -5.3]];
export const LOT_ISLANDS = [[-56.0, -51.0, 2.3]];   // a tree island in the faculty car park
export const LOOP_SWALE = [[-100.5, 50.8], [-95.5, 48.6], [-90.0, 46.6], [-84.0, 45.2], [-80.5, 44.6]];   // the loop island's dry creek of pale cobbles
export const DRY = [[[-219, -31], [-212, -34.5], [-203, -34], [-197.5, -31], [-198.5, -26.5], [-204, -24], [-213, -24.5], [-218, -27]]];   // the dry clearing in the wood west of the faculty lot drive (tools/data/extra.py DRY)
export const LITTER = [[[-193.0, -36.5], [-183.5, -36.5], [-180.0, -31.5], [-180.5, -23.0], [-185.5, -16.5], [-192.0, -17.5]]];   // the wood floor round the red base: leaf litter under a closed canopy (tools/data/extra.py LITTER)
// Fix round 5 (rule F8, nadir tiles): paved walks and door aprons, [points, width]; painted as concrete by tools/ground_fix.py (extra.py WALKS), kerbed in grounds.js
export const WALKS = [
  [[[-17.9, -36.5], [-16.2, -40], [-15.8, -48], [-16.6, -56], [-17.8, -61.5]], 2.6],   // the lane along the hall east wall
  [[[-6.6, 18.0], [-8.1, 20.3], [-9.7, 22.9], [-10.9, 25.0]], 2.6],   // from the hall's south-east terrace (KBH_TERR) to the round patio
  [[[2.15, 3.5], [2.2, 0.0], [2.4, -4.4]], 2.0],   // from the head of the terrace steps to the visitor lot (fix round 8: as wide as the flight)
  [[[-44.7, -48.5], [-46.8, -48.2]], 2.4],   // north block, west door
  [[[-28.1, -63.9], [-26.9, -65.5], [-21.5, -63.6], [-17.9, -61.3]], 1.8],   // north block, north-east door
  [[[-19.9, -50.1], [-16.2, -50.5]], 2.2],   // north block, east door
  [[[-24.4, -34.7], [-23.5, -34.0], [-21.4, -36.7], [-19.3, -36.9]], 1.8],   // north block, court door
  [[[60.2, 10.2], [60.0, 8.6], [52, 7.4], [46.4, 6.9]], 1.8],   // Music Hall north door
  [[[-147.4, 95.4], [-151, 101], [-157, 110], [-159, 115]], 2.4],   // from the Bridge to the quad
  // fix round 6 (rule F47): every kept door has an apron and a walk to paving
  [[[-24.9, -13.8], [-23.7, -15.4]], 2.4],   // the hall's north-east door by the entrance court (at grade, onto the visitor lot)
  [[[-9.1, -2.0], [-7.5, -4.2], [-5.4, -7.0]], 2.8],   // the hall's north-east door of the taller half: stoop, steps, a walk to the visitor lot
  [[[-22.25, 10.4], [-23.9, 12.5]], 2.8],   // the hall's south door: stoop and steps down to the south drive
  [[[50.6, -22.4], [50.3, -24.4], [52.6, -29.5], [52.8, -36.8]], 1.6],   // New House's north door to the parking court on Circle Drive (tiles: a stair and deck north of the door)
  [[[-121.6, 94.6], [-119.5, 95.9], [-116.1, 109.3], [-110.9, 131.3]], 2.2],   // the service walk along the gym's west wall, from the car bays past its three service doors
  [[[-144.4, 137.7], [-146.3, 138.7]], 2.2],   // Richardson Hall's door: apron to the quad path
  [[[44.9, 8.3], [46.5, 8.05]], 2.2],   // Fine Arts east door: apron to the court walk
  // fix round 7
  [[[-91.04, 73.63], [-80.33, 128.06]], 3.6],   // the slab under the gym's east colonnades (1.8 m out from the wall, 3.6 wide)
  [[[-121.6, 80.37], [-99.4, 75.55]], 1.3],   // a concrete margin along the foot of the gym's north wall (the lot is paved up to it)
  [[[-145.5, 158.7], [-145.9, 157.2], [-152.6, 156.4]], 2.2],   // Tallant Science Center's north door: apron and walk to the quad path
];
// (fix round 8, rule F42) the academic quad's paved strips (tools/data/extra.py PATHS, painted in the ground mask): laid as real pavers with a kerb like every
// other walk; they were paint only and faded into the lawn
export const QUAD_PATHS = [[[[-165.8, 127.2], [-158.8, 117.3]], 5.0], [[[-176.3, 138.8], [-167.0, 149.3], [-153.0, 156.3]], 3.5], [[[-153.0, 122.5], [-146.0, 148.2]], 3.0]];
// Katharine Branson Hall's south-east terrace (fix round 7, gridded nadir tiles + obliques): a paved terrace at 8.6 against the walk-out lower storey of
// the hall's south-east end, a flight of steps at its north corner up to the visitor lot's level, a walk from its south corner to the round patio
export const KBH_TERR = [[-1.6, 6.65], [0.3, 8.3], [1.75, 8.6], [1.5, 10.5], [0.6, 12.4], [-0.4, 14.0], [-1.6, 15.9], [-3.0, 17.3], [-5.2, 18.4], [-7.6, 19.2], [-8.6, 18.3], [-10.3, 17.55]];
export const KBH_TERR_Y = 8.6;
export const KBH_STEPS = { a: [1.94, 4.16], b: [0.64, 8.06], w: 2.0, head: 2.4, flare: true };   // (fix round 8: 2.0 m wide as the tiles' tread stripes read (1.8-2.0), widened to the east, away from the hall's corner; the rails end in outward returns so a player in an outer lane is led in, not caught on a rail end; the terrace has a paved landing under the foot)
export const PATIO = [-11.2, 27.3, 2.9];   // (fix round 7: 4 m east of where it stood, gridded nadir tiles)   // the round patio at the end of the terrace walk
export const ENTR_COURT = [[-40.44, -0.4], [-34.89, 3.71], [-36.9, 6.43], [-37.68, 6.24], [-44.44, 4.99]];   // the red tile forecourt at the foot of the hall's entrance steps (fix round 6: it ends on the drive's north edge, laid as real tile with a stone band on the join)
// the organic garden's fenced plot and the sundial, measured on a nadir tiles shot (fix round 6): plot 10.7 x 7.5 m, bearing -5.6 deg; the dial 4 m across
export const GARDEN = { cx: -66.0, cz: 17.0, w: 13.0, d: 8.0, ang: -7, gate: 2.1 };   // (fix round 7, gridded nadir: 13 x 8 m, 1.5 m further west; gates on the aisle between two bed columns)
export const SUNDIAL = [-43.3, 21.7, 2.0];
export const STEPS_WALK = [[-87.3, 18.4], [-86.6, 14.5], [-82.0, 9.5], [-73.5, 3.4]];   // from the head of the Alumni Steps up to the hall's south drive
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
  // (a level head longer than one 2 m lattice cell, or the drawn ground at the top tread sags below it and the first step shows a riser on its uphill side)
  const head = spec.head ?? 1.5, uc = (L + 1.5 - head) / 2; const rect = { cx: a[0] + tx * uc, cz: a[1] + tz * uc, w: L + 1.5 + head, d: w + 0.8, angle: Math.atan2(tz, tx) };
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
    // (fix round 8) spec.flare: each rail ends in a short outward return (45 deg, 0.55 m) with its own post: a player coming down or up an outer lane slides
    // along it into the flight instead of stopping dead on the rail's end
    if (spec.flare) for (const [u, y, dir] of [[0, y0, -1], [L, y1, 1]]) { const q0 = P(u, v, y), q1 = P(u + dir * 0.55, v + sd * 0.55, y); m.tube([q0[0], q0[1] + 1.15, q0[2]], [q1[0], q1[1] + 1.15, q1[2]], 0.025, 6); m.box(q1[0], q1[1] + 0.58, q1[2], 0.04, 1.16, 0.04, rot);
      const fn = [dir * tx * 0.7 - sd * nx * 0.7, 0, dir * tz * 0.7 - sd * nz * 0.7]; for (const k of [1, -1]) quadFacing(B.c('metal'), [q0[0], q0[1] - 0.1, q0[2]], [q1[0], q1[1] - 0.1, q1[2]], [q1[0], q1[1] + 1.15, q1[2]], [q0[0], q0[1] + 1.15, q0[2]], [k * fn[0], 0, k * fn[2]]); }
    const c0 = P(L / 2, v, (y0 + y1) / 2 + 0.7); const len = Math.hypot(L, drop); const g = new Float32Array(0); void g;
    // rail collision: a thin sloping slab (two quads back to back are enough for the capsule)
    quadFacing(B.c('metal'), P(0, v, y0 + 0.25), P(L, v, y1 + 0.25), P(L, v, y1 + 1.15), P(0, v, y0 + 1.15), [sd * nx, 0, sd * nz]); quadFacing(B.c('metal'), P(L, v, y1 + 0.25), P(0, v, y0 + 0.25), P(0, v, y0 + 1.15), P(L, v, y1 + 1.15), [-sd * nx, 0, -sd * nz]); void c0; void len; }
  return { n, riser, tread, drop };
}
export { hillFence, guardRail, hedgeMass, terraceBlocks };
