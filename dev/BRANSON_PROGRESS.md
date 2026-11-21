# Branson campus: builder hand-off (keep current; commit with every milestone)

Campus id `branson` (The Branson School, 39 Fernhill Ave, Ross CA). Terrain campus. Still IN_REVIEW: fix round 7 (after QA round 7: map check and walks
passed, 13 items) is done and verified item by item; next = independent QA round 8, release test, deploy. Matched game | tiles sheets of this round (same
pose, game side shot after the last code change): dev/shots/branson-v8/ (cmp_n_* nadir pairs, cmp_o_* obliques, ref_n_*.jpg = the tiles nadirs with a metre
grid drawn on them, sh_*.jpg eye-level game sheets, walks.txt = every `__walk` of the round, x/ = page helpers and pose lists; before_* = the state before
the round). Tiles shots are Google imagery: never commit that folder.

## Frame and key coordinates (x east, z south, metres)
- origin lat 37.96545, lon -122.56545; y = 0 is Tom Ryan Field (NAVD88 16.54 m; 3D-tiles surface = game height - 16.28, one constant)
- sat rectangle x -330..330, z -300..300; play bounds x -215..82, z -100..184
- Terrain: USGS 3DEP, validated (tools/validate_dem.py: 52 points, mean |err| 0.16 m, 0.07 m inside the edge blend band, max 1.47 m at an edge)
- Upper campus plateau y ~10-11: Fernhill Ave, tennis (-97, -27), Katharine Branson Hall (OSM 975106452: clay-tiled hall + white west
  wing, split in school.js), visitor lot with the Blue Atlas Cedar (-1, -33), Fine Arts (37..73, 3..21), New House (976780018)
- The Commons (-131, 10) in the glen, y 2.3; loop / rain garden (-89, 49); Tom Ryan Field centre (-33.2, 92.3), bearing -8.94 deg,
  94.6 x 51.2 m (nadir tiles; the Esri photo is sheared there); gym (976135756) y 0.5
- Ross Creek (OSM waterway 1286786146) is a real channel 2-5 m deep: (-160, 90) -> the Bridge (-144.5, 92.5) -> south along x -130 ->
  east behind the gym (z ~145) and the pitch (z ~130) -> north-east. The wooded hill starts south of it.
- Academic quad on flat ground y ~2: Study Hall (976479989), Richardson Hall (976475035), New Oaks (978513427), Tallant Science
  Center (hand-digitised 9000000007). Names follow the campus-map legend order (13, 14, 16, 17); which of the two south
  buildings is New Oaks and which is Tallant is inferred (the modern faceted one = the science center), not confirmed by a photo.

## Pipeline (tools/, python venv with numpy pillow scipy shapely tifffile)
osm.py -> sat.py -> (dev/branson-tiles.html __dumpHeights -> data/tile_heights.json) -> gen.py -> terrain.py -> validate_dem.py
-> patch_extra.py (data/extra.py: hand-digitised buildings, pitch, paved outlines) -> ground_fix.py -> canopy_fill.py
-> streetview.py plan / fetch (gitignored) -> data/facades_src.json -> facades.py
(Re-running gen.py resets ground_mask / macro / classes / trees: run patch_extra, ground_fix, canopy_fill again after it.)

## Gameplay
- CTF: red (Bulls) [-189.5, -29.5] in campus.js, drawn by the engine at (-190, -29): IN the wood between the faculty car park's entrance and
  its west drive, 7 m south of the Fernhill hedge, on a leaf-litter floor (`LITTER`), three oaks 4-7 m from the flag; walked both ways from the
  lot, the west drive, the dry clearing, Fernhill and the wood below. Blue (Wildcats) [48, -28] (drawn at (48, -29); lawn north of New House).
  236 m apart, 0 overlook cells each, both on nadir tiles. Cover (map check, 16 rays, 30 m): 0.50 / 0.50 (0.62 / 0.50 on the round-6 run: the red figure moves with the parked cars); 3 x 3 means at 0.5 m 0.49 / 0.49.
  The point figure still moves a ray with the parked cars' random layout: scan with the map check's `__coverAt(x, z)`.
- practice heli on the pitch (-33, 92); 14 candidates in campus.js, 12 placed (tennis courts, west lawns, Prize Day Field, the south-west corner, six on the pitch,
  one in the faculty car park on Fernhill at (-128, -41)); the spot in the tennis-shed car park is gone (that lot is full of cars now); spots are 30 m apart at least;
  sitework keeps trunks 11.5 m back from each
