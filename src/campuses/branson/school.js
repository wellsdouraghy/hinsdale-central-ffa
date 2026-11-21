// The Branson School's own buildings, over the OSM footprints (Katharine Branson Hall, the gym complex, the three
// buildings of the academic quad) and the hand-digitised ones OSM lacks (the Commons and the Douglas Fine Arts Center,
// both 2010: tools/data/extra.py). Names and uses are from the school's campus map. Every building stands on the real
// terrain (`sited`: datum = its lowest planned floor, each wall piece on its own pad) and its eave / parapet is an
// ABSOLUTE height in metres above Tom Ryan Field, read from the Google 3D tiles (surface samples, field = 0):
//   Katharine Branson Hall   upper campus (ground ~10.3): eaves ~14.9, ridges 18-19; cream stucco, red clay tile hips
//   Gym complex              beside the field (ground 0-1): eaves ~8.6, ridges ~13; brown wood siding, grey-brown shingle
//   The Commons              in the glen (ground ~2.4): hall eave 6.4 / ridge ~10 (metal gable, solar), wings 6.0 (planted roofs)
//   Douglas Fine Arts Center upper campus edge (ground 7-10): studios 15.6, Maxwell Music Hall 14.3 (white, flat, solar)
//   Academic quad            across Ross Creek (ground ~2.2): cream stucco, clay tile; 6.0 / 7.0 / 7.2
import { sited, kitWalls, flatBuilding, hipRoof, polyRoof, groundLadder, edgeFrame, pointInRing, ensureCCW } from '../marin/kit.js';
import { simplify } from './kit.js';
import { quadFacing } from '../../world/facade.js';
import { stuccoWalls, roofCover, solarFlat, dormer, BR_CLAY, BR_TAN, BR_SEAM, CREAM, outFrames, plainBlock, archOpening, winRow, boxOn, gableRoof, solarOn, leanTo, tileRim, ridgeRoof } from './extras.js';

const WOOD = { brick: 'maP_wood_siding', limestone: 'whitePanel' };
const BROWN = [0.3, 0.2, 0.14];   // dark brown siding (vertex tint on the wood-siding wall texture)
const CONC = [0.6, 0.59, 0.56], ARTS_WHITE = [0.74, 0.74, 0.72], SEDUM = [0.17, 0.15, 0.07], HOUSE_WHITE = [0.76, 0.76, 0.74], LIGHT_GREY = [4.5, 4.9, 5.2];
// Roof colours and materials are matched to 3D-tiles obliques (rule F27): bright terracotta tile on Katharine Branson Hall
// and the quad, tan shingle + solar on the gym, light grey standing seam + solar on the Commons.
const SPEC = [
  { id: 975106452, key: 'kbh', part: 'main', name: 'Katharine Branson Hall', top: 14.4, style: 'brKbh', roof: 'tile', rise: 4.7, ov: 0.7, tol: 0.9, level: 10.3, tint: BR_CLAY },
  { id: 975106452, key: 'kbhWhite', part: 'white', name: 'Katharine Branson Hall (west wing)', top: 15.7, style: 'brKbh', roof: 'custom', tol: 0.9, level: 10.3 },   // (tiles 4 m grid, QA round 4: the white flat roof reads 15.6-15.8)
  { id: 975106452, key: 'kbhNorth', part: 'north', name: 'Katharine Branson Hall (north block)', top: 13.5, style: 'brKbh', roof: 'custom', tol: 0.9, level: 10.3 },   // (its own, lower eave: 13.3-13.5 in the tiles against 14.4-15 on the wings)
  { id: 976135756, key: 'gym', name: 'Gym Complex', top: 8.6, style: 'brGym', roof: 'custom', skin: WOOD, minH: 6.5, level: 0.5, bank: { strip: 7.4, slope: 0.07, reach: 15 } },   // (bank: the ground at its west and north doors is graded to the floor, no pad blocks)
  { id: 9000000001, key: 'commonsN', name: 'The Commons (north wing)', top: 6.0, style: 'brCommons', roof: 'flat', ladder: true, level: 2.3, bank: { strip: 7.4, slope: 0.95 } },   // (the glen's north bank: a plain planted bank behind a narrow service strip, not planter tiers)
  { id: 9000000002, key: 'commonsHall', name: 'The Commons', top: 6.4, style: 'brHall', roof: 'custom', level: 2.3, bank: { strip: 7.4, slope: 0.95 } },
  { id: 9000000003, key: 'commonsS', name: 'The Commons (south wing)', top: 6.0, style: 'brCommons', roof: 'flat', level: 2.3, bank: { strip: 7.4, slope: 0.95 } },
  { id: 9000000004, key: 'artsW', name: 'Douglas Fine Arts Center', top: 14.6, style: 'brArts', roof: 'custom', level: 9.2, bank: { strip: 7.4, slope: 0.95 } },
  { id: 9000000005, key: 'artsE', name: 'Maxwell Music Hall', top: 14.3, style: 'brArts', roof: 'flat', ladder: true, level: 8.5, bank: { strip: 7.4, slope: 0.95 } },
  { id: 9000000006, key: 'artsLink', name: 'Douglas Fine Arts Center (link)', top: 13.4, style: 'brArtsLow', roof: 'flat' },
  { id: 976479989, key: 'study', name: 'Study Hall', top: 6.0, style: 'brQuadLow', roof: 'tile', rise: 2.2, ov: 0.6, level: 1.8, tint: BR_CLAY },
  { id: 976475035, key: 'richardson', name: 'Richardson Hall', top: 7.0, style: 'brKbh', roof: 'tile', rise: 2.4, ov: 0.6, level: 1.8, tint: BR_CLAY },
  { id: 978513427, key: 'newOaks', name: 'New Oaks', top: 7.2, style: 'brKbh', roof: 'tile', rise: 2.4, ov: 0.6, tol: 0.8, level: 2.1, tint: BR_CLAY },
  { id: 9000000007, key: 'tallant', name: 'Tallant Science Center', top: 9.6, style: 'brArts', roof: 'custom', level: 2.2, tol: 0.2, ladder: true, bank: {} },   // (its south-east corner is cut into the toe of the hill: a level strip, then a planted 36 deg bank)
  // New House (campus map item 5): a grey gabled house with dormers on Circle Drive (3D-tiles oblique)
  { id: 976780018, key: 'newHouse', name: 'New House', top: 15.9, style: 'brNewHouse', roof: 'custom', skin: WOOD, level: 10.0, tol: 1.2 },
];
export const SCHOOL_IDS = new Set(SPEC.map((s) => s.id));

