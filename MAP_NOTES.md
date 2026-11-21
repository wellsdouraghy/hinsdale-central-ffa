# Map-building notes (read before building or reworking a campus)

Lessons from building Hinsdale Central and Marin Academy, mostly from independent QA reviews. Add to this file
after every map QA round. The contract itself is in CAMPUSES.md; this file is the "what goes wrong and how to avoid it".

## The rulebook: one-shot maps (read this first; it is the user's feedback turned into rules)

The goal is that a new campus ships from the FIRST builder pass: the independent QA round should find nothing that is
already written here. Every rule below comes from something the user (or a friend who went to that school) saw in
the game and complained about. The detailed how-to for each is further down this file. A builder that hands over a
map breaking one of these rules has not finished.

**A. Real, not invented ("photorealistic", "the buildings around it are not real", "not two story")**
1. Draw only what exists. Every building, street, field, tree line and sign comes from data: OSM, satellite, Google
   3D tiles, USGS 3DEP and Street View. No invented neighbourhoods, tenants, shop names or "filler" buildings. Hinsdale
   v1 added a made-up neighbourhood round the campus and the user had it removed; Marin's procedural surroundings were
   called out by a friend from that school. Outside the play area, draw the real footprints from OSM, typed from
   Street View; beyond that, use a low-detail backdrop, never invented detail.
2. Every building's height and storeys are measured against the ground round its OWN footprint and cross-checked
   against Street View (and OSM `building:levels`). Roof kind (flat / hip / gable), colours, material, storefronts and
   real signage also come from Street View; the aerial roof class is wrong for low-pitched roofs.
3. Building quality is the bar the user sets for Hinsdale ("much higher quality... way better"): real facade rhythm,
   window rows only on real storeys, plain foundation below, no repeating slab texture, no blown-out whites.
4. Sports facilities use real standard dimensions and markings: track lanes and curves, turf field lines, goals,
   courts, nets and bleachers ("make some estimates based on common things"). Check the paint against the satellite.
5. Each school is its own brand: logo or emblem, its colours, and teams = school mascot vs its main rival's mascot
   (Hinsdale: Red Devils vs LT Lions; Marin is not the devil logo). Set this in the descriptor or brand.js on day one.

**B. Topography ("get smarter about topography", "this should not be that hard to get topography right")**
6. Hilly sites get real ground (3DEP bare-earth lidar for US campuses, never tile samples on a hill) on day one. A
   flat map of a hilly campus is wrong.
7. Earthworks happen in a fixed order, all of it before anything is placed:
   1. campus pads (fields, courts, pool deck, plazas, regraded lots);
   2. graded streets (`gradeStreets`);
   3. building wall pads and `seatInteriors`;
   4. `streets.restore()`;
   5. cheek or retaining walls;
   6. trees and props moved off the street design;
   7. `ctx.paintSurface`.
8. Terrain never touches a facade above its plinth: no grass over windows, no hill through a roof, no door in a bank.
   Every building is seated on per-wall pads, and every door and garage gets a level apron.
9. Streets and sidewalks are designed surfaces: a smooth profile on the road graph, a crown, a kerb, a parallel
   sidewalk and a shoulder. Never drape them on lidar. Buildings adapt to the street, not the other way round.
10. Everything shared that builds "up from y = 0" is suspect on a terrain campus (the pool got a 4 m wall). Water sits
    on its deck at grade, with a normal coping, matched to the street it fronts.
11. Steep ground beside play space gets a real structure: a retaining wall with coping and a rail over a 1.2 m drop,
    real steps, or a graded and planted bank. A house on a steep lot shows walk-out floors; it never sits on fill, and
    it is never wrapped in stepped concrete. Never assemble a wall from independent slices (the "ziggurat").
12. Anything standing on a slope (landing, prop, fence panel, car, flag) is founded on its LOWEST ground and checked
    against the drawn mesh (`world.groundY` = `meshHeightAt`), not the bilinear height.

**C. Nothing out of place (QA leftovers the user would spot in seconds)**
13. Nothing solid on a carriageway or sidewalk: trees, lamps, posts, benches, buses, hedges, fence panels, wall
    blocks and ledges. Placement uses `streets.inRoad` / `toVerge` and the street design, and every sidewalk is walked
    end to end.
14. Nothing floating, buried or orphaned: no lone fence panel, slab, shrub or coping stub, and no prop half in the
    ground. A run without neighbours is dropped.
15. Look at every changed thing from eye level, from the street outside, from a roof and from the helicopter. A
    fix that looks right from one side is not done.

**D. Playable ("go on top of things", "move around swiftly")**
16. Roofs are reachable (grapple, ladders, mantles) and escapable without the grapple. Nothing traps a player, and
    no mechanic puts a player under a roof skin.
17. Light posts, stadium lights and other tall poles are easy grapple targets. Every ladder (the water tower included)
    climbs and exits.
18. Stairs are climbable with the real controller in both directions: draw the risers and collide on the plane
    through the nosings.
19. CTF bases are on opposite sides of the map (about 250-300 m apart), fair, with cover, several approaches and no
    one-sided overlook (a hill counts as an overlook).
20. The helicopter spawns in a random, hidden spot; spots come from a scan, never picked by eye. Practice mode puts it
    on the main open field.
21. Chain-link and nets stop players but let bullets through.

**E. Looks solid ("see-through spots", "glitching artifact on the walls")**
22. No see-through roofs or walls, and no z-fighting seams or stray decals. Roofs are closed convex pieces with
    double-sided skins, and the roofSkin, visualSolid and facadeSweep checks pass.
23. Signs are readable at eye level and sit on clear wall, never over windows or behind pilasters.

**F. Verified against the source (Branson QA: the terrain was squashed 26% north-south and nobody noticed)**
24. Validate the DEM before building on it. The 3DEP `exportImage` call with `bboxSR=4326&imageSR=4326` and a pixel
    size whose aspect differs from the bbox's DEGREE aspect silently grows the extent (square pixels in degrees):
    a 960 x 900 m request at lat 38 came back 960 x 1137 m. Request in a metric `imageSR` (UTM) or read the extent
    from the GeoTIFF tags / `f=json`, never assume it. Then spot-check ~20 USGS point elevations across the map (edges
    included) against `terrain.heightAt`; mean error over ~1.5 m fails the bake.
25. If terrain disagrees with the tiles or imagery and the "fix" is to shift a hill, regrade a toe or fit a bias that
    changes across the map, stop: that is a registration bug in the data, not a real effect.
26. Count buildings per cluster against a top-down Google 3D tiles shot, not only OSM / county footprints (OSM missed
    a whole quad building). If the school publishes a campus map, tick off every numbered item on it (bridge, named
    tree, gate, garden...) as built or deliberately omitted, in the hand-off.
