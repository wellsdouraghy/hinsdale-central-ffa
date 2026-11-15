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
5. **Map check before QA (required):** the builder runs `dev/mapcheck.html` (below) and gets it clean before handing
   the map to the independent visual QA agent. QA starts from the check's report, not from zero.

## Map check (required before QA)

`dev/mapcheck.html?campus=<id>&mute=1` (dev server, own tab) loads the real world and validates it with the real
collision and the real player controller. Full run: ~2-3 min per campus (world load ~8-30 s, escape ~60-80 s, roof voids
~20-30 s, bots ~2 s; slower in a hidden browser pane). Deterministic (fixed sample grids and probe orders; the bot run uses a seeded `Math.random` and a virtual clock).

- **Output:** `window.__mapcheck` (JSON report: `verdict` pass / warn / fail, `summary`, and per check `status`,
  `counts`, `failures` with coordinates), `window.__mapcheckDone = true` when finished, a readable summary on the page,
  a top-down debug image over the satellite photo (`window.__mapcheckImage()` returns a PNG data URL), and
  `report.json` / `map.png` download links. Agents: poll `__mapcheckDone` in short waits (a hidden tab still runs, but
  keep each wait under ~30 s), then read `JSON.stringify(__mapcheck.summary)` and the `failures` of failing checks.
- **Options:** `&only=escape,ladders` or `&skip=bots` (check ids: spawns, ladders, heli, props, signs, boundary,
  visualSolid, escape, roofVoids, bots), `&grid=2.5` (escape sample spacing), `&bots=8&botTime=60`, `&q=low` (default).
- **Done means:** no `fail` (`report.pass === true`). Every `warn` is either fixed or explained in the hand-off to QA.
  Thresholds live in `TH` at the top of dev/mapcheck.js; change them there, not per campus.

What each check does (and what to fix when it fails):

1. **escape** (the "stuck on a roof" check). Downward rays every 2.5 m over the play area find every elevated surface
   (> 0.6 m, normal y > 0.45, 1.85 m headroom). Flat samples are grouped into walkable regions; each region, every
   sloped sample, and a drop test from 2 m above every crease (sample next to a wall / parapet) and every slope must
   get the real controller to walkable ground (nav-connected, y < 0.35) or to an already-proven surface using only
   walk + jump + double jump + mantle: 16 directions x 7 s, then a second-level search from where those attempts
   ended. Failures are clustered: `cannot move` = wedged / embedded (slope against a parapet, gap between collision
   boxes), `confined` = can walk but not get off, `sealed pocket` = drops into ground that is not connected to the
   walk area (closed courtyards). Fix with a ladder, a lower wall / gap, a ramp, or by filling the crease (flat
   collision over the gutter). `fellThrough` = the player fell below y = -5: a hole in the collision. Trapped
   surfaces with collision < 15 m above every sample (a sealed press box, a void under a roof skin) cannot be
   reached from the sky, so they are listed as `sealedInteriors` (info); getting INTO them is what 1b tests.
   The controller's stuck safety net (`_stuckWatch`, which pops a wedged player free) is switched off for this and
   the ladder test: the map has to be right without it.
   "Blocked" (the cue to jump) is read from the real displacement, not from `horizontalSpeed()`: on the ground the
   controller keeps its velocity while it grinds against a wall or a 0.4 m parapet, so the speed never drops.
   **Ladder pass:** a `sealed pocket` with a ladder is not a trap. After the first pass, every ladder that passed
   check 2 and whose deck was proven escapable *without* ladder credit gets its pocket flood-filled from the ladder
   foot (1 m grid); trapped starts are re-run and pass if they reach one of those cells (`escapedViaLadder`, and
   `ladders` in the report). A roof can therefore never be "proven" by dropping into a courtyard whose only way out
   leads back up to that same roof.
