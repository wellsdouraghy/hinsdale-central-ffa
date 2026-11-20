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
import { dormer, BR_CLAY, BR_TAN, BR_SEAM, WHITE, CREAM, outFrames, plainBlock, archOpening, archRow, winRow, boxOn, gableRoof, solarOn, leanTo, tileRim, inset, nameBoard } from './extras.js';

const WOOD = { brick: 'maP_wood_siding', limestone: 'whitePanel' };
const BROWN = [0.5, 0.38, 0.27];
// Roof colours and materials are matched to 3D-tiles obliques (rule F27): bright terracotta tile on Katharine Branson Hall
// and the quad, tan shingle + solar on the gym, light grey standing seam + solar on the Commons.
const SPEC = [
  { id: 975106452, key: 'kbh', part: 'main', name: 'Katharine Branson Hall', top: 14.9, style: 'brKbh', roof: 'tile', rise: 3.6, ov: 0.7, tol: 0.9, level: 10.3, tint: BR_CLAY },
  { id: 975106452, key: 'kbhWhite', part: 'white', name: 'Katharine Branson Hall (west wing)', top: 16.6, style: 'brKbh', roof: 'custom', tol: 0.9, level: 10.3 },
  { id: 976135756, key: 'gym', name: 'Gym Complex', top: 8.6, style: 'brGym', roof: 'custom', skin: WOOD, minH: 6.5, level: 0.5 },
  { id: 9000000001, key: 'commonsN', name: 'The Commons (north wing)', top: 6.0, style: 'brCommons', roof: 'flat', ladder: true, level: 2.3, bank: { strip: 7.4, slope: 0.95 } },   // (the glen's north bank: a plain planted bank behind a narrow service strip, not planter tiers)
  { id: 9000000002, key: 'commonsHall', name: 'The Commons', top: 6.4, style: 'brHall', roof: 'custom', level: 2.3, bank: { strip: 7.4, slope: 0.95 } },
  { id: 9000000003, key: 'commonsS', name: 'The Commons (south wing)', top: 6.0, style: 'brCommons', roof: 'flat', level: 2.3, bank: { strip: 7.4, slope: 0.95 } },
  { id: 9000000004, key: 'artsW', name: 'Douglas Fine Arts Center', top: 15.6, style: 'brArts', roof: 'flat', ladder: true },
  { id: 9000000005, key: 'artsE', name: 'Maxwell Music Hall', top: 14.3, style: 'brArts', roof: 'flat', ladder: true },
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
  return { white: ensureCCW(white), main: ensureCCW(main) };
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
  const gb = { tint: BR_TAN, ov: 0.8, gableBucket: 'stucco', gableTint: BROWN };
  gableRoof(ctx, boxOn(GYM_N, -11.1), h, 4.2, gb);
  const rs = gableRoof(ctx, boxOn(GYM_S, 78.9), h, 4.4, gb); const L = boxOn(GYM_S, 78.9).L;
  solarOn(ctx, rs, -L / 2 + 2.5, -1.2, 2.2, rs.hw - 2.0); solarOn(ctx, rs, 1.2, L / 2 - 4, 2.2, rs.hw - 2.0);
  // east front
  let F = edgeFrame(-93.0, 73.0, -81.9, 129.4); if (F.nx < 0) F = edgeFrame(-81.9, 129.4, -93.0, 73.0);
  const south = F.tz > 0 ? 1 : -1; const U = (zc) => { const t = (zc - 73.0) / (129.4 - 73.0); return south > 0 ? t * F.L : (1 - t) * F.L; };
  const ue = U(95.5), hw = 4.6, dep = 2.6;
  const blk = [F.P(ue - hw, 0, -0.6), F.P(ue + hw, 0, -0.6), F.P(ue + hw, 0, dep), F.P(ue - hw, 0, dep)].map((p) => [p[0], p[2]]);
  plainBlock(ctx, blk, 0, 6.0, BROWN, BR_TAN); (ctx.buildingRings).push(blk);
  const st = B.v('stucco', true); st.setColor(...CREAM);
  for (const sd of [-1, 1]) { const p = F.P(ue + sd * (hw - 0.45), 0, dep - 0.35); st.box(p[0], 2.6, p[2], 1.1, 5.2, 1.0, F.rotY, 0.45); }
  st.setColor(1, 1, 1);
  const ang = Math.atan2(F.nz, F.nx) * 180 / Math.PI; const c = F.P(ue, 0, dep - 3.6);
  gableRoof(ctx, { cx: c[0], cz: c[2], ang, L: 7.2, W: 2 * hw }, 6.0, 2.9, { tint: BR_TAN, ov: 0.7, ovEnd: 0.5, gableBucket: 'stucco', gableTint: BROWN, ends: [false, true] });
  let Ff = edgeFrame(blk[3][0], blk[3][1], blk[2][0], blk[2][1]); if (Ff.nx * F.nx + Ff.nz * F.nz < 0) Ff = edgeFrame(blk[2][0], blk[2][1], blk[3][0], blk[3][1]);
  archOpening(ctx, Ff, Ff.L / 2, 0.35, 5.4, 3.3, { mullions: 6, bars: [1.2, 2.25, 3.3], trim: [0.82, 0.81, 0.78], out: 0.05 });
  leanTo(ctx, F, 1.0, ue - hw, 3.4, 4.5, 3.3, { tint: BR_TAN }); leanTo(ctx, F, ue + hw, F.L - 1.0, 3.4, 4.5, 3.3, { tint: BR_TAN });
  // the second, smaller gable north of the entrance (a window over the north colonnade): 3D tiles oblique from the field
  { const un = ue - south * 13.5; const c2 = F.P(un, 0, -2.4); gableRoof(ctx, { cx: c2[0], cz: c2[2], ang, L: 6.0, W: 9.0 }, h - 1.2, 2.6, { tint: BR_TAN, ov: 0.6, ovEnd: 0.4, gableBucket: 'stucco', gableTint: BROWN, ends: [false, true] });
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
  { const c = [(cx + a2[0]) / 2 + nx * 3, (cz + a2[1]) / 2 + nz * 3]; const pt = B.v('stucco', true); pt.setColor(...WHITE); pt.box(c[0], h + 1.2, c[1], 6.5, 2.4, 5.0, Math.atan2(-(b[1] - a[1]), b[0] - a[0]), 0.45); pt.setColor(1, 1, 1); B.c('concrete').box(c[0], h + 1.2, c[1], 6.5, 2.4, 5.0, Math.atan2(-(b[1] - a[1]), b[0] - a[0])); }
  for (const F of outFrames(loggia)) { if (F.nx * nx + F.nz * nz > 0.5) continue; if (F.L > 6) archRow(ctx, F, 0.9, F.L - 0.9, 0.25, 1.9, 1.75, 3.1, { trim: [0.74, 0.73, 0.7] }); else archOpening(ctx, F, F.L / 2, 0.25, 1.7, 1.75, { trim: [0.74, 0.73, 0.7] }); }
  for (const F of outFrames(upper)) { const mx = F.ax + F.tx * F.L / 2 + F.nx * 1.2, mz = F.az + F.tz * F.L / 2 + F.nz * 1.2; if (F.L < 3.2 || pointInRing(mx, mz, loggia) || (ctx.buildingRings || []).some((r) => r !== ring && pointInRing(mx, mz, r))) { if (F.L >= 3.2 && pointInRing(mx, mz, loggia)) winRow(ctx, F, 0.8, F.L - 0.8, 4.3, h - 0.8, 1.3, 2.6); continue; }
    winRow(ctx, F, 0.8, F.L - 0.8, 1.0, 2.7, 1.3, 2.6); winRow(ctx, F, 0.8, F.L - 0.8, 4.3, h - 0.8, 1.3, 2.6); }
}
// arched entrance porches of the hall: on the visitor-lot side (the two flights of steps in the re-entrant corner) and on the lawn side
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
      if (s.key === 'newHouse') { kitWalls(ctx, ring, h, s.style, { skin: s.skin, id: s.name }); B.c('concrete').prism(ring, 0, h, 1, true); (ctx.buildingRings = ctx.buildingRings || []).push(ring);
        const GREY = [1.55, 1.6, 1.7], wall = [0.6, 0.62, 0.64]; const box = boxOn(ring, -16.4); const r = gableRoof(ctx, box, h, 3.4, { tint: GREY, ov: 0.5, gableBucket: 'stucco', gableTint: wall });
        for (const [u, sd, w] of [[-4.2, 1, 3.0], [1.2, 1, 2.2], [5.4, 1, 2.2], [-3, -1, 2.2], [3.5, -1, 2.2]]) dormer(ctx, r, box, u, sd, w, { tint: GREY, wall }); return; }
      if (s.key === 'tallant') { const r = flatBuilding(ctx, ring, h, s.style, { id: s.name }); tileRim(ctx, ring, h - 0.02, 2.2, 0.34); flats.push({ s, ring, roofAbs: base + r.roofY }); return; }
      if (s.roof === 'flat') { const r = flatBuilding(ctx, ring, h, s.style, { skin: s.skin, id: s.name }); flats.push({ s, ring, roofAbs: base + r.roofY }); return; }
      kitWalls(ctx, ring, h, s.style, { skin: s.skin, id: s.name });
      B.c('concrete').prism(ring, 0, h, 1, true); (ctx.buildingRings = ctx.buildingRings || []).push(ring);
      if (s.key === 'commonsHall') { const box = boxOn(ring, 41.5); const r = gableRoof(ctx, box, h, 3.5, { tint: BR_SEAM, ov: 0.9, gableTint: [0.66, 0.6, 0.5] }); solarOn(ctx, r, -box.L / 2 + 1.5, box.L / 2 - 1.5, 0.9, r.hw - 1.0); return; }
      polyRoof(ctx, ring, h, s.rise, { tint: s.tint || BR_CLAY, overhang: s.ov, fill: true });
      if (s.key === 'kbh') kbhPorches(ctx, s);
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