// Katharine Branson Hall is one county footprint: the clay-tiled hall (hips) and the white flat-roofed west wing are cut
// apart along the line where the white stucco meets the tile roof (nadir 3D-tiles view)
// Katharine Branson Hall is one county footprint. Fix round 5 (nadir tiles + the 1 m roof-height grid, dev/shots/branson-v6/kbh_tiles6.json):
// the white part is a flat-roofed block at 15.7 round the west end (a bowed north-west face, the south-west face with four arched windows, a leg
// to the south, and a strip along the hall's south-west side that holds the main entrance), with a raised white centre at 18.8; the clay hips
// start behind it. Wing frame: u along the long south-east wing from its north corner, v across it to the south-west.
const KW = (u, v) => [+(-41.5 + 0.804 * u - 0.595 * v).toFixed(2), +(-25.2 + 0.595 * u + 0.804 * v).toFixed(2)];
export const KBH_RAISED = [KW(1.7, 10.2), KW(9.7, 10.2), KW(9.7, 14.8), KW(10.9, 14.8), KW(10.9, 22.6), KW(1.7, 22.6)];   // the raised centre (tiles 18.5-18.9; QA round 6, 1 m grid: its north-west edge at u 1.7, its south-east edge at u 10.9 outside the clay wing)
const KBH_IN = [KW(25.4, 14.8), KW(9.7, 14.8), KBH_RAISED[1], KBH_RAISED[0]];   // the line where the white block ends under the clay roofs: strip end -> raised block's east and north corners
export const KBH_BOW = [[-56.5, -10.19], [-56.26, -12.0], [-55.66, -13.72], [-54.74, -15.3], [-53.52, -16.65], [-52.05, -17.73]];   // the bowed north-west end, south to north (the arc's last point at (-50.4, -18.5) is left out: it stood in the nook under the link's eave)
export const KBH_LOW = [[-58.4, -5.5], [-58.0, -9.4], ...KBH_BOW, [-49.9, -18.4], KBH_RAISED[0], KBH_RAISED[1], KW(9.7, 14.8), KW(25.4, 14.8), [-31.1, 3.5], [-32.6, 5.4], [-41, -1.2], [-45.5, 4.5]];
// The bowed end (QA round 6; tiles 0.5 m height grid, a gridded nadir close-up and two obliques, dev/shots/branson-v7/ref_kw_bow.jpg): the 15.7 block's
// own north-west end is a shallow bow with a parapet and a dentil cornice, an arc of radius 9.1 round (-47.4, -9.9) from (-56.5, -10.2) to (-50.4, -18.5)
// (sagitta 1.6 m), then a 1.5 m step out to the block's west corner. The 13-14.9 m readings in the grid just west of it lie under the tree canopy
// (planting at the foot of the wall in the obliques, no roof): nothing is built there.
export const KBH_SPLIT_U = 25.2;   // the long wing's south-east part (u beyond this) is taller: eave and ridge 0.8-0.9 m higher in the tiles
const nearIdx = (r, q) => { let bi = 0, bd = 1e9; r.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };
const arcOf = (r, i, j) => { const o = []; for (let k = i; ; k = (k + 1) % r.length) { o.push(r[k]); if (k === j) break; } return o; };
/** Replaces the arc of ring r between the vertices nearest a and b that passes the vertex nearest `mid` by the points `ins` (given a -> b). */
function swapArc(r, a, b, mid, ins) { const i = nearIdx(r, a), j = nearIdx(r, b), m = r[nearIdx(r, mid)]; return arcOf(r, i, j).includes(m) ? [...arcOf(r, j, i), ...ins] : [...arcOf(r, i, j), ...ins.slice().reverse()]; }
function splitKbh(ring) {
  // the hall without the white block
  const main = ensureCCW(swapArc(ring, [-31.1, 3.5], [-49.9, -18.4], [-58.4, -5.5], KBH_IN));
  // the north block (a hexagon under its own pyramid roof, eave 0.9 m lower than the wings): cut off along the chord between the two corners
  // where it meets the link. The 2.6 m slot between its south wall and the long wing's north-east wall is real (tiles: ground at
  // (-34..-30, -29..-26)): it stays open to the entrance court, the hall's ring no longer fills it.
  const ja = nearIdx(main, [-40.1, -36.8]), jb = nearIdx(main, [-30.1, -27.8]), jn = main[nearIdx(main, [-35.3, -69.1])];
  const p2 = arcOf(main, ja, jb), q2 = arcOf(main, jb, ja); const north = p2.includes(jn) ? p2 : q2; let rest = p2.includes(jn) ? q2 : p2;
  rest = rest.filter((p) => Math.hypot(p[0] + 30.1, p[1] + 27.8) > 0.8);
  // (fix round 6) a vertex on each long wall where the taller south-east half starts, so walls, floors and doors are laid out per half
  const mainR = ensureCCW(rest); for (const q of [KW(KBH_SPLIT_U, 0), KW(KBH_SPLIT_U, 17.05)]) { let bi = -1, bd = 1.6;   /* (the county walls stand up to 0.7 m off the wing frame's lines) */ for (let i = 0; i < mainR.length; i++) { const a = mainR[i], b = mainR[(i + 1) % mainR.length]; const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz; const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2; if (t < 0.02 || t > 0.98) continue; const d = Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t); if (d < bd) { bd = d; bi = i; } }
    if (bi >= 0) { const a = mainR[bi], b = mainR[(bi + 1) % mainR.length]; const dx = b[0] - a[0], dz = b[1] - a[1]; const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / (dx * dx + dz * dz); mainR.splice(bi + 1, 0, [+(a[0] + dx * t).toFixed(2), +(a[1] + dz * t).toFixed(2)]); } }
  // the white block's corners on the party line take the hall's own (county) vertices: 6 cm between the two wall planes let roof-skin rays through
  const white = ensureCCW(KBH_LOW.map((p) => { const q = mainR[nearIdx(mainR, p)]; return Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.15 ? q.slice() : p.slice(); }));
  return { white, main: mainR, north: ensureCCW(north) };
}

