// Marin Academy builder (San Rafael, CA): the school's buildings, the surrounding blocks, Championship Field, the pool,
// the circle drive, car parks and street furniture. See CAMPUSES.md for the contract and tools/ for the data pipeline.
import { addMaterials, minAreaOBB, gp, ANG, UX, UZ, planWalls, applyPads, planCheeks, buildPadWalls, seatInteriors, goreWalls } from './kit.js';
import { shapeSDF } from '../../world/terrain.js';
import { gradeStreets } from '../../world/streets.js';
import { pointInRing } from '../../world/util.js';
import { buildSchool, schoolWalls, POOL_STAIR } from './school.js';
import { buildTown, planTown } from './town.js';
import { buildGrounds, turfWorld } from './grounds.js';
import { addCampusWater } from '../../world/water.js';
import { buildTerrain, terrainSampler } from './terrain.js';

// carriageway widths by OSM class (kerb to kerb, as grounds.js lays the kerb furniture) and the sidewalk width
const STREET_W = { primary: 15.0, secondary: 13.0, secondary_link: 8.0, tertiary: 11.5, residential: 8.5 }, SIDEWALK_W = 2.4;
const CAR_FREE = [[108, -30], [62, -22], [76, -74], [12, -140], [-86, -44], [-20, -5], [84, 58], [-141, 131], [-30, 150], [-10, 180], [128, 172], [70, 150],
  [150, 62], [-160, 160], [100, 258], [-48, 240], [-196, 0], [196, 44], [13, 92], [-110, 96], [170, 110], [-150, -150], [60, -190], [180, -60]];

