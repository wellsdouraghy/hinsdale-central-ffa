# Branson campus: builder hand-off (keep current; commit with every milestone)

Campus id `branson` (The Branson School, 39 Fernhill Ave, Ross CA). Terrain campus, Marin Academy is the precedent.

## Frame and key coordinates (x east, z south, metres)
- origin lat 37.96545, lon -122.56545; y = 0 is Tom Ryan Field (NAVD88 16.28 m; 3D-tiles surface there reads -16.1)
- sat rectangle x -330..330, z -300..300; play bounds x -215..82, z -100..172
- Upper campus plateau y ~ 10 m: Fernhill Ave (north edge), tennis courts (-97, -27), Katharine Branson Hall (OSM 975106452,
  centre (-38, -23)), visitor lot east of it, Douglas Fine Arts Center (37..73, 3..21), New House (OSM 976780018/19, (50, -13)),
  Crossways (OSM 975107315, (36, -63)), gate on Fernhill near (0, -97)
- Lower campus y 0..3: Tom Ryan Field (centre (-35.9, 95.1), bearing -4.26 deg, lines 94.3 x 52.9 m), gym complex (OSM 976135756,
  (-98, 105), eaves ~9, ridge ~13 m over the field), car-park loop with the rain garden (-95, 48), the Commons ((-131, 10),
  hall ridge ~10 m abs, wings ~6 m abs), academic quad across Ross Creek: Study Hall / Richardson / New Oaks / Tallant
  (OSM 976479989 (-169,115), 976475035 (-139,134), 978513427 (-175,155))
- Steep wooded hillside south of the field and gym (rises to 34 m within 40 m): natural, unbuilt
- The terraced estate north of Fernhill (OSM 975103995/96) is a private residence: context only
- Hand-digitised features OSM lacks: src/campuses/branson/tools/data/extra.py (Commons, Fine Arts, field, tennis)

## Branding
Bulls (blue #0055B8 / green #00953B, white). Rival: Marin Academy (Wildcats) - confirmed by the user. Teams red = Bulls, blue = Wildcats.

## Pipeline (run from src/campuses/branson/tools, python venv with numpy pillow scipy shapely tifffile)
osm.py data/osm_raw.json -> sat.py -> (dev/branson-tiles.html: __dumpHeights fine + wide -> data/tile_heights.json) -> gen.py -> terrain.py
-> streetview.py plan / fetch (images gitignored) -> data/facades_src.json -> facades.py

## Gameplay
- CTF: red (Bulls) [-188, -28], blue (Wildcats) [68, -28]: the two ends of the upper plateau, 256 m apart, 0 overlook cells each
- practice heli on the field (-36, 95); 12 hidden spots in campus.js (scan; the builder also appends every level 5 m cell as spare candidates)
- ladders: flat roofs of the Commons north wing and both Fine Arts blocks; pitched roofs by grapple, all walk off
- stairs: Alumni Steps (-70, 12) -> (-76, 33), walked both ways with __walk

## Status
- [x] data pipeline (OSM, satellite, tile heights, gen, 3DEP terrain + post-lidar regrade of the field)
- [x] descriptor + registration (IN_REVIEW)
- [x] sitework / earthworks (world.js `sitework`)
- [x] school buildings (school.js), town (town.js = Marin's builder), grounds (grounds.js)
- [x] gameplay, map check 0 fails
- [ ] independent QA

## Known weak spots (for QA / a successor)
- Katharine Branson Hall is one cream block under clay hips: the real white two-storey west wing, arched windows and the
  entrance archway are not modelled; the gym has no glazed gable; no building name signs (none could be verified)
- houses on Fernhill are hidden from Street View by hedges: walls / colours are period guesses marked `visible: no`
- no painted stall lines / centre lines; car parks hold fewer cars than the imagery
- map check warnings left: two hedge-hidden houses 0.3-0.4 m over the storey limit on their downhill wall, bermed blank
  walls of the house west of the Commons, 6-7 cm profile bumps on Park Drive by the Fine Arts Center, one roadblock on
  the slope of Ivy Drive

## PAUSED 2026-11-17 (user's usage limit; resume this weekend)

State: QA round 1 said NOT SHIP (screenshots dev/shots/qa-branson/, untracked). Fix round started; only item 1 is done
(130b4c4: DEM re-baked with the real extent, 52 USGS points mean |err| 0.16 m, regrade shift / varying tile bias /
channel fill removed). Everything below is still TO DO, then a fresh independent QA, release test, deploy.

QA findings still open (coords in game metres):
2. Missing quad building: modern faceted white-rimmed ~22 x 18 m at (-149,163); count clusters against a tiles top-down (F26).
3. House 976135755 at (-152,53): was buried to the eaves; re-check on the new DEM (tiles ~7-8 m tall).
4. Gym east front: glazed gabled entrance with arched window, lean-to colonnades both sides, stepped roofs, tan roof + solar.
5. Ross Creek + footbridge (campus map item 12) at (-141,88) gym lot -> quad; remove the asphalt smear and mound.
6. Roof colours: KBH and quad bright terracotta tile; Commons light grey standing seam + solar; gym tan (F27 side by side).
7. Katharine Branson Hall: white two-storey west wing, arched windows, entrance archway/porch; SW addition flat roof.
8. Blue Atlas Cedar (campus map item 3) on the car-park island ~(-5,-35).
9. White ground-class blotches: Commons terrace (-112,30), KBH apron (-8,24), tennis lot (-70,-48), field NW corner.
10. Fernhill hedges: continuous clipped walls 3-4 m (F28), not cones.
11. Real building-name signs where the real ones are (E23); Hinsdale-level sign count.
12. Mounds at (-140,106), (-130,90) by Park Drive (may be gone after the re-bake).
13. Backdrop: no gridded city blocks to the north or white dome houses; wooded valley, denser canopy.
14. Fernhill double-yellow centre line, clean road edges.  15. Commons north planter tiers (-140,-15) -> bank + one wall.
16. Turf wedge at (-86,67).  17. Map-check warnings: barrier (-33.6,173.2), houses 975106084/975108094, Park Dr bumps (19-20,4-10).
18. New House (52,-14): grey gabled house with dormers.
Builder's own weak list: car-park stall/centre lines and realistic car counts; Fernhill house colours from Street View or
tiles obliques; hidden heli spots (not 7 of 12 on the field, with margin); turf pad under the gym; walk every perimeter,
street and roof; re-check CTF bases on the corrected ground.

Marin (live) has the same squashed-DEM bug. Paused fix: branch worktree-agent-afcaa04df291ec9ac (worktree
.claude/worktrees/agent-afcaa04df291ec9ac), WIP commit 959e26c, re-bake done, earthworks re-fit half done, NOT verified.
Finish it, re-verify every earlier Marin fix, independent QA, then merge + deploy.