- 32 FFA spawns, 10 per team; ladders on the flat roofs (Commons north wing, Fine Arts x2, Tallant); pitched roofs by grapple
- doors with steps (fix round 6): Katharine Branson Hall's entrance (red tile), its north-east door of the taller part and its south door (stoop + 6 risers each, `doorStoop` in extras.js), all walked both ways (dev/shots/branson-v7/walks.txt)
- stairs: the Alumni Steps = the red-brick flight running north-south down the bank, (-87.5, 19.0) -> (-88.3, 28.3), brick landing on the terrace, paved walk from its head up to the hall's south drive (kit.js STEPS_WALK); the Bridge. All walked both ways with `__walk` (dev/marin.html?campus=branson) at the end of fix round 4, with the steps walk, the arts court walks, the loop's north edge, Richardson Hall's east side and five approaches to the red base.

## Campus map tick list (branson.org/about/campus-map)
1 Branson Gate: built (piers, wing walls, name) | 2 Crossways: house 975107315, board | 3 Blue Atlas Cedar: built | 4 Katharine
Branson Hall: built | 5 New House: built (grey, gabled, dormers) | 6 Douglas Fine Arts Center + Maxwell Music Hall: built |
7 The Commons: built | 8 Alumni Steps: built | 9 Organic Garden: raised beds | 10 Gym Complex: built | 11 Tom Ryan Field: built |
12 Bridge: built | 13 Study Hall | 14 Richardson Hall | 15 Academic Quad | 16 New Oaks | 17 Tallant Science Center: built

## Status
- [x] QA round 1 items 1-18 and the builder's weak list (see MAP_NOTES.md "Branson", fix-round lessons)
- [x] map check 0 fails (one warning, explained below); Hinsdale / Marin / Hamilton unaffected; build passes
- [x] QA rounds 2-4: every item fixed with a matched game | tiles shot (round 4: items 1-17, see MAP_NOTES.md "Fix round after the fourth QA")
- [x] map check 0 fails incl. the new `facadePeaks` test (one warning: seating, below); Hinsdale / Hamilton pass, Marin 0 fails (its own old warnings); build passes; practice + a started CTF host match with 6 bots run without console errors
- [x] QA round 5: items 1-15 fixed, each with a game | tiles pair (see MAP_NOTES.md "Fix round after the fifth QA")
- [x] map check on the merged base (mounds / walkDesign included): 0 fails; warning: seating (below); `retaining` reports "skip" (no block registered: the pitch's south side falls to the creek, a ball-stop fence stands there); Hinsdale / Hamilton pass, Marin 0 fails; build passes
- [x] QA round 6: items 1-12 fixed, each with a game | tiles pair (see MAP_NOTES.md "Fix round after the sixth QA"); item 11 (the gym's south wall)
  is left blank on purpose: it stands under closed canopy in every tiles view and no photo of it was found
- [x] map check after round 6: 0 fails; warning: seating (the same four hillside houses); `retaining` skip; Hinsdale / Hamilton pass, Marin 0 fails; build passes;
  practice + a started CTF host match with 6 bots run without console errors
- [x] QA round 7: items 1-13 fixed, each with a game | tiles pair (see MAP_NOTES.md "Fix round after the seventh QA")
- [x] map check after round 7: 0 fails; warning: seating (the same hillside houses); `retaining` skip; Hinsdale / Hamilton pass, Marin 0 fails; build passes;
  practice + a started CTF host match with 6 bots run without console errors
- [ ] independent QA round 8, release test, deploy

## Known weak spots (for QA / a successor)
- base cover is 0.50 / 0.50 but the measure is noisy (2-10 rays of 16 within 10 m of the red base); real solid cover round red is the Fernhill hedge, trunks and parked cars, shrubs and low conifer sprays are not solid
- Katharine Branson Hall's roof against the tiles (dev/shots/branson-v7/kbh_roof_cmp.txt): 1 m grid mean |diff| 0.38 m over the whole hall, 0.17 m over the taller
  south-east part, 0.17 m over the white block; cells over 1.6 m are a tree over the link's west wall, a vent on the ridge, and the long wing's north-east
  slope between u 16 and 26 (the tiles show a nearly flat strip at ~16.1 along that eave: not rebuilt)
- the hall's south-east end (fix round 7): ground back on the lidar (8.6), a paved terrace (kit.js `KBH_TERR`), a walk-out lower storey with two glazed doors
  under two tall arched windows, a flight of ten risers at the terrace's north corner up to the visitor lot, the round patio 4 m further east (`PATIO`). The
  side walls of that half show a cream base course down to the ground; the planting beside the steps and the rail on the terrace edge are not built
- the low curved bay outside the hall's bowed end (fix round 7, on the reviewer's reading of the 1 m height grid): floor 12.9, parapet to 13.9, arc 181-222 deg
  round (-47.42, -9.92), radius 9.1-11.7. Every tiles oblique of it is closed by tree canopy: its windows, the parapet's real height (the grid reads 14.4-14.9)
  and its north end (the grid suggests ~228 deg; beyond 222 the roof-skin check fails beside the link's roof) are not resolved
- the neighbour's tennis court (west edge, half inside the bounds) is its green slab and lines only: no net, no fence (helicopter spots stand at (-203, 32) and
  (-203, 62) beside it; the play-area fence crosses it). The neighbour's round pool in the south-west corner is a raised basin on gravel; the play-area fence
  stops at its coping (the bounds still hold); the garden's paths, hedges and benches are one gravel tone
- Richardson Hall's creek side is drawn as a walk-out lower storey (cream, small windows) wherever the ground is 2.3 m under the floor: under closed canopy in
  the tiles, not confirmed by a photo. Tallant's door (north front, arched like the kit's other doors) and the Commons' glazed doors (south-east gable) stand
  where the paths and the terrace end; neither is resolved in the tiles