const cache = new WeakMap();
/** The school's buildings with their rings (one array per building for the whole build: plans are keyed by the ring). */
export function schoolWalls(ctx) {
  let list = cache.get(ctx.data);
  if (!list) { list = []; let kbh = null; for (const s of SPEC) { const b = ctx.data.buildings.find((q) => q.id === s.id); if (!b) continue; let ring = simplify(b.outer[0], s.tol || 0.5);
      if (s.part) { if (!kbh) kbh = splitKbh(ring); ring = kbh[s.part]; }
      ring.id = s.name; list.push({ ...s, ring }); } cache.set(ctx.data, list); }
  return list;
}

// ---- the gym: two halls under gable roofs (north hall ridge east-west, south hall ridge north-south with the solar arrays on
// its west slope), and the east front on the field: a glazed gabled entrance with an arched window between two lean-to colonnades
const GYM_N = [[-122, 81], [-99, 76], [-93, 73], [-86, 104], [-115, 109]], GYM_S = [[-87, 104], [-82, 129], [-83, 134], [-108, 139], [-115, 109]];
function gym(ctx, s, h) {
  const { B } = ctx; const ring = s.ring;
  kitWalls(ctx, ring, h, s.style, { skin: s.skin, id: s.name }); B.c('concrete').prism(ring, 0, h, 1, true); (ctx.buildingRings = ctx.buildingRings || []).push(ring);
  const gb = { tint: BR_TAN, ov: 0.8, gableBucket: 'maP_wood_siding', gableTint: BROWN, trim: true };
  gableRoof(ctx, boxOn(GYM_N, -11.1), h, 4.2, gb);
  const rs = gableRoof(ctx, boxOn(GYM_S, 78.9), h, 4.4, gb); const L = boxOn(GYM_S, 78.9).L;
  solarOn(ctx, rs, -L / 2 + 2.5, -1.2, 2.2, rs.hw - 2.0); solarOn(ctx, rs, 1.2, L / 2 - 4, 2.2, rs.hw - 2.0);
  // east front
  let F = edgeFrame(-93.0, 73.0, -81.9, 129.4); if (F.nx < 0) F = edgeFrame(-81.9, 129.4, -93.0, 73.0);
  const south = F.tz > 0 ? 1 : -1; const U = (zc) => { const t = (zc - 73.0) / (129.4 - 73.0); return south > 0 ? t * F.L : (1 - t) * F.L; };
  const ue = U(95.5), hw = 4.6, dep = 2.6;
  const blk = [F.P(ue - hw, 0, -0.6), F.P(ue + hw, 0, -0.6), F.P(ue + hw, 0, dep), F.P(ue - hw, 0, dep)].map((p) => [p[0], p[2]]);
  plainBlock(ctx, blk, 0, 6.0, BROWN, null, 'maP_wood_siding'); (ctx.buildingRings).push(blk);
  const st = B.v('maP_wood_siding', true); const wt = B.v('paint', true); wt.setColor(0.8, 0.8, 0.77);
  for (const sd of [-1, 1]) { const p = F.P(ue + sd * (hw - 0.1), 0, dep + 0.03); wt.box(p[0], 3.0, p[2], 0.22, 6.0, 0.1, F.rotY); }   // white corner boards
  wt.setColor(1, 1, 1);
  const ang = Math.atan2(F.nz, F.nx) * 180 / Math.PI; const c = F.P(ue, 0, dep - 3.6);
  gableRoof(ctx, { cx: c[0], cz: c[2], ang, L: 7.2, W: 2 * hw }, 6.0, 2.9, { tint: BR_TAN, ov: 0.7, ovEnd: 0.5, gableBucket: 'maP_wood_siding', gableTint: BROWN, ends: [false, true], trim: true });
  let Ff = edgeFrame(blk[3][0], blk[3][1], blk[2][0], blk[2][1]); if (Ff.nx * F.nx + Ff.nz * F.nz < 0) Ff = edgeFrame(blk[2][0], blk[2][1], blk[3][0], blk[3][1]);
  archOpening(ctx, Ff, Ff.L / 2, 0.35, 5.4, 3.3, { mullions: 6, bars: [1.2, 2.25, 3.3], trim: [0.82, 0.81, 0.78], out: 0.05 });
  leanTo(ctx, F, 1.0, ue - hw, 3.4, 4.5, 3.3, { tint: BR_TAN }); leanTo(ctx, F, ue + hw, F.L - 1.0, 3.4, 4.5, 3.3, { tint: BR_TAN });
  // the second, smaller gable north of the entrance (a window over the north colonnade): 3D tiles oblique from the field
  { const un = ue - south * 13.5; const c2 = F.P(un, 0, -2.4); gableRoof(ctx, { cx: c2[0], cz: c2[2], ang, L: 6.0, W: 9.0 }, h - 1.2, 2.6, { tint: BR_TAN, ov: 0.6, ovEnd: 0.4, gableBucket: 'maP_wood_siding', gableTint: BROWN, ends: [false, true], trim: true });
    const blk2 = [F.P(un - 4.5, 0, -0.6), F.P(un + 4.5, 0, -0.6), F.P(un + 4.5, 0, 0.6), F.P(un - 4.5, 0, 0.6)].map((p) => [p[0], p[2]]); st.setColor(...BROWN); st.prism(blk2, 4.4, h - 1.2, 0.45, false); st.setColor(1, 1, 1); B.c('concrete').prism(blk2, 4.4, h - 1.2, 1, true);
    let F2 = edgeFrame(blk2[3][0], blk2[3][1], blk2[2][0], blk2[2][1]); if (F2.nx * F.nx + F2.nz * F.nz < 0) F2 = edgeFrame(blk2[2][0], blk2[2][1], blk2[3][0], blk2[3][1]); winRow(ctx, F2, 1.6, F2.L - 1.6, 4.9, h - 1.6, 2.2, 2.9, 0.05); }
}

