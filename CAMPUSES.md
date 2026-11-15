# Campus Combat: multi-campus contract

One game, many campuses. Gameplay, networking, UI and the generic world pipeline are shared; each campus supplies
data + a builder for its own buildings and landmarks. A game update reaches every campus automatically.

Flow: password -> "Welcome to Campus Combat · choose your campus" -> that campus's branded title screen (same menus,
modes, lobby) -> match. The host's campus travels with the room, so joiners load the same map.

## Layout

```
src/campuses/index.js            registry: CAMPUSES (ordered list), getCampus(id), DEFAULT_CAMPUS
src/campuses/<id>/campus.js      descriptor (default export, plain data + loadWorld)
src/campuses/<id>/world.js       campus builder (export function build(ctx))
src/campuses/<id>/tools/         offline data scripts for this campus (python/node, run by hand)
public/campuses/<id>/            this campus's data + baked assets (Hinsdale keeps its existing paths)
```

## Descriptor (`src/campuses/<id>/campus.js`)

```js
export default {
  id: 'marin',                       // url/room id, lowercase
  name: 'Marin Academy',             // full name (loading screen, credits)
  wordmark: ['Marin', 'Academy'],    // title logo: small top line, big main line
  city: 'San Rafael, CA',
  legal: 'Fan-made campus game. Not affiliated with Marin Academy.',
  brand: { accent: '#d22630', accent2: '#ff4b55', dark: '#0b0b0d' },   // menu accent colors
  teams: { red: 'Wildcats', blue: 'Panthers' },   // home team vs its main rival (Hinsdale: Red Devils vs LT Lions); player-facing names; ids stay red/blue, colors stay red/blue
  origin: { lat, lon, height },      // local frame origin (x east, z south, metres); height = ellipsoid m for 3D tiles
  tileRegistration: [[x, z], ...],   // open flat spots for 3D-tiles ground registration (see src/world/tiles.js)
  files: {                           // all relative to the site root
    campus: 'campuses/marin/campus.json',   // OSM-derived local-metre data (same shape as public/data/campus.json)
    gen: 'campuses/marin/gen.json',
    satellite: 'campuses/marin/satellite.jpg',      // covers `sat`
    groundMacro: 'campuses/marin/ground_macro.jpg',
    groundMask: 'campuses/marin/ground_mask.png',
    roofs: 'campuses/marin/roofs.jpg',
    surfaceClasses: 'campuses/marin/surface_classes.png',
  },
  sat: { minX, maxX, minZ, maxZ },   // world extent of satellite/ground images (m)
  playBounds: { minX, maxX, minZ, maxZ },
  ctf: { red: [x, z], blue: [x, z] },        // flag bases, far apart, open ground
  practiceHeli: { x, z, yaw },               // helicopter parking in practice
  heliPark: [[x, y, z], ...],                // hidden-heli candidates: y = 0 ground, y = deck height on flat roofs
  walkSeeds: [[x, z], ...],                  // optional: walkable flood-fill seeds (default: ctf bases, practiceHeli, ground heliPark)
  spawnBounds: { minX, maxX, minZ, maxZ },  // optional: FFA spawn candidates limited to this box (default: whole play area)
  spawnCenter: [x, z],                       // optional: spawn sampling starts here (default: play-area centre)
  navSeed: [x, z],                           // optional: bot nav-grid seed (default: ctf.red)
  short, blurb, emblem, letters { red, blue }, thumb   // title badge, campus card line, logo SVG, varsity letters, card image
  tour: [ { name, fov, pos: [[x,y,z] x4], tgt: [[x,y,z] x4] }, ... ],   // menu camera tour; name = caption
  loadWorld: () => import('./world.js'),
};
```

## Builder (`src/campuses/<id>/world.js`)

`export function build(ctx)` replaces Hinsdale's `buildSchool / buildHouses / buildLandmarks / buildProps` calls.
`ctx` is exactly what those receive today (`src/world/index.js`): `data, gen, T, M, B, scene, sky, applyBakedShadow,
playBounds, surfaceAt, blockers, instanced, updaters, shrubs, grapplePoles, ladders, quality, campus`.
Everything else (ground, sky, post, trees from `gen.trees`, grass, collision, spawns, nav, heli spots, shadow bake,
3D tiles) is generic and driven by the descriptor.

Reuse the shared helpers in `src/world/` (`util.js` Builder, `facade.js`, `trees.js`, `assets.js` materials, props
helpers). Shared modules may gain backward-compatible options; never change Hinsdale's output.

Rules for every campus: outdoor only (buildings solid, roofs reachable where real), collision for anything you can
see, grapple poles registered in `ctx.grapplePoles`, ladders in `ctx.ladders`, no neighbourhood clutter outside the
play area beyond low-detail context, same performance budget as Hinsdale (medium quality must hold 60 fps).

## Water (`src/world/water.js`)

Shared pools / ponds / fountains for any campus. **Visual only**: it adds no collision and changes no gameplay; the
walk surface stays the flat ground, players cross at deck height. The surface is one flat mesh just above the ground
plane and everything under it is faked in the shader (rippling procedural normal, fresnel sky reflection from the
scene environment, refracted pool floor with tiles / lane lines / walls / darker deep end, caustics on medium+high,
depth tint, baked far shadows). Around it the module builds a stone coping lip, gutter and waterline band, and for
competition pools lane ropes, backstroke flags and grab-rail ladders. Cost: one draw call + one small rope mesh per body.

Declare it in the descriptor and call `addCampusWater(ctx)` at the end of the campus builder:

```js
water: [
  { kind: 'pool',                                   // 'pool' | 'pond' | 'fountain'
    rect: { cx, cz, w, d, angle },                  // rectangle (w along local x rotated by angle = atan2(z, x), d across)
    // or outline: [[x, z], ...]                    // any simple polygon (ponds, round fountains)
    level: 0.05,                                    // y of the visible surface; keep it a few cm above the ground plane
    depth: [1.2, 3.8], deepEnd: 1,                  // visual depth (m) shallow -> deep along the long axis; -1 flips the deep end
    lanes: { count: 14, along: 'short' },           // lane lines + ropes; 'long' (default) or 'short' axis; `true` = auto
    ladders: 4, flags: true, ropes: true,           // pool furniture (all optional)
    coping: { w: 0.5, h: 0.11 },                    // or false; copingMaterial: 'limestone' (any material key)
    tint: [r, g, b], floor: [r, g, b] },            // optional colour overrides (linear)
],
```

or call `addWater(ctx, opts)` directly from the builder (same options; returns `{ mesh, ring, level, toWorld }`).
Ponds get a muddy green-brown tint and a soft transparent shoreline; fountains a shallow tiled basin with livelier
ripples. Solid things next to the water (starting blocks, deck walls, bleachers) stay the campus builder's job, since
they need collision. Low quality drops the caustics and the fine tile detail; nothing else changes.