1b. **roofVoids** (ways into the hidden space under pitched roofs). Reuses dev/trap-sweep.js with the real
   controller: 0.5 m top-surface scan, 800 wall jumps + double jumps + mantles from the ground and 800 from roofs at
   building walls, walking / jumping / sprinting / dropping on 150 pitched-roof points at 60 / 30 / 20 fps, and 250
   grapples onto pitched roofs and eaves. Fail = a run ends under a roof skin (roof > 0.9 m above the player) or
   stuck on a roof, and walk + jump + double jump cannot get back out. Counts: `&voidWall=`, `&voidSloped=`,
   `&voidGrapple=`.
2. **ladders.** Scripted climb with the real controller, forward held from 1.3 m out, released 1 s after the exit:
   one grab and grounded on the deck = pass. `regrabbed` = a parapet / lip above exitY throws the player back.
3. **spawns.** Every FFA and CTF team spawn: inside playBounds (FFA also spawnBounds), at ground level, open sky above,
   capsule fits, >= 0.4 m from any solid (warn < 1.2 m), not on a registered prop, on (or within 3 m of) a nav walk
   cell. Also: >= 24 FFA / >= 8 per team, navGrid.unreachable = 0, both CTF bases on walk cells and connected (nav
   path length reported), team spawns 25-70 m from their own base and never nearer the enemy base, base distance
   (warn outside 150-420 m), cover around each base (fraction of 16 directions blocked within 30 m).
   The pipeline itself now refuses cells closer than 1.25 m to a wall / fence / prop (`wallClear` in
   src/world/collision.js, tested lazily on the cells the samplers pick), for FFA and team spawns on every campus.
4. **heli.** Exact shape query (not rays): nothing solid within 8 m of the rotor axis between deck + 0.3 m and
   + 3.4 m (warn < 8.5 m), tree trunks >= 10.5 m (canopies are not collision), open sky, roof spots have deck under
   the centre and all four skid ends, >= 12 spots. The pipeline (`pickHeliSpawns`) runs the same exact query after
   its 16 rays and wants 8.5 m, so a bad `heliPark` entry is dropped at load instead of failing here; what the
   campus has to guarantee is the count. Keep >= 12 entries that pass at 8.5 m: with fewer, the pipeline falls back
   to 7 m and 6 m and those spots fail this check (that is how Marin's bad spots got in).
5. **visualSolid.** Upward-facing visual triangles above 1 m inside the play area that are at least 0.45 m wide
   (triangle altitude) and have no collision within 0.6 m below (and are not buried in a solid, and are not a lip
   right next to a wall): patches >= 2 m2 fail. Typical hits: hip / gable roofs whose collision is a box at eave
   height, canopies, porch roofs. Shrubs (ctx.shrubs) taller than 1.1 m with no collision under them fail too.
   Nets, chain-link and windscreens are skipped (see-through).
6. **props.** Props placed with the shared helpers (src/world/props.js: cars, buses, dumpsters, containers, barriers,
   benches, tables, bins, utility boxes, porta-potties, pads, sleds, tarp rollers, film towers, bike racks) register
   their footprint (`registerProp`; use it for any custom solid prop too). Footprints must not overlap (> 5 cm) or
   hit a tree trunk; within 0.6 m of a trunk = warn.
7. **signs.** Every `M.textDecal` texture records a fit (`texture.userData.textFit`). Fail: text still wider than the
   canvas or taller than its line band; > 15% of the sign over windows (glass / frames found right behind it).
   Warn: shrunk below 60%, stretched > 20% (canvas aspect vs decal aspect), letters < 12 cm, not backed by a wall.
8. **boundary** (warn only). Where the player can walk up to the play-area edge, no collider between the nearest
   walkable ground on that line (3 m inside or more) and 2 m outside, and no tree trunk within 4 m = an invisible
   wall. (The ray starts at the walkable ground: a building whose wall stands 3-5 m inside the edge is a barrier.)
   Samples are every 3 m from the corner: a row of 3 m barriers with 0.3 m gaps drifts onto a gap sooner or later,
   so lay roadblocks out in whole multiples of 3 m from the corner. Open edges >= 6 m on asphalt = "stopped
   mid-street": dress them (fence + windscreen, barriers, tree belt).
9. **bots** (warn only). 8 normal bots, FFA, 60 s: a bot staying within 2 m for > 12 s while trying to move (not
   fighting, not perched) is logged with its position and goal; the controller's stuck safety net firing for a bot
   (`unstuckPops`) is logged too.

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
  crossings, tree belt) so the edge reads as physical. Hinsdale: plain chain-link along the far kerb of the two
  streets that run along the edge and along the east lot, striped barriers where a street leaves the map, all 0.5-0.7 m
  *outside* the bounds so nothing walkable changes (`edgeDressing` in src/world/props.js). Leave a gap in the fence
  at tree trunks and shift a barrier that would touch one.
