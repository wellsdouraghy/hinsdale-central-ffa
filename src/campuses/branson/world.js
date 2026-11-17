// The Branson School builder (Ross, CA): the school's buildings on the upper and lower campus, Tom Ryan Field, the
// tennis courts, the car-park loop, Fernhill Ave / Park Drive and the houses behind their hedges. See CAMPUSES.md for the
// contract, MAP_NOTES.md for the rules (earthworks order below) and tools/ for the data pipeline.
import { addMaterials, minAreaOBB, planWalls, applyPads, planCheeks, buildPadWalls, seatInteriors, goreWalls } from '../marin/kit.js';
import { shapeSDF } from '../../world/terrain.js';
import { gradeStreets } from '../../world/streets.js';
import { pointInRing } from '../../world/util.js';
import { addStyles, fieldRing, tennisRing, isStreet, streetWidth, stairGrade, centroid } from './kit.js';
import { buildSchool, schoolWalls } from './school.js';
import { buildTown, planTown } from './town.js';
import { buildGrounds, ALUMNI_STEPS, CAR_FREE } from './grounds.js';
import { buildTerrain, terrainSampler } from './terrain.js';

// Park Drive and the loop are drawn in OSM with a few long chords: two rounds of corner cutting (end points kept, so
// the junction nodes still coincide) before the street is designed on them
const SMOOTH = new Set([12187517, 570965050, 570965049, 570965051]);
function smoothLine(r) { let L = r.line; if (!SMOOTH.has(r.id)) return L; for (let k = 0; k < 2; k++) { const o = [L[0]]; for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(L[L.length - 1]); L = o; } return L; }

