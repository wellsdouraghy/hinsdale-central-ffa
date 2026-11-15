# Map-building notes (read before building or reworking a campus)

Lessons from building Hinsdale Central and Marin Academy, mostly from independent QA reviews. Add to this file
after every map QA round. The contract itself is in CAMPUSES.md; this file is the "what goes wrong and how to avoid it".

## Process that works

1. **Data first.** OSM via Overpass (overpass-api.de; the maps.mail.ru mirror sometimes 504s), Esri World Imagery z19
   stitched to one satellite jpg, Google Photorealistic 3D Tiles for heights / roof shapes / colours (key in
   .env.local, read inside scripts only, never printed or committed). Bake ground_macro / ground_mask / roofs /
   surface_classes / gen.json with a per-campus copy of gen.py (src/campuses/<id>/tools/).
2. **Builder agent (Fable) builds; a separate QA agent (Fable) reviews** in the real game, without being told the
   builder's conclusions. Loop fix -> re-check until it passes. Expect 2-3 QA rounds per map.
3. **Test the production build** of committed HEAD (release preview config), including a host + client pair where
   the client last played another campus, before publishing.
4. Agents must use their own browser tab, `?mute=1`, and close tabs. Writing files into dev/shots triggers a Vite
   full reload: write to a scratch folder, then copy. With several agents editing at once, review against a
   `git archive`/worktree copy of HEAD served on another port.

## Recurring defects (check these every time)

**Gameplay**
- **Ladders that can't be exited:** a parapet/roof lip above the ladder's exitY makes the player fall and regrab
  forever. Walk every ladder as a player; exitY must clear the lip, or notch the parapet collision at the ladder.
- **Walkable-looking surfaces without collision:** canopies, porch roofs, mansard edges, dormers. Anything you can
  see and would try to stand on needs collision.
- **Steps/terraces with a tall first riser** (frontH ~0.9) snag or block players: use ramps or real step heights.
- **Hedges/shrubs** taller than eye height with no collision: keep under ~1.1 m or make them solid.
- **Invisible wall mid-street at the play edge:** dress the boundary (fence + windscreen, barriers at street
  crossings, tree belt) so the edge reads as physical.
- **FFA spawns in far corners** (farthest-point sampling pushes them out): set `spawnBounds` to the campus core.
- **CTF bases must be fair:** both need cover, multiple approaches (fence openings) and no single roof overlooking
  one but not the other. Keep them ~250-300 m apart.
- **Heli spots need rotor clearance** (~8 m radius) from any collider, roof spots need deck under the skids.
- Chain-link / nets use the `metal:mesh` collision surface (bulletPassthrough): solid to players, bullets pass.
- Re-validate after every change: spawn count + all inside spawnBounds, nav unreachable 0, heli spot count, CTF
  bases on walk cells, every ladder exits, a few wall/roof walk tests.

**Visual**
- **Minimap / laptop images are per campus:** anything baked once at startup must re-bake on campus change.
- **Props placed after other props without exclusion clip** (buses through parked cars, cars on tree trunks):
  reserve footprints before placing, and keep stalls ~1.2 m from tree trunks.
- **Satellite smears** (old cars, shadows, lane paint) on asphalt look like blotches up close: use the low-pass
  asphalt (`ground.asphaltDeblur`) and paint real markings (stall lines, centre lines) as geometry.
- **Ground-class blobs** (amoeba concrete patches, tree-shadow grass on car parks, white speckles): rasterise OSM
  `amenity=parking` (and similar) polygons into the visual mask, despeckle small islands; courtyards/pavers painted
  as hardscape so high-quality grass doesn't grow through them. Grass must also skip synthetic turf / track.
- **Blown-out whites:** white membrane roofs, white stucco, pavers, aluminium furniture clip to pure white in the
  sun; tone albedo down (~0.5-0.7).
- **Repeating facade textures on tall walls** read as apartment slabs: texture only the real storeys, plain
  foundation below.
- **Backdrop beyond the play area** is what you see from the helicopter (up to 120 m): it needs real texture
  variation, roofed houses, believable tree crowns at real scale (5-10 m, not 20-30 m domes), colour matched to the
  instanced trees, and a blended join (no style seam or cliff where 3D trees stop). Cities must continue as an
  urban backdrop (rooftops / street grid), not end on a straight edge into green.
- **Horizon:** use `sky.horizonHaze`; on Low quality there is no composer, so fog is applied after tone mapping and
  the haze band must not be tone-mapped (or the horizon shows a hard line).
- **Turf / fine detail shaders:** keep detail anisotropic and subtle; big octaves read as blotches.
- **Shared prop kit (cars):** dangling shards under wheel arches/bumpers (open item).
- **Stray wall decals / facade seams:** a small dark rectangle floating on a brick wall and a thin vertical seam
  beside a downpipe (Hinsdale, user report: dev/shots/user-reports/hinsdale_wall_artifact.webp). Sweep walls at eye
  level near doors, downpipes and vents for misplaced decals and z-fighting seams.

**Performance**
- Budget: medium quality holds 60 fps with ~1M triangles and ~300-500 draw calls. Chunking the merged static mesh
  by space cost more draw calls than it saved (left opt-in). Instancing for repeated backdrop elements is cheap.
- Bench numbers from a hidden pane on a shared machine are noisy (±50%): compare same views, repeat, and treat
  small differences as noise.

## Terrain: what future campuses will need (hilly, coastal, etc.)

Today gameplay ground is **flat at y = 0 inside the play area** (groundY, nav grid, spawns, heli spots, bots,
grenades, airstrike all assume it). Marin's real ~10 m climb was handled with a terrain *backdrop outside* the
bounds plus solid terraces/ramps inside. For a genuinely hilly or coastal campus, plan for:
- **Real in-bounds heightfield:** world.groundY(x, z) from 3D-tiles/USGS heights, a collision mesh for the terrain,
  nav grid sampling height + slope limits, spawns/heli spots/CTF bases placed on sampled ground, bots using
  groundY (botMobility already does), grenade/airstrike/heli ground queries via castWorld, minimap unaffected.
  This is a shared-engine change (src/world/*), not campus-local: do it once, generically, with Hinsdale/Marin
  still flat.
- **Slopes:** max walkable slope, stairs/ramps where real, retaining walls as collision.
- **Water / coast:** src/world/water.js is visual only (pool/pond/fountain). A coastline or bay needs a large
  water plane with shoreline foam, a solid "no walking into the sea" boundary (or shallow-water slowdown), and the
  haze/horizon tuned for open water.
- **Elevation in the 3D-tiles origin:** set origin.height to the ellipsoid height of the main ground level and
  pick tileRegistration spots on flat open ground at that level.