// Earthworks, before anything is placed (CAMPUSES.md "Terrain": flatten first). The lidar ground already has the real
// shape of the streets, car parks and yards; only the pads that are dead level in reality (or that the hand-built
// pieces need level) are flattened, each to the height the ground really has there.
function sitework(ctx) {
  const T = ctx.terrain; if (!T) return;
  const R = (cx, cz, w, d) => ({ rect: { cx, cz, w, d, angle: ANG } }); const G = (a, b) => gp(0, 0, a, b);
  const mean = (shape) => T.footprint(shape).mean;
  const porch = gp(-18.0, -45.3, 0, 12.5); const porchY = mean(R(porch[0], porch[1], 16, 3));
  // Foster Hall's terrace: the house, its porch and the steps down to the circle (level of the ground at the porch)
  { const c = gp(-18.0, -45.3, 0, 2.6); ctx.flatten(R(c[0], c[1], 27, 29), { y: porchY, blend: 5 }); }
  // the spectator terrace between Thacher Hall and the pitch: one metre above the turf, as the real steps are
  { const c = G(21.9, -13.5); ctx.flatten(R(c[0], c[1], 11.2, 36), { y: 1.0, blend: 3 }); }
  // Championship Field: dead level (y = 0 by definition).
  // The level pad reaches 4.2 m past the turf: one lattice cell behind the face of the retaining block (2 m out), so no
  // terrain triangle can rise through the wall face; the 2.3 m blend lies wholly inside the 4.7 m deep block (grounds.js).
  ctx.flatten({ outline: turfWorld(4.2) }, { y: 0, blend: 2.3 });
  // Library / Leadership Center courtyard: a paved terrace falling gently with the site (plane through its ends)
  { const n = gp(7.7, 60.5, 0, -16), s2 = gp(7.7, 60.5, 0, 16); const yn = mean(R(n[0], n[1], 8, 3)), ys = mean(R(s2[0], s2[1], 8, 3)); const d = [s2[0] - n[0], s2[1] - n[1]], L2 = d[0] * d[0] + d[1] * d[1];
    ctx.flatten(R(7.7, 60.5, 10.6, 36.4), { y: (x, z) => yn + (ys - yn) * Math.max(-0.1, Math.min(1.1, ((x - n[0]) * d[0] + (z - n[1]) * d[1]) / L2)), blend: 1.5 }); }
  // aquatic centre: pool, deck and pool house on one level
  const poolPad = R(...gp(53.1, 75.6, 0.7, -2.8), 37.6, 45.0);   // the deck, from the pool house's deck front to the 5th Ave wall
  // the car park north of the gyms was graded level with the Athletic Center after the lidar flight (the 3D tiles show
  // a flat lot there; the DEM still has the old 15 % hillside): cut it into the hill at the gym's floor level
  { const lot = ctx.data.areas.find((q) => q.id === 652917772); if (lot) ctx.flatten({ outline: lot.outer[0] }, { y: 11.0, blend: 3.5 }); }
  // picnic plaza between the Science Center, the gyms and Foster Hall: level pads under the tables
  for (const [x, z] of [[2, -76], [8, -79.5], [-2, -82], [14, -74]]) ctx.flatten({ circle: { x, z, r: 2.4 } }, { blend: 2.5 });
  // ---- Streets (MAP_NOTES "grade streets first"): after the campus pads, before any building pad. Every OSM street gets
  // a smooth profile, a crowned carriageway, a kerb and parallel sidewalks; the building pads below may not move them
  // (streets.restore() at the end), so a pad that differs from its sidewalk steps inside the lot.
  const zoneShapes = [R(...G(21.9, -13.5), 11.2, 36), R(7.7, 60.5, 10.6, 36.4), poolPad, { outline: turfWorld(4.2) }].map((sh) => shapeSDF(sh).sd);
  const zones = zoneShapes.map((sd) => (x, z) => sd(x, z) <= 0);
  const streets = gradeStreets(ctx, ctx.data.roads.filter((r) => STREET_W[r.tags.highway] && r.line.length >= 2).map((r) => { const sw = r.tags.sidewalk; const none = sw === 'no' || sw === 'none';
    return { id: r.id, name: r.tags.name, line: r.line, width: STREET_W[r.tags.highway], left: none || sw === 'right' ? 0 : SIDEWALK_W, right: none || sw === 'left' ? 0 : SIDEWALK_W }; }), { hillside: { width: 8.5, shoulder: 2.5 } /* the hill lanes keep their width: cars park at the same kerb line */, hard: [zones[3]] /* the field pad, to the face of its retaining block */, protect: [...zones, ((sd) => (x, z) => sd(x, z) <= 0)(shapeSDF({ outline: turfWorld(12) }).sd)] });   // (the field's retaining block stands 2..6.7 m outside the turf)
  if (streets) streets.apply();
  // aquatic centre: pool, deck and pool house on one level, at the level of the 5th Ave sidewalk it fronts (the Library's
  // lowest floor opens onto it at that level too). Mission Ave is ~1.8 m higher: the pool house stands in that step
  // (planned like every other building: street floor on Mission, a storey taller toward the deck)
  if (streets) { let n = 0, sum = 0; for (const sg of [1]) for (let a = -15; a <= 15.01; a += 5) for (let k = 0; k <= 14; k++) { const p = gp(53.1, 75.6, 0.7 + a, 19.7 + k); const d = streets.design(p[0], p[1]); if (d && d.zone === 'walk') { n++; sum += d.y; break; } }
    ctx.poolY = n ? sum / n : mean(R(...gp(53.1, 75.6, 0.7, 0), 34, 46)); ctx.flatten(poolPad, { y: ctx.poolY, blend: 4 }); }
  // ---- Seat every building (MAP_NOTES "seat every building on a pad"), AFTER the designed campus pads above: the walls
  // are planned on the ground as designed, each wall piece gets its own level strip (they win at the walls), a wall that
  // faces a designed pad takes that pad as its floor, and last the ground inside every footprint is cut to its floor.
  const sw = schoolWalls(ctx);
  const rings = [...sw.map((w) => w[1]), ...ctx.data.buildings.filter((b) => ctx.gen.buildings[String(b.id)]?.play && b.outer[0].length >= 3).map((b) => b.outer[0])];
  for (const [name, ring, top, style, lv] of sw) planWalls(ctx, ring, lv === 'porch' ? porchY + 8.8 : top, style, { name, others: rings, zones, level: lv === 'porch' ? porchY : undefined });
  planTown(ctx, rings, zones);   // houses (fill / cut terraces, door aprons), shops and blocks
  applyPads(ctx);
  ctx.flatten({ circle: { x: 39.3, z: 48.6, r: 2.0 } }, { blend: 1.5 });   // a level landing at the pool house's west door (it stands in the step between Mission Ave and the deck)
  seatInteriors(ctx);
  // a sliver between three buildings off 4th St (their OSM outlines do not quite touch): level ground there (laid last, over the wall pads), so it is an ordinary dead corner and not a hollow in a slope
  ctx.flatten({ circle: { x: 85.5, z: 168, r: 9.5 } }, { blend: 2.5 });
  if (streets) { const bx = (ctx.allRings || rings).map((r) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [r, x0, z0, x1, z1]; }); streets.solid.push((x, z) => bx.some((b) => x >= b[1] && x <= b[3] && z >= b[2] && z <= b[4] && pointInRing(x, z, b[0]))); 
    // (no pad survives in the shoulder either: a wall that stands there takes the street's level as its floor, kit.js streetSide)
    streets.restore(); }
  // ---- Designed steps and terraces, after the streets are back on their design (none of them touches a roadway or sidewalk):
  // the alley between the Library and the pool house falls 2 m from Mission Ave to the deck: a flight of stairs wall to
  // wall instead of an asphalt chute. The ground under the flight is cut just below the line of the steps (school.js builds them).
  { const st = POOL_STAIR, am = (st.a0 + st.a1) / 2; let topY = -Infinity; for (let a = st.a0 + 0.3; a <= st.a1 - 0.29; a += 0.4) for (const b of [st.bTop - 1.0, st.bTop - 0.5, st.bTop]) topY = Math.max(topY, T.heightAt(...G(a, b)));
    const botY = ctx.poolY ?? T.heightAt(...G(am, st.bTop + 6)); const n = Math.max(2, Math.round((topY - botY) / 0.165)), riser = (topY - botY) / n, run = (n - 1) * st.tread;
    ctx.poolStair = { topY, botY, n, riser, run };
    ctx.flatten({ rect: { cx: G(am, st.bTop + run / 2)[0], cz: G(am, st.bTop + run / 2)[1], w: st.a1 - st.a0 + 0.4, d: run + 0.8, angle: ANG } }, { blend: 0.5, y: (x, z) => { const b = -x * UZ + z * UX; return Math.min(T.heightAt(x, z), Math.max(botY, topY - (b - st.bTop) / st.tread * riser) - 0.18); } }); }
  // (2) Mission Ave runs 2.5 m below the pitch along its south side, and the field pad (a `hard` zone) kept its bank on the
  // designed sidewalk there. The walk gets its designed level back (cut only); the bank moves under the hedge at the fence.
  if (streets) { const c = G(78, 20.4); ctx.flatten({ rect: { cx: c[0], cz: c[1], w: 98, d: 4.4, angle: ANG } }, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z); const b = -x * UZ + z * UX; if (b < 18.0) return h; const d = streets.design(x, z); if (!d || d.zone !== 'walk') return h; return h > d.y || b >= 19.7 ? d.y : h; } }); }   // (cut from 18.0: a lattice cell south of the turf edge, the most the 2 m lattice allows; at the east end, where the street is ABOVE the pitch, the walk is raised to its design from 19.7 on: 2.1 m behind the face of the field wall's block, which covers the ramp)
  if (streets) {
    // everything respects the designed section: the ground texture is painted from it (asphalt on the carriageways,
    // concrete on the sidewalks, whatever the satellite classes say under tree crowns), and every tree the canopy
    // scan put on a carriageway (or within 0.6 m of one) moves behind the sidewalk on its side, or goes
    // (and the strip between the Cottage Ave sidewalk and the Leadership Center's sunk west wall is a lawn bank, not the car park the photo's shadow reads as)
    const lawn = shapeSDF(R(...gp(-12.4, 61.0, -8.0, 0), 5.4, 51.6)).sd;
    if (ctx.paintSurface) ctx.paintSurface((x, z) => streets.surface(x, z) || (lawn(x, z) <= 0 ? 'grass' : null));
    const solid = streets.solid[0] || (() => false); const out = [];
    for (const t of ctx.gen.trees || []) { const p = streets.toVerge(t[0], t[1], 1.0); if (!p) { out.push(t); continue; } if (streets.inRoad(p[0], p[1], 1.0) || solid(p[0], p[1]) || out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3)) continue; out.push([p[0], p[1], ...t.slice(2)]); }
    // (and a tree deep inside a car park: asphalt 2.5 m all round it)
    ctx.gen.trees = out.filter((t) => !(ctx.surfaceAt(t[0], t[1]) === 'asphalt' && [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]].every(([dx, dz]) => ctx.surfaceAt(t[0] + dx, t[1] + dz) === 'asphalt')));
  }
  planCheeks(ctx);
}

