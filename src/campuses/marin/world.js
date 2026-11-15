// Marin Academy builder (San Rafael, CA): the school's buildings, the surrounding blocks, Championship Field, the pool,
// the circle drive, car parks and street furniture. See CAMPUSES.md for the contract and tools/ for the data pipeline.
import { addMaterials, minAreaOBB } from './kit.js';
import { buildSchool } from './school.js';
import { buildTown } from './town.js';
import { buildGrounds } from './grounds.js';
import { addCampusWater } from '../../world/water.js';

export function build(ctx, progress = () => {}) {
  addMaterials(ctx);
  // spots that must stay free of parked cars: flag bases, practice helicopter, hidden-heli pads
  const c = ctx.campus || {};
  ctx.keepClear = [[...(c.ctf?.red || [0, 0]), 9], [...(c.ctf?.blue || [0, 0]), 9], ...(c.practiceHeli ? [[c.practiceHeli.x, c.practiceHeli.z, 11]] : []), ...(c.heliPark || []).filter((p) => p[1] < 0.5).map((p) => [p[0], p[2], 10])];
  progress(0.48, 'Building Marin Academy');
  buildSchool(ctx);
  progress(0.58, 'Building San Rafael');
  buildTown(ctx);
  // hidden-helicopter pads on the big flat roofs (validated against collision by the shared pipeline)
  const roofs = [[-54, 9.6, 68], [-77, 8.2, 52], [-49, 6.2, 36], [47, 4.2, -143], [-92, 5.2, -14]];
  for (const f of ctx.flatRoofs || []) { if (f.area < 520) continue; const o = minAreaOBB(f.ring); const u = (o.u0 + o.u1) / 2, v = (o.v0 + o.v1) / 2; roofs.push([u * o.tx - v * o.tz, f.roofY, u * o.tz + v * o.tx]); }
  ctx.campus = { ...c, heliPark: [...(c.heliPark || []), ...roofs] };
  progress(0.68, 'Laying out the field and grounds');
  buildGrounds(ctx);
  addCampusWater(ctx);   // the aquatic centre pool (descriptor `water`)
}
