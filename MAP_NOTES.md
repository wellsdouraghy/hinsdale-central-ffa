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
- **Options:** `&only=escape,ladders` or `&skip=bots` (check ids: spawns, ladders, heli, terrain, houses, retaining, overlook, seating, interior, facadeSweep (= glassBuried + wallGap), props, signs, boundary,
  visualSolid, roofSkin, escape, roofVoids, bots), `&grid=2.5` (escape sample spacing), `&bots=8&botTime=60`, `&q=low` (default).
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
4b. **terrain** (campuses with a descriptor `terrain` only; flat campuses report `skip`). Every ground / roof / spawn /
   heli / nav threshold of the other checks is measured from `world.groundY` there, so a hill is not a "roof".
   (a) Slope pockets: terrain samples every 2.5 m that are steeper than the walk limit, or on hilly ground (> 0.5 m
   relief within 6 m) without a nav connection, are clustered (4 m); from the 3 lowest starts of each cluster the real
   controller (stuck net off) must reach walkable, nav-connected ground with walk + jump + double jump (16 directions x
   6 s). One that cannot = **unwalkable slope pocket** (fail): a hollow ringed by slopes too steep to climb. Fix by easing
   a slope (`ctx.flatten` with a ramp `y` function), a ramp / steps with collision, or filling the hollow.
   (b) Props on slopes: each registered prop's base against the ground under its footprint corners + centre: floating
   > 12 cm fails; ground above the base by > 50 % of the prop's height fails (> 30 % warns). Place props with
   `propKit` / `ctx.onGround`, and on steep ground flatten a small pad first.
   Heli (check 4) also tests ground spots on terrain: skids neither floating (> 15 cm) nor in the ground, <= 0.35 m of
   drop under them, no hillside more than 2 m above the skids inside the 8 m rotor disc. Spawns (check 3) fail on
   slopes over 20 deg.
4c. **houses / retaining / overlook / seating** (hilly campuses; they `skip` when the builder registers nothing or the campus is flat).
   `houses`: each `ctx.houses` entry `{ id, ring, top, storeys, garage, rows }`: eave over the lowest ground at the walls
   must stay within (storeys + garage) x 3 m + 1.5 m (warn; fail beyond + 2.5 m), and windowed rows within the storeys.
   `retaining`: each `ctx.retaining` block `{ x, z, tx, tz, fx, fz, w, d, top, frontY }`: no terrain above the pad level
   right in front of its face (> 0.12 m) or above its top inside the footprint (> 0.25 m fails).
   `overlook` (warn only): 3 m cells of open, standable ground within 80 m of a CTF base, >= 4 m above it, with a clear
   line of sight to the base (chain-link is not cover); warns when one base has >= 8 cells and the other under a third.
   `interior`: ground inside each `ctx.footprints` entry `{ id, ring, roof, floor }` (1 m grid, 0.6 m clear of the walls):
   at / above the roof deck fails, > 0.3 m above the floor warns.
   `glassBuried` / `wallGap` (run together as `facadeSweep`, no registry): see "Geometry sweeps" in the Marin lessons;
   they fail on terrain campuses and only warn on flat ones (cantilevers and canopies in wall materials).
5. **visualSolid.** Upward-facing visual triangles above 1 m inside the play area that are at least 0.45 m wide
   (triangle altitude) and have no collision within 0.6 m below (and are not buried in a solid, and are not a lip
   right next to a wall): patches >= 2 m2 fail. Typical hits: hip / gable roofs whose collision is a box at eave
   height, canopies, porch roofs. Shrubs (ctx.shrubs) taller than 1.1 m with no collision under them fail too.
   Nets, chain-link and windscreens are skipped (see-through).
