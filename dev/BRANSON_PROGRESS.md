# Branson campus: builder hand-off (keep current; commit with every milestone)

Campus id `branson` (The Branson School, 39 Fernhill Ave, Ross CA). Terrain campus, Marin Academy is the precedent.

## Frame and key coordinates (x east, z south, metres)
- origin lat 37.96545, lon -122.56545; y = 0 is Tom Ryan Field (NAVD88 16.28 m; 3D-tiles surface there reads -16.1)
- sat rectangle x -330..330, z -300..300; play bounds x -215..82, z -100..185
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

## Status
- [x] data pipeline (OSM, satellite, tile heights, gen, 3DEP terrain)
- [ ] descriptor + registration (IN_REVIEW)
- [ ] sitework / earthworks
- [ ] school buildings
- [ ] town (houses), streets, grounds
- [ ] gameplay (CTF, heli, ladders, poles), map check 0 fails
- [ ] walk / screenshots / polish, MAP_NOTES "Branson" section