// Earthworks, in the fixed order of the rulebook (B7), all before anything is placed:
//   1 campus pads -> 2 graded streets -> 3 building wall pads + seatInteriors -> 4 streets.restore() -> 5 cheek /
//   retaining walls (planCheeks here, built in build()) -> 6 trees and props off the street design -> 7 paintSurface
function sitework(ctx) {
  const T = ctx.terrain; if (!T) return;
  // ---- 1. campus pads
  // The lower campus was regraded after the lidar flight (tools/terrain.py moves the hillside; here the old channel of
  // Ross Creek, now in a culvert under the field, is filled to the level of the lawns round the pitch)
  ctx.flatten({ rect: { cx: -13, cz: 95, w: 150, d: 66, angle: 0 } }, { y: (x, z) => Math.max(T.heightAt(x, z), -0.3), blend: 7 });
  // Tom Ryan Field: dead level (y = 0 by definition). The pad reaches 4.2 m past the turf: one lattice cell behind the
  // face of the retaining wall on the south side (2 m out), its 2.3 m blend wholly under that wall's 4.7 m block.
  ctx.flatten({ outline: fieldRing(4.2) }, { y: 0, blend: 2.3 });
  // the tennis courts: one level slab
  ctx.tennisY = ctx.flatten({ outline: tennisRing(1.6) }, { blend: 3 });
  // the dining terrace in front of the Commons hall (tables under umbrellas)
  ctx.terraceY = ctx.flatten({ circle: { x: -106, z: 31, r: 9 } }, { blend: 3 });
  // Buildings that back onto the steep wooded hill (the gym and the quad): the hill behind them is cut to a planted
  // bank of 36 deg rising from the edge of the wall pad, instead of a sheer face many metres high (map check
  // `retaining`: "grade the ground in or step it"). Laid before the wall pads; the lidar ground wins where it is lower.
  const sw0 = schoolWalls(ctx);
  for (const w of sw0) { if (!w.bank) continue; const sd = shapeSDF({ outline: w.ring }).sd; const c = centroid(w.ring); let R = 0; for (const p of w.ring) R = Math.max(R, Math.hypot(p[0] - c[0], p[1] - c[1]));
    ctx.flatten({ circle: { x: c[0], z: c[1], r: R + 46 } }, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z), d = sd(x, z); return d <= 2.4 ? h : Math.min(h, w.level + (d - 2.4) * 0.72); } }); }
  const zoneShapes = [{ outline: fieldRing(4.2) }, { outline: tennisRing(1.6) }, { circle: { x: -106, z: 31, r: 9 } }].map((sh) => shapeSDF(sh).sd);
  const zones = zoneShapes.map((sd) => (x, z) => sd(x, z) <= 0);
  // ---- 2. streets: Fernhill Ave, Park Drive (the campus drive from the gate down to the loop and on to the bridge),
  // Circle Drive, Glenwood. Ross lanes: a crowned carriageway, no kerb, no sidewalk, a narrow gravel shoulder.
  const streets = gradeStreets(ctx, ctx.data.roads.filter((r) => isStreet(r) && r.line.length >= 2).map((r) => ({ id: r.id, name: r.tags.name, line: smoothLine(r), width: streetWidth(r), left: 0, right: 0 })),
    { kerb: 0.04, shoulder: 1.2, blend: 4, hillside: { width: 6.0, shoulder: 1.0 }, hard: [zones[0]], protect: zones });
  if (streets) streets.apply();
  // ---- 3. seat every building: walls planned on the designed ground, a level strip per wall piece, interiors cut
  const sw = schoolWalls(ctx);
  const rings = [...sw.map((w) => w.ring), ...ctx.data.buildings.filter((b) => ctx.gen.buildings[String(b.id)]?.play && b.outer[0].length >= 3 && !sw.some((w) => w.id === b.id)).map((b) => b.outer[0])];
  for (const w of sw) { let level = w.level;   // (the Fine Arts link takes the floor of the music hall's wall it stands against: one terrace between them)
    if (w.key === 'artsLink') { const pe = ctx.wallPlans && [...ctx.wallPlans.values()].find((p) => p.name === 'Maxwell Music Hall'); const c = centroid(w.ring); let best = null; if (pe) for (const pcs of pe.edges.values()) for (const pc of pcs) { const d = Math.hypot((pc.p[0] + pc.q[0]) / 2 - c[0], (pc.p[1] + pc.q[1]) / 2 - c[1]); if (!best || d < best.d) best = { d, level: pc.level }; } if (best) level = best.level; }
    planWalls(ctx, w.ring, w.top, w.style, { name: w.name, others: rings, zones, minH: w.minH, level }); }
  planTown(ctx, rings, zones);
  applyPads(ctx);
  seatInteriors(ctx);
  // ---- 4. the streets take their design back (no pad survives on a carriageway or shoulder)
  if (streets) { const bx = (ctx.allRings || rings).map((r) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [r, x0, z0, x1, z1]; }); streets.solid.push((x, z) => bx.some((b) => x >= b[1] && x <= b[3] && z >= b[2] && z <= b[4] && pointInRing(x, z, b[0])));
    streets.restore(); }
  // ---- designed steps, after the streets are back (none touches a roadway): the Alumni Steps down the bank from
  // Katharine Branson Hall's lawn to the car-park loop
  for (const st of ALUMNI_STEPS) stairGrade(ctx, st);
  // ---- 6 + 7. everything respects the designed section: surface classes painted from it, trees off the carriageways
  if (streets) {
    const turf = zoneShapes[0], courts = shapeSDF({ outline: tennisRing(0) }).sd;
    if (ctx.paintSurface) ctx.paintSurface((x, z) => streets.surface(x, z) || (courts(x, z) <= 0 ? 'concrete' : null));
    const solid = streets.solid[0] || (() => false); const out = [];
    for (const t of ctx.gen.trees || []) { const p = streets.toVerge(t[0], t[1], 1.0); if (!p) { out.push(t); continue; } if (streets.inRoad(p[0], p[1], 1.0) || solid(p[0], p[1]) || out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3)) continue; out.push([p[0], p[1], ...t.slice(2)]); }
    // no tree on the pitch pad, the courts, the dining terrace, the steps, or deep inside a car park
    const stairs = ALUMNI_STEPS.map((s) => shapeSDF({ rect: { cx: (s.a[0] + s.b[0]) / 2, cz: (s.a[1] + s.b[1]) / 2, w: Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) + 5, d: s.w + 4, angle: Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) } }).sd);
    ctx.gen.trees = out.filter((t) => turf(t[0], t[1]) > 2.5 && courts(t[0], t[1]) > 2 && zoneShapes[2](t[0], t[1]) > 0 && stairs.every((sd) => sd(t[0], t[1]) > 0)
      && !(ctx.surfaceAt(t[0], t[1]) === 'asphalt' && [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]].every(([dx, dz]) => ctx.surfaceAt(t[0] + dx, t[1] + dz) === 'asphalt')));
  }
  // ---- 5. cheek walls where two terraces meet (built in build(): buildPadWalls)
  planCheeks(ctx);
}

