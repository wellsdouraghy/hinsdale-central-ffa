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
- **Players ending up INSIDE a roof ("stuck in a roof"):** a pitched roof is a thin shell over the wall prism's cap, so
  every hip roof / roof-well perimeter hides a void with a floor (attics at 2.9 / 5.8 / 8.8 m, the space under the
  tiled rim of a roof well). Nothing leads out of it. The way in was the mantle: jumping or grappling at a wall under
  the eaves found the attic floor as a "ledge" through the slot between wall top and roof slope and climbed in. Fixed
  in the controller (`_tryMantle` needs a clear level sight line to the landing spot and no low cover over it), but
  keep the rule: **roof wells, courts and anything enclosed on a roof must be escapable without the grapple, and
  no mechanic may put a player under a roof skin. Test by teleport + leave** (drop the player on a grid of roof
  points and in every void, try to leave with walk / jump / double jump only; jump and grapple at walls under eaves
  and check nobody ends up below the top surface). Harness: `dev/trap-sweep.js` (scans top-surface heights on a 0.5 m grid,
  flood-fills reachability to the ground with a 1.7 m climb limit, simulates the rest with the real `player.update`).
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
- **Signs / text decals:** text must fit its canvas (textDecal now shrinks to fit) and sit on clear wall (brick
  band, parapet), never over windows. Read every sign at eye level in QA ("HIGH SCHO" shipped once).
- **Wall-mounted fixtures:** wall packs / downpipes must mount on the surface actually behind them (pilaster faces),
  stand proud of it, and not hide half a pilaster (reads as a stray seam).
- **Car model:** closed end caps + floor pan; wheel-arch discs clipped at the sill (shards otherwise).
- **Ladder exits:** if neighbouring parapets leave less than a player's width, move the ladder; raising exitY won't
  help. Test with a scripted climb (real player.update, forward held): one grab and ending on the deck = pass.
- **Ground photo blotches** can live in ground_macro.jpg itself, not the mask: pull blotches inside car parks to
  the mean asphalt tone (tools/macro_fix.js on Marin).
- **Backdrop crowns:** 3-7.6 m radius, jittered 5-sided, leaf texture, ~5k instances; dense planting in the first
  ~45 m past the photo edge. Urban sides: one tiling roof/street sheet + a few hundred low-rise roof boxes.
- **Canopy shelf (wooded edges):** ~5.6 m cells, leaf breakup, an 85 m ring of low-poly 3D crowns on its inner edge
  (only above y = 18), road notches with asphalt strips so streets continue into the haze.
- **Placement changes reshuffle gameplay data** (removing overlapping cars changed the nav grid and spawns): always
  re-validate after visual edits that touch anything solid.
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
