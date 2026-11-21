# Earl of March campus: builder hand-off (keep current; commit with every milestone)

Campus id `earlofmarch` (Earl of March Secondary School, 4 The Parkway, Kanata / Ottawa ON). Terrain campus, IN_REVIEW.
NOTE: this worktree is shared with a Branson texture agent (uncommitted edits under src/campuses/branson/, tools/textures/generate.py,
MAP_NOTES.md ...). Commit ONLY Earl of March paths (`git commit -- <paths>`), never `git add -A`.

## Frame and key coordinates (x east, z south, metres)
- origin lat 45.32305, lon -75.89570; y = 0 = the ground round the school (CGVD2013 93.66 m); 3D-tiles viewer height 59.49 (one constant)
- sat rectangle x -360..360, z -330..330; play edge = polygon `PLAY_EDGE` (kit.js + tools/data/extra.py), playBounds = its bounding box
- Terrain: NRCan HRDEM lidar (City of Ottawa 2020, 1 m, EPSG:3979: rotated 17.2 deg and 1.6 % larger than true metres here, handled
  in tools/dem.py). Validation (tools/terrain.py): MRDEM-30 61 points mean |err| 0.19 m; Google tiles 223 open points one constant
  (-0.51 at h 60) in every quadrant, residual 0.13 m; CDEM (1:50k contours, integer m, CGVD28) bias -1.46, scatter 1.46.
  Relief in the play rectangle: -2.9 .. +4.8 m (p2..p98 -0.96 .. 2.74): the built part is level, the wooded rock knolls stand 3-6 m.
- The school (OSM way 68609482, one polygon, 12 650 m2) is split into 9 roof blocks by tools/blocks.py (zones in
  tools/data/school_zones.json, building frame: origin (84, 16), u = 43.26 deg north of east): old 8.99, add (2015 wing) 9.32,
  midC 9.61, midD 9.52, RA / RB (raised, precast-clad) 13.4, low 5.68, ph 10.2, RApent 13.1
