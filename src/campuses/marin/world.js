// Marin Academy builder (San Rafael, CA): the school's buildings, the surrounding blocks, Championship Field, the pool,
// the circle drive, car parks and street furniture. See CAMPUSES.md for the contract and tools/ for the data pipeline.
import { addMaterials, minAreaOBB, gp, ANG } from './kit.js';
import { buildSchool } from './school.js';
import { buildTown } from './town.js';
import { buildGrounds, turfWorld } from './grounds.js';
import { addCampusWater } from '../../world/water.js';
import { buildTerrain, terrainSampler } from './terrain.js';

const CAR_FREE = [[108, -30], [62, -22], [76, -74], [12, -140], [-86, -44], [-20, -5], [84, 58], [-141, 131], [-30, 150], [-10, 180], [128, 172], [70, 150],
  [150, 62], [-160, 160], [100, 258], [-48, 240], [-196, 0], [196, 44], [13, 92], [-110, 96], [170, 110], [-150, -150], [60, -190], [180, -60]];

// Earthworks, before anything is placed (CAMPUSES.md "Terrain": flatten first). The lidar ground already has the real
// shape of the streets, car parks and yards; only the pads that are dead level in reality (or that the hand-built
// pieces need level) are flattened, each to the height the ground really has there.
function sitework(ctx) {
  const T = ctx.terrain; if (!T) return;
  const R = (cx, cz, w, d) => ({ rect: { cx, cz, w, d, angle: ANG } }); const G = (a, b) => gp(0, 0, a, b);
  const mean = (shape) => T.footprint(shape).mean;
  // Foster Hall's terrace: the house, its porch and the steps down to the circle (level of the ground at the porch)
  { const c = gp(-18.0, -45.3, 0, 2.6), f = gp(-18.0, -45.3, 0, 12.5); ctx.flatten(R(c[0], c[1], 27, 29), { y: mean(R(f[0], f[1], 16, 3)), blend: 5 }); }
  // the spectator terrace between Thacher Hall and the pitch: one metre above the turf, as the real steps are
  { const c = G(21.9, -13.5); ctx.flatten(R(c[0], c[1], 11.2, 36), { y: 1.0, blend: 3 }); }
  // Championship Field: dead level (y = 0 by definition). The 2.3 m blend lies under the retaining wall (grounds.js).
  ctx.flatten({ outline: turfWorld(2.0) }, { y: 0, blend: 2.3 });
  // Library / Leadership Center courtyard: a paved terrace falling gently with the site (plane through its ends)
  { const n = gp(7.7, 60.5, 0, -16), s2 = gp(7.7, 60.5, 0, 16); const yn = mean(R(n[0], n[1], 8, 3)), ys = mean(R(s2[0], s2[1], 8, 3)); const d = [s2[0] - n[0], s2[1] - n[1]], L2 = d[0] * d[0] + d[1] * d[1];
    ctx.flatten(R(7.7, 60.5, 10.6, 36.4), { y: (x, z) => yn + (ys - yn) * Math.max(-0.1, Math.min(1.1, ((x - n[0]) * d[0] + (z - n[1]) * d[1]) / L2)), blend: 1.5 }); }
  // aquatic centre: pool, deck and pool house on one level
  { const c = gp(53.1, 75.6, 0.7, -5.2); const y = mean(R(...gp(53.1, 75.6, 0.7, 0), 34, 46)); ctx.flatten(R(c[0], c[1], 37.6, 60.6), { y, blend: 3 }); }
  // the car park north of the gyms was graded level with the Athletic Center after the lidar flight (the 3D tiles show
  // a flat lot there; the DEM still has the old 15 % hillside): cut it into the hill at the gym's floor level
  { const lot = ctx.data.areas.find((q) => q.id === 652917772); if (lot) ctx.flatten({ outline: lot.outer[0] }, { y: 11.0, blend: 3.5 }); }
  // picnic plaza between the Science Center, the gyms and Foster Hall: level pads under the tables
  for (const [x, z] of [[2, -76], [8, -79.5], [-2, -82], [14, -74]]) ctx.flatten({ circle: { x, z, r: 2.4 } }, { blend: 2.5 });
  // a sliver between three buildings off 4th St (their OSM outlines do not quite touch): level ground there, so it is an ordinary dead corner and not a hollow in a slope
  ctx.flatten({ circle: { x: 85.5, z: 168, r: 9.5 } }, { blend: 2.5 });
  // the service building above the gyms is cut into the hill: pad at its floor
  { const b = ctx.data.buildings.find((q) => q.id === 652917784); if (b) ctx.flatten({ outline: b.outer[0] }, { y: 15.2, blend: 3 }); }
}

export function build(ctx, progress = () => {}) {
  addMaterials(ctx);
  terrainSampler(ctx.gen);   // installs the backdrop grid (descriptor terrain.outside reads it beyond the satellite rectangle)
  sitework(ctx);
  // spots that must stay free of parked cars: flag bases, practice helicopter, hidden-heli pads, and the open spots the
  // car layout was first laid out around (CAR_FREE: kept as they were, so no parked car changes place when the
  // helicopter list is edited)
  const c = ctx.campus || {};
  ctx.keepClear = [[...(c.ctf?.red || [0, 0]), 9], [...(c.ctf?.blue || [0, 0]), 9], ...(c.practiceHeli ? [[c.practiceHeli.x, c.practiceHeli.z, 11]] : []), ...CAR_FREE.map((p) => [p[0], p[1], 10]), ...(c.heliPark || []).filter((p) => p[1] < 0.5).map((p) => [p[0], p[2], 10])];
  progress(0.48, 'Building Marin Academy');
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
