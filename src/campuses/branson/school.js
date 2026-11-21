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
import { stuccoWalls, roofCover, solarFlat, dormer, BR_CLAY, BR_TAN, BR_SEAM, WHITE, CREAM, outFrames, plainBlock, archOpening, archRow, winRow, boxOn, gableRoof, solarOn, leanTo, tileRim, inset, nameBoard, ridgeRoof } from './extras.js';

const WOOD = { brick: 'maP_wood_siding', limestone: 'whitePanel' };
const BROWN = [0.3, 0.2, 0.14];   // dark brown siding (vertex tint on the wood-siding wall texture)
const CONC = [0.6, 0.59, 0.56], ARTS_WHITE = [0.74, 0.74, 0.72], SEDUM = [0.17, 0.15, 0.07], HOUSE_WHITE = [0.76, 0.76, 0.74], LIGHT_GREY = [6.2, 6.3, 6.5];
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
const KBH_CUT = { a: [-41, -1], k: [-40, -10], b: [-49, -18], white: [-58, -6] };
function splitKbh(ring) {
  const near = (q) => { let bi = 0, bd = 1e9; ring.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const ia = near(KBH_CUT.a), ib = near(KBH_CUT.b), iw = near(KBH_CUT.white); const n = ring.length; const arc = (i, j) => { const o = []; for (let k = i; ; k = (k + 1) % n) { o.push(ring[k]); if (k === j) break; } return o; };
  const p = arc(ia, ib), q = arc(ib, ia); const pHas = p.includes(ring[iw]);
  const white = pHas ? [...p, KBH_CUT.k] : [...q, KBH_CUT.k], main = pHas ? [...q, KBH_CUT.k] : [...p, KBH_CUT.k];
  // the north block (a hexagon under its own pyramid roof, eave 0.9 m lower than the wings): cut off along the chord between the two
  // re-entrant corners where it meets the link
  const m = ensureCCW(main); const nm = m.length; const nr = (q) => { let bi = 0, bd = 1e9; m.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const ja = nr([-40.1, -36.8]), jb = nr([-30.1, -27.8]), jn = nr([-35.3, -69.1]); const arcM = (i, j) => { const o = []; for (let k = i; ; k = (k + 1) % nm) { o.push(m[k]); if (k === j) break; } return o; };
  const p2 = arcM(ja, jb), q2 = arcM(jb, ja); const north = p2.includes(m[jn]) ? p2 : q2, rest = p2.includes(m[jn]) ? q2 : p2;
  return { white: ensureCCW(white), main: ensureCCW(rest), north: ensureCCW(north) };
}

const cache = new WeakMap();
/** The school's buildings with their rings (one array per building for the whole build: plans are keyed by the ring). */
export function schoolWalls(ctx) {
  let list = cache.get(ctx.data);
  if (!list) { list = []; let kbh = null; for (const s of SPEC) { const b = ctx.data.buildings.find((q) => q.id === s.id); if (!b) continue; let ring = simplify(b.outer[0], s.tol || 0.5);
      // (the county footprint has a 2 m wide, 5 m deep slot at (-34, -30) that the building does not have: a player dropping off the roof wedged in it)
      if (s.part) { if (!kbh) { ring = ring.filter((p) => Math.hypot(p[0] + 34, p[1] + 31) > 1.6 && Math.hypot(p[0] + 36, p[1] + 29) > 1.6); kbh = splitKbh(ring); } ring = kbh[s.part]; }
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

// ---- Katharine Branson Hall's white west wing: a two-storey flat-roofed block with a bowed corner and a small penthouse,
// and a single-storey arcaded loggia along its south-west face (arched openings onto the lawn)
function kbhWhite(ctx, s, h) {
  const { B } = ctx; const ring = s.ring; (ctx.buildingRings = ctx.buildingRings || []).push(ring);
  const near = (q) => { let bi = 0, bd = 1e9; ring.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const i0 = near([-58, -6]), i1 = near([-46, 5]); const a = ring[i0], b = ring[i1]; let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); let nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; if (nx * (cx - a[0]) + nz * (cz - a[1]) < 0) { nx = -nx; nz = -nz; }   // inward
  const D = 3.6; const a2 = [a[0] + nx * D, a[1] + nz * D], b2 = [b[0] + nx * D, b[1] + nz * D];
  const upper = ring.map((p, i) => (i === i0 ? a2 : i === i1 ? b2 : p)); const loggia = [a, b, b2, a2];
  plainBlock(ctx, upper, 0, h, WHITE); plainBlock(ctx, loggia, 0, 3.7, WHITE, [0.55, 0.53, 0.5]);
  for (const F of outFrames(loggia)) { if (F.nx * nx + F.nz * nz > 0.5) continue; if (F.L > 6) archRow(ctx, F, 0.9, F.L - 0.9, 0.25, 1.9, 1.75, 3.1, { trim: [0.74, 0.73, 0.7] }); else archOpening(ctx, F, F.L / 2, 0.25, 1.7, 1.75, { trim: [0.74, 0.73, 0.7] }); }
  for (const F of outFrames(upper)) { const mx = F.ax + F.tx * F.L / 2 + F.nx * 1.2, mz = F.az + F.tz * F.L / 2 + F.nz * 1.2; if (F.L < 3.2 || pointInRing(mx, mz, loggia) || (ctx.buildingRings || []).some((r) => r !== ring && pointInRing(mx, mz, r))) { if (F.L >= 3.2 && pointInRing(mx, mz, loggia)) winRow(ctx, F, 0.8, F.L - 0.8, 4.3, h - 0.8, 1.3, 2.6); continue; }
    winRow(ctx, F, 0.8, F.L - 0.8, 1.0, 2.7, 1.3, 2.6); winRow(ctx, F, 0.8, F.L - 0.8, 4.3, h - 0.8, 1.3, 2.6); }
}
// arched entrance porches of the hall: on the visitor-lot side (the two flights of steps in the re-entrant corner) and on the lawn side
const KBH_ROOFS = [[[[-41.5, -25.2], [-0.5, 5.1], [-10.7, 18.9], [-51.7, -11.4]], 19.0]];   // the long south-east wing (QA round 4: its north-west end pulled back off the white wing, ridge 19.0)
// the link between the north block and the wings: its own outline (the hall's west wall with its notch, the chord to the north block, the entrance court's
// corner) and the ridge the tiles show, (-45, -30) -> (-38, -21) at 18.3; the old box hip hung 5 m over the entrance court
const KBH_LINK = { ring: [[-51.6, -26.6], [-44.8, -35.7], [-40.1, -36.8], [-30.1, -27.8], [-27.9, -22.6], [-31.1, -18.5], [-38, -13], [-49.9, -18.4]], a: [-45, -30.2], b: [-38.2, -20.8], y: 18.3 };
const KBH_DECK = [[-53, -6.5], [-42, -6.5], [-37.5, -10], [-40.2, -14.5], [-38.3, -21], [-40.6, -21.4], [-51.6, -9.6]];   // the flat top where the wings meet: 18.7-18.9 on the tiles' 2 m grid   // [footprint part, ridge height above the field]: the long south-east wing (its ridge runs on north-west to the white wing) and the link to the north block
// Richardson Hall is two blocks, each under its own hip: the smaller north block and the larger south block set 2 m further east (county outline)
const RICH_PARTS = [[[-151.3, 119.6], [-140.9, 114.3], [-136.3, 123.4], [-146.7, 128.7]], [[-149.2, 128.4], [-138.3, 124.4], [-129.3, 141.9], [-139.6, 147.1]]];
const STUDY_MAIN = [[-159.0, 113.7], [-174.2, 139.5], [-188.0, 131.4], [-172.8, 105.6]], STUDY_ANNEX = [[-170.9, 106.7], [-168.8, 103.1], [-159.2, 108.7], [-161.3, 112.3]];
const KBH_PORCH = [[[-31, -18], [-22, -11]], [[-33, 5], [-41, -1]]];
function kbhPorches(ctx, s) {
  const { B } = ctx; const ring = s.ring;
  for (const [p, q] of KBH_PORCH) { const near = (t) => { let bp = ring[0], bd = 1e9; for (const r of ring) { const d = Math.hypot(r[0] - t[0], r[1] - t[1]); if (d < bd) { bd = d; bp = r; } } return bp; }; const a = near(p), b = near(q);
    const F = outFrames([a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]).find((f) => f.L > 3) || edgeFrame(a[0], a[1], b[0], b[1]); let Fo = edgeFrame(a[0], a[1], b[0], b[1]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (pointInRing(mx + Fo.nx * 1.0, mz + Fo.nz * 1.0, ring)) Fo = edgeFrame(b[0], b[1], a[0], a[1]); void F;
    const uc = Fo.L / 2, w = 4.2, d = 1.5, hh = 4.3; const blk = [Fo.P(uc - w / 2, 0, -0.3), Fo.P(uc + w / 2, 0, -0.3), Fo.P(uc + w / 2, 0, d), Fo.P(uc - w / 2, 0, d)].map((t) => [t[0], t[2]]);
    plainBlock(ctx, blk, -0.6, hh, CREAM, BR_CLAY.map((v) => v * 0.2)); 
    let Ff = edgeFrame(blk[3][0], blk[3][1], blk[2][0], blk[2][1]); if (Ff.nx * Fo.nx + Ff.nz * Fo.nz < 0) Ff = edgeFrame(blk[2][0], blk[2][1], blk[3][0], blk[3][1]);
    archOpening(ctx, Ff, Ff.L / 2, 0.05, 2.2, 2.0, { kind: 'door', trim: [0.8, 0.79, 0.74] });
    // a low landing with two steps in front of the arch
    const l0 = Ff.P(Ff.L / 2, 0, 0.9); for (const [k, dd] of [[0, 1.8], [1, 2.6]]) { B.v('concrete').box(l0[0] + Ff.nx * (dd - 1.8) * 0.5, -0.3 - k * 0.16, l0[2] + Ff.nz * (dd - 1.8) * 0.5, 3.4, 0.6, dd, Ff.rotY, 1 / 3); B.c('concrete').box(l0[0] + Ff.nx * (dd - 1.8) * 0.5, -0.3 - k * 0.16, l0[2] + Ff.nz * (dd - 1.8) * 0.5, 3.4, 0.6, dd, Ff.rotY); }
  }
}

export function buildSchool(ctx) {
  const { B } = ctx; const list = schoolWalls(ctx); const all = list.map((s) => s.ring); const flats = [];
  for (const s of list) {
    const ring = s.ring;
    sited(ctx, ring, (base) => {
      const h = s.top - base;
      if (s.key === 'gym') return gym(ctx, s, h);
      if (s.key === 'kbhWhite') return kbhWhite(ctx, s, h);
      (ctx.buildingRings = ctx.buildingRings || []).push(ring);
      if (s.key === 'newHouse') { stuccoWalls(ctx, ring, h, { color: HOUSE_WHITE, storeys: 2, w: 1.0, pitch: 2.5, others: all, trim: [0.85, 0.85, 0.83] });
        // (QA round 4, nadir tiles: the east 7 m of the house is a white flat-roofed section; the gable covers the rest)
        const full = boxOn(ring, -16.4); const E = 7.0, ca = Math.cos(-16.4 * Math.PI / 180), sa = Math.sin(-16.4 * Math.PI / 180); const box = { ...full, cx: full.cx - ca * E / 2, cz: full.cz - sa * E / 2, L: full.L - E };
        const r = gableRoof(ctx, box, h, 3.4, { tint: LIGHT_GREY, ov: 0.5, ovEnd: 0.3, gableBucket: 'stucco', gableTint: HOUSE_WHITE, trim: true });
        for (const [u, sd, w] of [[-4.2, 1, 3.4], [1.6, 1, 2.6], [-3, -1, 2.6], [2.4, -1, 2.2]]) { const uu = u - 1.2; if (Math.abs(uu) + w / 2 < box.L / 2 - 0.6) dormer(ctx, r, box, uu, sd, w, { tint: LIGHT_GREY, wall: HOUSE_WHITE, h: 1.7, rise: 1.3 }); }
        { const P = (u, v) => [full.cx + u * ca - v * sa, full.cz + u * sa + v * ca]; const blk = (v0, v1, col) => { const fl = [P(full.L / 2 - E, v0), P(full.L / 2, v0), P(full.L / 2, v1), P(full.L / 2 - E, v1)]; const st = B.v('stucco', true); st.setColor(...HOUSE_WHITE); st.prism(fl, h - 0.3, h + 0.45, 0.45, false); st.setColor(1, 1, 1); B.v('paint', true).setColor(...col).poly(inset(fl, 0.3), null, h + 0.3, (x, z) => [x / 3, z / 3]); B.v('paint', true).setColor(1, 1, 1); B.c('concrete').prism(fl, h - 0.3, h + 0.3, 1, true); };
          blk(-full.W / 2, full.W * 0.14, [0.8, 0.8, 0.78]); blk(full.W * 0.14, full.W / 2, [0.42, 0.44, 0.48]); }   // (white membrane over the north two thirds, grey over the rest: nadir tiles)
        return; }
      if (s.key === 'tallant') { stuccoWalls(ctx, ring, h, { color: ARTS_WHITE, storeys: 2, w: 2.6, pitch: 3.3, others: all }); roofCover(ctx, ring, h + 0.01, [0.5, 0.5, 0.5]); tileRim(ctx, ring, h + 0.07, 2.2, 0.04); flats.push({ s, ring, roofAbs: base + h }); return; }
      if (s.key === 'artsW') { stuccoWalls(ctx, ring, h, { color: ARTS_WHITE, storeys: 1, w: 2.4, pitch: 3.1, others: all }); const box = boxOn(ring, -9); const r = gableRoof(ctx, box, h, 1.3, { tint: [4.6, 4.7, 4.9], ov: 0.3, gableTint: ARTS_WHITE }); solarOn(ctx, r, -box.L / 2 + 1, box.L / 2 - 1, 0.8, r.hw - 0.8); return; }
      if (s.key === 'artsE') { stuccoWalls(ctx, ring, h, { color: ARTS_WHITE, storeys: 1, w: 2.4, pitch: 3.1, others: all }); roofCover(ctx, ring, h + 0.01, [0.72, 0.72, 0.7]); const box = boxOn(ring, -9); solarFlat(ctx, box, h + 0.12, -box.L / 2 + 1.2, box.L / 2 - 1.2, -box.W / 2 + 1.0, box.W / 2 - 1.0); flats.push({ s, ring, roofAbs: base + h }); return; }
      if (s.roof === 'flat') { const green = s.key.startsWith('commons'); stuccoWalls(ctx, ring, h, { color: green ? CONC : ARTS_WHITE, storeys: 1, w: 2.2, pitch: 3.2, others: all }); roofCover(ctx, ring, h + 0.01, green ? SEDUM : [0.72, 0.72, 0.7]); flats.push({ s, ring, roofAbs: base + h }); return; }
      if (s.key === 'commonsHall') { stuccoWalls(ctx, ring, h, { color: [0.66, 0.6, 0.5], storeys: 1, w: 2.7, pitch: 3.2, others: all, glazedEnds: 12, gableRise: 3.5, gableGlass: true }); /* both gable ends are glass: the west one over the service yard */ const box = boxOn(ring, 41.5); const r = gableRoof(ctx, box, h, 3.5, { tint: BR_SEAM, ov: 0.9, gableTint: [0.66, 0.6, 0.5] }); solarOn(ctx, r, -box.L / 2 + 1.5, box.L / 2 - 1.5, 0.9, r.hw - 1.0); return; }
      // Katharine Branson Hall and the quad: cream stucco under clay tile, tall windows in a regular rhythm (arched on the hall), arched doors
      stuccoWalls(ctx, ring, h, { floor: s.level !== undefined ? Math.max(0, s.level - base) : 0, y0: -1.2, plinth: [0.5, 0.45, 0.37], cap: [0.3, 0.22, 0.18], color: [0.93, 0.8, 0.54], arched: s.key === 'kbh' || s.key === 'kbhNorth', storeys: s.key === 'kbh' || s.key === 'kbhNorth' ? 1 : Math.max(1, Math.round(h / 3.2)), others: all, trim: [0.8, 0.78, 0.72] });
      // Katharine Branson Hall: three hips with the RIDGE heights of the tiles (rule F32: 19.8 over the south-east wing, 19.0 over the
      // middle, 18.4 over the north block); one pitch over the whole plan left the wings 3.5 m low
      if (s.key === 'kbh') { for (const [quad, rise] of KBH_ROOFS) hipRoof(ctx, quad, h, rise - s.top, { tint: BR_CLAY, overhang: s.ov, fill: true });
        ridgeRoof(ctx, KBH_LINK.ring, h, KBH_LINK.a, KBH_LINK.b, KBH_LINK.y - base, { ov: 0.5 });
        // the flat top where the wings meet (tile-coloured from above): a low attic block up to 18.8
        { const y0 = h - 0.2, y1 = 18.8 - base; const st = B.v('stucco', true); st.setColor(0.93, 0.8, 0.54); st.prism(KBH_DECK, y0, y1, 0.45, false); st.setColor(1, 1, 1); const sh = B.v('shingles', true); sh.setColor(...BR_CLAY); sh.poly(KBH_DECK, null, y1, (x, z) => [x / 3, z / 3]); sh.setColor(1, 1, 1); B.c('concrete').prism(KBH_DECK, y0, y1, 1, true); }
        // the low lean-to roof along the link's north-west wall (tiles: a roof at 13.0-13.5 beside the car park, about x -49..-45, z -38..-33)
        { let F = edgeFrame(-51.6, -26.6, -44.8, -35.7); if (pointInRing(-48.2 + F.nx, -31.2 + F.nz, ring)) F = edgeFrame(-44.8, -35.7, -51.6, -26.6); const yw = 13.6 - base, ye = 13.0 - base, dp = 3.4; leanTo(ctx, F, 0.6, F.L - 0.4, dp, yw, ye, { tint: BR_CLAY });
          const a = F.P(0.6, 0, 0), b2 = F.P(F.L - 0.4, 0, 0), c = F.P(F.L - 0.4, 0, dp), d = F.P(0.6, 0, dp); for (const [p, q, r, t] of [[[a[0], yw, a[2]], [b2[0], yw, b2[2]], [c[0], ye, c[2]], [d[0], ye, d[2]]]]) { B.c('concrete').tri(p, q, r); B.c('concrete').tri(p, r, t); B.c('concrete').tri(p, r, q); B.c('concrete').tri(p, t, r); }
          const pt = B.v('paint', true); pt.setColor(0.8, 0.79, 0.74); for (const u of [0.8, F.L - 0.6]) { const p = F.P(u, (ye + s.level - base) / 2 - 0.3, dp - 0.2); pt.box(p[0], p[1], p[2], 0.2, ye - (s.level - base) + 0.6, 0.2, F.rotY); B.c('metal').box(p[0], p[1], p[2], 0.2, ye - (s.level - base) + 0.6, 0.2, F.rotY); } pt.setColor(1, 1, 1); }
        kbhPorches(ctx, s); }
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
