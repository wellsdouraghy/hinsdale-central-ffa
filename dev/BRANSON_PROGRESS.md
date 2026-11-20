# Branson campus: builder hand-off (keep current; commit with every milestone)

Campus id `branson` (The Branson School, 39 Fernhill Ave, Ross CA). Terrain campus. Still IN_REVIEW: fix round 1 after the
first QA (NOT SHIP) is done; next = a fresh independent QA, release test, deploy.

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
- CTF: red (Bulls) [-188, -28], blue (Wildcats) [68, -28]: the two ends of the upper plateau, 258 m apart, nav path 340 m, 0 overlook cells each
- practice heli on the pitch (-33, 92); 13 hidden spots in campus.js (9 off the pitch: tennis-shed car park, the courts, the glen,
  west lawns, Fine Arts lawn, Prize Day Field, the quad lawn, the south-west corner; 4 on the pitch), all pass at 8.5 m; the
  builder appends every level 5 m cell as spare candidates; sitework keeps trunks 11.5 m back from each
- 32 FFA spawns, 10 per team; ladders on the flat roofs (Commons north wing, Fine Arts x2, Tallant); pitched roofs by grapple
- stairs: Alumni Steps (-70, 12) -> (-76, 33); the Bridge deck is level with both banks

## Campus map tick list (branson.org/about/campus-map)
1 Branson Gate: built (piers, wing walls, name) | 2 Crossways: house 975107315, board | 3 Blue Atlas Cedar: built | 4 Katharine
Branson Hall: built | 5 New House: built (grey, gabled, dormers) | 6 Douglas Fine Arts Center + Maxwell Music Hall: built |
7 The Commons: built | 8 Alumni Steps: built | 9 Organic Garden: raised beds | 10 Gym Complex: built | 11 Tom Ryan Field: built |
12 Bridge: built | 13 Study Hall | 14 Richardson Hall | 15 Academic Quad | 16 New Oaks | 17 Tallant Science Center: built

## Status
- [x] QA round 1 items 1-18 and the builder's weak list (see MAP_NOTES.md "Branson", fix-round lessons)
- [x] map check 0 fails (one warning, explained below); Hinsdale / Marin / Hamilton unaffected; build passes
- [ ] independent QA round 2, release test, deploy

## Known weak spots (for QA / a successor)
- map check `seating` warns for houses 975107317 and 976477404 (one low wall each): both stand outside the play bounds
- name boards stand at each building's entrance; the positions of the real signs could not be verified (no Street View on campus)
- the Blue Atlas Cedar is a tiered low-poly crown; the creek bed is gravel paint in a grassed channel (no rocks, no water: none visible in the tiles)
- school buildings east of the pitch (Fine Arts, New House) keep their OSM / Esri positions; the Esri photo is sheared by up to ~5 m
  there against the tiles, not re-measured
- Fernhill houses are hidden behind hedges: walls / roofs from tiles obliques (facades_src.json `visible: tiles`), not Street View
- New Oaks' solar array and the Fine Arts roofs' solar arrays are not drawn; Katharine Branson Hall's bow corner is faceted

## Marin
Marin (live) has the same squashed-DEM bug. Paused fix: branch worktree-agent-afcaa04df291ec9ac (worktree
.claude/worktrees/agent-afcaa04df291ec9ac), WIP commit 959e26c, re-bake done, earthworks re-fit half done, NOT verified.
Finish it, re-verify every earlier Marin fix, independent QA, then merge + deploy.