5b. **roofSkin** (the "see-through roof" check, ~5-15 s). Rays against the DRAWN meshes, back-face culling included,
   for every roof skin (bucket keys `TH.roofKeys`: shingles) up to 40 m outside the play bounds: (exposedBack) a side
   of a roof face that the renderer culls must look into the closed attic, never into open air; (open) from points
   0.35 m under the skin that are enclosed, rays in 48 directions (35 deg below the horizon up to 75 deg above: under
   the eaves, from a neighbouring roof, from a helicopter) must meet a face that is drawn from outside (front face,
   double-sided, or a both-windings pair) before they are out from under the roof. 4 m cells with >= 3 such rays
   fail; every failure carries `views[].cam`, a camera string for `dev/world.html?campus=<id>&cam=` (or
   `dev/marin.html`) that shows the hole. `strays` lists the cells below the threshold. Typical hits: a gable wall
   that does not reach the rakes, a folded roof on an L / T plan, a missing hip end or soffit, a canopy made of roof
   skin with no ceiling. Fix the generator, never the one house.
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
- **Two eaves 0.5-0.9 m apart are a wedge:** a player who slides off a pitched roof into the slot between two
  neighbouring roofs hangs there on the capsule (0.7 m) and cannot leave (map check roofVoids, `drop20 cantLeave`).
  Roofs next to another building get a narrower overhang (`eaveOverhang` in src/campuses/roofs.js keeps the slot
  >= 1.1 m); the list of all solid footprints (`ctx.playRings`) is built before the first house is roofed.
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
- **See-through roofs** (Marin, reported by a player standing on a roof): a pitched roof is a thin skin drawn
  single-sided, so every mistake shows the SKY, not a dark attic. What went wrong, all in the shared generators:
  (1) `polyRoof` raised every eave edge of an L / T / U footprint to one ridge line: faces folded over the yard, the
  step between two eave depths was a vertical triangle with arbitrary winding, and whole roof planes vanished from
  one side. (2) The gable wall was a triangle from the eave corners, but at the wall line the slope is already
  `rise * overhang / halfWidth` above the eave: a slit under both rakes, open into the attic (and solid neither).
  (3) The underside of every rake / eave overhang, seen from a roof next door or from the ground, was culled.
  (4) A bounding-box hip on an L plan also roofed the notch and whatever stood in it.
  Rules: **a roof is a union of closed convex pieces** (`polyRoof` = hip roofs at one pitch over the footprint's
  maximal rectangles + a deck at the eave, src/campuses/roofs.js; coplanar faces of two pieces need plane / world
  UVs or they shimmer; ridge caps only on real creases); **the gable wall is the roof profile in the wall plane (a
  pentagon), visual and collision**; **roof skin materials are double-sided** (`M.shingles`, `shadowSide` left at
  BackSide), and so is any instanced far house without a soffit; in-play poly roofs get the solid attic
  (`fill`). Never judge a roof from above only: look along the ridge from eave height, from the ground under the
  eaves and from a helicopter, and run the roofSkin check (it failed 290 cells on Marin and 87 on Hamilton before
  the fix).
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
- **Signs blocked by geometry in front:** a sign can pass "not over windows" and still be unreadable because
  pilasters, downpipes or a wall step cross it (Hamilton: "H MILTON", "PAT CONCERT HALL"). Keep the sign band clear
  (stop pilasters below the frieze, route pipes off the band) and read every sign in a screenshot at eye level.
- **A frieze sign needs the frieze:** stop pilasters at an architrave under the name band (Brown Hall) or give the
  name its own projecting stone band proud of pilasters and pipes (concert hall); a decal 2 cm off a wall loses to
  anything 10 cm proud of it.
- **Canvas axes on painted courts/fields:** paintedQuad expects X = the b extent; drawing the canvas with X = a
  rotates the paint 90 degrees (Hamilton tennis deck). Check paint against the nets/goals and the satellite.
- **Species and local style:** use the region's trees (Italian cypress, palms, oaks) and house styles (LA stucco vs
  Midwest clapboard); never put a tree on a landmark's entrance axis.
- **Stray wall decals / facade seams:** a small dark rectangle floating on a brick wall and a thin vertical seam
  beside a downpipe (Hinsdale, user report: dev/shots/user-reports/hinsdale_wall_artifact.webp). Sweep walls at eye
  level near doors, downpipes and vents for misplaced decals and z-fighting seams.

**Performance**
- Budget: medium quality holds 60 fps with ~1M triangles and ~300-500 draw calls. Chunking the merged static mesh
  by space cost more draw calls than it saved (left opt-in). Instancing for repeated backdrop elements is cheap.
