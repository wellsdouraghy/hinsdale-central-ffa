// The Branson School builder (Ross, CA): the school's buildings on the upper and lower campus, Tom Ryan Field, the
// tennis courts, the car-park loop, Fernhill Ave / Park Drive and the houses behind their hedges. See CAMPUSES.md for the
// contract, MAP_NOTES.md for the rules (earthworks order below) and tools/ for the data pipeline.
import { addMaterials, minAreaOBB, mulberry32, planWalls, applyPads, planCheeks, buildPadWalls, seatInteriors, goreWalls } from '../marin/kit.js';
import { shapeSDF } from '../../world/terrain.js';
import { gradeStreets } from '../../world/streets.js';
import { pointInRing } from '../../world/util.js';
import { addStyles, fieldRing, tennisRing, isStreet, streetWidth, stairGrade, centroid, TERRACE, ARTS_PLAZA, ARTS_LAWN, LOOP_GARDEN, LOOP_OUTER, POOL, POOL_DECK, POOL_HOUSE, PAVED_POLYS, PAVED_LINES, DRY, LITTER, WALKS, PATIO, ENTR_COURT, GARDEN, SUNDIAL, KBH_TERR, KBH_TERR_Y, KBH_STEPS } from './kit.js';
import { buildSchool, schoolWalls, KBH_LOW } from './school.js';
import { buildTown, planTown } from './town.js';
import { buildGrounds, ALUMNI_STEPS, CAR_FREE, BRIDGE, creekSDF, SHED, NB_POOL } from './grounds.js';
import { buildTerrain, terrainSampler } from './terrain.js';

// Park Drive and the loop are drawn in OSM with a few long chords: two rounds of corner cutting (end points kept, so
// the junction nodes still coincide) before the street is designed on them
const SMOOTH = new Set([12187517, 570965050, 570965049, 570965051, 12186851]);   // (+ Ivy Drive: its OSM corners on the hillside tilt the cross-section)
function smoothLine(r, fixed) { let L = r.line; if (!SMOOTH.has(r.id)) return L; const key = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
  for (let k = 0; k < (r.id === 12186851 ? 1 : 2); k++) { const o = [L[0]]; for (let i = 1; i < L.length - 1; i++) { const a = L[i - 1], v = L[i], b = L[i + 1]; if (fixed.has(key(v))) { o.push(v); continue; } o.push([a[0] * 0.25 + v[0] * 0.75, a[1] * 0.25 + v[1] * 0.75], [b[0] * 0.25 + v[0] * 0.75, b[1] * 0.25 + v[1] * 0.75]); } o.push(L[L.length - 1]); L = o; } return L; }

