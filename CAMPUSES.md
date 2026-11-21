# Campus Combat: multi-campus contract

> Before building or reworking a campus, read MAP_NOTES.md, starting with "The rulebook: one-shot maps" (the user's feedback as rules A1-F48; a builder hand-off ticks every one), then the lessons from previous builds and QA reviews.
> Before handing a campus to QA, run the map check (`dev/mapcheck.html?campus=<id>&mute=1`, see MAP_NOTES.md "Map check") and get it to no `fail`.

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
  stateName: 'California',          // search: full state name
  rival: 'San Domenico',             // search: the rival school (its mascot is teams.blue)
  aliases: ['Marin Academy High School', 'MA', ...],   // search: nicknames, abbreviations, nearby city
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
    textures: 'campuses/marin/tex/tex.json',        // optional: building textures generated from references (tools/textures/README.md)
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
  terrain: { file | heights | fn, extent, ... },   // optional: real ground heights in the play area (see "Terrain" below)
  short, blurb, emblem, letters { red, blue }, thumb   // title badge, campus card line, logo SVG, varsity letters, card image
  tour: [ { name, fov, pos: [[x,y,z] x4], tgt: [[x,y,z] x4] }, ... ],   // menu camera tour; name = caption
  loadWorld: () => import('./world.js'),
};
```

## Builder (`src/campuses/<id>/world.js`)

`export function build(ctx)` replaces Hinsdale's `buildSchool / buildHouses / buildLandmarks / buildProps` calls.
`ctx` is exactly what those receive today (`src/world/index.js`): `data, gen, T, M, B, scene, sky, applyBakedShadow,
playBounds, surfaceAt, blockers, instanced, updaters, shrubs, grapplePoles, ladders, quality, campus`, plus the terrain
helpers `terrain, groundY, flatten, onGround, plinth, drape` (no-ops on flat campuses; see "Terrain").
Everything else (ground, sky, post, trees from `gen.trees`, grass, collision, spawns, nav, heli spots, shadow bake,
3D tiles) is generic and driven by the descriptor.

Reuse the shared helpers in `src/world/` (`util.js` Builder, `facade.js`, `trees.js`, `assets.js` materials, props
helpers). Shared modules may gain backward-compatible options; never change Hinsdale's output.

Rules for every campus: outdoor only (buildings solid, roofs reachable where real), collision for anything you can
see, grapple poles registered in `ctx.grapplePoles`, ladders in `ctx.ladders`, no neighbourhood clutter outside the
play area beyond low-detail context, same performance budget as Hinsdale (medium quality must hold 60 fps).

## Terrain (`src/world/terrain.js`)

Opt-in real ground heights inside the play area. Without `terrain` in the descriptor the world is flat at y = 0 and
nothing changes (Hinsdale, Hamilton). With it, the engine resamples the heightfield onto a working lattice (`cell`,
default 2 m) over the satellite rectangle and everything generic follows it: `world.groundY(x, z)` (bilinear), the
visual ground mesh (displaced lattice; the satellite / ground shader reads only x, z, so the photo still lines up, and
its detail normals follow the slope), the ground collision (same lattice, per-surface meshes as before), grass, trees
from `gen.trees`, the baked shadow mask, walk flood fill / spawns / CTF bases and team spawns (gentle ground only,
<= 20 deg), the bot nav grid (probes follow the ground, cells steeper than ~42 deg are blocked: `navGrid.steepCells`),
helicopter spots (ground entries stand on the highest ground under the skids, <= 0.3 m drop, no hill in the rotor disc),
water levels, the player controller (slope rules below), bots, grenades, airstrikes, care packages, kill cam and
finisher bodies (they lie on the slope), the map check. Test campus: `?terrainTest=1` / `?campus=terraintest`
(`src/campuses/terraintest.js`: Hinsdale with procedural hills; `&pit=1` adds a deliberately broken pit; also
`dev/mapcheck.html?campus=terraintest`, `dev/world.html?campus=terraintest`).

```js
terrain: {
  file: 'campuses/<id>/terrain.png',  // 16-bit grey PNG (8-bit works), or '.bin' raw little-endian samples
  format: 'u16',                      // .bin only: 'f32' (default) | 'u16' | 'i16' | 'u8'
  nx, nz,                             // .bin / heights: samples per row, rows (a PNG carries its own size)
  // heights: [...] or fn: (x, z) => y instead of a file
  scale: 0.01, offset: -5,            // metres = sample * scale + offset
  extent: { minX, maxX, minZ, maxZ }, // world rectangle the samples cover, corner-aligned, row 0 = north (-z) like the photo
  outside: 0,                         // height beyond the extent: a number or (x, z) => y (e.g. the backdrop's own sampler)
  blend: 30,                          // metres over which the extent edge blends into `outside` (no seam with a backdrop)
  cell: 2,                            // working lattice (m); the walk surface is triangulated on it
  flatten: [{ rect: { cx, cz, w, d, angle } | circle: { x, z, r } | outline: [[x, z], ...], y?, blend? }],
},
```

World API: `world.groundY(x, z)`, `world.terrain` (null when flat) with `heightAt, normalAt(x, z, out), slopeAt (rise /
run), minIn / maxIn(x, z, r), standY (capsule rest height on a slope), footprint(shape) -> { min, max, mean }`, and
`world.groundNormal(x, z, out)` (up when flat). Constants in terrain.js: `WALK_NORMAL_Y = 0.7` (~45.6 deg, the same
limit as the mantle ledge test and the bots' ground tests), `NAV_MAX_GRADE` (~42 deg), `SPAWN_MAX_GRADE` (~20 deg).

Builder helpers (all no-ops on flat campuses, so a shared helper can call them unconditionally):
- `ctx.groundY(x, z)`; `ctx.terrain` (or null).
- `ctx.flatten(shape, { y, blend })`: pads for fields, courts, car parks, building footprints, ponds. `y` = a number, a
  function `(x, z) => y` (a sloped pad or ramp), or omitted (the mean height under the shape). Returns the pad height.
  **Flatten before you place anything** on that ground; the ground mesh is re-displaced after the builder returns.
- `ctx.onGround(where, fn, { mode, plinth, lift })`: runs `fn(baseY)` with every Builder vertex (visual and collision)
  raised by `baseY` = the ground under `where` (`[x, z]`, `[x, z, r]`, `{ x, z, r }`, a ring, or a flatten shape);
  `mode` 'min' (default: sinks into the slope, nothing floats) | 'max' | 'mean' | a number. Build at local y = 0 inside.
  Ladders, grapple poles, shrubs and props registered inside are raised too. With `plinth: true | { material, surface,
  depth }` (ring footprints) a foundation is built from 0.6 m below the lowest ground up to `baseY` (mode defaults to
  'max', so the floor is level and the downhill side shows a plinth). Nesting is fine (the inner base is absolute).
- `ctx.plinth(ring, topY, opts)`: the foundation on its own.
- `ctx.drape(bucket, fromVertex)`: adds the ground height to every vertex written to `bucket` after `fromVertex`
  (painted lines, ground decals built at y = 0.01-0.02; subdivide them to <= 2 m first).
- `propKit.*` (src/world/props.js) stand on the lowest ground under their footprint by themselves; `registerProp`
  records the base height (`y`) for the map check.
- Things you add to `ctx.scene` yourself (instanced meshes, custom meshes) need `y = ctx.groundY(...)` by hand.
- Water: `level` is above the mean ground under the outline (flatten it first); `absolute: true` for sea / bay level.
- heliPark: entries with y <= 0.5 are ground spots (placed on the terrain); larger y = absolute roof deck height.
- Worked example on a real hillside: Marin Academy (`src/campuses/marin/`: `sitework` in world.js, `sited` / `atGround` /
  `onSlope` / `hillFence` / `ringGround` in kit.js; lessons in MAP_NOTES.md "Marin on real terrain").

Player controller on terrain (src/game/player.js, terrain campuses only; flat campuses keep the old code path bit for
bit): ground with a contact normal y >= 0.7 holds the player (standing still on a hill does not creep downhill: the way
out of the ground is straight up when only walkable ground is touched); downhill walking / running / sliding snaps to
the ground within one step's reach (no bouncing, never off a ledge); steeper ground is a wall you slide down (its push is
horizontal, and the step-up assist only lands on walkable ground, so nothing climbs a 50 degree bank 0.45 m at a
time); walking uphill is slower (x0.78 at 30 deg, x0.7 at 45). Fall-out (-20 m), grenades (-30 m) and bots' fall
recovery are relative to the ground.

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