// ---- Katharine Branson Hall's white block (fix round 5, tiles obliques dev/shots/branson-v6/t_kw_obl_*.jpg): one tall storey of warm white
// stucco under a flat roof at 15.7 with a cornice, arched windows on the south-west face and the leg, small arched windows round the bowed
// north-west face; a plain raised centre to 18.8 (blank in the tiles too); the main entrance in the strip's south-west face: an arched door
// above a flight of red tile steps down to a red tile forecourt (the forecourt is laid in grounds.js)
const KBH_WHITE = [0.88, 0.82, 0.68], KBH_ROOF_WHITE = [0.84, 0.84, 0.82];
export const KBH_ENTRANCE = { door: KW(16.9, 19.25), out: [-0.595, 0.804], stoop: 1.3, w: 2.6, rise: 0.9, run: 1.92 };   // the door's centre on the wall, the way out (south-west), stoop depth, width, height over the floor, run of the steps
function kbhWhite(ctx, s, h, all) {
  const { B } = ctx; const ring = s.ring; (ctx.buildingRings = ctx.buildingRings || []).push(ring); const base = B.off ? B.off.y : 0; const f0 = Math.max(0, s.level - base);
  plainBlock(ctx, ring, -1.2, h, KBH_WHITE, KBH_ROOF_WHITE);
  if (ctx.terrain) (ctx.footprints = ctx.footprints || []).push({ id: s.name, ring, roof: base + h, floor: s.level });
  const yTop = 18.8 - base; plainBlock(ctx, KBH_RAISED, h - 0.3, yTop, KBH_WHITE, KBH_ROOF_WHITE);
  const pt = B.v('paint', true); const band = (F, y, hh, col) => { const c = F.P(F.L / 2, y, 0.1); pt.setColor(...col); pt.box(c[0], c[1], c[2], F.L + 0.3, hh, 0.14, F.rotY);   /* (wholly outside the wall plane and under the roof level: a face inside the wall reads as an open attic to the roof-skin check) */ pt.setColor(1, 1, 1); };
  for (const F of outFrames(KBH_RAISED)) band(F, yTop - 0.17, 0.28, [0.74, 0.72, 0.66]);
  // two condenser units on the lower roof beside the raised centre (nadir tiles)
  for (const [u, v] of [[12.3, 17.2], [13.8, 17.6]]) { const q = KW(u, v); B.v('galv').box(q[0], h + 0.45, q[1], 1.0, 0.9, 1.0, 0.64); B.c('metal').box(q[0], h + 0.45, q[1], 1.0, 0.9, 1.0, 0.64); }
  const trim = [0.86, 0.84, 0.78]; const E = KBH_ENTRANCE;
  // the bow: a parapet rim on the roof edge and a row of dentils under the cornice, on its facets only
  { const onBow = (F) => [[F.ax, F.az], [F.ax + F.tx * F.L, F.az + F.tz * F.L]].every(([x, z]) => Math.abs(Math.hypot(x + 47.42, z + 9.92) - 9.08) < 0.25);
    for (const F of outFrames(ring)) { if (!onBow(F)) continue; const c = F.P(F.L / 2, h + 0.17, -0.14); pt.setColor(0.8, 0.78, 0.72); pt.box(c[0], c[1], c[2], F.L + 0.12, 0.34, 0.28, F.rotY);
      pt.setColor(0.7, 0.68, 0.62); for (let u = 0.25; u < F.L - 0.1; u += 0.46) { const q = F.P(u, h - 0.46, 0.12); pt.box(q[0], q[1], q[2], 0.2, 0.16, 0.12, F.rotY); } pt.setColor(1, 1, 1); } }
  for (const F of outFrames(ring)) {
    const mx = F.ax + F.tx * F.L / 2 + F.nx * 0.8, mz = F.az + F.tz * F.L / 2 + F.nz * 0.8; if (all.some((r) => r !== ring && pointInRing(mx, mz, r))) continue;
    band(F, h - 0.2, 0.32, [0.74, 0.72, 0.66]); band(F, f0 + 0.1, 0.5, [0.7, 0.67, 0.6]);
    const ud = (E.door[0] - F.ax) * F.tx + (E.door[1] - F.az) * F.tz, off = Math.abs((E.door[0] - F.ax) * F.nx + (E.door[1] - F.az) * F.nz);
    if (off < 0.4 && ud > 1 && ud < F.L - 1) {   // the entrance front: the door over its steps, a large arched window and a small one beside it
      const yd = f0 + E.rise; archOpening(ctx, F, ud, yd + 0.03, 2.0, 1.9, { kind: 'door', trim }); const dir = ud < F.L / 2 ? 1 : -1;
      if (Math.abs(ud + dir * 4.3 - F.L / 2) < F.L / 2 - 1.3) archOpening(ctx, F, ud + dir * 4.3, yd + 0.55, 1.9, 1.5, { trim, mullions: 3, bars: [yd + 1.3] });
      if (Math.abs(ud + dir * 7.3 - F.L / 2) < F.L / 2 - 0.8) archOpening(ctx, F, ud + dir * 7.3, yd + 0.75, 1.0, 1.2, { trim, mullions: 2, bars: [yd + 1.4] });
      // stoop and steps: red tile, collision on the stoop and on the plane through the nosings (rule D18)
      const P = (u, y, o) => F.P(ud + u, y, o); const yTopS = yd, n = 6; const foot = P(0, 0, E.stoop + E.run + 0.4); const yFoot = ctx.groundY(foot[0], foot[2]) - base; const riser = (yTopS - yFoot) / n, tread = E.run / n;
      const tile = B.v('brickRed'), col = B.c('concrete'); const c0 = P(0, (yTopS + yFoot - 0.6) / 2, E.stoop / 2); tile.box(c0[0], c0[1], c0[2], E.w + 0.5, yTopS - yFoot + 0.6, E.stoop, F.rotY, 1 / 2.2); col.box(c0[0], c0[1], c0[2], E.w + 0.5, yTopS - yFoot + 0.6, E.stoop, F.rotY);
      for (let k = 0; k < n - 1; k++) { const yT = yTopS - riser * (k + 1); const c = P(0, (yT + yFoot - 0.6) / 2, E.stoop + tread * (k + 0.5)); tile.box(c[0], c[1], c[2], E.w, yT - yFoot + 0.6, tread + 0.02, F.rotY, 1 / 2.2); const nz = P(0, yT + 0.006, E.stoop + tread * (k + 1) - 0.04); B.v('limestone').box(nz[0], nz[1], nz[2], E.w, 0.012, 0.08, F.rotY, 1 / 3); }
      quadFacing(col, P(-E.w / 2, yTopS + 0.01, E.stoop - 0.05), P(E.w / 2, yTopS + 0.01, E.stoop - 0.05), P(E.w / 2, yFoot + riser * 0.4, E.stoop + E.run - tread), P(-E.w / 2, yFoot + riser * 0.4, E.stoop + E.run - tread), [0, 1, 0]);
      quadFacing(col, P(-E.w / 2, yFoot + riser * 0.4, E.stoop + E.run - tread), P(E.w / 2, yFoot + riser * 0.4, E.stoop + E.run - tread), P(E.w / 2, yFoot - 0.05, E.stoop + E.run + 0.25), P(-E.w / 2, yFoot - 0.05, E.stoop + E.run + 0.25), [0, 1, 0]);
      // low rendered cheek walls each side of the flight (tiles: clipped hedges stand behind them)
      for (const sd of [-1, 1]) { const u = sd * (E.w / 2 + 0.2); for (const bk of [B.v('stucco', true), col]) { if (bk.setColor) bk.setColor(...KBH_WHITE);
          quadFacing(bk, P(u - 0.15, yTopS + 0.55, 0), P(u + 0.15, yTopS + 0.55, 0), P(u + 0.15, yFoot + 0.55, E.stoop + E.run), P(u - 0.15, yFoot + 0.55, E.stoop + E.run), [0, 1, 0]);
          for (const o of [-0.15, 0.15]) quadFacing(bk, P(u + o, yFoot - 0.7, 0), P(u + o, yFoot - 0.7, E.stoop + E.run), P(u + o, yFoot + 0.55, E.stoop + E.run), P(u + o, yTopS + 0.55, 0), [Math.sign(o) * F.tx, 0, Math.sign(o) * F.tz]);
          quadFacing(bk, P(u - 0.15, yFoot - 0.7, E.stoop + E.run), P(u + 0.15, yFoot - 0.7, E.stoop + E.run), P(u + 0.15, yFoot + 0.55, E.stoop + E.run), P(u - 0.15, yFoot + 0.55, E.stoop + E.run), [F.nx, 0, F.nz]); if (bk.setColor) bk.setColor(1, 1, 1); } }
      (ctx.doors = ctx.doors || []).push({ x: foot[0], z: foot[2], nx: F.nx, nz: F.nz, id: s.name, main: true });
      continue; }
    const y0 = f0 + 0.8;
    if (F.L < 1.7) continue;
    if (F.L < 3.2) archOpening(ctx, F, F.L / 2, y0 + 0.15, Math.min(1.0, F.L - 0.9), 1.5, { trim, mullions: 2, bars: [y0 + 1.1] });
    else if (F.L < 6.5) archOpening(ctx, F, F.L / 2, y0, 1.6, 1.9, { trim, mullions: 3, bars: [y0 + 1.2] });
    else { const pitch = F.L > 12 ? 3.4 : 2.7, m = F.L > 12 ? 1.2 : 0.9; const n = Math.max(1, Math.floor((F.L - 2 * m) / pitch)), st = (F.L - 2 * m) / n; for (let k = 0; k < n; k++) archOpening(ctx, F, m + st * (k + 0.5), y0, F.L > 12 ? 1.9 : 1.6, 1.9, { trim, mullions: 3, bars: [y0 + 1.2] }); }
  }
}
// the long south-east wing in two parts (QA round 6, tiles cross-sections every 2-4 m + the nadir hip lines): north-west of u 25.2 eave 14.4 / ridge 19.0 as
// before, its ridge running on to u 33 where it dies into the taller part; the south-east part (u 25.2-51) is its own hip: eave line 15.2 (15.7 at the
// wall), ridge 19.9 from u 33.7 to u 42, hipped at BOTH ends (the north-west hip rises out of the lower roof)
const KBH_WING = { nw: { ring: [KW(0, 0), KW(KBH_SPLIT_U, 0), KW(KBH_SPLIT_U, 17.1), KW(0, 17.1)], a: KW(8.55, 8.55), b: KW(33, 8.55), y: 19.0 }, se: { ring: [KW(KBH_SPLIT_U, 0), KW(51, 0), KW(51, 17.1), KW(KBH_SPLIT_U, 17.1)], a: KW(33.7, 8.55), b: KW(42, 8.55), y: 19.9, eave: 15.2, up: 0.9 } };
const kwU = (x, z) => 0.804 * (x + 41.5) + 0.595 * (z + 25.2);
// Rule F47 (QA round 6): doors of the kit's default layout that no tiles view or photo shows (a wall under closed canopy or facing a bank or a bed, no
// walk to it in the nadir tiles): Study Hall west and south-west, New Oaks south-west, both Commons wings, Fine Arts south and west, the Music Hall's
// south side, New House east
const NO_DOOR = [[-180.4, 118.5], [-181.1, 135.4], [-179.8, 161.6], [-128.0, -2.3], [-139.7, 20.8], [38.0, 15.9], [29.1, 10.8], [61.8, 20.2], [61.0, -16.8], [-5.4, 12.1]];   // (+ the hall's south-east end: the tiles show a terrace 1.8 m below the floor there and no flight of steps)
// the link between the north block and the wings: its own outline (the hall's west wall with its notch, the chord to the north block, the entrance court's
// corner) and the ridge the tiles show, (-45, -30) -> (-38, -21) at 18.3; the old box hip hung 5 m over the entrance court
const KBH_LINK = { ring: [[-51.6, -26.6], [-44.8, -35.7], [-40.1, -36.8], [-34, -30.8], [-35.6, -28.7], [-27.9, -22.6], [-31.1, -18.5], [-38, -13], [-49.9, -18.4]], a: [-45, -30.2], b: [-38.2, -20.8], y: 18.3 };
// Richardson Hall is two blocks, each under its own hip: the smaller north block and the larger south block set 2 m further east (county outline)
const RICH_PARTS = [[[-151.3, 119.6], [-140.9, 114.3], [-136.3, 123.4], [-146.7, 128.7]], [[-149.2, 128.4], [-138.3, 124.4], [-129.3, 141.9], [-139.6, 147.1]]];
const STUDY_MAIN = [[-159.0, 113.7], [-174.2, 139.5], [-188.0, 131.4], [-172.8, 105.6]], STUDY_ANNEX = [[-170.9, 106.7], [-168.8, 103.1], [-159.2, 108.7], [-161.3, 112.3]];
// (fix round 6: the arched porch block that was planned on the visitor-lot side had collapsed to nothing when the hall's outline changed; the door of
// that wall now stands where the tiles show the entrance steps, see the per-half layout in buildSchool)

