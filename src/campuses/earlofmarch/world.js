// Earl of March Secondary School builder (Kanata, Ottawa): the school and its portables, the Mlacak Centre and the
// library, the track, the car parks, The Parkway, and the real buildings beyond the fence as context. See CAMPUSES.md
// for the contract, MAP_NOTES.md for the rules (earthworks order below) and tools/ for the data pipeline.
import { shapeSDF } from '../../world/terrain.js';
import { gradeStreets } from '../../world/streets.js';
import { pointInRing } from '../../world/util.js';
import { offsetRing } from './lib.js';
import { addMaterials, PLAY_EDGE, isStreet, STREET_W, centroid, lineDist } from './kit.js';
import { buildSchool, buildPortables, schoolRing, FLOOR } from './school.js';
import { buildCivic, civicPads } from './civic.js';
import { buildTown, townPads } from './town.js';
import { buildGrounds, groundPads, KEEP_OPEN } from './grounds.js';
import { buildTerrain, terrainSampler } from './terrain.js';

// Earthworks, in the fixed order of the rulebook (B7), all before anything is placed:
//   1 campus pads -> 2 graded streets -> 3 building pads + interiors -> 4 streets.restore() -> (5 no cheek walls: the
//   built site is level) -> 6 trees and props off the street design -> 7 paintSurface
function sitework(ctx) {
  const T = ctx.terrain; if (!T) return;
  // ---- 1. campus pads: the track and its infield, the courts, the level forecourts (grounds.js)
  groundPads(ctx);
  // ---- 2. streets: The Parkway inside the fence; Campeau Drive and Teron Road just outside it (seen through it).
  // Kanata collectors: a crowned carriageway between concrete kerbs, no sidewalk at the kerb (the walks are separate
  // asphalt paths set back in the grass: OSM footways, drawn by the ground classes).
  const sRoads = ctx.data.roads.filter((r) => isStreet(r) && r.line.length >= 2 && r.line.some((p) => Math.abs(p[0]) < 420 && Math.abs(p[1]) < 400));
  const streets = gradeStreets(ctx, sRoads.map((r) => ({ id: r.id, name: r.tags.name, line: r.line, width: r.tags.highway === 'secondary' && (r.tags.lanes === '3' || r.tags.lanes === '4') ? 17 : STREET_W[r.tags.highway], left: 0, right: 0 })),
    { kerb: 0.13, shoulder: 1.5, blend: 5, hillside: false });
  if (streets) streets.apply();
  // ---- 3. buildings: the school stands on ONE level floor (the lidar ground 2 m outside its walls is -0.18 .. +0.13);
  // the pad reaches 3 m past the walls, so every door has its level apron (rule B8), and blends out over 4 m.
  ctx.flatten({ outline: offsetRing(schoolRing(), 3.0) }, { y: FLOOR - 0.02, blend: 4 });
  // each portable on its own level spot at the highest ground under it (cut, never fill: a few centimetres here)
  for (const b of ctx.data.buildings) { if (b.tags.building !== 'portable_classroom') continue; const ring = b.outer[0]; const y = Math.max(...ring.map((p) => T.heightAt(p[0], p[1]))); ctx.flatten({ outline: offsetRing(ring, 1.6) }, { y, blend: 2.5 }); }
  civicPads(ctx);
  townPads(ctx);
  // ---- 4. the streets take their design back
  if (streets) { const rings = ctx.data.buildings.filter((b) => ctx.gen.buildings[String(b.id)] && b.outer[0].length >= 3).map((b) => { const r = b.outer[0]; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [r, x0, z0, x1, z1]; });
    streets.solid.push((x, z) => rings.some((b) => x >= b[1] && x <= b[3] && z >= b[2] && z <= b[4] && pointInRing(x, z, b[0])));
    streets.restore(); }
  // ---- 6 + 7. surface classes from the design, trees off the carriageways and off everything that is open ground
  if (streets && ctx.paintSurface) ctx.paintSurface((x, z) => streets.surface(x, z));
  const keep = KEEP_OPEN(ctx); const heli = (ctx.campus.heliPark || []).filter((p) => p[1] < 0.5);
  const bl = ctx.data.buildings.map((b) => b.outer[0]);
  const out = [];
  // (fix round 1) natural woods: the canopy-fill trunks (the last 675 of gen.trees: one per 3.6 m cell of closed canopy the crown tops left uncovered)
  // stood in orchard rows of one species and size. Each is moved off its cell (up to 2.3 m), takes its own size (0.7-1.25 of the canopy height: under-
  // storey to emergent), and a quarter of them are the white pines and spruces of the Beaverbrook woods (Street View: conifers through the maple / birch);
  // the measured crown tops keep their place and height. Deterministic (a hash of the cell), so every client builds the same wood.
  const all = ctx.gen.trees || []; const FILL0 = Math.max(0, all.length - 675); const hash = (a, b, k) => { const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
  for (let ti = 0; ti < all.length; ti++) {
    let t = all[ti];
    if (ti >= FILL0) { const r1 = hash(t[0], t[1], 1), r2 = hash(t[0], t[1], 2), r3 = hash(t[0], t[1], 3), r4 = hash(t[0], t[1], 4); const a = r1 * Math.PI * 2, d = 0.5 + r2 * 1.8;
      const con = r4 < 0.26; t = [t[0] + Math.cos(a) * d, t[1] + Math.sin(a) * d, con ? 1 : 0, Math.max(0.42, Math.min(2.1, t[3] * (0.7 + 0.55 * r3) * (con ? 1.07 : 1)))]; }
    let p = [t[0], t[1]];
    if (streets) { const v = streets.toVerge(t[0], t[1], 1.2); if (v) { if (streets.inRoad(v[0], v[1], 1.0)) continue; p = v; } }
    if (keep(p[0], p[1], t)) continue;
    if (heli.some((h) => Math.hypot(p[0] - h[0], p[1] - h[2]) < 11.6)) continue;
    if (bl.some((r) => pointInRing(p[0], p[1], r) || pointInRing(p[0] + 1.6, p[1], r) || pointInRing(p[0] - 1.6, p[1], r) || pointInRing(p[0], p[1] + 1.6, r) || pointInRing(p[0], p[1] - 1.6, r))) continue;
    { const dm = ti >= FILL0 ? 1.8 + 1.5 * hash(t[0], t[1], 5) : 3; if (out.some((q) => Math.abs(q[0] - p[0]) < dm && Math.abs(q[1] - p[1]) < dm && Math.hypot(q[0] - p[0], q[1] - p[1]) < dm)) continue; }   // (uneven spacing: clumps and gaps)
    out.push([p[0], p[1], ...t.slice(2)]);
  }
  ctx.gen.trees = out;
}

export function build(ctx, progress = () => {}) {
  addMaterials(ctx);
  terrainSampler(ctx.gen);   // installs the backdrop grid (descriptor terrain.outside reads it beyond the satellite rectangle)
  ctx.playEdge = PLAY_EDGE.map((p) => [p[0], p[1]]);   // (rule F48) the clamp is the fence line; grounds.js lays the fence on the same ring
  sitework(ctx);
  const c = ctx.campus || {};
  ctx.keepClear = [[...(c.ctf?.red || [0, 0]), 9], [...(c.ctf?.blue || [0, 0]), 9], ...(c.practiceHeli ? [[c.practiceHeli.x, c.practiceHeli.z, 11]] : []), ...(c.heliPark || []).filter((p) => p[1] < 0.5).map((p) => [p[0], p[2], 10])];
  progress(0.5, 'Building Earl of March');
  buildSchool(ctx); buildPortables(ctx);
  progress(0.58, 'Building the Mlacak Centre');
  buildCivic(ctx);
  progress(0.62, 'Building Beaverbrook');
  buildTown(ctx);
  // Hidden-helicopter candidates (rule D20: from a scan, never by eye): the descriptor lists the spots a scan accepted (parked
  // cars and trees keep clear of those); a short list is topped up with every level 5 m cell clear of streets and buildings.
  let scan = [];
  if (ctx.terrain) { const T = ctx.terrain; const rank = { asphalt: 0, rubber: 1, concrete: 2, grass: 3 }; const pb = ctx.playBounds;
    for (let z = pb.minZ + 12; z <= pb.maxZ - 12; z += 5) for (let x = pb.minX + 12; x <= pb.maxX - 12; x += 5) { if (!pointInRing(x, z, PLAY_EDGE) || lineDist(x, z, [...PLAY_EDGE, PLAY_EDGE[0]]) < 12) continue; const s = ctx.surfaceAt(x, z); if (rank[s] === undefined) continue; if (ctx.streets && ctx.streets.inRoad(x, z, 5)) continue; if (T.maxIn(x, z, 2.6) - T.minIn(x, z, 2.6) > 0.26) continue; if ((ctx.buildingRings || []).some((r) => pointInRing(x, z, r))) continue; scan.push([x, 0, z, rank[s]]); }
    scan.sort((p, q) => p[3] - q[3]); scan = scan.map((p) => [p[0], 0, p[2]]); }
  ctx.campus = { ...c, heliPark: [...(c.heliPark || []), ...((c.heliPark || []).length >= 12 ? [] : scan)] };
  progress(0.68, 'Laying out the grounds');
  buildGrounds(ctx);
  buildTerrain(ctx);     // the land beyond the satellite photo (visual backdrop)
  ctx.buildNotes = { doors: ctx.doors, stairs: ctx.stairNotes, lots: ctx.lots, cars: ctx.carCount, stalls: ctx.stallCount };
  void shapeSDF; void centroid;
}