// Earthworks, in the fixed order of the rulebook (B7), all before anything is placed:
//   1 campus pads -> 2 graded streets -> 3 building wall pads + seatInteriors -> 4 streets.restore() -> 5 cheek /
//   retaining walls (planCheeks here, built in build()) -> 6 trees and props off the street design -> 7 paintSurface
function sitework(ctx) {
  const T = ctx.terrain; if (!T) return;
  // ---- 1. campus pads
  // Tom Ryan Field: dead level (y = 0 by definition). The pad reaches 4.2 m past the turf: one lattice cell behind the
  // face of the retaining wall on the south side (2 m out), its 2.3 m blend wholly under that wall's 4.7 m block.
  ctx.flatten({ outline: fieldRing(3.0) }, { y: 0, blend: 2.3 });
  // the tennis courts: one level slab
  ctx.tennisY = ctx.flatten({ outline: tennisRing(1.6) }, { blend: 3 });
  // the organic garden's raised beds stand on a level plot of Katharine Branson Hall's south-west lawn
  ctx.flatten({ rect: { cx: GARDEN.cx, cz: GARDEN.cz, w: GARDEN.w + 0.8, d: GARDEN.d + 0.8, angle: GARDEN.ang * Math.PI / 180 } }, { blend: 3.5 });   // (fix round 6: the fenced plot's real place and size)
  ctx.flatten({ circle: { x: SUNDIAL[0], z: SUNDIAL[1], r: SUNDIAL[2] + 0.6 } }, { blend: 2.5 });
  ctx.flatten({ circle: { x: PATIO[0], z: PATIO[1], r: PATIO[2] + 0.4 } }, { blend: 3 });   // the round patio at the end of the hall's terrace walk (two tables)   // the sundial's level spot on the lawn
  // the dining terrace in front of the Commons hall (tables under umbrellas)
  ctx.terraceY = ctx.flatten({ outline: TERRACE }, { blend: 3 });   // (its real outline, traced from the tiles: a stone plaza, not a circle)
  ctx.flatten({ outline: ARTS_PLAZA }, { y: 9.26, blend: 2.5 });
  { const red = ctx.campus.ctf?.red; if (red) ctx.flatten({ circle: { x: red[0], z: red[1], r: 3.2 } }, { blend: 4.5 }); }   // the red base: a level spot on the wooded slope (cut and fill under 0.7 m)   // (one level with the Fine Arts studios' floor strip: the tiles read 9.5-9.7 over the whole court)
  { const [qx, qz, qr] = NB_POOL; ctx.nbPoolY = ctx.flatten({ circle: { x: qx, z: qz, r: qr + 0.9 } }, { y: Math.min(T.heightAt(qx, qz - qr), T.heightAt(qx, qz)), blend: 3 }); }   // (fix round 8) the neighbour's round pool stands on a level spot: on the lidar slope (0.2 m across it) the ground rose through the water as a wedge
  ctx.poolY = ctx.flatten({ outline: POOL_DECK }, { blend: 3 }); ctx.flatten({ outline: POOL }, { y: ctx.poolY - 0.95, blend: 0.6 });   // the neighbour's pool deck north of Fernhill Ave   // the paved court between New House and the Fine Arts studios
  // Buildings that back onto the steep wooded hill (the gym and the quad): the hill behind them is cut to a planted
  // bank of 36 deg rising 7.4 m behind the walls, instead of a sheer face many metres high (map check
  // `retaining`: "grade the ground in or step it"). Laid before the wall pads; the lidar ground wins where it is lower.
  const sw0 = schoolWalls(ctx);
  for (const w of sw0) { if (!w.bank) continue; const sd = shapeSDF({ outline: w.ring }).sd; const c = centroid(w.ring); let R = 0; for (const p of w.ring) R = Math.max(R, Math.hypot(p[0] - c[0], p[1] - c[1]));
    ctx.flatten({ circle: { x: c[0], z: c[1], r: R + 46 } }, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z), d = sd(x, z); const st = w.bank.strip ?? 7.4, sl = w.bank.slope ?? 0.72, rc = w.bank.reach ?? 1e9; return Math.min(h, d <= st ? w.level + 0.06 : d <= rc ? w.level + 0.06 + (d - st) * sl : w.level + 0.06 + (rc - st) * sl + (d - rc) * 0.9); } }); }   // (reach: a gentle apron only that far, then a real bank)   // (the bank starts beyond the wall pad's retaining depth: a level service strip behind the building, no block)
  const zoneShapes = [{ outline: fieldRing(3.0) }, { outline: tennisRing(1.6) }, { outline: TERRACE }].map((sh) => shapeSDF(sh).sd);
  const zones = zoneShapes.map((sd) => (x, z) => sd(x, z) <= 0); const plazaZ = shapeSDF({ outline: ARTS_PLAZA }).sd; const zonesW = [...zones, (x, z) => plazaZ(x, z) <= 0];   // (walls that face the arts court stand on it: no wall pad laid over the pavers)
  // ---- 2. streets: Fernhill Ave, Park Drive (the campus drive from the gate down to the loop and on to the bridge),
  // Circle Drive, Glenwood. Ross lanes: a crowned carriageway, no kerb, no sidewalk, a narrow gravel shoulder.
  const sRoads = ctx.data.roads.filter((r) => isStreet(r) && r.line.length >= 2); const seen = new Map(), fixed = new Set();   // vertices that two streets share (junction nodes) stay where they are
  for (const r of sRoads) for (const p of r.line) { const k = Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10); if (seen.has(k) && seen.get(k) !== r.id) fixed.add(k); else seen.set(k, r.id); }
  const streets = gradeStreets(ctx, sRoads.map((r) => ({ id: r.id, name: r.tags.name, line: smoothLine(r, fixed), width: streetWidth(r), left: 0, right: 0 })),
    { kerb: 0.04, shoulder: 1.2, blend: 4, hillside: { width: 6.0, shoulder: 1.0 }, hard: [zones[0]], protect: zones });
  if (streets) streets.apply();
  // ---- 3. seat every building: walls planned on the designed ground, a level strip per wall piece, interiors cut
  const sw = schoolWalls(ctx);
  const rings = [...sw.map((w) => w.ring), ...ctx.data.buildings.filter((b) => ctx.gen.buildings[String(b.id)]?.play && b.outer[0].length >= 3 && !sw.some((w) => w.id === b.id)).map((b) => b.outer[0])];
  for (const w of sw) { let level = w.level;   // (the Fine Arts link takes the floor of the music hall's wall it stands against: one terrace between them)
    if (w.key === 'artsLink') { const pe = ctx.wallPlans && [...ctx.wallPlans.values()].find((p) => p.name === 'Maxwell Music Hall'); const c = centroid(w.ring); let best = null; if (pe) for (const pcs of pe.edges.values()) for (const pc of pcs) { const d = Math.hypot((pc.p[0] + pc.q[0]) / 2 - c[0], (pc.p[1] + pc.q[1]) / 2 - c[1]); if (!best || d < best.d) best = { d, level: pc.level }; } if (best) level = best.level; }
    planWalls(ctx, w.ring, w.top, w.style, { name: w.name, others: rings, zones: zonesW, minH: w.minH, level }); }
  planTown(ctx, rings, zones);
  applyPads(ctx);
  seatInteriors(ctx);
  // ---- 4. the streets take their design back (no pad survives on a carriageway or shoulder)
  if (streets) { const bx = (ctx.allRings || rings).map((r) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [r, x0, z0, x1, z1]; }); streets.solid.push((x, z) => bx.some((b) => x >= b[1] && x <= b[3] && z >= b[2] && z <= b[4] && pointInRing(x, z, b[0])));
    streets.restore(); }
  // ---- designed steps, after the streets are back (none touches a roadway): the Alumni Steps down the bank from
  // Katharine Branson Hall's lawn to the car-park loop
  for (const st of ALUMNI_STEPS) stairGrade(ctx, st);
  // Richardson Hall stands on the creek bank: its wall pads had FILLED the bank up to 3.4 m (map check: fill above the source DEM).
  // Outside its walls the ground goes back to the lidar surface; the walls run down to it (rule F33: natural ground, no fill).
  for (const wl of sw) { if (wl.key !== 'richardson' || !T.sourceAt) continue; const sd = shapeSDF({ outline: wl.ring }).sd; const c = centroid(wl.ring); ctx.flatten({ circle: { x: c[0], z: c[1], r: 34 } }, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z); const d = sd(x, z); return d > -3.2 && d < 16 ? Math.min(h, T.sourceAt(x, z) + 0.2 + Math.max(0, d - 12) * 1.0) : h; } }); }   // (from 3.2 m INSIDE the walls: a pad level left on the wall line drew as a sawtooth of grass peaks up the facade; the walls go down to the natural bank as a base course)
  // Katharine Branson Hall's south-east end (fix round 7; tiles 2 m grid = the lidar within 0.2 m: the ground there is 8.5-8.7, a paved terrace against a
  // walk-out lower storey). The wall pads had filled it to the floor (10.3, 1.7 m of fill): from u 41 on (wing frame) the ground outside the walls goes
  // back to the lidar surface, from 3.2 m inside them (rule F45), the terrace is level at 8.6 and the flight at its north corner is graded up to the lot.
  for (const wl of sw) { if (wl.key !== 'kbh' || !T.sourceAt) continue; const sd = shapeSDF({ outline: wl.ring }).sd; const U = (x, z) => 0.804 * (x + 41.5) + 0.595 * (z + 25.2);
    ctx.flatten({ circle: { x: -5.4, z: 12, r: 27 } }, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z), d = sd(x, z); const wg = Math.max(0, Math.min(1, (U(x, z) - 41) / 5)) * (d > 10 ? Math.max(0, (14 - d) / 4) : 1); return d < -3.2 || wg <= 0 ? h : h + (Math.min(h, T.sourceAt(x, z)) - h) * wg; } });
    ctx.flatten({ outline: KBH_TERR }, { y: KBH_TERR_Y, blend: 1.8 }); stairGrade(ctx, KBH_STEPS); }
  // the white shed on the edge of the Commons' service yard stands on the yard's level (cut into the foot of the bank behind it, no fill)
  { const y = Math.min(T.heightAt(-152.2, -6.3), T.heightAt(-150.4, -8.2), T.heightAt(-154.4, -4.4)); const sd = shapeSDF({ outline: SHED }).sd; ctx.flatten({ circle: { x: -154.2, z: -8.4, r: 11 } }, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z), d = sd(x, z); return d < 0.8 ? Math.min(h, y) : d < 3.2 ? Math.min(h, y + (d - 0.8) * 0.9) : h; } }); }
  // ---- Ross Creek at the Bridge (campus map item 12; OSM cycleway 1286714176 from the end of Park Drive to the quad path).
  // The lidar has the channel on both sides; the street's end pad and shoulder had filled it. Re-cut it under the bridge
  // (bed -2.7, 3 m wide, banks rising to the abutments) and level the two bridgeheads.
  { const B0 = BRIDGE; const ca = Math.cos(B0.creekAng), sa = Math.sin(B0.creekAng); B0.y = T.heightAt(B0.a[0] + 0.6, B0.a[1] - 0.6) + 0.01;   // the deck takes the level of the street's designed end, whatever the grading made it
    ctx.flatten({ rect: { cx: B0.mid[0], cz: B0.mid[1], w: 18, d: B0.span + 1.0, angle: B0.creekAng } }, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z); const dx = x - B0.mid[0], dz = z - B0.mid[1]; const across = Math.abs(-dx * sa + dz * ca), al = Math.abs(dx * ca + dz * sa); const prof = -2.7 + Math.max(0, across - 1.5) * 1.9 + Math.max(0, al - 6) * 0.6; return Math.min(h, Math.max(prof, -2.7)); } });
    { const tx = (B0.b[0] - B0.a[0]) / B0.span, tz = (B0.b[1] - B0.a[1]) / B0.span; ctx.flatten({ circle: { x: B0.b[0] + tx * 1.0, z: B0.b[1] + tz * 1.0, r: 2.6 } }, { y: B0.y - 0.035, blend: 3.0 }); } }   // (fix round 7: the ground under the deck's south end lies 4 cm under the deck top, level for 2.6 m round the head of the walk; it stood 1 cm above the deck and grass grew through it)   // only the quad-side bridgehead: the road end keeps its street design
  // ---- 6 + 7. everything respects the designed section: surface classes painted from it, trees off the carriageways
  if (streets) {
    const turf = zoneShapes[0], courts = shapeSDF({ outline: tennisRing(0) }).sd;
    const creek = creekSDF(ctx); const bsd = shapeSDF({ rect: { cx: BRIDGE.mid[0], cz: BRIDGE.mid[1], w: 16, d: BRIDGE.span - 1.2, angle: BRIDGE.creekAng } }).sd;
    const deckSd = shapeSDF({ rect: { cx: BRIDGE.mid[0], cz: BRIDGE.mid[1], w: BRIDGE.w + 0.5, d: BRIDGE.span + 5.0, angle: BRIDGE.creekAng } }).sd;   // (no grass under the deck's ends or on the join with the walk)
    // (fix round 8, rule F42) at the loop's west end the paving is the traced outline (kit.js LOOP_OUTER, kerbed): the street's own shoulder is not painted past it
    const loopSd = shapeSDF({ outline: LOOP_OUTER }).sd, gymDrSd = shapeSDF({ outline: PAVED_POLYS[4] }).sd; const offLoop = (x, z) => x > -119 && x < -99.5 && z > 39 && z < 57.5 && loopSd(x, z) > 0 && gymDrSd(x, z) > 0;
    if (ctx.paintSurface) ctx.paintSurface((x, z) => (bsd(x, z) <= 0 ? 'dirt' : null) || (offLoop(x, z) ? null : streets.surface(x, z)) || (courts(x, z) <= 0 || deckSd(x, z) <= 0 ? 'concrete' : creek(x, z) < 1.6 && T.heightAt(x, z) < -0.9 ? 'dirt' : null));
    const solid = streets.solid[0] || (() => false); const out = [];
    for (const t of ctx.gen.trees || []) { const p = streets.toVerge(t[0], t[1], 1.0); if (!p) { out.push(t); continue; } if (streets.inRoad(p[0], p[1], 1.0) || solid(p[0], p[1]) || out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3)) continue; out.push([p[0], p[1], ...t.slice(2)]); }
    // no tree on the pitch pad, the courts, the dining terrace, the steps, or deep inside a car park
    const stairs = ALUMNI_STEPS.map((s) => shapeSDF({ rect: { cx: (s.a[0] + s.b[0]) / 2, cz: (s.a[1] + s.b[1]) / 2, w: Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) + 5, d: s.w + 4, angle: Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) } }).sd);
    const poolSd = shapeSDF({ outline: POOL_DECK }).sd, phSd = shapeSDF({ outline: POOL_HOUSE }).sd; const plazaSd = shapeSDF({ outline: ARTS_PLAZA }).sd, gardenSd = shapeSDF({ outline: LOOP_GARDEN }).sd;
    ctx.gen.trees = out.filter((t) => turf(t[0], t[1]) > 2.5 && poolSd(t[0], t[1]) > 2 && phSd(t[0], t[1]) > 3 && plazaSd(t[0], t[1]) > 1.5 && gardenSd(t[0], t[1]) > 3 && Math.hypot(t[0] - SUNDIAL[0], t[1] - SUNDIAL[1]) > 4.4 && !(ctx.campus.heliPark || []).some((p) => p[1] < 0.5 && Math.hypot(t[0] - p[0], t[1] - p[2]) < 11.6) && Math.hypot(t[0] + 3.5, t[1] + 32) > 13.5 /* the Blue Atlas Cedar's crown */ && !(Math.abs(t[0] - GARDEN.cx) < GARDEN.w / 2 + 1.2 && Math.abs(t[1] - GARDEN.cz) < GARDEN.d / 2 + 1.6) /* the organic garden */ && !ALUMNI_STEPS.some((st) => Math.hypot(t[0] - st.a[0], t[1] - st.a[1]) < 3.2) && !(Math.abs(t[0] + 81) < 9 && Math.abs(t[1] - 11) < 9 && [[-87.3, 18.4], [-86.6, 14.5], [-82.0, 9.5], [-73.5, 3.4], [-84.3, 12], [-77.7, 6.4]].some((q) => Math.hypot(t[0] - q[0], t[1] - q[1]) < 2.6)) /* the walk from the head of the steps */ && Math.hypot(t[0] - BRIDGE.mid[0], t[1] - BRIDGE.mid[1]) > 5 && Math.hypot(t[0] - 52, t[1] - 67) > 12.5 /* Prize Day Field: an open lawn (campus map), and a helicopter spot */ && courts(t[0], t[1]) > 2 && zoneShapes[2](t[0], t[1]) > 0 && stairs.every((sd) => sd(t[0], t[1]) > 0)
      && !(ctx.surfaceAt(t[0], t[1]) === 'asphalt' && [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]].every(([dx, dz]) => ctx.surfaceAt(t[0] + dx, t[1] + dz) === 'asphalt')));
  }
  // the academic quad's courtyard is an open lawn (nadir tiles): no scanned tree inside it, only the three round clipped ones pushed below
  { const Q = [[-160.5, 114.5], [-151.5, 121.5], [-141.5, 147.5], [-150.5, 157], [-166, 151], [-174.5, 140.5]]; ctx.gen.trees = (ctx.gen.trees || []).filter((t) => !pointInRing(t[0], t[1], Q)); }
  // the arts court's lawn panel is open grass (nadir tiles), and nothing grows through the yard shed
  { const lawn = shapeSDF({ outline: ARTS_LAWN }).sd, shed = shapeSDF({ outline: SHED }).sd, yard = shapeSDF({ outline: PAVED_POLYS[0] }).sd; ctx.gen.trees = (ctx.gen.trees || []).filter((t) => lawn(t[0], t[1]) > 2.2 && shed(t[0], t[1]) > 10.5 && yard(t[0], t[1]) > (t[2] === 1 ? 6.5 : 2.5)); }   // (a conifer's low branches reach 5-6 m: none over the yard or through the shed)
  // Landmark trees through the tree kit (rule: no hand-built cones): the Blue Atlas Cedar on the visitor-lot island (crown ~25 m
  // across, 26 m tall in the tiles) and the three big clipped trees of the quad lawn (nadir tiles)
  (ctx.gen.trees = ctx.gen.trees || []).push([-3.5, -32, 2, 1.68], [-56, -51, 0, 0.95], [-166.4, 134.2, 0, 0.6], [-148.3, 144.1, 0, 0.6], [-160.0, 150.5, 0, 0.58]);
  // round the Fine Arts Center the tall trees are redwoods and cedars (tiles obliques): the tall ones there draw as conifers
  // (QA round 4: the grove north and west of the arts court reads 20-26 m on the tile heights: every tree of 15 m or more there is a conifer at its
  // measured height, and the four tallest crowns of the tile grid stand as redwoods where no scanned trunk is)
  for (const t of ctx.gen.trees) if (t[0] > 14 && t[0] < 82 && t[1] > -24 && t[1] < 42 && t[2] === 0 && t[3] >= 0.97 && !(ctx.campus.heliPark || []).some((p) => p[1] < 0.5 && Math.hypot(t[0] - p[0], t[1] - p[2]) < 24)) { t[2] = 1; t[3] = Math.max(1.3, Math.min(1.85, t[3] * 1.12)); }   // (not round the helicopter spot on the Fine Arts lawn: its rotor test reads crown sizes)
  { const pz = shapeSDF({ outline: ARTS_PLAZA }).sd; for (const [x, z, sc] of [[38, -15.2, 1.78], [31, -15.5, 1.5], [20.5, -12.2, 1.55], [27, -12.8, 1.62]]) if (pz(x, z) > 1.6 && !(ctx.gen.trees || []).some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.2) && !(ctx.allRings || []).some((r) => pointInRing(x, z, r)) && !(streets && streets.inRoad(x, z, 2))) ctx.gen.trees.push([x, z, 1, sc]); }
  // The hill south of the field, the gym and the quad is closed-canopy oak, bay and redwood forest (imagery, 3D tiles); the
  // canopy scan plants one trunk per ~10 m. Filled in on a jittered 6.5 m grid (seeded), clear of buildings and roads.
  { const rnd = mulberry32(1917); const trees = ctx.gen.trees = ctx.gen.trees || []; const sds = sw.map((w) => shapeSDF({ outline: w.ring }).sd); const fieldSd = shapeSDF({ outline: fieldRing(7.5) }).sd;
    for (let z = 122; z < 232; z += 6.5) for (let x = -200; x < 120; x += 6.5) { const px = x + (rnd() - 0.5) * 4.4, pz = z + (rnd() - 0.5) * 4.4, k = rnd(), sc = 0.72 + rnd() * 0.5;
      if (T.slopeAt(px, pz) < 0.3 || fieldSd(px, pz) < 0 || sds.some((sd) => sd(px, pz) < 5) || (streets && streets.inRoad(px, pz, 2.5))) continue;
      if ((ctx.campus.heliPark || []).some((p) => Math.hypot(px - p[0], pz - p[2]) < 11.6)) continue;
      if ((ctx.allRings || []).some((r) => pointInRing(px, pz, r) || pointInRing(px + 3, pz, r) || pointInRing(px - 3, pz, r) || pointInRing(px, pz + 3, r) || pointInRing(px, pz - 3, r))) continue;
      if (trees.some((t) => Math.abs(t[0] - px) < 4.6 && Math.abs(t[1] - pz) < 4.6 && Math.hypot(t[0] - px, t[1] - pz) < 4.6)) continue;
      trees.push([+px.toFixed(1), +pz.toFixed(1), k < 0.3 ? 1 : 0, +sc.toFixed(2)]); } }
  // The slope between Fernhill Ave and the Commons' service drive, west of the faculty car park, is dense oak / bay wood round one dry
  // clearing (nadir tiles; QA round 4: the game had mown parkland): filled on a jittered 6 m grid, clear of the clearing, the drives,
  // the car park, the red base and the buildings.
  { const rnd = mulberry32(2104); const trees = ctx.gen.trees = ctx.gen.trees || []; const dry = DRY.map((r) => shapeSDF({ outline: r }).sd); const lot = shapeSDF({ outline: PAVED_POLYS[1] }).sd; const litter = LITTER.map((r) => shapeSDF({ outline: r }).sd);   // (the red base stands IN this wood: trunks come to 4.6 m of the flag, on a floor of leaf litter)
    const shedSd = shapeSDF({ outline: SHED }).sd, yardSd = shapeSDF({ outline: PAVED_POLYS[0] }).sd; const red = ctx.campus.ctf?.red || [0, 0];
    const svc = (ctx.data.roads || []).filter((r) => r.tags.highway === 'service').map((r) => r.line); const nearLine = (x, z, d) => svc.some((L) => { for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < d) return true; } return false; });
    // the canopy is closed over the red base in the tiles: three oaks stand round it, 5-6 m from the flag (trunks are its cover, with the hedge and the parked cars)
    for (const [tx, tz, sc] of [[-191.6, -33.2, 0.95], [-185.2, -24.5, 1.0], [-191.4, -24.4, 0.9]]) if (!(streets && streets.inRoad(tx, tz, 1.5)) && !nearLine(tx, tz, 3.2)) trees.push([tx, tz, 0, sc]);
    for (let z = -38; z < 6; z += 6) for (let x = -214; x < -150; x += 6) { const px = x + (rnd() - 0.5) * 4, pz = z + (rnd() - 0.5) * 4, k = rnd(), sc = 0.8 + rnd() * 0.45;
      if (dry.some((sd) => sd(px, pz) < 2.5) || lot(px, pz) < 3 || nearLine(px, pz, 4.2) || (streets && streets.inRoad(px, pz, 3)) || Math.hypot(px - red[0], pz - red[1]) < 4.6 || shedSd(px, pz) < 10.5 || yardSd(px, pz) < 5) continue;   // (nothing over the Commons' service yard and its shed)
      if ((ctx.surfaceAt(px, pz) !== 'grass' && !litter.some((sd) => sd(px, pz) < 0)) || (ctx.allRings || []).some((r) => pointInRing(px, pz, r) || pointInRing(px + 3, pz, r) || pointInRing(px - 3, pz, r) || pointInRing(px, pz + 3, r) || pointInRing(px, pz - 3, r))) continue;
      if ((ctx.campus.heliPark || []).some((p) => Math.hypot(px - p[0], pz - p[2]) < 11.6) || trees.some((t) => Math.hypot(t[0] - px, t[1] - pz) < 4.4)) continue;
      trees.push([+px.toFixed(1), +pz.toFixed(1), k < 0.2 ? 1 : 0, +sc.toFixed(2)]);
      // understory (toyon, coffeeberry, young bay: the tiles show no open ground under this canopy): a shrub clump beside about every other trunk
      if (rnd() < 0.55) { const a = rnd() * 6.2832, d = 2.2 + rnd() * 1.6; const ux = px + Math.cos(a) * d, uz = pz + Math.sin(a) * d; if (!(dry.some((sd) => sd(ux, uz) < 3)) && lot(ux, uz) > 2.5 && !nearLine(ux, uz, 4.6) && !(streets && streets.inRoad(ux, uz, 2.5)) && Math.hypot(ux - red[0], uz - red[1]) > 6.5 && ctx.surfaceAt(ux, uz) === 'grass') (ctx.understory = ctx.understory || []).push([+ux.toFixed(1), +uz.toFixed(1), 1.8 + rnd() * 0.8, 0.75 + rnd() * 0.3, rnd() * 3.14]); } }   // (under the map check's 1.1 m limit for shrubs without collision)
    ctx.gen.trees = trees.filter((t) => !(dry.some((sd) => sd(t[0], t[1]) < 1.5)) && Math.hypot(t[0] - red[0], t[1] - red[1]) > 4.5);
    // fix round 5: within 22 m of the red flag the wood is oak and bay with high crowns (conifer sprays hung at eye level across the base and hid
    // every approach from the east and south); the trunks stay where they are, so the base is as wooded and as covered as before
    for (const t of ctx.gen.trees) if (t[2] === 1 && Math.hypot(t[0] - red[0], t[1] - red[1]) < 22) { t[2] = 0; t[3] = Math.max(0.95, Math.min(1.2, t[3])); } }
  // fix round 5: no trunk in the white block of Katharine Branson Hall (its real outline is larger than the old one), on the new walks, the hall's
  // south drive, the round patio or the entrance forecourt
  { const low = shapeSDF({ outline: KBH_LOW }).sd, court = shapeSDF({ outline: ENTR_COURT }).sd; const dl = (x, z, L) => { let m = 1e9; for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); m = Math.min(m, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)); } return m; };
    const terr = shapeSDF({ outline: KBH_TERR }).sd;   // (fix round 7: open lawn round the hall's south-east terrace and its steps, paving up to the gym's north wall: nadir tiles)
    ctx.gen.trees = (ctx.gen.trees || []).filter((t) => low(t[0], t[1]) > 4.5 && court(t[0], t[1]) > 2 && terr(t[0], t[1]) > 6.5 && dl(t[0], t[1], [KBH_STEPS.a, KBH_STEPS.b]) > 5 && !(t[1] < 80 && dl(t[0], t[1], [[-122, 81], [-99, 76], [-93, 73]]) < 7) && Math.hypot(t[0] - PATIO[0], t[1] - PATIO[1]) > PATIO[2] + 2 && ![...WALKS, ...PAVED_LINES].some(([pts, w]) => dl(t[0], t[1], pts) < w / 2 + 1.5)); }
  // ---- 5. cheek walls where two terraces meet (built in build(): buildPadWalls)
  planCheeks(ctx);
}