- Mlacak Centre OSM 69099636 (arena + halls), library 576122574, 31 portables (23 of OSM's + 8 traced on the tiles; 8 OSM units are gone: tools/data/extra.py), track (OSM 69094421)
- school roof blocks now 11: the 1971 deck is split by roof COVER too (gym 9.20 and midE 8.90 = white membrane, kind oldW)

## Pipeline (tools/, python venv with numpy pillow scipy shapely tifffile fsspec aiohttp pyproj)
osm.py (-> epoch.py patches an existing campus.json to the tiles' epoch) -> sat.py -> dem.py (lidar windows, cached in data/dem/) -> gen.py (classes, mask, macro, lidar building heights, lidar trees)
-> terrain.py (terrain.bin, backdrop grid, VALIDATION) -> blocks.py (school roof blocks -> blocks.js) -> ground_fix.py (paving: classifier + extra.py EPOCH)
-> mapimg.py (map.jpg: the overview for menus / loading / minimap, from top-down game renders)
-> streetview.py (gitignored cache) ; dev/earlofmarch-tiles.html (3D tiles reference, receiver on :5187), dev/earlofmarch.html (viewer:
__s / __look / __sheet / __walk)

## Brand
Lions (green / white / gold / black; Wikipedia + school athletics page). Rival: A.Y. Jackson SS (Jays, blue / white): INFERRED (the other
English public high school in Kanata, same board and league); no source names an official rival. Teams: Lions vs Jays.

## Gameplay
- CTF: red (Lions) [-32, -86] = the green between the portable rows north-west of the school; blue (Jays) [-56, 172] = the lawn between the
  Mlacak Centre and the wood by the track. 259 m apart (nav path 284 m), cover 0.44 / 0.38 (map check), overlook 0 / 0.
- 15 scanned helicopter spots in the descriptor (lawns first, 34 m apart); practice heli on the track infield (-113, 85)
- 6 ladders: three on outside walls (gym wall (79.6, 64.6), north-east face, the 2015 wing's south-west face), two up to the raised roofs,
  one from the low block; 32 FFA spawns, 10 per team; lot lights, floodlight masts and hoops are grapple poles
- doors: 11 on the school (`DOORS` in school.js), 3 on the Mlacak Centre / library (`CIVIC_DOORS_W`), one per portable; each gets a level
  apron (the building pads) and a concrete walk to the nearest paving (grounds.js `doorWalks`)

## Status
- [x] data + terrain; school roof blocks + wall kit; portables; Mlacak Centre + library blocks; context buildings (343 OSM footprints)
- [x] grounds: track (painted oval) + goals + masts + bleachers, two courts, stall rows on the OSM aisles (~240 cars), kerbs on the
      vectorised paving, rocks, fence line + barriers
- [x] textures: 27 Street View frames + tiles (the 44 scraped web images were all off-topic and pruned), material sheet, 14 generated
      tiles (2.9 MB), wired through the descriptor
- [x] map check 0 fails / 0 warnings (houses, retaining: skip, nothing registered); Hinsdale / Hamilton pass after the map-check change
- [x] round 2 (builder's definition of done): 902 scripted walks 0 fails; doors confirmed against Street View (4 school + 2 civic kept, 8 removed);
      crest + Mlacak / library name bands; tennis hedges; salmon pavers; hand-traced islands; blank gym walls; library cedar band; row-house roofs;
      game | tiles and game | Street View pair sheets in dev/shots/earlofmarch/tiles-compare/ (gitignored); medium 2.6-7.4 ms / frame
- [ ] still weak (see the hand-off report): salmon pavers at the main entrance, the bus-loop islands' exact outlines, hand correction of
      the vectorised paving, signs, the 2025-26 addition under construction (not in the tiles), per-wall facade review beyond the default bays

## Fix round 1 (independent QA: NOT SHIP -> all 14 items fixed; pairs in dev/shots/earlofmarch-v2/, gitignored)
- Imagery epochs: Esri photo (classifier) and OSM portables are OLDER than the Google 3D tiles; the tiles are the truth (rule F53). Epoch data lives in
  tools/data/extra.py (PORTABLES_GONE, BUILDINGS, EPOCH, DIRT, FOOT_CUT, RETONE); run `epoch.py` then `ground_fix.py` after any change there.
- 1 grades 7-8 south front: kit.js curtainWall / portalWall / entryWall / slotWall via WALL_SPEC; the entrance door is in the corner beside the glazed box.
- 2 roofs: zones gym + midE (white), ROOF_BROWN darker, SOLAR (10 arrays, tilted racks), SKYLIGHTS, PYRAMID in school.js.
- 3 portable yard: lawn + walks + asphalt path + bare-earth staging; red CTF base unchanged at (-32, -86) (still lawn between two rows in the tiles).
- 4 bleachers face the track (grounds.js). 5 / 6 plazas: EPOCH outlines + draped pavers (grounds.js plazas). 7 lot west of the annex retoned pale.
- 8 Mlacak name band 7.4 m; no school name sign exists in Street View at the entrances (searched: f_sign1..6). 9 library curtain wall + ground ribbon.
- 10 cars: 85 % within 45 m of the school, 10 % beyond (school-day panoramas). 11 woods: fill trunks jittered, sized, a quarter conifers (world.js).
- 12 files.map = map.jpg. 13 ctfSpawn 45-66 m. 14 flags: flagBrand(campus, team) (shared; all five campuses).
- still weak: the east drive's outline is the classifier's (wobbly kerb line); the portal / oriel are read from one 2019 panorama and mushy tiles; portable
  roofs are a brighter red than the tiles' brown-red; the paver bands' spacing (6.6 m) is measured once on the nadir.

## Fix round 2 (independent QA round 2: 1 fix-first, 4 should-fix, 9 nits; all 14 done; pairs in dev/shots/earlofmarch-v3/, gitignored)
- Helpers used: receiver on :5187 saving to dev/shots/earlofmarch-v3/; one shot list (name -> pose) loaded into BOTH dev/earlofmarch.html (`__s`) and
  dev/earlofmarch-tiles.html (`__r`), so every pair is the same camera; nadirs get a 10 / 20 m grid drawn from the camera (x, H, z, fov).
  A source edit reloads every open dev tab (the tiles tab too): shoot the tiles first, then edit.
- 1 the 1971 block is a CONCRETE FRAME (kit.js `frameWall`, Street View n5 + tiles t_ne1 / t_nw1 / t_sw1 / t_sw3): piers 0.7 m proud every ~7.4 m, 1.9 m fascia,
  first-floor band, ground storey dark in their shadow; 'slope' = leaning brick spandrels + one tall window per bay (the long north-east front), 'ribbon' =
  window strip over brick (north-west and south-west fronts), 'glazed' = the bay that steps out of the south-west front (WALL_SPEC kind 'frame'). All of it
  stands OUT from the wall line with its own collision (no invisible wall); a ladder on a framed wall stands in front of the frame (`F.frameOut`).
- 2 lot west of the annex: extra.py LOT2 (rectangle, 28 deg), yellow rows along its own long side (grounds.js; the stale OSM aisle is trimmed: ROAD_SET).
  Blue base unchanged at (-56, 172): lawn 3.7 m off the lot's north-east edge, the wood behind it (map check spawns / overlook pass, 259 m apart).
- 3 court yard: extra.py YARD (frame o / a / b), pale concrete pad + paler border walks, cross-court marks, three hoops, target rings; the east yard is pale
  concrete with three four-square grids (grounds.js `yardMarks`).
- 4 woods: extra.py WOODS (five outlines traced on nadirs) -> world.js fills them on a 2.9 m jittered lattice (a third understorey, a fifth conifers,
  3.4 m off walls, clear of flags / helicopter spots / paving) and ground_fix.py paints the forest floor. Trunks near the play area 1 574 -> 1 734.
- 5 portables: siding tint tan, roof tint muted brown-red (medians inside the footprints on one nadir: tiles 133 103 113, game was 138 81 77).
- 6 bare earth: browner tones, wheel ruts (DIRT_TRACKS) and mottling in the bake; lumber stacks on the two pads (grounds.js `lumber`, solid).
- 7 bleachers: campus material `eomAlu` swapped into the shared helper. 8 tennis: red / green and green / blue acrylic baked (TENNIS, `_courts`), lines, nets,
  3 m fence. 9 east drive: triangle island, wooded island and parking pad re-traced as clean curves (E_TRI / E_WOOD / E_PAD), four bars on the pad.
- 10 The Parkway: two OSM nodes moved onto the tiles' centreline (ROAD_MOVE). MEASURED: the OSM line was 3 m south-east of the tiles (and of the photo) at
  the bend, not 10 m north; the fence (PLAY_EDGE) already followed the tiles' far kerb.
- 11 library: rust-orange end panel on the short end piece of the curtain wall. 12 pool: POOL (baked salmon deck, water + coping), 20 m beyond the fence.
- 13 map.jpg: one source: 16 top-down game renders from 1 500 m (tools/mapimg.py; `world.forceFullTrees(true)`), no photo patches.
- 14 team spawns: descriptor `ctfSpawn.wall: 7` (shared ctf.js option: eight probes of that length instead of four of 1.2 m).
- Checks: `__walkAll` 880 walks 0 fails; map check 0 fails / 0 warnings; medium 3.3-5.9 ms / frame at seven poses (1280 x 800); practice CTF, CTF host and a
  two-tab joiner without console errors; build passes.
- still weak: the upper-storey brick on the north-east front is read as leaning from the tiles (n5 does not settle it); the court yard's key positions are
  read off one nadir; the tennis courts and the pool are baked colour (flat) with lines / nets on top; the yard path and the car parks keep the game's dark
  asphalt where the tiles are sun-bleached pale.