- the gym's north wall: four window pairs, the lot paved up to the wall, the brown store; the planted bed the tiles show north-east of the cars is still asphalt
- doors (rule F47): the kit's default doors that no tiles view shows are removed (list `NO_DOOR` in school.js); the gym's three west service doors are
  kept (generic facade kit, the wall is under canopy) with a service walk along the wall; New House's north door has a walk to the Circle Drive court
  that passes 4 m east of the blue flag (the tiles show a stair and deck there, the rest of the route is under canopy)
- the white block's facade (arch count, cornice) is read from two blurry obliques; its raised centre is blank as in the tiles; the walk from the terrace at the hall's south-east
  end to the visitor lot is read as steps + a walk from one nadir shot
- New House is built from the height grid (main gable, two south gables, flat white block, cross gable, two dormers); its two small west gablets and the low east lean-to are not built
- lawn tones: only four outlines are painted dry (the hall's south lawn, the bank north of the Commons, two beds at the loop); the rest keeps the baked green
- the organic garden is the tiles' fenced plot (13 x 8 m since fix round 7, gates on the aisle east of the middle beds) with six square beds; the real bed layout inside it is not resolved. The loop island is rounded but narrower than in the tiles
- the cars on the loop's rim and in the gym drive's bays stand on the drive's grade (up to 1 in 7); 
- the Alumni Steps are one flight; the tiles oblique suggests a second parallel brick flight or wall east of it (under the canopy, not resolved)
- the yard shed's doors are read from blurry tiles
- the arts court's sculpture is a neutral open form (three dark bars and a ring): no photo of the real piece was found
- map check `seating` warns "lowOnly" for hillside houses 974153830, 975106084, 975108094, 975107317: natural ground 0.15-0.3 m
  above a wall's floor, the price of cut-only pads (no fill)
- name boards stand at entrances; real sign positions unverified. New Oaks / Tallant naming inferred from the legend order
- Fine Arts / New House keep their OSM positions (the Esri photo is sheared up to ~5 m there against the tiles)
- the gym keeps the generic kit walls under brown siding; concrete pad blocks remain at two of its doors; its south wall (26 m) is blank: under closed canopy in the tiles, no photo found (F41 exception, stated)
- creek: gravel paint + boulders in a grassed channel, dry (no water visible in the tiles)

## Marin
Marin (live) has the same squashed-DEM bug. Paused fix: branch worktree-agent-afcaa04df291ec9ac (worktree
.claude/worktrees/agent-afcaa04df291ec9ac), WIP commit 959e26c, re-bake done, earthworks re-fit half done, NOT verified.
Finish it, re-verify every earlier Marin fix, independent QA, then merge + deploy.