- Bench numbers from a hidden pane on a shared machine are noisy (±50%): compare same views, repeat, and treat
  small differences as noise.

## Terrain: hilly campuses (real ground heights in the play area)

The engine supports a real in-bounds heightfield (descriptor `terrain`, src/world/terrain.js; contract and builder API
in CAMPUSES.md "Terrain"). Campuses without it stay exactly flat at y = 0. Marin Academy is the first real campus on it
(66 m of relief inside the play area: see "Marin on real terrain" below). Proven on the test campus
(`?terrainTest=1`, src/campuses/terraintest.js) before any real campus uses it.
- **Baking the heightfield.** Ground, not roofs or tree crowns:
  - *Google 3D tiles (dev only):* cast rays straight down through the tiles on a 2-4 m grid over the satellite
    rectangle (dev/<campus>-tiles.html already streams them in the local frame), keep the LOWEST hit per cell in a
    5-10 m window (min filter drops buildings, cars and canopies; then a 3x3 median), subtract the main ground level
    (`origin.height` is the ellipsoid height of y = 0), and write a 16-bit grey PNG with `scale` / `offset` (e.g.
    1 cm steps: scale 0.01, offset -50) or a Float32 .bin into public/campuses/<id>/. Inside building footprints the
    min filter reads the ground at the walls: fill footprints from their outline (interpolate), they get flattened anyway.
  - *USGS 3DEP (US campuses, public domain):* 1 m DEM GeoTIFF from the National Map (or the 1/3 arc-second DEM where 1 m
    is missing), reproject to the campus frame (x east, z south, metres from `origin`), subtract the ground level,
    write PNG / .bin as above. 3DEP is bare earth already (no roofs / trees), but check it against the tiles: it can
    predate grading work.
  - Cover the whole satellite rectangle (`extent` = `sat`) so the drawn ground and the backdrop meet; when the campus
    has its own backdrop sampler, pass it as `outside` and give `blend` 20-40 m: no seam or cliff at the edge.
- **Flatten (descriptor `flatten` or `ctx.flatten`, BEFORE placing anything):** sports fields, courts, tracks, car parks
  (real ones are graded nearly flat, 1-2 %), pool decks, plazas and every building footprint + 1-2 m (or use
  `ctx.onGround(ring, fn, { plinth: true })`: level floor, plinth on the downhill side, as real buildings on slopes
  have). Use a `y` function for a sloped car park or a ramp. Blend 3-6 m so pads meet the hill smoothly; a 0 m blend
  makes a step the controller treats as a wall.
- **Building heights on slopes:** measure each building against the ground around its own footprint (see the bullet
  below), then `onGround` it with `mode: 'max'` + plinth, or flatten the footprint to the entrance level.