27. Signature facades (the main hall's entrance, the gym front) and every school roof's colour and material are
    matched against a tiles oblique or photo in a side-by-side screenshot included in the hand-off. Building name
    signs go where the real ones are.
28. Hedges are continuous extruded walls at their real height, never rows of separate cones or blobs.
29. After any terrain re-bake or regrade, `__walk` EVERY existing flight of steps, landing and gate both ways, not only
    the new ones: hand-built stairs keep their old heights while the street and ground move under them (Marin's pool
    stairs ended 0.4 m below the re-graded sidewalk and nothing in the map check caught it).
30. No mounds on paving: a point on asphalt or concrete more than 0.15 m above its neighbours 3 m away along all four
    axes is a defect (map check "mound on paving").
31. Cover added to make the CTF overlook check pass must be real (A1) and must stay off sidewalks and roads (C13). If
    only invented cover would make a base fair, move the base instead.
32. Check roof RIDGE heights against the tiles, not only eaves: a single-pitch roof on a wide plan sits metres low
    (Katharine Branson Hall was 3.5 m short).
33. Outside graded streets and pads the ground stays within ~2 m of the source DEM; a house on a steep lot gets
    walk-out storeys on natural ground, never a fill mound under its pad.
34. Plazas, loops, terraces and car parks take their outline from the imagery. A flatten circle or ellipse makes an
    invented shape with fuzzy, blown-out edges.
35. Never put the satellite photo on a modelled roof (it bakes in tree shadows). Named landmark trees go through the
    tree kit, never ad-hoc low-poly geometry.
36. Each signature building gets its own facade style, matched side by side with tiles or photos. One shared
    "office" style across historic and modern buildings reads as generic.
37. Never re-baseline the street survey after cutting or filling beside a street. Every sidewalk point stays within
    0.15 m of `streetDesign(x, z).y` (map check, 0.5 m grid); Marin's walk grew 0.5 m sawtooth humps that the roads
    and mounds checks both missed.
38. Where a retaining wall or fence run ends at a street corner, `__walk` that corner both ways on both sidewalks: run
    ends are where pits, wedges and stray fence posts appear.
39. Put every CTF base on a top-down tiles shot before committing it. A base never sits on an unmodelled feature
    (Branson's red base landed on a neighbour's swimming pool drawn as lawn).
40. Any roof-height fix is re-measured on a 4 m grid against the tiles over the WHOLE roof, especially where wings
    join; a hip that stops short of the next wing leaves a valley that is not there.
41. No blank wall longer than 8 m on a school building unless the tiles or a photo show one.
42. Every paved outline has a hard kerb or edge, never a fade into grass; island planting comes from the tree and
    shrub kit, not loose rocks. A builder never reports a visual item fixed without a game shot and the matching
    tiles shot from the same pose.

**Definition of done for a builder (one-shot):**
- The map check has 0 fails, and every warning is fixed or explained.
- The builder has walked every building perimeter, every street and every sidewalk at eye level, plus every new
  stair, gate, ladder and entrance with `__walk`, both ways.
- Before/after screenshots are taken from collision-checked poses, compared against Street View where it exists.
- Every rule A1-F42 above is ticked off explicitly in the hand-off.

Then the independent QA reviewer checks the map without seeing the builder's conclusions. Any leftover the reviewer
finds is fixed, re-checked, release-tested and shipped without asking the user, and its lesson is added to this file
(as a new rule here if it is general).

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
- **Options:** `&only=escape,ladders` or `&skip=bots` (check ids: spawns, ladders, heli, terrain, houses, retaining, mounds, walkDesign, overlook, seating, interior, facadeSweep (= glassBuried + wallGap), props, signs, boundary,
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
    **Validate the registration before anything is built on it:** read the extent back from the GeoTIFF tags (the
    ImageServer returns square-degree pixels whatever `size` you ask for), and compare the baked file with >= 20 USGS
    epqs point elevations across the play area and its edges (mean error <= 1.5 m). Marin shipped five rounds on a DEM
    stretched 26 % north-south ("DEM registration" in the Marin section; tools/terrain.py does both on every run).
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

- **Ground source: USGS 3DEP.** The National Map ImageServer (`3DEPElevation/ImageServer/exportImage`, `format=tiff&pixelType=F32`,
  no key) returns bare-earth lidar at 1 m: no roofs, no canopies, no min filter needed. On open ground the 3D-tiles
  samples agree with it to ~0.3 m after ONE constant offset (ellipsoid vs NAVD88: -13.6 m here, the same in every
  quadrant). *This bullet used to say the tile offset "drifts across the map" by 3-20 m and that the lidar "predated the
  regrading" of a car park and of the pitch. Both were wrong: the DEM had been fetched stretched 26 % north-south (see
  "DEM registration" at the end of this section). On the correctly placed DEM the offset is constant, that car park is a
  level lot (0.8 % fall) and the pitch is flat to 4 cm.* Tiles are still for roofs only: they cannot see the ground under
  canopies.
- **A plane fit per OSM `amenity=parking` polygon is a registration test.** Real lots are planes to < 0.2 m rms; a lot that
  reads as a 15 % hillside means the DEM is misplaced, not that the lot was regraded. Do not flatten it away: find out why.
- **Building heights (the "not two storey" report).** Roof = tile samples inside the footprint, shifted by the one
  constant tile-to-DEM offset (median over smooth tile cells clear of every footprint); ground = DEM on
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
  - **Everything must respect the designed street section.** Grading the streets is not enough: the canopy scan's trees,
    lamps, a parked bus and hand-placed walls were all laid out against the lidar / photo and ended up on the graded
    carriageway (trunks 0.8 m from a centre line, a pool wall inside the nominal kerb line). After `streets.restore()`:
    move every tree with `streets.toVerge`, test posts with `streets.inRoad`, and check hand-built enclosures against
    `streets.surface`. Map check `roads` fails a trunk within 0.6 m of a carriageway and any post / prop on one.
  - **Paint surface classes from the design.** The satellite classes under tree crowns are grass: a grass wedge across a
    hairpin, a lawn island in a junction. `ctx.paintSurface(streets.surface)` (src/world/index.js) rewrites the surface
    mask, the class map and (where the class changed) the photo tone: asphalt on carriageways, concrete on sidewalks.
    Map check `roads` compares the class map with the design at every station.
  - **Check an enclosure fix from every approach, including the street outside.** The pool looked right from the deck
    and the air while its 5th Ave side was a bare slab on the kerb line. Street View showed a wall set back behind a
    planting bed with bar gates.
  - **The play boundary is not the visual boundary: walk it looking outward.** Context shells just outside the boundary
    were plain boxes; every shell now gets window rows on its top two storeys like the houses.
  - **Hidden tabs throttle QA.** Timers and frames slow down in a hidden pane: movement tests report "stuck" or "below
    ground" that are not real. Keep the game tab in front for anything that walks; raycast checks are unaffected.
  - **Two ground heights: the smooth one for building, the mesh one for standing.** `terrain.heightAt` is bilinear; the
    drawn and collided mesh splits each cell along one diagonal, so on a twisted cell they differ (QA measured up to 1.65 m on steep samples on Marin; 0.35 m was the figure on walkable ground).
    `world.groundY` is now `terrain.meshHeightAt` (exact on the mesh: flags, dummies, markers, bodies); builders, street
    grading and the map check keep the bilinear `ctx.groundY` / `heightAt`. Do not make `heightAt` itself barycentric:
    car placement and the graded cross-sections were tuned on the smooth surface (a car ended 1 m buried).
  - A drop of more than 1.2 m at a retaining block gets a guard rail (`guardRail` in marin/kit.js, built by `buildPadWalls`).
- **Lessons from the polish round after QA 5 (leftovers; tools: `__look` / `__sheet` / `__walk` in dev/marin.js):**
  - **A streak of grass across a street is geometry, not paint.** At the Bonnie Brae / Bryn Mawr fork the class map was
    asphalt all the way; the two carriageways run side by side 2-4 m apart in height, the designed surface steps between
    them over one lattice cell (45-50 deg), and the ground shader turns steep asphalt into grass. Look at the slope
    before touching the surface classes. A fork on a hill gets a retaining wall between the roadways (`goreWalls` in
    marin/kit.js: clusters of steep carriageway points that have pavement both above and below, one strip with straight
    faces (least-squares lines) and a top one constant kerb height over the upper road, coping, rail). Requiring pavement on BOTH sides is what keeps it off road ends and off the foot
    of the field wall (two false clusters before that test).
  - **A solid mass is as deep as it is DRAWN.** `hedgeMass` swells 0.3-0.5 m past its collider and its nominal depth
    (half depth = 0.24 d + 0.22 + column radius): a row laid out on a fixed line beside a street that is not parallel to
    it hung 1.1 m over the asphalt. Fit each piece between the fence line and `streets.inRoad`, drawn columns included.
    And its collider reached 1.6 m above the leaves (right for a 5 m belt, an invisible wall over a waist-high row):
    under 3 m the collider ends at the clipped top.
  - **A context shell needs a ground floor too.** "Windows on the top two storeys, plain below" is a foundation only
    where the hill falls away under the wall; on level ground it is two storeys floating on a grey slab. Per wall: if
    there is a storey of height between the wall's own ground and the window rows, draw it (shopfront + fascia on
    street-facing walls of flat-roofed blocks, a rendered storey with a plinth elsewhere), seated on that wall's ground.
  - **Yard fences are runs, placed against the street design.** The rule "not on asphalt" let single 2.5 m panels, hedge
    clumps and garden-wall slabs stand on sidewalks and lawns wherever their neighbours had been rejected. Now: the
    line stands behind the sidewalk / 1.2 m clear of a carriageway (`streets.design`), a panel needs plane ground under
    it (mesh heights at five points; it is laid on a fitted plane), and a panel without a neighbour is dropped.
  - **Stairs: draw the risers, collide the plane through the nosings.** On terrain campuses the controller's step-up
    (STEP = 0.45 m) only accepts a landing with a walkable contact normal, and a capsule (r ~0.35) on a 0.30 m tread always
    touches the next nosing: with one collision box per 16 cm riser the walk test stopped on the second step, every time.
    The nosing plane (28 deg here) walks up and down at walk and sprint speed with no air time. **Walk every stair with
    `__walk` (real controller, forward only), both directions**; a riser under the step limit proves nothing.
  - **A stair or walk between two buildings: the lattice ground there belongs to the neighbours.** In a 3.4 m alley every
    lattice node but one row lies inside a footprint (cut to that building's floor), so the alley floor tilts toward the
    lower building. Build the designed piece wall to wall as a solid mass, cut the ground under it (min, never fill:
    fill buries glass next door), and end it with an apron that dies into the ground.
  - **An accessible entrance follows the street's fall.** The pool deck is level, 5th Ave falls 1.7 m along its wall: the
    gate at the low end is 0.6 m above its sidewalk. The walk leaves the sidewalk where the two are level and runs along
    the wall to the gate (kerb + handrail where it stands above the bed, steps at the low end), instead of a ramp
    square to the wall that would need 7 m.
  - **Retaining blocks are terraced only where they are long** (`terraceBlocks` in marin/kit.js): at most 1.5 m per
    riser, 1 m treads, coping on every edge, planting on the treads, the rail on the top edge; a level that the bank
    pokes through is skipped. Blocks under 5 m wide (the cheek blocks at building corners) stay ONE wall with coping and
    rail: stepped, they were giant stairs to nowhere (QA). They are registered `allowTall`.
  - **Do not wall a problem that the house plan made (QA: "FIX FIRST").** A house whose footprint falls 10 m was planned
    with three rows and stood on 6 m of fill ending one lattice cell from the road: a cone of grass. Stepped walls built
    in 1 m slices round that corner came out as a concrete ziggurat (sawtooth plan, coping at random heights, rail in
    fragments, a sheer 4.7 m tail wall) and looked worse than the grass. The cure is upstream: the house shows walk-out
    lower floors on the downhill side (`HOUSE_LOWER` in marin/town.js adds rows, the map check counts them as storeys),
    no fill, and the lot keeps its natural bank. If a tier is ever needed: one continuous run per side, one top height,
    one mitre, one rail. Never assemble a wall from independent slices.
  - **A 2 m lattice cannot put a 2.5 m step beside a 2.2 m sidewalk.** Along Mission Ave the pitch (a `hard` pad) kept its
    bank on the designed walk. Cutting the walk zone back to its design level after `restore()` moves the ramp to the
    cell at the fence, and the hedge covers exactly that ramp (from the fence line to where the ground has reached the
    walk level, one row of columns where narrow: `hedgeMass` `oneRow`). The walk is clear from there, not full width
    everywhere; full width needs the fence and pad 2 m further from the street.
  - **Street furniture and designed entrances:** a random bench landed across the mouth of the new stair alley. Anything
    placed by a seeded loop gets an exclusion test AFTER its random numbers are drawn (nothing else moves), and every
    new entrance is walked along both walls, not only down the middle.
  - **"Sunk" props: check the drawn mesh before moving anything.** The map check's `floating` for a car is measured from
    the lowest ground in its radius (a neighbouring footprint's cut floor counts); the car at (71, 162) stands on the
    mesh (roof 1.75 m above it).
  - **Final round (QA on 4170c68):**
    - A sight-blocker that is dropped "for lack of room" opens a base to the street. Where the Mission Ave hedge has no
      bank to stand on (the street is level with the pitch or above it) it is one row on the field wall's block, right
      behind the fence. Check `overlook` AND look through every fence after trimming planting.
    - **A retaining block ends where the sidewalk begins.** The field wall's 4.7 m block took its top from all the ground
      under it and stood 0.4-0.5 m proud across the walk (a forward walk stopped on it). At a graded street it is as
      deep as the strip to the walk (2.3 m at the least: the pad's ramp), top = the ground under that footprint, and the
      walk beyond is set to its design (raise from 2.1 m behind the block's face on, so no ramp starts in front of it).
      Walk every sidewalk end to end with `__walk`.
    - **Walk-out floors are drawn bay by bay.** Counting rows from the highest ground along a whole wall left a blank
      base of 4.5 m at the low end. A `HOUSE_LOWER` house steps its window rows down with the ground one module at a
      time and has a door with a landing on its lowest floor, at a bay joint (between two windows).
    - A cut after `restore()` can start one lattice cell from anything that must stay level (18.0 for a turf edge at
      16.0), never nearer: the ramp takes the cell before the first cut node.
    - Narrow cheek walls are registered `allowTall` (accepted as built); gore-wall tops follow the road cross-line by
      cross-line (sampling a metre each way on a 24 % street made a 0.5 m kerb).
    - **Anything standing on a bank is founded on its LOWEST ground.** The walk-out door's landing was built from the
      highest ground within its radius: its underside hung 0.5 m over the falling bank and its top stood up to 1.65 m
      above the grass with no way up. A landing is a box from 0.3 m below the lowest ground under its footprint up to the
      door's sill, the sill is the floor line of the bay it stands in (not the ground), steps go down on the uphill
      side until they meet the ground (nosing-plane collision, walked with `__walk` both ways), and the outer edge and
      the downhill end get a rail. Measure it: cast down on the landing, compare with the mesh under it.
    - **A block beside a sloping walk has a sloping top.** One level top per 3 m panel on an 8 % street is a 0.25 m ledge
      at the low end: the top is the walk's level at the block's outer edge at each end of the panel (quads, not a box).
  - **Close an after-shot loop against HEAD, same poses.** `git archive HEAD` into a scratch folder, a second Vite on
    another port, the same list of camera strings in both (each tested: nothing solid within 0.6 m, above the ground).
- **Never put Street View imagery where it can be committed:** the cache is gitignored; side-by-side sheets go to
  dev/shots/<id>/streetview-compare/ (gitignored); game renders from the same poses are fine to keep.
- **DEM registration (the terrain-fix round; tools/terrain.py). Every hill was 26 % too far from the origin north-south.**
  - **What went wrong.** `exportImage` was asked for a 960 x 900 m box as 960 x 900 px with `bboxSR = imageSR = 4326`. The
    server keeps SQUARE DEGREE pixels and silently grows the extent to fit the size: the tiff covered 960 x 1137 m, the
    sampler assumed 900 m. The ground at z in the game was the real ground at 1.26 z. Near the origin nothing showed; at the
    play-area edge hills stood 45 m from where they are, the far backdrop DEM was stretched the same way.
  - **How it hid for five QA rounds.** Every symptom got its own explanation and its own fix: "the tile offset drifts across
    the map" (a locally fitted offset), "the lidar predates the regrading" (a car park flattened by hand, y = 11), "a house
    whose footprint falls 10 m" (walk-out floors, then a ziggurat), a 4 m retaining wall round the north of the pitch, gore
    walls at a fork that is 2 m high, not 4. **Three unrelated-looking compensations in one bake are one bug upstream.**
  - **The rule.** Build the request from ONE pixel size in degrees and a whole number of pixels each way (or ask for a metric
    `imageSR`), READ the georeferencing back from the GeoTIFF tags (ModelPixelScale / ModelTiepoint) instead of assuming it,
    assert the pixel aspect, and validate the BAKED file against independent point elevations on every run: 63 USGS epqs
    points over the satellite rectangle (cached), the bake fails over 1.5 m mean. Before: mean 2.60 m, max 16.9 m (play
    area 1.94 / 16.9). After: mean 0.04 m, max 0.27 m. Also print the tile-to-DEM offset by quadrant: it must be one number.
  - **After a re-bake, re-measure everything that was typed in from the old ground.** Hand-entered absolute heights (the
    school's roof tops, the helicopter deck, a pad's `y`) carry the old error: the roofs were up to 1.4 m off, the service
    building 3 m. Keep such numbers in ONE table with their source (`TOP` in school.js). For hip roofs the eave is the LOW
    end of the tile samples (10th percentile), for flat roofs the median; "the delta of the old value" is not a measurement.
  - **A house above its road: the eave is the measured roof, the front is the road it is seen from.** "Street-side ground +
    the storeys Street View shows" put the hill house four storeys up, because the nearest centre line was the lane ABOVE
    its roof and Street View had counted the storeys from the road below. `HOUSE_FRONT` names the street, `HOUSE_LOWER`
    takes the measured eave; the bank behind is cut to a terrace, the house is not raised to clear it.
  - **Real ground moves the steps to where they are.** The courtyard between the Library and the Leadership Center lies
    1.6 m below Mission Ave; on the stretched DEM that step lay out in the street and vanished in the grading. Now it is at
    the building line: a flight in the frontage strip (`COURT_STAIR`, shared `stairFlight` with the pool stairs), a
    retaining block either side, a forecourt at courtyard level. Lattice bookkeeping that made it work: the level pad
    starts a lattice ROW behind the back of the walk (not "2 m": look at where the rows fall on the rotated grid), the
    blocks cover the row that ramps, a block's return in front of a neighbouring wall is a plain mass (registering it as
    a retaining face makes the map check sample "in front" of it inside the building), and the ground just INSIDE a
    footprint next to a lower terrace must be cut too, or the lattice carries street level through the wall onto the
    windows that face the terrace.
  - **A sidewalk needs room, per stretch of street.** With real cross-slopes fewer streets are "benched hill lanes", so more
    of them got sidewalks: two walks squeezed into the 6 m between the carriageways of a fork became one 30 deg ramp, a walk
    on a 17 % lane kinked at every vertex. `walkRoom` (marin/world.js) splits a road at its OSM vertices and drops the walk
    on a side where the strip to the next carriageway cannot hold both walks and a 1 : 1.5 bank, or where the lane climbs
    more than 12 %. Splitting a street into pieces exposed an engine artefact: past the end of a piece the round cap has
    less crown, and blending it with the piece alongside dipped the centre line 8 cm (streets.js now drops the cap when a
    piece of the SAME street covers the point; never when only another street does: its sidewalk took over the roadway).
  - **The walk beside a level pad, both ways.** The Mission Ave rule (walk cut back to its design after `restore()`) is now
    one rule round the whole pitch: cut where it stands above the design, raise from a lattice cell behind the block's face
    on, and raise the verge node just inside a walk that stands above the pitch, so the walk is level over its full width
    and the ramp lies under the block (Bryn Mawr Drive runs 3-5 m above the east side). Anything that changes a street
    after `restore()` used to call `streets.resurvey()`: RETRACTED (second QA below), do such changes before `restore()`.
  - **Sight-blockers follow the ground, not the wall.** The evergreen belt was tied to "wall higher than 2.2 m". With the
    north wall 1-2 m lower on the real ground, the gym plaza looked straight down on the red base (overlook: 117 m2 vs 0).
    The belt now also stands wherever the ground 6-14 m behind the field edge is 3.5 m or more above the pitch.
  - **Small things the re-bake flushed out:** a sign placed at a fixed share of a wall's height landed on the clerestory when
    the wall grew 3 m (place it a fixed distance under the eave); cars were tested for slope at their centre only (test the
    footprint); a team spawn on a twisted lattice cell stood 16 cm off the drawn mesh (collision.js: spawns only where mesh
    and smooth height agree to 6 cm); trees were moved off carriageways but not off the new sidewalks (`toVerge` with the
    walk's width when the design says 'walk').
  - **Google 3D tiles from a dev page on another port:** the key is restricted to the referrer of the default dev server.
    Load `dev/<id>-tiles.html` from that server and post the canvas to your own receiver; do not forward requests with a
    spoofed Referer.
- **QA of the terrain-fix round (NOT SHIP, then fixed): what the builder's own verification missed.**
  - **A stair is fitted to the DESIGNED walk, not to the ground at its head.** The pool stairs took their top from the
    terrain a metre behind the landing; after the re-bake that ground was a lattice ramp 0.4 m below the re-graded
    sidewalk. Both flights now go through one `fitFlight` (marin/world.js): top = `streets.design` of the walk behind its
    back edge, an apron from the walk to the top riser, nothing cut under the top tread, the floor from the foot to the
    terrace cut level. The builder's walk test had started half way down the flight: **start a stair test on the
    sidewalk and end it on the terrace, on every lane (both walls and the middle), both ways.** Do not aim a walk test
    at a bench: three "failures" on the spectator terrace were the benches on its deck.
  - **Cover that exists only to pass the overlook check is invented (A1).** The evergreen belt on the field wall was tied
    to wall height, then to the ground behind; the tiles show open woodland there and Street View looks straight across
    the pitch from Bryn Mawr Drive. Without it the red base on the pitch was overlooked from 1584 m2 (blue: 0). The base
    moved to the plaza between the gyms, the Science Center and Foster Hall (buildings on every side, 259 m from blue,
    overlook 0 / 0). **Ask "what hides this base in reality?" before placing it, not after the check fails.**
  - **A clipped hedge is one extruded wall (rule 28).** `hedgeMass` drew bushy columns with cone tops and swelled 0.3-0.5 m
    past its collider: on Mission Ave the cones stood on the back half of the sidewalk. It is now a plain body with a
    narrower shoulder, exactly as deep as its collider; `hedgeRun` runs a hedge through stations with a sloping foot and
    top (Mission Ave: fitted between the fence line and the back of the designed walk, never on it).
  - **A retaining wall has ONE top.** A level top per 3 m panel is a sawtooth with notches of bank between the teeth.
    `perimeter` (marin/grounds.js) is two passes: what each panel needs, then the upper envelope with a slope of at most
    15 % (forward and backward sweep), sloping quads, one coping, corner wedges at the same top. A wall ends by tapering,
    never in a step. Street detection must run for EVERY panel: the tapering end of a tall neighbour ran out across the
    Mission Ave sidewalk as a 4.7 m deep block.
  - **A block whose top is level on a street that falls 7 % is a wedge.** The blocks beside the courtyard steps are now
    planted beds whose top runs with the sidewalk (ivy, a low clipped hedge, a wall and coping only on the forecourt side
    and along the flight). Cheek blocks under 0.75 m are banks, not walls (0.5 m plinths stood on the frontage). A wall
    whose floor is more than 1.2 m above the ground beyond it gets no pad at all: filled up to the floor it was a
    2.6 m berm against the Leadership Center and a mound on the paving beside it; the foundation shows instead.
  - **Hill lanes have no sidewalks (tiles), whatever the cross-slope rule says:** `NO_WALK` by street name. That also
    removed the 6-8 cm centre-line bumps on Bonnie Brae (they were the walk / no-walk joints).
  - **Furniture goes behind the walk, not "on the kerb side of it":** planters, benches and bins at 3.3 m from the kerb
    with a design-zone test, signal masts through `toVerge`, lamps 0.4 m from the kerb, no car bumper over a walk
    (six points of the car against `streets.design`).
  - **Separate small pads on a slope make steps between them.** Four 2.4 m pads on the 19 % gym plaza each took their own
    level; a table stood 0.7 m deep in the step. One terrace under the group.
  - **New map-check rule `mounds`** (dev/mapcheck.js): a paved point more than 0.15 m above the ground 3 m away along all
    four axes, not under a solid. It found the hump at the foot of the pool stairs, a berm beside the Leadership Center
    and a pad joint in a concrete yard.
- **Second QA of the terrain-fix round (v6): sidewalks on the 2 m lattice.**
  - **A walk is only as level as every lattice node within a cell of it.** Mission Ave's walk runs 7 deg off the grid, 3 m
    from the pitch and 1.7 m below it: each time its back edge crossed a lattice row, a pad node just behind it pulled the
    walk up half a metre (a sawtooth every 16 m). `streets.restore()` now ends with a SKIRT pass: every non-road node within
    2.1 m of a walk point takes that walk's design level, footprint interiors and wall pads included (`streets.skirtAt`);
    road and walk nodes are restored even inside a footprint. Designed pads (`protect`) do it themselves: round the pitch a
    node is raised or lowered from 2 m outside the turf, and only lowered nearer than that.
  - **Then the step needs a structure, not terrain.** Where the street is lower than the pitch the last cell at the turf
    edge dips: a planted margin (pitch-level slab, ivy, the hedge on its street side, collision under the turf edge) covers
    it, and the gate gap gets a landing and a concrete ramp. Where the street is higher, the field wall's block moves its
    face toward the turf until the ground in front of it is level, and carries on UNDER a walk that dips toward the pitch
    (the walk there is the block's top). No `hard` exception: a pad that narrows a sidewalk made the corner pit.
  - **Never re-baseline the street survey after a cut or fill** (`resurvey()` is gone): it turned "the walk moved" into a
    pass. Do the designed changes BEFORE `restore()`; what restore surveys is what ships.
  - **New map-check rule `walkDesign`:** every walk-zone point (0.5 m grid) against `streetDesign(x, z).y`, > 0.15 m fails.
    Skipped: ground under a solid, the 0.6 m kerb strip, seams where two streets' walks meet at different levels. It found
    22 places on the first run (the pit 2.05 m, the humps 1.3 m, a building in the walk, the pool house 2 m into the walk).
  - **Every earthwork change can wake a dormant generator.** The skirt raised the nodes at the head of the pool stairs,
    `planCheeks` then saw a clean step between two wall pads and filled the head of the flight with a cheek block: all
    six lanes failed, and only the stair re-walk caught it. Designed flights register `ctx.noCheek`.
  - **A sidewalk does not run through a building.** `walkRoom` now works per 12 m stretch and drops the walk on a side where
    more than a quarter of it lies inside a footprint (974487547 stands at the kerb). The pool house was 2 m into the
    Mission Ave walk: 7.2 m deep from the same deck front.
  - **Helicopter pads are scanned at load** (`heliScan`, world.js): 2 m grid, lots first, then pitch, concrete, lawns;
    relief, streets, footprints and trunks pre-tested; the pipeline's exact test decides (19 pads). No typed list.

- **Third QA of the terrain-fix round (v7 -> fix 4): the Mission Ave / Bryn Mawr Drive ("E St") corner, built instead of patched.**
  - **Look at the street before designing its edge.** Three rounds argued about a "field wall" along Bryn Mawr Drive. Street
    View shows no wall and no sidewalk on the pitch side at all: a red kerb, a strip of dry grass, a planted bank with a row
    of trees down to the ball-stop fence, a low chain-link fence behind the kerb where the bank is high, and the concrete
    sidewalk on the EAST side (OSM maps it as a footway; the street had been put in `NO_WALK` whole). Six Street View frames
    (one along each side, one at the corner) would have settled it before the first block was drawn.
  - **A 7 m strip that rises 3-5 m is a built surface, not terrain.** On the 2 m lattice the retaining block needs the pad to
    reach a cell behind its face, so the "wall" grew to the kerb: a 6 m concrete slab on a 3.5 m blank wall. `eastSide`
    (grounds.js) is one mesh from the fence line to the kerb: toe wall (0.5 m, as high as a bank of at most 32 deg needs, rising
    to meet the corner block), bank, verge, kerb; `eastSideGeom` is the ONE definition of that surface, used by the builder and
    by sitework, which cuts the lattice 0.35 m under it (and to pitch level within 2.3 m of the fence line, so no node next to
    one in front of the wall face can stand up). Trees and shrubs stand on it; the fence is continuous on the toe wall.
  - **Where a fence corner stands 0.7 m from a sidewalk 2 m above it, the walk is built too.** No lattice holds that back edge
    (the pit). The corner of the walk is a concrete apron at the walk's design level, kerb to back edge; the bed behind it is
    level with the walk (a 12 cm kerb) for 2.2 m before the bank starts, so no node of the walk's skirt pokes through it.
    **One surface, not three:** the first apron was 13 m long and ended where the field wall's blocks still carried on under
    the back of the walk, so its end crossed their tops in a diagonal seam ("a wedge lying on the sidewalk"), and dipping
    the end a blind 10 cm made it worse. It now starts 23 m from the corner, west of the last such block, and its first
    1.5 m meet the walk AS LAID (ground + 1 cm, point by point), not the design.
  - **A step in the DESIGN is copied by everything built to it.** 13 m west of the corner the sidewalk design itself stepped
    0.19 m across the walk: in `streets.design` the "two roads at different heights" blend let Bryn Mawr Drive (0.9 m higher)
    in at full weight the moment a point came within its reach. `gradeStreets(..., { taper: 4 })` fades an arm in over the last
    4 m of its reach (opt-in: other campuses keep their surveyed design). Scan the walk design for jumps (two points 0.25 m
    apart, more than 6 cm) before building anything on it; the jumps left on Marin are corner seams where two streets' walks
    meet (the map check skips those).
  - **A block top beside a walk or a street is planted, with a coping under the fence.** The blocks that hold the pitch were
    bare concrete shelves 2-5 m deep (the "wedge" between the fence and the Mission Ave walk, a slab at the north-east
    chamfer beside Bryn Mawr Drive). Street View and the satellite show dry grass, brush and woodland floor up to the fence:
    every block top and corner wedge now carries the verge texture from the coping to the back edge of the walk (the part
    under a dipping walk stays concrete: it is the walk).
  - **The shoulder of a street keeps its design right up to a wall.** North of the built bank the first 2.5 m behind the
    kerb stood 0.3-0.5 m low: the rule that hands verge nodes to the street only applied 7.2 m from the turf. The level
    shoulder (`d.t < 0.35`) now takes its design from 5.2 m.
  - **A gate between two levels is a flight of steps that fits BEHIND the walk** (`gateFlight` / `gateSteps`): from the turf
    edge to the back edge of the walk (9 risers in 2.5 m), cheek walls holding the planted margin, exactly as wide as the
    opening the fence run really leaves (one 3 m panel: the first version was 4.8 m wide and a fence panel hung across the
    outer lanes). The ground under the flight and one cell either side is cut after the pads, before `restore()`.
  - **Do not move a terrace over a slope and wall the difference.** The plaza terrace at the red base reached 5 m too far
    south, over the passage between the Old Gym and the Science Center: a 1.1 m ledge, a 2.2 m wall, a cheek block in the
    middle. The lidar shows a plain 2.3 m fall over 6 m there. A designed slope (21 deg, the terrace's level to the passage's)
    laid BEFORE the wall plans, and long enough to cover the terrace's own blend at its foot: a 0.4 m lip left there was
    enough for `planCheeks` to stand a block in the passage.
  - **Rule F33 is automatic now** (`housePlan`): a plan that needs more than 1.2 m of fill gets walk-out floors instead (rows
    step down bay by bay on the natural ground). QA named two houses on 3-6 m of fill; the map check had listed sixteen.
  - **Street lights are what the street has.** Acorn posts "behind the walk" stood inside the 4.4 m hedge. Mission Ave is lit
    by cobra heads on wooden utility poles: `utilityLamp`, 9 m, foot in the face of the hedge at the back of the walk, head
    over the street, a grapple target. None on the pitch side of Bryn Mawr Drive.
  - **Sweep the WHOLE perimeter for drops, not the wall QA named.** QA found one fence gap on the east wall; a sweep (every
    1.5 m round the pitch, from 1.7 m outside the fence line walking in, a fall of more than 1.2 m to pitch level fails)
    found two more openings: a 3 m gap on the 5.2 m north-east wall (closed) and the 26 m of the north-west side that is
    open toward the campus on a 2-3 m wall. `perimeter` now runs a 1.1 m guard rail along any opening whose wall is more
    than 1.2 m high (rule B11): it can be jumped, it cannot be walked off.
  - **Walk every sidewalk from its own zone, not from typed coordinates.** After a rebuild QA's old probe points lay on the
    pitch or in the bank. The test that settles a street: scan the walk zone for its centre every 3-4 m, walk centre, back
    edge (-0.75 m) and kerb side (+0.75 m) both ways, compare the trace with `streetDesign`, then the verge on the side
    without a walk, the two crossings at the corner, and a sweep from the kerb toward the pitch every 2 m (nobody may reach
    pitch level: the fence is continuous).
  - **Walk-test targets must be standable.** A target 0.6 m from a new pole, on a parked car or in a building that interrupts
    the walk reads as "stuck" or "missed"; test from kerb-side points of the walk zone and report the nearest approach.
  - **Small things:** the skirt gives a shoulder node the level of the NEAREST walk point, which at a seam of two walks is the
    wrong walk (two places 0.2-0.3 m low: the shoulder's own design wins where they disagree); the dip scan of a field block
    must start at the walk's back edge, not at the block's minimum depth; a prop laid with `onSlope` registers its plane and
    the map check measures it against that plane (a car on a 9 % street read "31 % buried"); roof helicopter pads are
    registered by the builder at the height it built (`ctx.roofPads`), none typed; a walk on a straight 13 % street that
    Street View shows is kept (`keepWalk`), the 12 % rule is for lanes that kink.
- **QA round 4 leftovers (SHIP, then fix 5): solids on walks that the map check skips, and blank walk-out floors.**
  - **`walkDesign` skips ground under a solid, so it cannot see a building or a stoop ON a walk.** Scan every walk-zone point
    (0.5 m) for a footprint ring within 0.4 m and for collision more than 0.12 m above the design, cluster, and look at each.
    It found the stoop and porch posts of 974487542 on the Mission Ave walk, which QA had not named, next to the one it had.
  - **A footprint that stands on the walk: ask Street View which one is wrong before moving either.** 974487544's front wall was
    0.3 m into the Mission Ave walk; the frame from its own panorama shows kerb, grass strip, walk, a hedge and the facade 4-5 m
    behind (ground distance from the image row: camera height / tan(angle below the horizon, pitch included)). The OSM outline
    was moved 3 m (`RING_SHIFT`, world.js), not the street. A house's stoop and porch posts are dropped wherever they would land
    on a walk or a carriageway (house(), town.js).
  - **A satellite class is not a design.** North of the built east side, Bryn Mawr Drive's west shoulder read "concrete" (dry
    grass from the air) and rendered as a jointed sidewalk with a tree and a lamp in it. Where Street View shows a verge, paint
    it (`paintSurface` -> grass) and draw what edges it (`bmWestLip`: the concrete lip at the asphalt).
  - **A curve interpolated between samples overshoots.** The east-side bed started at the walk's back edge sampled every 0.25 m
    and linearly interpolated: round the corner fillet it cut 0.1-0.2 m into the walk, 0.14 m proud. Take the furthest of three
    neighbouring samples plus a few centimetres.
  - **A wall end square to the back of a walk is a snag.** The toe wall's south end stood 0.31-0.35 m over the dirt margin
    between the Mission Ave fence and the walk, 0.4 m from a player hugging the back edge: STEP is 0.45 m but the step failed
    there. A concrete chamfer from the margin to the coping (23 deg) fixed it; walk the back edge (centre at -0.2 m from it)
    both ways, not only the centre line.
  - **Walk-out bays: decide each window row by the ground under the WINDOW**, not by the highest ground across the bay (a bay
    with a bank at one end kept a 3-6 m blank lower storey): a row is drawn when the ground under the middle 40 % of the bay is
    below its sill (floor + 0.75 m) and the bay's ends are no higher than mid-window. The walk-out door keeps the old floor.
  - **Bots resting on a parapeted roof is not a campus defect:** 900888955 has a working ladder (map check) and the standard
    0.45 m parapet that a player jumps; the descent is shared bot code.

## Branson (first campus built from the rulebook; scripts in src/campuses/branson/tools/)

- **RETRACTED: "the lidar can be older than the campus".** The first build read Ross Creek's channel and a hill toe under
  the south half of the pitch and "cured" it with a 13 m regrade shift and a channel fill. The lidar was right; the bake had
  squashed it 26 % north-south (rule F24). On the corrected DEM the creek runs behind the pitch and the gym, the quad is on
  flat ground, and tile heights differ from the DEM by ONE constant (-16.28 m, 100 m blocks within 0.3 m). If two sources
  disagree by metres over a whole area, print both on a grid and look for a scale / offset pattern before inventing history.
- **Stale coarse 3D tiles hang hundreds of metres up.** A straight-down ray took a parent tile 600 m above the campus as
  the first hit in 40 % of the cells: drop hits above a sane height in the sampler (dev/branson-tiles.js).
- **Tiles cannot see the ground under closed canopy.** Low values under trees are sagging mesh, not ground; high values
  are crowns. On a wooded site read roofs and open ground from the tiles, never the forest floor.
- **OSM may not have the school at all.** Here only a node: no campus polygon, no pitch, and the two newest buildings
  missing. Hand-digitise them from the photo in one data file with its own id range (tools/data/extra.py, merged by
  osm.py), so gen.py, the Street View plan and the builder all see ordinary buildings / areas.
- **A building that backs onto a steep hill: cut a bench, then a bank.** Wall pads alone gave retaining blocks 13-16 m
  high behind the quad. Before the wall pads, cut the ground to the floor for 7.4 m behind the walls (the depth the pad's
  retaining block would take) and let it rise from there at 36 deg (`bank` in school.js / sitework): no block, a level
  service strip, a planted bank; the lidar wins wherever it is lower.
- **Pick CTF bases with the overlook count, before building round them.** The lower campus (quad, loop) lies under a
  10 m plateau and a 34 m hill: 250+ cells of high ground with a line to any base there. A ten-line console loop over
  candidate points (terrain-only line of sight, same thresholds as the map check) found the two ends of the plateau with
  0 cells each in a minute. The hill above the quad stays outside the play bounds.
- **Smoothing a street polyline must keep junction vertices.** Corner-cutting the campus drive removed the vertex a side
  street shared with it: the two no longer met on a node and the cross-slope test failed at the junction. Keep every
  vertex that another graded street also has.
- **A protected pad swallows a road that touches it.** A generous "keep the shoulder off the field" zone (9 m past the
  turf) covered the car-park loop: 11 % cross-slope. Protect the pad you built, not a margin round it.
- **Hedges are the street in some towns.** Ross has no sidewalks and no kerbs; every lot is behind a 2.5-3 m clipped hedge
  (Street View showed hedges in 13 of 15 views and no house). Draw them as solid runs fitted against the street design,
  with gaps at the driveways so no yard is sealed (the terrain check needs a way out of every hollow).
- **Helicopter spots: hand the pipeline the scan.** With an empty `heliPark` the builder passes every level 5 m cell that
  is clear of the streets (car parks first); the shared exact test picks; the accepted spots are then written into the
  descriptor so parked cars keep clear of them. Keep spare candidates after the first twelve: one that passes at 7 m
  only shows up as a warning.
- **Fix round after the first QA (terrain squashed, NOT SHIP). What it taught:**
  - *Validate with points, in a script that stays in the repo.* `tools/validate_dem.py`: 36 lattice points + 16 named spots
    against USGS EPQS; mean |error| 0.16 m after the fix (5.0 m before). ArcGIS `exportImage`: size the request from the bbox
    in DEGREES and read the extent back with `f=json` (the `href` is the tiff); assert it against the request.
  - *The photo can be sheared, the tiles are not.* The Esri image showed the pitch as a parallelogram (touchlines -5.3 deg,
    goal lines 9.6 deg); a nadir 3D-tiles view gave a true rectangle (-8.94 deg, 94.6 x 51.2 m, centre 3 m away). The first
    build's compromise rectangle put turf on the lawn at one corner and the field pad under the gym at another. Measure
    pitches, courts and anything that must be rectangular from a nadir tiles shot (camera straight down, narrow fov: metres =
    pixels / (viewport height / (2 h tan(fov / 2)))), and check the corners make 90 degrees.
  - *A footprint the map lacks is in the tile-height grid.* Tallant Science Center was missing from OSM and the county data;
    the 2 m roof-height table (roof 9-10 m over ground 2 m) gave its outline in one print. Print (tile - ground) round every
    cluster and compare with the footprints before building (rule F26).
  - *The ground classifier is not a paving map on a wooded campus.* Tree shadow, roof spill and glare came out as asphalt
    and concrete "amoebas" round every building (10 000 m2 of them). `tools/ground_fix.py` now rewrites the play area from
    truth: car parks and service drives traced from nadir tiles (tools/data/extra.py `PAVED`), OSM service ways, streets by
    the engine, thin OSM paths kept, everything else lawn; repainted pixels take the neighbour class's median tone with
    low-frequency noise and a soft edge that fully covers the old outline (a 1 px rim of the old class reads as a ring).
  - *Half the scanned trees drew as 7 m ornamentals* (the tree system picks the young variant under scale 0.82) and a wooded
    valley looked like a park. `tools/canopy_fill.py` gives every tree its height from the tiles (scale = canopy height /
    model height, conifer over 27 m) and fills canopy that has no trunk; the backdrop draws canopy on flat land too (no
    street grid, no roof boxes, no pale houses on the hills: at that distance Ross shows no roofs).
  - *Split a county footprint where the real building changes.* Katharine Branson Hall is one polygon: the clay-tiled hall
    and the white flat-roofed wing were cut along the line seen from above (school.js `splitKbh`), each with its own roof and
    wall treatment; a 2 m slot in the same polygon (a digitising artefact) wedged a player who dropped off the roof: delete
    slots narrower than a doorway from footprints.
  - *Roof tints are not colours.* The shingle texture is dark and slightly purple: a "tan" of 2.5 rendered grey-mauve and
    terracotta 3.7 rendered maroon. Tints of 6-9.5 were needed (extras.js BR_CLAY / BR_TAN / BR_SEAM); always judge beside
    the tiles oblique, never by the number.
  - *A bench and a bank instead of planter tiers* now takes parameters (`bank: { strip, slope }` in the school SPEC): the strip
    must be at least the pad's retaining depth (7.4 m) or the stepped blocks come back.
  - *Helicopter spots in car parks cost the cars.* Each ground spot clears parked cars for 10 m; one spot in a small lot
    empties it. Put hidden spots on lawns behind buildings and keep at most one per car park. Tree trunks are kept 11.5 m
    back from every descriptor spot in sitework (scan trees and the forest fill alike), so a denser canopy cannot fail them.
  - *A street on a hillside just inside the bounds still gets checked.* Extending the play area 12 m south for one building
    brought Ivy Drive in: one round of corner cutting cured its cross-slope at the bends; two rounds made 9 cm profile bumps.
  - *Dev helpers:* `dev/world.html?recv=<port>` + `__s(name, cam, fov)` and `dev/branson-tiles.html?recv=<port>` + `__r(...)`
    post JPEGs to a local receiver; `__fit(1280, 800)` sizes the renderer in a hidden pane. Several vite servers sharing one
    node_modules answer 504 "Outdated Optimize Dep" after one of them re-optimises: restart yours and reload.
- **Fix round after the second QA (NOT SHIP: a house on a fill mound, an invented car-park loop, a low and generic main hall):**
  - *Ridge heights from the tiles, per wing.* `polyRoof` runs one pitch over the whole plan, so a 17 m wing next to a 27 m block
    came out 3.5 m low. Katharine Branson Hall now has one hip per wing with the RIDGE height read off the tile grid
    (school.js `KBH_ROOFS`); check built roofs with a downward ray at the tile's ridge points, not by eye.
  - *Houses never stand on fill.* `housePad` is cut-only now; the fall along the walls becomes walk-out floors (up to two) and
    the eave is capped over the low side, so a 45 degree lot gets a bench cut uphill instead of a 9 m mound downhill. The map
    check warns when a house has ground more than 1 m above the source DEM round its walls, and for any ground more than 2 m above
    the source away from asphalt and footprints (`terrain.sourceAt`, checkHouses). Its first run also showed pads filling
    the creek beside Richardson Hall: footprints registered with `ctx.footprints` are exempt, everything else is a mound.
  - *No flatten-circle plazas, no ellipse car parks.* Trace the outline from a nadir tiles shot (pixels to metres from camera
    height and fov) into tools/data/extra.py AND kit.js: the loop is OUTER minus the island garden with a stall row inside its
    south half, the terrace is a polygon with a 3 x 3 table grid, the arts court a paved polygon with a lawn panel and a brick
    square. Stalls that open straight off a graded lane need the car placement's road test switched off for that row.
  - *No satellite photo on a modelled roof* (baked tree shadows, blur): flat roofs get a plain cover in the real colour
    (sedum, white membrane, grey) plus the solar arrays as geometry.
  - *Signature buildings get their own facade style.* The generic kit's ribbon windows read as an office block on a 1920s
    Mediterranean hall. `stuccoWalls` (extras.js): plain stucco, tall windows in a regular rhythm per storey, arched on the
    hall, arched doors, nothing on party walls, nothing where the ground stands above the sill. It also removed the kit's
    streak bands and stray decals. Use the point-in-ring test for a wall's outward side: the centroid test put windows on
    the inside of every re-entrant wall of a concave plan.
  - *Landmark trees through the tree kit* (`gen.trees.push([x, z, kind, scale])` in sitework, scale = height / 15.5): a hand-built
    crown read as a blue cone. Likewise far-ridge crowns: half-sunk domes, not cones (sawtooth skyline).
  - *A dormer's roof must run back until its ridge meets the main slope*; stopping where the eaves meet it leaves a hole the
    roof-skin check finds. Two digitised footprints that overlap by a metre fail the same check: keep them apart.
  - *`floor((w + 0.02) / (w + 0.02))` is 0 often enough* to delete every window of a facade: never derive a count of one from
    a float division.
  - *A pad level 0.16 m above a street's designed end is a mound on paving* (the bridgehead): level bridge decks and aprons
    to the street design, flatten only the side that is not a street.
  - *Cover is measured, not guessed.* The map check's base cover (16 rays, 30 m, chest height) disagreed with a quick ray
    count that included the ground mesh. Try candidates with `&only=spawns,overlook` and read `checks.spawns.bases`.
- **Fix round after the third QA (three "fixed" items were not, a base stood on an unmodelled pool):**
  - *Compare before reporting.* Every visual item now gets a game shot and a tiles shot from one pose, pasted side by side
    (a 20-line `pair.py`); two of my own poses turned out to be inside a tree, which a report without the picture hides.
  - *Hard edges are two things:* the baked mask painted WITHOUT a soft edge for paving (tools/ground_fix.py `hard=True`), and a
    concrete kerb laid on the outline (extras.js `kerb`: skips sides where the far side is paved). Flat plazas (terrace, arts
    court, pool deck) are real paver / brick polygons on their flattened pad, with holes for lawn panels and the pool.
  - *Windows ride on the ground at each wall.* A building datum below the ground on one side left that side blank (Fine Arts
    north and west). `stuccoWalls` takes each wall's floor as max(building floor, ground at the wall); gable ends under
    `glazedEnds` metres get one big arched glazing (the Commons hall).
  - *A roof is checked on a grid.* The viewer casts a ray down every 4 m over the hall, the grid is posted to a file and compared
    with tile_heights.json (`kbhcmp.py` in the session scratch: mean |diff| and the cells over 1.6 m). The first comparison
    showed the whole hall 1-2 m HIGH on its eaves, the opposite of the reported fault at the ridges.
  - *Fairness can come from the other base.* Red could not be made as enclosed as blue with real cover, so blue moved to a
    more open lawn on school ground: 0.44 vs 0.56 instead of 0.44 vs 0.75. Scan candidates with the map check's own cover
    measure (ignore hits whose normal points up, or the ground counts as cover).
  - *Neighbours' pools are in the tiles, not in OSM.* A nadir tiles shot of each base and each lawn spot shows them; model
    the pool (basin cut 0.95 m, water, coping, deck, pool house) or stay off the lot.
  - *The builder's helicopter scan is only a top-up.* With 12 or more descriptor spots the scan is not appended: its cells
    are not kept clear of cars and trees and one of them always landed as a 7 m warning.
  - *A cut bank needs the pad's retaining depth everywhere a door is* (the gym got `bank` too: no pad blocks at its doors).
    Where pads had FILLED a creek bank (Richardson Hall), the ground outside the walls is clamped back to `terrain.sourceAt`.
  - *Landmark conifer:* tree kit variant 5 (gen.trees kind 2): a broad blue-grey cedar. The needle texture is dark green, so
    the material colour goes above 1 (1.05, 1.5, 1.85).