// ---- New House (campus map item 5). Fix round 5, from the tiles' 1 m height grid and obliques (dev/shots/branson-v6/nh_tiles6.json, t_nh_obl_*):
// a steep main gable along the house (ridge 20.1, north eave 14.5), a two-storey south part under two parallel gables running south (ridges 19.4,
// walls 17.4) with a white flat-roofed block east of them (17.45), a hipped cross gable and two dormers on the north slope.
// Frame: a along the north wall from its west corner (bearing -17 deg), b across the house to the south.
function newHouse(ctx, s, base, all) {
  const { B } = ctx; const ring = s.ring; const A = -17 * Math.PI / 180, ax = Math.cos(A), az = Math.sin(A), bx = -az, bz = ax; const P = (a, b) => [42.4 + a * ax + b * bx, -20 + a * az + b * bz];
  const yN = 14.5 - base, yS = 17.4 - base, yR = 20.1 - base, yF = 17.45 - base; const trim = [0.85, 0.85, 0.83];
  stuccoWalls(ctx, ring, yN, { color: HOUSE_WHITE, storeys: 1, w: 1.0, pitch: 2.5, others: all, noDoor: NO_DOOR, trim });
  const south = [P(0, 8), P(11.5, 8), P(11.5, 17.75), P(0.1, 17.75)], flat = [P(11.5, 8), P(17.05, 8), P(16.8, 16.6), P(11.5, 16.6)];
  plainBlock(ctx, south, yN - 0.2, yS, HOUSE_WHITE, null); plainBlock(ctx, flat, yN - 0.2, yF, HOUSE_WHITE, [0.84, 0.84, 0.82]);
  // first-floor windows on the open faces of the south part (west, south, east)
  for (const [poly, skip] of [[south, [[5.7, 8], [11.5, 12.9]]], [flat, [[14.3, 8], [11.5, 12.3]]]]) for (const F of outFrames(poly)) { const m = [F.ax + F.tx * F.L / 2, F.az + F.tz * F.L / 2]; if (skip.some(([a, b]) => { const q = P(a, b); return Math.hypot(q[0] - m[0], q[1] - m[1]) < 1.2; })) continue; winRow(ctx, F, 0.9, F.L - 0.9, yN + 0.55, yN + 2.05, 1.0, 2.6); }
  const gb = { tint: LIGHT_GREY, ov: 0.5, ovEnd: 0.3, gableBucket: 'stucco', gableTint: HOUSE_WHITE, trim: true };
  const c = P(8.53, 5.4); const box = { cx: c[0], cz: c[1], ang: -17, L: 17.05, W: 10.8 }; const r = gableRoof(ctx, box, yN, yR - yN, gb);
  for (const [a, w] of [[3.4, 5.9], [8.95, 5.1]]) { const q = P(a, 11.83); gableRoof(ctx, { cx: q[0], cz: q[1], ang: 73, L: 11.85, W: w }, yS, 2.0, { ...gb, ov: 0.3, ends: [false, true] }); }
  // the hipped cross gable on the north slope (apex 18.8) on its own little wall, and two dormers west of it
  { const blk = [P(6.85, 0), P(12.35, 0), P(12.35, 1.5), P(6.85, 1.5)]; plainBlock(ctx, blk, yN - 0.2, 15.9 - base, HOUSE_WHITE, null); const q = P(9.6, 2.0); gableRoof(ctx, { cx: q[0], cz: q[1], ang: 73, L: 4.6, W: 5.5 }, 15.9 - base, 2.9, { ...gb, ov: 0.3, ends: [true, false] });
    const F = outFrames(blk).find((f) => f.nx * bx + f.nz * bz < -0.7); if (F) winRow(ctx, F, 1.2, F.L - 1.2, yN + 0.25, yN + 1.2, 1.1, 1.6); }
  for (const a of [2.6, 5.0]) dormer(ctx, r, box, a - 8.53, -1, 1.5, { tint: LIGHT_GREY, wall: HOUSE_WHITE, h: 1.3, rise: 0.9, back: 2.3 });
}