- **Slope rules (gameplay):** walkable = contact normal y >= 0.7 (~45.6 deg, same as mantle / bots); the nav grid blocks
  cells over ~42 deg; spawns / CTF points need <= 20 deg; ground heli spots <= 0.3 m of drop under the skids. Real
  ground over ~35 deg (embankments, creek banks) reads as a wall: give it a path (`flatten` with a ramp function) or
  retaining walls with collision where the real site has them; never leave a hollow ringed by steep banks (the map
  check's slope-pocket test fails it).
- **Props / decals:** `propKit` props ground themselves; your own props go through `ctx.onGround`; painted lines and
  ground decals need `ctx.drape` (subdivided to <= 2 m) or they vanish under / float over the slope.
- **Water:** levels are above the ground under the outline; flatten the pond / pool first; sea level is `absolute`.
- **Water / coast:** src/world/water.js is visual only (pool/pond/fountain). A coastline or bay needs a large
  water plane with shoreline foam, a solid "no walking into the sea" boundary (or shallow-water slowdown), and the
  haze/horizon tuned for open water.
- **Building heights on sloped sites (Marin player report: "some of the buildings you rendered are not two story"):**
  never measure height as roof minus one campus-wide ground level. Measure each building against the ground
  around its OWN footprint (lowest/eave-side ground sample within a few metres outside the footprint), cross-check
  the storey count against street-level imagery and OSM `building:levels`, then place it on the real terrain. On a
  flat-ground map, a hillside building must keep its true height, not inherit the slope.
- **Street-level imagery for facades:** surrounding buildings must not be procedural guesses. Sample each building
  in the play area from street-level imagery (Google Street View Static API) for colour, material, storeys,
  windows, storefronts and signage. The key in .env.local (VITE_GOOGLE_TILES_KEY) allows Map Tiles + Street View
  Static and is website-restricted: scripts must send `Referer: http://localhost:5173/` (curl -H) or run from the
  dev server page. Use the free `streetview/metadata` endpoint first (pano date/position), then fetch only the
  views you need (`streetview?size=640x640&location=..&heading=..&pitch=..&fov=..`); keep requests in the hundreds
  per campus (free trial credit). Never print or commit the key; cache images under the campus tools/data folder
  only if they are not committed (add to .gitignore) since Street View imagery may not be redistributed.
- **Street View pass, as done for Hamilton (use it as the recipe):** `tools/streetview.py plan` (free metadata: one
  pano per *main* building = the largest footprint of each county parcel, found from the nearest named street; sheds
  and garages inherit from their parcel) -> `fetch` (one 640 px view per main building, heading / fov / pitch computed
  from the footprint: 147 images for 226 buildings) -> read the images in contact sheets of 12 with the OSM / gen
  heights printed on each tile -> type one line per building into `tools/data/facades_src.json` ("storeys wall colour
  roof roofColour | features") -> `tools/facades.py` writes `src/campuses/<id>/facades.json` (imported by town.js)
  and prints every building whose Street View storey count disagrees with the measured height. What it showed:
  - *3D-tiles roof classes are wrong for low-pitched roofs.* 70 of 226 buildings flipped roof kind: nearly every
    1940s LA bungalow has a 3-in-12 hip or gable that the height spread (< 1.1 m) called "flat". Roof kind comes from
    the street, the tiles only give heights.
  - *The view is of the lot, not of the footprint.* A rear unit gets the front house's picture, a rebuilt lot shows a
    house the old footprint does not have. Resolve storeys with the measured height and the county height tag when
    they both disagree with the picture; keep the colours.
  - *Street View colours are lit paint, not albedo.* Converting them with gamma 2.2 made navy and grey houses
    near-black and oversaturated: lift (gamma ~1.75) and desaturate ~10 %; roofs need more lift than walls.
  - *About 1 in 7 facades is hidden* (hedges, street trees, blur): mark them (`hidden`) so the guess is visible in the
    data, and take the period style of the neighbours.
  - Comparison sheets (Street View | game from the same pano position, heading and fov) are the QA artefact; they
    contain Google imagery, so they live in a gitignored folder (`dev/shots/*/streetview-compare/`).
- **Rows of shops are party walls:** OSM footprints of a shop row share edges (and overlap by a vertex). Test every
  wall for a neighbour 0.9 m outside it at three points before putting anything on it (dado, service door, downpipe,
  windows): "stray dressing" on Hamilton was the side-wall kit drawn on walls that stood against the next shop, and a
  gabled "house" in the row was a shop whose pent roof the tiles had read as pitched.
- **Front yards:** the fence / hedge line is wherever the lawn starts behind the sidewalk, not a fixed offset from
  the centre line (first try: 11 of 55 fences placed). Probe a few offsets and take the one with the most grass;
  dedupe when two buildings of a parcel share a frontage; keep fences low (<= 1.6 m) and solid.
- **Distant landmarks vs the scene fog:** FogExp2 at 0.00085 is opaque beyond ~2.5 km, so a skyline 3.5 km away
  dissolves and the horizon-haze shell is drawn over it. Unlit material with `fog: false`, its own light haze mixed
  into the vertex colours, `transparent` + a high `renderOrder` so it draws after the haze shell. At true size a
  170 m tower 3.5 km away is 2.8 deg tall and never clears the trees round a field: landmarks that every photo of
  the place shows need to be drawn larger / nearer than life (Hamilton's Century City: 1.9x, 3 km).
- **Hand-built tree crowns** (palms, cypresses, jacarandas) are static geometry, so the map check sees them: wide
  near-flat crown triangles fail visualSolid as "canopy without collision". Put crowns in their own mesh named
  `trees:<species>` (skipped like the instanced trees); trunks get collision + `ctx.trunks` as usual. The generic
  tree pass has one conifer (a spruce): filter `gen.trees` kind 1 in the builder and plant the regional species at
  the same spots (same trunk collision, so nav and spawns do not move).
- **Baked ground classes under street trees:** a sidewalk hidden by tree crowns in the satellite photo is classed as
  lawn. Patch the baked files along the road line (mask, macro tone and class grid together:
  src/campuses/hamilton/tools/sidewalk_fix.py) instead of laying geometry over grass.
- **Stockpiles and site clutter:** flat-shaded cones with random vertex heights read as rocks or tents; keep gravel
  and sand piles nearly regular (5 % jitter), darker than you think, and replace coloured boxes with things that
  have a silhouette (pipes on bearers, banded lumber, block pallets, a generator, an excavator, a site cabin with
  the contractor's board). Keep the old footprints so gameplay does not move.
- **Signs on small props:** a three-line board 1.5 m wide gives 4 cm letters (map check: >= 12 cm). Size the board
  from the text, not from the prop.
- **Elevation in the 3D-tiles origin:** set origin.height to the ellipsoid height of the main ground level and
  pick tileRegistration spots on flat open ground at that level.

## Marin on real terrain (lessons from the rebuild; scripts in src/campuses/marin/tools/)

- **Ground source: USGS 3DEP beat the 3D tiles.** The National Map ImageServer (`3DEPElevation/ImageServer/exportImage`,
  bbox in EPSG:4326, `format=tiff&pixelType=F32`, no key) returns bare-earth lidar at 1 m: no roofs, no canopies, no min
  filter needed. The tile samples agree with it to ~0.5 m on open flat ground after a constant offset, but **their offset
  drifts across the map** (3 m on the hillside streets, 20 m on a steep wooded slope where only coarse LODs load). Never
  take absolute ground heights from tile samples on a hill; use them for roofs only (tools/terrain.py).
- **Check the DEM against current imagery for regrading.** The lidar predated one car park (a 15 % hillside in the DEM, a
  flat lot in the tiles: residual of a plane fit 1.0 m, where every real lot had < 0.35 m) and the north tip of the pitch.
  A plane fit per OSM `amenity=parking` polygon finds these in seconds; flatten them to the level of the building they serve.
- **Building heights (the "not two storey" report).** Roof = tile samples inside the footprint, shifted by an offset
  fitted LOCALLY on open ground next to it (smooth tile cells clear of every footprint, gaussian 16 m); ground = DEM on
  the outline. Store the roof as an ABSOLUTE height plus the ground min / max. The old "roof minus the lowest ground
  nearby" read 34 of 144 buildings a storey too tall (one-storey houses on a 3 m fall became two storeys on every side);
  the gyms were 9 / 12.4 m and are 7 / 9 m. OSM had no `building:levels` here: Street View is the cross-check.
- **Place buildings by absolute roof height, datum = lowest ground on the outline** (`sited` in kit.js) and let the hill
  bury the rest: one storey uphill, two or three downhill, as in reality. The facade kit lays storeys out from y = 0, so
  **each wall (each 8-12 m piece of a long wall) gets its own base** (`kitWalls` -> nested `ctx.onGround`): doors and
  windows start at that wall's ground instead of being buried. House wall textures are anchored at the eave, not the base.
- **A plinth cap is a drawn floor.** `ctx.plinth` with its cap fails the roofSkin check from inside every attic above it
  (rays reach a front face that is not under a roof skin). Build foundations without a cap (`cap: false`).
- **Do all flattening first** (`sitework` in world.js), then read the ground: a pad flattened later moves the ground
  under a neighbour that was already placed. Flatten only what is level in reality (pitch, pool deck, terraces, the
  regraded lot); lidar already has the real shape of streets, lots and yards.
- **A level pad cut into a hill needs a retaining structure as deep as the blend.** The lattice is 2 m, so a pad edge is
  never a cliff: the blend zone is a steep ramp in front of any thin wall. Make the wall a block that covers the blend
  (field: 2.5 m deep, top stepped with the ground behind, fence on top). A wall with the fence in front of it leaves a slot.
- **Props on slopes:** `propKit` stands a prop level on its lowest ground (a car across a 6 % street is 25 cm in the
  asphalt at one end). `onSlope` in Marin's kit shears whatever a callback builds onto the plane fitted through its
  footprint (visual + collision; walls stay vertical): cars, buses, roadblocks, the entry sign, the courtyard. The map
  check still measures them as level boxes, so sloped cars show as "half buried" warnings up to ~11 %; park nothing
  steeper (`terrain.slopeAt`). Facade-kit planting beds stand at the wall base: clamp them to the ground a metre out.
- **The engine's far skirt** (a green ring at y = -0.25 from 280 m) cuts through any real ground below the datum: a
  campus whose surroundings fall away must park it under its lowest land and drape its own backdrop on the grid.
- **Helicopter spots on terrain:** find them with a scan, not by eye (candidates on a 4 m grid, car parks first, then
  turf and lawns, never on a street; <= 0.28 m of relief under the skids; let the pipeline's own exact test pick).
  21 valid spots came out; every hand-picked one from the flat map had to go.
- **Street View pass (tools/streetview.py -> facades_src.json -> facades.py -> facades.js):** one view per building from
  the nearest street point with a clear line to the footprint (metadata first, aim from the panorama's real position,
  fov from the footprint's angular width), a second for footprints > 420 m2: 158 images for 131 buildings + 12 school
  frontages. Reading them is a job for parallel agents writing JSON (storeys from the street, material, colours, roof
  type, storefront, sign text, fences, hedges, trees); ~10 % are hidden by hedges or blurred, and those take the look
  of the nearest classified neighbour of the same kind instead of a random skin. What it corrected: the aerial "hip"
  default (40 gables, 39 flat), shop names (only signs that exist are drawn: no invented tenants), the 4-5 m hedge wall
  along the pitch that had been a knee-high row, one-storey frontages of buildings that are three storeys downhill.
  "Storeys" from the street include the attic of a gabled house: a third storey under a pitched roof is not a wall storey.
  Shop windows belong on the main frontage only; the side-street wall of a corner shop is usually blank.
- **Seat every building on a pad; terrain never touches a facade above the plinth** (player report, with a screenshot of a
  window band half buried in a lawn: "you gotta get smarter about topography"). Starting each wall at the LOWEST ground
  along it is not seating: wherever the ground rises along that wall, the hill climbs over its windows. 125 of Marin's
  ~150 solid buildings had ground more than 0.3 m above a windowed wall's floor (worst 6 m), school buildings included.
  The rule, for every building, school or town:
  1. **Plan on the natural ground, before any earthworks** (`planWalls` in marin/kit.js, called from `sitework`): each wall
     piece (8-12 m of a long wall) gets a floor level the facade can really have (the kit's 'class' wall is one row of
     windows = 4.6 m to the eave, or two = 7.4 m and up; other kinds take the mean ground).
  2. **Lay a pad along every piece** (`applyPads`): a strip 2.2 m outside (1 m inside) the wall, flattened to exactly that
     level, blend 2.6 m. Highest pads first, lowest last: at a step between two pieces the ramp then lies under the
     UPPER piece (its foundation shows, drawn as plain wall), never against the lower piece's windows.
  3. **Deep cuts get a retaining block with a coping** at the pad edge (`buildPadWalls`: as deep as the blend, top at the
     ground behind); shallow ones are a planted bank that starts 2.2 m from the wall, below the sills.
  4. **The floor follows the pad as finally laid**: kitWalls / shop walls re-read the ground after all flattening and
     start no lower than it (a campus pad laid later may have raised it).
  5. **A side that is genuinely bermed is blank**: a house wall whose top row of windows would not clear the ground is
     drawn without openings; rows of windows are counted from the HIGHEST ground along the wall, not the lowest.
  6. Party walls (the next footprint 1.2 m outside) get no pad and are not checked.
  Map check `seating` (builder registers `ctx.walls`: `{ id, a, b, floor, top, open }`): ground 0.4 m outside every wall,
  every ~1 m; > 0.3 m above the floor of a wall with openings fails, ground up to the wall top fails, 0.15-0.3 m and
  bermed blank walls warn. Flat campuses and builders that register nothing skip.
- **Lessons from QA round 2:**
  - **Per-wall pads seat the walls, not the building: flatten the footprint interior too.** The hill inside a footprint
    is untouched by the wall strips; where it stands above the roof deck it comes out through the roof (the service
    building had a 12 m grass ridge across its white roof). After all pads, cut the ground inside EVERY solid footprint
    to its floor (`seatInteriors`: `min(ground, floor)` over the outline). Map check `interior` (`ctx.footprints`).
  - **Order of earthworks:** designed campus pads first (field, terraces, courtyard, pool deck, regraded lot), THEN plan
    the walls on that ground and lay the wall strips (they win at the walls), then the interiors. With the strips laid
    first, every later campus pad cut notches and mounds into them (asphalt mound under a roof ladder, a notch at a
    wall base, door stoops above the lawn). A wall that faces a designed pad takes that pad as its floor (`zones`).
  - **A deep cut pad must reach one lattice cell behind the face of its retaining block** (same rule as the field wall):
    with the pad ending at the face, the "is the ground in front level?" test never passed and no building pad got a
    block at all, only banks.
  - **Level an apron at every door and garage sill** (3 m, eased into the drive): a sill placed at the highest ground
    within its width still has one corner in a sloping driveway. Fix door positions at plan time (a hash of the id,
    not a random draw at build time) so the earthworks know where they are.
  - **Planting beds only on bed-level ground:** where the ground a metre out is more than 0.3 m off the wall's floor the
    kit's mulch bed is dropped (it showed as an orange sliver through the bank).
  - **A gameplay blocker needs a real skin, seen from both sides.** The sight-blocking belt was a near-black `paint` slab:
    correct for the overlook check, a black wall to every player behind it. Now `hedgeMass` (kit.js): leaf texture, mid
    green with a little self-light for the shaded side, a broken line of crowns, collision unchanged.
  - **A QA camera inside a wall manufactures defects** (a "black block" that was a window mullion 17 cm from the lens).
    Test every screenshot pose against collision before shooting: nothing solid within 0.6 m, not under a roof cap from
    inside, not below ground; reject the pose otherwise.
  - **Geometry sweeps complement registry checks.** `seating` / `interior` only see what the builder registered. The map
    check's `glassBuried` (glazing triangles vs the ground 0.35 m in front) and `wallGap` (wall triangles whose foot
    hangs over the ground with nothing drawn below) read the drawn meshes themselves. Decide "outdoors" from the
    collision face the triangle sits on (triangle winding is unreliable), and probe a little in from wall corners:
    a ray along a wall end misses the wall below it (345 false cells before that).
- **Lessons from QA round 1 (all four now have a map-check rule):**
  - **Houses on slopes need a pad, not just a datum.** "Datum = lowest ground, let the hill bury the rest" is right for a
    campus building cut into a slope, and wrong for a house whose footprint falls 6-10 m: the downhill wall became
    9-13 m of windows (a four-storey block where a one-storey house stands). Plan every house on the NATURAL ground
    first (eave = street-side ground + the storeys Street View shows), then fill the ground under and round it up to
    eave - (storeys [+ garage level] x 2.9 m + 0.9 m), cut it down to eave - 2.5 m where the hill would bury the eave
    (`housePlan` / `housePad` in marin/town.js: a `flatten` whose y function clamps the existing height into that band,
    blend 1.5 x the fill). Windowed rows are capped at the storey count; anything below is blank foundation.
    Map check `houses` (builder registers `ctx.houses`): tallest wall <= storeys x 3 m + 1.5 m, rows <= storeys.
  - **A retaining block must be deeper than the pad's blend + one lattice cell,** and the level pad must reach one cell
    BEHIND the block's face. With the pad edge at the face, the 2 m lattice interpolates the bank through the wall: a
    sawtooth of ground triangles up to 1 m high (Championship Field). Now: pad 4.2 m past the turf, face at 2 m, block
    4.7 m deep, wedge blocks on the outside of corners. Map check `retaining` (`ctx.retaining`).
  - **Terrain creates overlooks the flat-map fairness rules miss.** "No roof overlooking one base only" said nothing
    about a lawn 10 m above the red base, 40 m away, behind chain-link (bullets pass). Map check `overlook`: open
    standable ground within 80 m, >= 4 m above a base, with a clear line (terrain and solid colliders block, mesh does
    not), compared between the two bases. Cure used: the evergreen belt that really grows on that bank, as solid blocks.
  - **Re-class the ground by slope after flattening.** A cut bank beside a car park keeps the lot's asphalt class and
    draws as a tilted road. The ground shader now turns asphalt / concrete into grass above ~25-35 deg on terrain
    campuses (src/world/ground.js, `GROUND_TERRAIN`); beside play space anything over 45 deg gets a wall or steps
    (the grass ramp by the Science Center looked climbable and was not).
  - A descriptor point inside a footprint is silently moved (`nearestOpenGround`): the blue base sat 9 m from where the
    descriptor said because [-141, 131] is a cottage. Compare `world.ctfBases` with the descriptor after every load.
  - Colours typed from Street View are too pure for a whole sunlit wall: desaturate ~25 % and cap the chroma (`tame`).
  - A local variable named like the plan object (`pl` = a bucket) turned every house wall into NaN without an error:
    after any builder refactor, scan the merged meshes for NaN positions (three.js only logs a bounding-sphere warning).
  - **Grade streets first; streets and sidewalks are designed surfaces, never draped lidar.** Draped lidar gives a lumpy
    carriageway, centre lines that snake over bumps, and (worse) every building pad beside a street pulls the sidewalk
    up or down into a hump. Earthworks order on a hilly campus: campus pads -> `gradeStreets` (src/world/streets.js) ->
    building pads -> `streets.restore()` -> cheek walls. Per street: the DEM along the centreline is low-passed ON THE
    ROAD GRAPH (shared junction nodes; at a junction the through street's profile carries on and the side streets
    attach, else every corner gets a hump), parabolic crown (a tent crown ripples on the 2 m lattice), kerb, parallel
    sidewalk, a level shoulder behind it, then a blend to the terrain. Buildings adapt to the street: a wall at a
    sidewalk takes the ground just OUTSIDE it as its floor (`streetSide` / `outsideMax` in marin/kit.js) and steps
    inside the lot. Roads benched across a steep hillside are auto-detected (cross-slope) and lose their sidewalks.
    Designed pads that must win over a shoulder go in `protect`, over a sidewalk in `hard` (the field's retaining block).
    Map check `roads` (builder returns `ctx.streets`; flat campuses skip): bump (2nd difference over 4 m less the
    vertical curve over 12 m), cross-slope, sidewalk steps, kerb range, and nothing moved after `restore()`.
    Known limit: on the 2 m lattice the 15 cm kerb is a height difference with a one-cell face, not a vertical kerb.
  - **Pads end at lattice ramps: plan the step, do not let it happen.** Corridors between two buildings are one terrace
    wall to wall; no lower pad may cut into a higher neighbour's strip; where two terraces meet across a strip a cheek
    block covers the ramp (`planCheeks`, checked against the final ground in `buildPadWalls`: no clean step, no block).
    A wall that can start at any height sits at the LOW end of its ground (cut, never fill: fill made asphalt mounds
    under ladders); a party wall keeps the mean (it has no pad, a low floor buries its neighbour's glass).
  - **Shared code that builds "up from y = 0" is a wall on a campus whose ground is not at 0.** The pool coping
    (src/world/water.js) was a box from y = 0 to the lip: on Marin's deck at -4 m that was a 4 m wall round the whole
    pool, invisible from the air. After moving any pad, look at every shared prop on it from eye level.
  - A `// comment` appended inside a one-line statement swallows the rest of the line (four times now): use `/* */`.
  - An instanced skin for a solid mass (the evergreen belt) needs clamped dimensions: a negative cylinder height gives
    NaN normals and the bloom pass blacks out the whole frame, not just the hedge.
- **Never put Street View imagery where it can be committed:** the cache is gitignored; side-by-side sheets go to
  dev/shots/<id>/streetview-compare/ (gitignored); game renders from the same poses are fine to keep.
