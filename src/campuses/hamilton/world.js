// Alexander Hamilton High School builder (Los Angeles): the school's buildings, the surrounding Castle Heights blocks,
// Al Michaels Field, the car parks, Robertson Blvd and the backdrop. See CAMPUSES.md for the contract, MAP_NOTES.md
// for the lessons applied here and tools/ for the data pipeline.
import { addMaterials, minAreaOBB, pointInRing } from './kit.js';
import { buildSchool } from './school.js';
import { buildTown } from './town.js';
import { buildGrounds } from './grounds.js';
import { buildBackdrop } from './backdrop.js';

export function build(ctx, progress = () => {}) {
  addMaterials(ctx);
  // spots that must stay free of parked cars and clutter: flag bases, practice helicopter, hidden-heli pads
  const c = ctx.campus || {};
  ctx.keepClear = [[...(c.ctf?.red || [0, 0]), 9], [...(c.ctf?.blue || [0, 0]), 9], ...(c.practiceHeli ? [[c.practiceHeli.x, c.practiceHeli.z, 11]] : []), ...(c.heliPark || []).filter((p) => p[1] < 0.5).map((p) => [p[0], p[2], 11.6])];
  progress(0.48, 'Building Hamilton High');
  buildSchool(ctx);
  progress(0.58, 'Building Castle Heights');
  buildTown(ctx);
  // hidden-helicopter pads on the big flat roofs: hand-picked school decks + the middle of the larger apartment roofs
  // (validated against collision by the shared pipeline: rotor clearance, deck under the skids)
  const roofs = (ctx.roofSpots || []).map(([x, z, y]) => [x, y, z]);
  for (const f of ctx.flatRoofs || []) { if (f.school || f.area < 560) continue; const o = minAreaOBB(f.ring); const u = (o.u0 + o.u1) / 2, v = (o.v0 + o.v1) / 2; const x = u * o.tx - v * o.tz, z = u * o.tz + v * o.tx; if (pointInRing(x, z, f.ring)) roofs.push([x, f.roofY, z]); }
  ctx.campus = { ...c, heliPark: [...(c.heliPark || []), ...roofs] };
  progress(0.68, 'Laying out the field and grounds');
  buildGrounds(ctx);
  buildBackdrop(ctx);
}