export function buildSchool(ctx) {
  const { B } = ctx; const list = schoolWalls(ctx); const all = list.map((s) => s.ring); const flats = [];
  for (const s of list) {
    const ring = s.ring;
    sited(ctx, ring, (base) => {
      const h = s.top - base;
      if (s.key === 'gym') return gym(ctx, s, h);
      if (s.key === 'kbhWhite') return kbhWhite(ctx, s, h, all);
      (ctx.buildingRings = ctx.buildingRings || []).push(ring);
      if (s.key === 'newHouse') return newHouse(ctx, s, base, all);
      if (s.key === 'tallant') { stuccoWalls(ctx, ring, h, { color: ARTS_WHITE, storeys: 2, w: 2.6, pitch: 3.3, others: all, noDoor: NO_DOOR }); roofCover(ctx, ring, h + 0.01, [0.5, 0.5, 0.5]); tileRim(ctx, ring, h + 0.07, 2.2, 0.04); flats.push({ s, ring, roofAbs: base + h }); return; }
      if (s.key === 'artsW') { stuccoWalls(ctx, ring, h, { color: ARTS_WHITE, storeys: 1, w: 2.4, pitch: 3.1, others: all, noDoor: NO_DOOR }); const box = boxOn(ring, -9); const r = gableRoof(ctx, box, h, 1.3, { tint: [4.6, 4.7, 4.9], ov: 0.3, gableTint: ARTS_WHITE }); solarOn(ctx, r, -box.L / 2 + 1, box.L / 2 - 1, 0.8, r.hw - 0.8); return; }
      if (s.key === 'artsE') { stuccoWalls(ctx, ring, h, { color: ARTS_WHITE, storeys: 1, w: 2.4, pitch: 3.1, others: all, noDoor: NO_DOOR }); roofCover(ctx, ring, h + 0.01, [0.84, 0.84, 0.82]); const box = boxOn(ring, -9);
        // (fix round 5, nadir tiles: a white membrane roof with two fields of tilted panel rows, white between the rows and round the rim; it was one sheet of panels)
        for (const [ua, ub] of [[-box.L / 2 + 1.2, -0.9], [0.5, box.L / 2 - 1.2]]) for (let k = 0; k < 4; k++) { const va = -box.W / 2 + 1.0 + k * 2.1; solarFlat(ctx, box, h + 0.14, ua, ub, va, va + 1.55); }
        flats.push({ s, ring, roofAbs: base + h }); return; }
      if (s.roof === 'flat') { const green = s.key.startsWith('commons'); stuccoWalls(ctx, ring, h, { color: green ? CONC : ARTS_WHITE, storeys: 1, w: 2.2, pitch: 3.2, others: all, noDoor: NO_DOOR }); roofCover(ctx, ring, h + 0.01, green ? SEDUM : [0.72, 0.72, 0.7]); flats.push({ s, ring, roofAbs: base + h }); return; }
      if (s.key === 'commonsHall') { stuccoWalls(ctx, ring, h, { color: [0.66, 0.6, 0.5], storeys: 1, w: 2.7, pitch: 3.2, others: all, noDoor: NO_DOOR, glazedEnds: 12, gableRise: 3.5, gableGlass: true }); /* both gable ends are glass: the west one over the service yard */ const box = boxOn(ring, 41.5); const r = gableRoof(ctx, box, h, 3.5, { tint: BR_SEAM, ov: 0.9, gableTint: [0.66, 0.6, 0.5] }); solarOn(ctx, r, -box.L / 2 + 1.5, box.L / 2 - 1.5, 0.9, r.hw - 1.0); return; }
      // Katharine Branson Hall and the quad: cream stucco under clay tile, tall windows in a regular rhythm (arched on the hall), arched doors
      stuccoWalls(ctx, ring, h, { floor: s.level !== undefined ? Math.max(0, s.level - base) : 0, y0: -1.2, plinth: [0.5, 0.45, 0.37], cap: [0.3, 0.22, 0.18], color: [0.93, 0.8, 0.54], arched: s.key === 'kbh' || s.key === 'kbhNorth', stoops: s.key === 'kbh', per: s.key === 'kbh' ? (F) => { const u = kwU(F.ax + F.tx * F.L / 2, F.az + F.tz * F.L / 2); return u > KBH_SPLIT_U ? { up: KBH_WING.se.up, top: KBH_WING.se.eave - s.top } : u > 14 && F.nx > 0.4 && F.nz < -0.6 ? { doorMin: 11 } : null; } : null,   /* (the 12 m piece of the north-east wall by the entrance court keeps its door: the tiles show the entrance steps there) */ storeys: s.key === 'kbh' || s.key === 'kbhNorth' ? 1 : Math.max(1, Math.round(h / 3.2)), others: all, noDoor: NO_DOOR, trim: [0.8, 0.78, 0.72] });
      // Katharine Branson Hall: three hips with the RIDGE heights of the tiles (rule F32: 19.8 over the south-east wing, 19.0 over the
      // middle, 18.4 over the north block); one pitch over the whole plan left the wings 3.5 m low
      if (s.key === 'kbh') { const wg = KBH_WING; ridgeRoof(ctx, wg.nw.ring, h, wg.nw.a, wg.nw.b, wg.nw.y - base, { ov: s.ov });
        // the taller south-east half: its walls run on up to its own eave, then its own hip
        { const near = (t) => ring[nearIdx(ring, t)]; const se = [near(KW(KBH_SPLIT_U, 0)), near([0.2, 5.0]), near([-11, 19.1]), near(KW(KBH_SPLIT_U, 17.05))]; const yE = wg.se.eave - base;
          plainBlock(ctx, se, h, yE, [0.93, 0.8, 0.54], [0.3, 0.22, 0.18]); ridgeRoof(ctx, wg.se.ring, yE, wg.se.a, wg.se.b, wg.se.y - base, { ov: 0.9 }); }
        ridgeRoof(ctx, KBH_LINK.ring, h, KBH_LINK.a, KBH_LINK.b, KBH_LINK.y - base, { ov: 0.5 });
        // the cross ridge between the link and the white block's raised centre (tiles 1 m grid: 19.0-19.2 along u = 4.6, falling 0.5 per metre to
        // both sides): a pitched clay roof on that ridge. (Fix round 5: the flat stucco "deck" that stood here read as a blank wall above the roofline.)
        { const XR = [KW(-4.6, 0.6), KW(13.8, 0.6), KW(13.8, 10.2), KW(-1.9, 10.2), [-50.3, -20.0]]; ridgeRoof(ctx, XR, 14.25 - base, KW(4.6, 2.4), KW(4.6, 10.2), 19.1 - base, { ov: 0 });   // (its rim lies inside the link's and the wing's roofs: a rim above them left a slit into the space between the skins)
          // its rake against the white block north-west of the raised centre: a white wall up to the roof line
          const st = B.v('stucco', true); st.setColor(0.88, 0.82, 0.68); const a0 = KW(0.0, 10.27), a1 = KW(1.7, 10.27); const q = [[a0[0], 15.5 - base, a0[1]], [a1[0], 15.5 - base, a1[1]], [a1[0], 17.0 - base, a1[1]], [a0[0], 15.72 - base, a0[1]]];
          quadFacing(st, q[0], q[1], q[2], q[3], [-0.595, 0, 0.804]); st.setColor(1, 1, 1); }
        }
      else if (s.key === 'kbhNorth') { ridgeRoof(ctx, ring, h, [-33.2, -53.5], [-33.0, -43.0], 17.3 - base, { ov: 0.7 });   // (ridge 17.2-17.3 under the white roof monitor, which tops out at 18.2: tiles grid)
        { const pt = B.v('paint', true); pt.setColor(0.74, 0.74, 0.72); pt.box(-33.0, 17.7 - base, -48.0, 3.2, 1.1, 9.4, 0.1); pt.setColor(1, 1, 1); B.c('concrete').box(-33.0, 17.7 - base, -48.0, 3.2, 1.1, 9.4, 0.1); } }
      else if (s.key === 'study') { hipRoof(ctx, STUDY_MAIN, h, s.rise + 0.4, { tint: BR_CLAY, overhang: s.ov, fill: true }); hipRoof(ctx, STUDY_ANNEX, h - 0.5, 1.5, { tint: BR_CLAY, overhang: 0.4, fill: true }); }   // (one straight rectangle under one roof + the small north-east annex: nadir tiles; the union-of-hips roof drew a concave east side)
      else if (s.key === 'richardson') { for (const q of RICH_PARTS) hipRoof(ctx, q, h, s.rise, { tint: BR_CLAY, overhang: s.ov, fill: true }); }   // (two roofs: nadir tiles)
      else polyRoof(ctx, ring, h, s.rise, { tint: s.tint || BR_CLAY, overhang: s.ov, fill: true });
      if (s.key === 'newOaks') {   // the solar array on its south-west slope (nadir tiles)
        const p1 = [-190, 152], t = Math.SQRT1_2; const P = (u, d) => [p1[0] + t * u + t * d, h + 0.42 + 0.262 * (d - 1.2), p1[1] + t * u - t * d];   // (plane measured on the built roof: 7.52 at 1.2 m in, 0.262 per metre)
        for (const bk of [B.v('solar'), B.c('metal')]) { bk.quad(P(10, 1.2), P(10, 6.2), P(24, 6.2), P(24, 1.2), [0, 0], [0, 3], [13, 3], [13, 0]); bk.quad(P(24, 1.2), P(24, 6.2), P(10, 6.2), P(10, 1.2), [13, 0], [13, 3], [0, 3], [0, 0]); } }
    }, { id: s.name });
  }
  // service ladders up to the flat roofs: on the longest wall that faces open ground (never a party wall)
  for (const f of flats) {
    if (!f.s.ladder) continue; let best = null;
    for (let i = 0; i < f.ring.length; i++) { const a = f.ring[i], c = f.ring[(i + 1) % f.ring.length]; const F = edgeFrame(a[0], a[1], c[0], c[1]); if (F.L < 5) continue;
      for (const t of [0.2, 0.8]) { const p = F.P(F.L * t, 0, 1.4), q = F.P(F.L * t, 0, 0.14); if (all.some((r) => r !== f.ring && (pointInRing(p[0], p[2], r) || pointInRing(q[0] + F.nx * 2.6, q[2] + F.nz * 2.6, r)))) continue;
        const drop = f.roofAbs - ctx.groundY(p[0], p[2]); if (drop < 2.2) continue; if (!best || F.L > best.L) best = { L: F.L, q, F }; } }
    if (best) groundLadder(ctx, best.q[0], best.q[2], best.F.nx, best.F.nz, f.roofAbs);
  }
  B.v('stucco', true).setColor(1, 1, 1);
}