export function build(ctx, progress = () => {}) {
  addMaterials(ctx);
  terrainSampler(ctx.gen);   // installs the backdrop grid (descriptor terrain.outside reads it beyond the satellite rectangle)
  sitework(ctx);
  // spots that must stay free of parked cars: flag bases, practice helicopter, hidden-heli pads, and the open spots the
  // car layout was first laid out around (CAR_FREE: kept as they were, so no parked car changes place when the
  // helicopter list is edited)
  const c = ctx.campus || {};
  ctx.keepClear = [[...(c.ctf?.red || [0, 0]), 9], [...(c.ctf?.blue || [0, 0]), 9], ...(c.practiceHeli ? [[c.practiceHeli.x, c.practiceHeli.z, 11]] : []), ...CAR_FREE.map((p) => [p[0], p[1], 10]), [78, 49, 6] /* the step beside the pool house */, ...(ctx.extraClear || []), ...(c.heliPark || []).filter((p) => p[1] < 0.5).map((p) => [p[0], p[2], 10])];
  progress(0.48, 'Building Marin Academy');
  buildPadWalls(ctx);   // retaining blocks where a building pad is cut deep into the hill
  goreWalls(ctx);       // ...and between two carriageways at different heights (a fork on the hill)
  ctx.buildNotes = { gores: ctx.goreWallStats, poolStair: ctx.poolStair };
  buildSchool(ctx);
  progress(0.58, 'Building San Rafael');
  buildTown(ctx);
  // hidden-helicopter pads on the big flat roofs in town (validated against collision by the shared pipeline: most are
  // rejected for roof units or parapets inside the rotor disc; the campus roofs that work are listed in campus.js)
  const roofs = [];
  for (const f of ctx.flatRoofs || []) { if (f.area < 520) continue; const o = minAreaOBB(f.ring); const u = (o.u0 + o.u1) / 2, v = (o.v0 + o.v1) / 2; roofs.push([u * o.tx - v * o.tz, f.roofY, u * o.tz + v * o.tx]); }
  ctx.campus = { ...c, heliPark: [...(c.heliPark || []), ...roofs] };
  progress(0.68, 'Laying out the field and grounds');
  buildGrounds(ctx);
  // planting beds the facade kit lays against a wall stand at that wall's base: on a slope the bed is on the ground
  // a metre out, which can be lower (a floating hedge, and taller than eye height from below)
  if (ctx.terrain) for (const sh of ctx.shrubs) if (sh[4] === 0.85) sh[1] = Math.min(sh[1], ctx.groundY(sh[0], sh[2]) + 0.05);
  buildTerrain(ctx);     // hills outside the play area (visual backdrop)
  addCampusWater(ctx);   // the aquatic centre pool (descriptor `water`)
}
