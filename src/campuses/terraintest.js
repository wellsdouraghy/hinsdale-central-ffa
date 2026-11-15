// Terrain test campus (dev only, never listed in the campus picker): Hinsdale Central with procedural hills, to prove the
// generic terrain system (src/world/terrain.js) before a real campus adopts it. Open it with ?terrainTest=1 (game) or
// ?campus=terraintest (game, dev/mapcheck.html, dev/world.html); add &pit=1 for a deliberately broken variant with a
// steep-walled pit on the east hill (the map check's slope-pocket test must fail on it).
//
// The hills sit on Hinsdale's two biggest open areas (the practice turf west of the school, the east ball-field lawn),
// so Hinsdale's own buildings and props (all placed at y = 0) stay on flat ground. The extra builder step shows the
// builder API on a slope: a summit helipad flattened with ctx.flatten, a shed on a plinth (ctx.onGround + plinth),
// kit props that stand on the slope by themselves (propKit), trees planted on the hillside, a pond on a terrace.
import hinsdale from './hinsdale/campus.js';

const PIT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('pit');

// hill profiles: raised cosine (smooth, zero slope at the rim); max slope = h * pi / (2 r)
const bump = (x, z, cx, cz, r, h) => { const d = Math.hypot(x - cx, z - cz); return d >= r ? 0 : h * 0.5 * (1 + Math.cos(Math.PI * d / r)); };
const ridge = (x, z, ax, az, bx, bz, r, h) => {   // a ridge along a segment
  const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L));
  const d = Math.hypot(x - ax - ex * t, z - az - ez * t); return d >= r ? 0 : h * 0.5 * (1 + Math.cos(Math.PI * d / r));
};
export const HILLS = {
  west: { x: -58, z: 38, r: 27, h: 9 },     // practice turf: 9 m dome (max ~28 deg)
  east: { x: 236, z: 92, r: 22, h: 4 },     // east lawn: gentle 4 m mound (~16 deg)
};
function height(x, z) {
  const W = HILLS.west, E = HILLS.east;
  let y = bump(x, z, W.x, W.z, W.r, W.h) + bump(x, z, E.x, E.z, E.r, E.h);
  // a steep spur on the west hill's south-west flank: steeper than the 45 deg walk limit (nav blocks it, players slide off)
  y += ridge(x, z, -66, 47, -71, 54, 4.5, 4.2);
  if (PIT) y -= bump(x, z, E.x, E.z, 4.5, 7);   // pit on the east summit: walls up to ~65 deg, 3 m below the lawn
  return y;
}

let baseBuild = null, propKit = null, addWater = null;   // loaded with the world (keeps the start-up bundle unchanged)
function build(ctx, progress) {
  const W = HILLS.west, E = HILLS.east;
  // flatten first, then place things on the final ground
  ctx.flatten({ circle: { x: W.x, z: W.z, r: 7.5 } }, { blend: 4 });                 // summit helipad
  const pond = [[E.x - 11, E.z + 7], [E.x - 5, E.z + 9], [E.x - 3, E.z + 14], [E.x - 9, E.z + 16], [E.x - 13, E.z + 12]];
  ctx.flatten({ outline: pond }, { blend: 3 });                                         // a terrace on the east mound
  ctx.campus = { ...ctx.campus, heliPark: [...(ctx.campus.heliPark || []), [W.x, 0, W.z]] };   // hidden-heli pad on the summit
  baseBuild(ctx, progress);
  // a shed on the west hill's east flank: footprint sloping ~1.4 m, standing on a concrete plinth
  const sx = -36, sz = 34, ring = [[sx - 2.5, sz - 2], [sx + 2.5, sz - 2], [sx + 2.5, sz + 2], [sx - 2.5, sz + 2]];
  ctx.onGround(ring, () => {
    ctx.B.v('brick').prism(ring, 0, 2.6, 1);
    ctx.B.c('brick').prism(ring, 0, 2.6, 1, true);
  }, { plinth: { material: 'concrete' } });
  // kit props on the slopes (each stands on the lowest ground under its footprint), long side along the contour: on
  // the steep middle of a hill a bench would be half buried (the map check's terrain test flags that)
  const onHill = (H, ang, d) => [H.x + Math.cos(ang) * d, H.z + Math.sin(ang) * d, Math.atan2(-Math.cos(ang), -Math.sin(ang))];
  { const [x, z, r] = onHill(W, -0.9, 23.5); propKit.bench(ctx, x, z, r); }
  { const [x, z, r] = onHill(W, -1.6, 24); propKit.bench(ctx, x, z, r); }
  { const [x, z] = onHill(W, -0.6, 22); propKit.trashCan(ctx, x, z); }
  { const [x, z, r] = onHill(E, -2.5, 19.5); propKit.picnicTable(ctx, x, z, r); }
  { const [x, z, r] = onHill(E, 0.6, 15); propKit.dumpster(ctx, x, z, r); }
  // trees on the hillsides (planted by the generic tree pass on the terrain)
  ctx.gen.trees = [...(ctx.gen.trees || []), [-75, 30, 0, 1.0], [-50, 58, 0, 0.9], [-40, 48, 1, 1.0], [250, 80, 0, 1.0]];
  addWater(ctx, { kind: 'pond', outline: pond, level: 0.05, depth: [0.4, 1.0] });
}

export default {
  ...hinsdale,
  id: 'terraintest',
  name: 'Hinsdale Central (terrain test)',
  terrain: { fn: height },
  spawnCenter: [-58, 22],   // FFA spawn sampling starts on the west hill's flank (proves spawns on slopes)
  loadWorld: async () => {
    const [base, props, water] = await Promise.all([hinsdale.loadWorld(), import('../world/props.js'), import('../world/water.js')]);
    baseBuild = base.build; propKit = props.propKit; addWater = water.addWater;
    return { build };
  },
};
