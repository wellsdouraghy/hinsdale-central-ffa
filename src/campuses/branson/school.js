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
import { sited, kitWalls, flatBuilding, hipRoof, polyRoof, groundLadder, edgeFrame, CLAY, tileTint, pointInRing } from '../marin/kit.js';
import { simplify } from './kit.js';

const WOOD = { brick: 'maP_wood_siding', limestone: 'whitePanel' };
const GYM_ROOF = tileTint([156, 146, 132]), METAL_ROOF = tileTint([138, 142, 144]);
const SPEC = [
  { id: 975106452, key: 'kbh', name: 'Katharine Branson Hall', top: 14.9, style: 'brKbh', roof: 'tile', rise: 3.2, ov: 0.7, tol: 0.9, level: 10.3 },
  { id: 976135756, key: 'gym', name: 'Gym Complex', top: 8.6, style: 'brGym', roof: 'tile', rise: 4.4, ov: 0.8, tint: GYM_ROOF, skin: WOOD, minH: 6.5, level: 0.5 },
  { id: 9000000001, key: 'commonsN', name: 'The Commons (north wing)', top: 6.0, style: 'brCommons', roof: 'flat', ladder: true },
  { id: 9000000002, key: 'commonsHall', name: 'The Commons', top: 6.4, style: 'brHall', roof: 'gable', rise: 3.5, ov: 0.9, tint: METAL_ROOF, gableTint: [0.66, 0.6, 0.5] },
  { id: 9000000003, key: 'commonsS', name: 'The Commons (south wing)', top: 6.0, style: 'brCommons', roof: 'flat' },
  { id: 9000000004, key: 'artsW', name: 'Douglas Fine Arts Center', top: 15.6, style: 'brArts', roof: 'flat', ladder: true },
  { id: 9000000005, key: 'artsE', name: 'Maxwell Music Hall', top: 14.3, style: 'brArts', roof: 'flat', ladder: true },
  { id: 9000000006, key: 'artsLink', name: 'Douglas Fine Arts Center (link)', top: 13.4, style: 'brArtsLow', roof: 'flat' },
  { id: 976479989, key: 'study', name: 'Study Hall', top: 6.0, style: 'brQuadLow', roof: 'tile', rise: 2.2, ov: 0.6, level: 1.8 },
  { id: 976475035, key: 'richardson', name: 'Richardson Hall / New Oaks', top: 7.0, style: 'brKbh', roof: 'tile', rise: 2.4, ov: 0.6, level: 1.8 },
  { id: 978513427, key: 'tallant', name: 'Tallant Science Center', top: 7.2, style: 'brKbh', roof: 'tile', rise: 2.4, ov: 0.6, tol: 0.8, level: 2.1 },
];
export const SCHOOL_IDS = new Set(SPEC.map((s) => s.id));

const cache = new WeakMap();
/** The school's buildings with their rings (one array per building for the whole build: plans are keyed by the ring). */
export function schoolWalls(ctx) {
  let list = cache.get(ctx.data);
  if (!list) { list = []; for (const s of SPEC) { const b = ctx.data.buildings.find((q) => q.id === s.id); if (!b) continue; const ring = simplify(b.outer[0], s.tol || 0.5); ring.id = s.name; list.push({ ...s, ring }); } cache.set(ctx.data, list); }
  return list;
}

export function buildSchool(ctx) {
  const { B } = ctx; const list = schoolWalls(ctx); const all = list.map((s) => s.ring); const flats = [];
  for (const s of list) {
    const ring = s.ring;
    sited(ctx, ring, (base) => {
      const h = s.top - base;
      if (s.roof === 'flat') { const r = flatBuilding(ctx, ring, h, s.style, { skin: s.skin, id: s.name }); flats.push({ s, ring, roofAbs: base + r.roofY }); return; }
      kitWalls(ctx, ring, h, s.style, { skin: s.skin, id: s.name });
      B.c('concrete').prism(ring, 0, h, 1, true); (ctx.buildingRings = ctx.buildingRings || []).push(ring);
      if (s.roof === 'gable') hipRoof(ctx, ring, h, s.rise, { gable: true, tint: s.tint || CLAY, overhang: s.ov, fill: true, gableTint: s.gableTint });
      else polyRoof(ctx, ring, h, s.rise, { tint: s.tint || CLAY, overhang: s.ov, fill: true });
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
