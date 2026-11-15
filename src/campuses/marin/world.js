// Marin Academy builder (San Rafael, CA): the school's buildings, the surrounding blocks, Championship Field, the pool,
// the circle drive, car parks and street furniture. See CAMPUSES.md for the contract and tools/ for the data pipeline.
import { addMaterials, minAreaOBB } from './kit.js';
import { buildSchool } from './school.js';
import { buildTown } from './town.js';
import { buildGrounds } from './grounds.js';
import { addCampusWater } from '../../world/water.js';
import { buildTerrain } from './terrain.js';

const CAR_FREE = [[108, -30], [62, -22], [76, -74], [12, -140], [-86, -44], [-20, -5], [84, 58], [-141, 131], [-30, 150], [-10, 180], [128, 172], [70, 150],
  [150, 62], [-160, 160], [100, 258], [-48, 240], [-196, 0], [196, 44], [13, 92], [-110, 96], [170, 110], [-150, -150], [60, -190], [180, -60]];

export function build(ctx, progress = () => {}) {
  addMaterials(ctx);
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
  buildTerrain(ctx);     // hills outside the play area (visual backdrop)
  addCampusWater(ctx);   // the aquatic centre pool (descriptor `water`)
}
