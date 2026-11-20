// Marin Academy builder (San Rafael, CA): the school's buildings, the surrounding blocks, Championship Field, the pool,
// the circle drive, car parks and street furniture. See CAMPUSES.md for the contract and tools/ for the data pipeline.
import { addMaterials, minAreaOBB, gp, ANG, UX, UZ, planWalls, applyPads, planCheeks, buildPadWalls, seatInteriors, goreWalls } from './kit.js';
import { shapeSDF } from '../../world/terrain.js';
import { gradeStreets } from '../../world/streets.js';
import { pointInRing } from '../../world/util.js';
import { buildSchool, schoolWalls, POOL_STAIR, COURT_STAIR } from './school.js';
import { buildTown, planTown } from './town.js';
import { buildGrounds, turfWorld } from './grounds.js';
import { addCampusWater } from '../../world/water.js';
import { buildTerrain, terrainSampler } from './terrain.js';

// carriageway widths by OSM class (kerb to kerb, as grounds.js lays the kerb furniture) and the sidewalk width
const STREET_W = { primary: 15.0, secondary: 13.0, secondary_link: 8.0, tertiary: 11.5, residential: 8.5 }, SIDEWALK_W = 2.4;
const CAR_FREE = [[108, -30], [62, -22], [76, -74], [12, -140], [-86, -44], [-20, -5], [84, 58], [-141, 131], [-30, 150], [-10, 180], [128, 172], [70, 150],
  [150, 62], [-160, 160], [100, 258], [-48, 240], [-196, 0], [196, 44], [13, 92], [-110, 96], [170, 110], [-150, -150], [60, -190], [180, -60]];

// A sidewalk needs room. Where two carriageways run side by side at different heights (the Bonnie Brae / Bryn Mawr fork)
// the strip between their kerbs must hold both walks AND the bank between them (1 : 1.5); where it cannot, neither
// street has a walk on that side: the two walks were one 30 deg ramp from road to road. Such a road is split at its
// OSM vertices into pieces with their own left / right (the pieces share the vertex, so the profile runs through).
function walkRoom(T, pb, roads) {
  walkRoom.notes = [];
  const segsOf = (r) => r.line.slice(0, -1).map((a, i) => [a, r.line[i + 1]]);
  const near = (r, x, z) => { let best = null; for (const [a, b] of segsOf(r)) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz); if (!best || d < best.d) best = { d, qx, qz, tx: dx / Math.sqrt(L2), tz: dz / Math.sqrt(L2) }; } return best; };
  const out = [];
  for (const r of roads) {
    if (!r.left && !r.right) { out.push(r); continue; }
    const flags = segsOf(r).map(([a, b]) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const res = [];
      for (const side of [-1, 1]) { const sw = side > 0 ? r.right : r.left; let n = 0, bad = 0; if (sw) for (let u = 1; u < L; u += 2) { const x = a[0] + tx * u, z = a[1] + tz * u; if (x < pb.minX - 20 || x > pb.maxX + 20 || z < pb.minZ - 20 || z > pb.maxZ + 20) continue; n++;
          const qx = x - tz * side * (r.width / 2 + sw / 2), qz = z + tx * side * (r.width / 2 + sw / 2);
          for (const o of roads) { if (o === r || o.id === r.id) continue; const m = near(o, qx, qz); if (!m || m.d > 30 || Math.abs(m.tx * tx + m.tz * tz) < 0.6) continue;   /* side by side (a fork), not a crossing */
            if (((m.qx - x) * -tz + (m.qz - z) * tx) * side <= 0) continue;   /* the other road lies on this side */
            const D = Math.hypot(m.qx - x, m.qz - z), dh = Math.abs(T.heightAt(m.qx, m.qz) - T.heightAt(x, z)); if (dh > 0.8 && D - r.width / 2 - o.width / 2 - sw - SIDEWALK_W < dh * 1.5) { bad++; break; } } }
        res.push(n > 0 && bad / n > 0.5); }
      // (and a lane that climbs at more than 12 % has no sidewalks, like the benched hill lanes gradeStreets detects by cross-slope:
      // on the 2 m lattice a walk on such a grade kinks at every change of slope. Not checked against Street View.)
      { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (mx > pb.minX - 20 && mx < pb.maxX + 20 && mz > pb.minZ - 20 && mz < pb.maxZ + 20 && L > 4 && Math.abs(T.heightAt(b[0], b[1]) - T.heightAt(a[0], a[1])) / L > 0.12) res[0] = res[1] = true; }
      return res; });
    if (!flags.some((f) => f[0] || f[1])) { out.push(r); continue; }
    let k = 0, i0 = 0; for (let i = 1; i <= flags.length; i++) if (i === flags.length || flags[i][0] !== flags[i0][0] || flags[i][1] !== flags[i0][1]) { out.push({ ...r, id: r.id + ':' + k++, line: r.line.slice(i0, i + 1), left: flags[i0][0] ? 0 : r.left, right: flags[i0][1] ? 0 : r.right }); (walkRoom.notes = walkRoom.notes || []).push([r.name, r.id + ':' + (k - 1), r.line[i0].map(Math.round).join(','), r.line[i].map(Math.round).join(','), flags[i0].map(Number).join('')]); i0 = i; }
  }
  return out;
}