- **FFA spawns in far corners** (farthest-point sampling pushes them out): set `spawnBounds` to the campus core.
- **CTF bases must be fair:** both need cover, multiple approaches (fence openings) and no single roof overlooking
  one but not the other. Keep them ~250-300 m apart.
- **Heli spots need rotor clearance** (~8 m radius) from any collider, roof spots need deck under the skids.
  Parking-lot aisles, service yards with dumpsters, roofs with units: nearly every hand-picked spot was 3-7 m from
  something. Find spots with a scan (exact segment-to-triangle distance >= 9 m, trunks >= 11 m, 3 m grid), not by eye.
- **Closed courtyards** (Hinsdale had three, walls of 10-12 m): door canopies inside them are "low roofs" you can
  drop onto and never leave. Every enclosed court needs a ladder (`wallLadder` in src/world/facade.js, `top` = the
  parapet top so the exit clears the lip) on plain brick between the corner pier and the first window, or an opening.
- **Pitched roof over a box:** collision must be the visible shape (walls to the eave + the roof planes + the soffit
  closing the eave overhang from below), never a taller box "roughly the same volume": players stood 0.7 m above the
  eaves and sank 1.4 m into the ridge of Hinsdale's concession building.
- **Layout data that feeds placement** (Marin: ground `heliPark` entries were also the walk seeds and the car-free
  circles): editing the list reshuffled every parked car. Spell such inputs out separately (`walkSeeds`, `CAR_FREE`
  in src/campuses/marin/world.js) and have anything that is rejected still draw its random numbers.
- Chain-link / nets use the `metal:mesh` collision surface (bulletPassthrough): solid to players, bullets pass.
- Re-validate after every change: spawn count + all inside spawnBounds, nav unreachable 0, heli spot count, CTF
  bases on walk cells, every ladder exits, a few wall/roof walk tests.

**Visual**
- **Minimap / laptop images are per campus:** anything baked once at startup must re-bake on campus change.
- **Props placed after other props without exclusion clip** (buses through parked cars, cars on tree trunks):
  reserve footprints before placing, and keep stalls ~1.2 m from tree trunks. Trunks are up to ~0.6 m in radius
  (the radius is only known once the trees are planted), so test props against `gen.trees` with footprint + 1.3 m;
  lane cars need an oriented-box test against the kerb-parked ones (a centre-distance test let two overlap by 0.7 m).
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
  Work the heights out from the facade kit (lintel top, sill course), make the canvas the same shape as the decal
  (a 16 : 1 canvas on a 35 : 1 plane doubles every letter's width) and pick a font that fits without shrinking. No
  clear wall behind a canopy? Stand the name on the canopy edge on its own solid sign band (Marin science center).
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
- **Building heights on sloped sites (Marin player report: "some of the buildings you rendered are not two story"):**
  never measure height as roof minus one campus-wide ground level. Measure each building against the ground
  around its OWN footprint (lowest/eave-side ground sample within a few metres outside the footprint), cross-check
  the storey count against street-level imagery and OSM `building:levels`, then place it on the real terrain. On a
  flat-ground map, a hillside building must keep its true height, not inherit the slope.
- **Street-level imagery for facades:** surrounding buildings must not be procedural guesses. Sample each building
  in the play area from street-level imagery (Google Street View Static API or Mapillary) for colour, material,
  storeys, windows, storefronts and signage.
- **Elevation in the 3D-tiles origin:** set origin.height to the ellipsoid height of the main ground level and
  pick tileRegistration spots on flat open ground at that level.