export function build(ctx, progress = () => {}) {
  addMaterials(ctx); addStyles(ctx);
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
  // Hidden-helicopter candidates (rule D20: from a scan, never by eye). The descriptor lists the spots a scan accepted
  // (parked cars keep clear of those); behind them every level cell of a 5 m grid that is clear of the streets goes to the shared pipeline (car
  // parks first, then the turf, then lawns), whose exact rotor-clearance test picks the valid ones.
  let scan = [];
  if (ctx.terrain) { const pb = ctx.playBounds, T = ctx.terrain; const rank = { asphalt: 0, rubber: 1, concrete: 2, grass: 3 };
    for (let z = pb.minZ + 12; z <= pb.maxZ - 12; z += 5) for (let x = pb.minX + 12; x <= pb.maxX - 12; x += 5) { const s = ctx.surfaceAt(x, z); if (rank[s] === undefined) continue; if (ctx.streets && ctx.streets.inRoad(x, z, 5)) continue; if (T.maxIn(x, z, 2.6) - T.minIn(x, z, 2.6) > 0.26) continue; if ((ctx.buildingRings || []).some((r) => pointInRing(x, z, r))) continue; scan.push([x, 0, z, rank[s]]); }
    scan.sort((p, q) => p[3] - q[3]); scan = scan.map((p) => [p[0], 0, p[2]]); }
  ctx.campus = { ...c, heliPark: [...(c.heliPark || []), ...((c.heliPark || []).length >= 12 ? [] : scan), ...roofs] };   // (the scan only tops up a short list: its grid cells are not kept clear of cars and trees)
  progress(0.68, 'Laying out the field and grounds');
  buildGrounds(ctx);
  if (ctx.terrain) for (const sh of ctx.shrubs) if (sh[4] === 0.85) sh[1] = Math.min(sh[1], ctx.groundY(sh[0], sh[2]) + 0.05);   // facade-kit planting beds stand on the ground a metre out
  buildTerrain(ctx);     // hills outside the play area (visual backdrop)
  ctx.buildNotes = { gores: ctx.goreWallStats, stairs: ctx.stairNotes, doors: ctx.doors };
}