// Earthworks, before anything is placed (CAMPUSES.md "Terrain": flatten first). The lidar ground already has the real
// shape of the streets, car parks and yards; only the pads that are dead level in reality (or that the hand-built
// pieces need level) are flattened, each to the height the ground really has there.
function sitework(ctx) {
  const T = ctx.terrain; if (!T) return;
  const R = (cx, cz, w, d) => ({ rect: { cx, cz, w, d, angle: ANG } }); const G = (a, b) => gp(0, 0, a, b);
  let courtY = null;
  const FORECOURT = () => { const st = COURT_STAIR, b1 = 41.6; const b0 = st.bWalk + 2.0; /* a lattice cell behind the back of the walk, so the walk stays level over its whole width; on this lattice the ramp then ends at b = 37.7 (east) .. 39.0 (west): under the flight and its blocks */ return R(...G((st.gapA[0] + st.gapA[1]) / 2, (b0 + b1) / 2), st.gapA[1] - st.gapA[0], b1 - b0); };
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
    courtY = (x, z) => yn + (ys - yn) * Math.max(-0.1, Math.min(1.1, ((x - n[0]) * d[0] + (z - n[1]) * d[1]) / L2));
    ctx.flatten(R(7.7, 60.5, 10.6, 36.4), { y: courtY, blend: 1.5 });
    // ...and its forecourt: the same level carries on north between the two wings to the foot of the steps from Mission Ave
    // (the street is 1.6 m above the courtyard; the step is held by the flight and its blocks, school.js courtSteps)
    ctx.flatten(FORECOURT(), { y: courtY, blend: 0 }); }
  // aquatic centre: pool, deck and pool house on one level
  const poolPad = R(...gp(53.1, 75.6, 0.7, -2.8), 37.6, 45.0);   // the deck, from the pool house's deck front to the 5th Ave wall
  // (the car park north of the gyms needs no pad: on the correctly registered DEM it is a level lot at 11.4 m, 0.8 % fall.
  // The "15 % hillside regraded after the lidar flight" that used to be flattened here was the DEM stretched north-south.)
  // picnic plaza between the Science Center, the gyms and Foster Hall: level pads under the tables
  for (const [x, z] of [[2, -76], [8, -79.5], [-2, -82], [14, -74], [5.5, -72] /* the bike rack */]) ctx.flatten({ circle: { x, z, r: 2.4 } }, { blend: 2.5 });
  // ---- Streets (MAP_NOTES "grade streets first"): after the campus pads, before any building pad. Every OSM street gets
  // a smooth profile, a crowned carriageway, a kerb and parallel sidewalks; the building pads below may not move them
  // (streets.restore() at the end), so a pad that differs from its sidewalk steps inside the lot.
  const zoneShapes = [R(...G(21.9, -13.5), 11.2, 36), R(7.7, 60.5, 10.6, 36.4), poolPad, { outline: turfWorld(4.2) }, FORECOURT()].map((sh) => shapeSDF(sh).sd);
  const zones = zoneShapes.map((sd) => (x, z) => sd(x, z) <= 0);
  const streets = gradeStreets(ctx, walkRoom(T, ctx.playBounds, ctx.data.roads.filter((r) => STREET_W[r.tags.highway] && r.line.length >= 2).map((r) => { const sw = r.tags.sidewalk; const none = sw === 'no' || sw === 'none';
    return { id: r.id, name: r.tags.name, line: r.line, width: STREET_W[r.tags.highway], left: none || sw === 'right' ? 0 : SIDEWALK_W, right: none || sw === 'left' ? 0 : SIDEWALK_W }; })), { hillside: { width: 8.5, shoulder: 2.5 } /* the hill lanes keep their width: cars park at the same kerb line */, hard: [zones[3]] /* the field pad, to the face of its retaining block */, protect: [...zones, ((sd) => (x, z) => sd(x, z) <= 0)(shapeSDF({ outline: turfWorld(12) }).sd)] });   // (the field's retaining block stands 2..6.7 m outside the turf)
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
  if (courtY) { ctx.flatten(FORECOURT(), { y: courtY, blend: 0 });   // (the forecourt again, over the wall strips that wrap round the wings' north corners)
    // ...and the ground just INSIDE the east wing's courtyard wall at its north end, which stood at street level: the lattice
    // carried it through the wall, 0.6 m up the windows that face the forecourt
    const st = COURT_STAIR; ctx.flatten(R(...G(st.gapA[0] - 1.1, st.westB + 3.1), 2.2, 7.8),   /* (from 0.8 m north of the wall line: the node row just outside it, under the block's return) */ { blend: 0, y: (x, z) => Math.min(T.heightAt(x, z), courtY(x, z)) });
    // Founders Hall, south-east corner: the east wall's pad (0.6 m higher) wraps round the corner onto the south wall
    { const lv = T.heightAt(-78.5, 75.0); ctx.flatten({ circle: { x: -74.5, z: 76.4, r: 1.4 } }, { blend: 1.2, y: (x, z) => Math.min(T.heightAt(x, z), lv) }); } }
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
  // the flight from the Mission Ave walk down to the forecourt (school.js courtSteps): top = the walk's level behind its back
  // edge, foot = the forecourt; the ground under the flight is cut just below the line of the steps
  { const st = COURT_STAIR, am = (st.a0 + st.a1) / 2; let sum = 0, k = 0; for (const a of [st.a0, am, st.a1]) { const q = G(a, st.bWalk - 0.3); const d = streets && streets.design(q[0], q[1]); sum += d && d.zone === 'walk' ? d.y : T.heightAt(q[0], q[1]); k++; } const topY = sum / k;
    const botY = T.heightAt(...G(am, st.bBot + 1.2)); const n = Math.max(2, Math.min(Math.floor((st.bBot - st.bWalk - st.apron) / st.tread + 1e-6), Math.round((topY - botY) / 0.165))), riser = (topY - botY) / n, run = (n - 1) * st.tread, bTop = st.bBot - n * st.tread;
    if (topY - botY > 0.5 && riser <= 0.2) { ctx.courtStair = { topY, botY, n, riser, run, bTop };
      ctx.flatten({ rect: { cx: G(am, bTop + run / 2)[0], cz: G(am, bTop + run / 2)[1], w: st.a1 - st.a0 + 0.4, d: run + 0.8, angle: ANG } }, { blend: 0.5, y: (x, z) => { const b = -x * UZ + z * UX; if (b < bTop + st.tread) return T.heightAt(x, z); /* nothing is cut under the top tread: the walk behind it keeps its level */ return Math.min(T.heightAt(x, z), Math.max(botY, topY - (b - bTop) / st.tread * riser) - 0.18); } }); } }
  // (2) A graded street beside the pitch: the field pad (a `hard` zone) keeps its bank on the designed sidewalk. Mission Ave
  // runs 2.5 m BELOW the pitch along its south side, Bryn Mawr Drive 3-5 m ABOVE it along the east side. The walk gets its
  // designed level back: cut wherever it stands above the design; raised to it from 4.0 m outside the turf on (a full lattice cell behind
  // the face of the field wall's block, which covers the ramp); nothing nearer than a lattice cell (2 m) to the turf edge.
  if (streets) { const sdT = shapeSDF({ outline: turfWorld(0) }).sd; ctx.flatten({ outline: turfWorld(12) }, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z); const o = sdT(x, z); if (o < 2.0) return h; const d = streets.design(x, z);
      if (d && d.zone === 'walk') return h > d.y || o >= 4.0 ? d.y : h;
      // (a lattice node in the verge just inside a walk that stands ABOVE the pitch is raised with it: the walk is level over its
      // whole width and the ramp lies one cell nearer the pitch, under the block)
      if (o >= 4.3) { /* (never a node of the level pad itself, 4.2 m) */ const e = 0.5, gx = sdT(x + e, z) - sdT(x - e, z), gz = sdT(x, z + e) - sdT(x, z - e), l = Math.hypot(gx, gz) || 1; for (let k = 0.5; k <= 2.001; k += 0.5) { const q = streets.design(x + gx / l * k, z + gz / l * k); if (q && q.zone === 'walk') return Math.max(h, q.y); } }
      return h; } }); streets.resurvey(); }
  if (streets) {
    // everything respects the designed section: the ground texture is painted from it (asphalt on the carriageways,
    // concrete on the sidewalks, whatever the satellite classes say under tree crowns), and every tree the canopy
    // scan put on a carriageway (or within 0.6 m of one) moves behind the sidewalk on its side, or goes
    // (and the strip between the Cottage Ave sidewalk and the Leadership Center's sunk west wall is a lawn bank, not the car park the photo's shadow reads as)
    const lawn = shapeSDF(R(...gp(-12.4, 61.0, -8.0, 0), 5.4, 51.6)).sd;
    if (ctx.paintSurface) ctx.paintSurface((x, z) => streets.surface(x, z) || (lawn(x, z) <= 0 ? 'grass' : null));
    const solid = streets.solid[0] || (() => false); const out = [];
    for (const t of ctx.gen.trees || []) { const dz = streets.design(t[0], t[1]); const p = streets.toVerge(t[0], t[1], dz && dz.zone === 'walk' ? 3.2 : 1.0);   /* (a trunk on a sidewalk moves behind it too: several streets have walks now that had none on the stretched ground) */ if (!p) { out.push(t); continue; } if (streets.inRoad(p[0], p[1], 1.0) || solid(p[0], p[1]) || out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3)) continue; out.push([p[0], p[1], ...t.slice(2)]); }
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
  ctx.buildNotes = { walkRoom: walkRoom.notes, gores: ctx.goreWallStats, poolStair: ctx.poolStair, courtStair: ctx.courtStair, doors: ctx.buildNotes2 };
}