export function build(ctx, progress = () => {}) {
  addMaterials(ctx); addStyles();
  terrainSampler(ctx.gen);   // installs the backdrop grid (descriptor terrain.outside reads it beyond the satellite rectangle)
  sitework(ctx);
  const c = ctx.campus || {};
  ctx.keepClear = [[...(c.ctf?.red || [0, 0]), 9], [...(c.ctf?.blue || [0, 0]), 9], ...(c.practiceHeli ? [[c.practiceHeli.x, c.practiceHeli.z, 11]] : []), ...CAR_FREE.map((p) => [p[0], p[1], 10]), ...(c.heliPark || []).filter((p) => p[1] < 0.5).map((p) => [p[0], p[2], 10])];
  progress(0.48, 'Building The Branson School');
  buildPadWalls(ctx);   // retaining blocks where a building pad is cut deep into the hill
  goreWalls(ctx);       // ...and between two carriageways at different heights
  buildSchool(ctx);
  progress(0.58, 'Building Ross');
  buildTown(ctx);
  const roofs = [];
  for (const f of ctx.flatRoofs || []) { if (f.area < 520) continue; const o = minAreaOBB(f.ring); const u = (o.u0 + o.u1) / 2, v = (o.v0 + o.v1) / 2; roofs.push([u * o.tx - v * o.tz, f.roofY, u * o.tz + v * o.tx]); }
  // Hidden-helicopter candidates (rule D20: from a scan, never by eye). The descriptor lists the spots a scan accepted;
  // when it lists none, every level cell of a 5 m grid that is clear of the streets goes to the shared pipeline (car
  // parks first, then the turf, then lawns), whose exact rotor-clearance test picks the valid ones.
  let scan = [];
  if (!(c.heliPark || []).length && ctx.terrain) { const pb = ctx.playBounds, T = ctx.terrain; const rank = { asphalt: 0, rubber: 1, concrete: 2, grass: 3 };
    for (let z = pb.minZ + 12; z <= pb.maxZ - 12; z += 5) for (let x = pb.minX + 12; x <= pb.maxX - 12; x += 5) { const s = ctx.surfaceAt(x, z); if (rank[s] === undefined) continue; if (ctx.streets && ctx.streets.inRoad(x, z, 5)) continue; if (T.maxIn(x, z, 2.6) - T.minIn(x, z, 2.6) > 0.26) continue; if ((ctx.buildingRings || []).some((r) => pointInRing(x, z, r))) continue; scan.push([x, 0, z, rank[s]]); }
    scan.sort((p, q) => p[3] - q[3]); scan = scan.map((p) => [p[0], 0, p[2]]); }
  ctx.campus = { ...c, heliPark: [...(c.heliPark || []), ...scan, ...roofs] };
  progress(0.68, 'Laying out the field and grounds');
  buildGrounds(ctx);
  if (ctx.terrain) for (const sh of ctx.shrubs) if (sh[4] === 0.85) sh[1] = Math.min(sh[1], ctx.groundY(sh[0], sh[2]) + 0.05);   // facade-kit planting beds stand on the ground a metre out
  buildTerrain(ctx);     // hills outside the play area (visual backdrop)
  ctx.buildNotes = { gores: ctx.goreWallStats, stairs: ctx.stairNotes };
}
