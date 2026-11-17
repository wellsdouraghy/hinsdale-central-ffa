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
