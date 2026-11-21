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
- Mlacak Centre OSM 69099636 (arena + halls), library 576122574, 31 portables (building=portable_classroom), track (OSM 69094421)

## Pipeline (tools/, python venv with numpy pillow scipy shapely tifffile fsspec aiohttp pyproj)
osm.py -> sat.py -> dem.py (lidar windows, cached in data/dem/) -> gen.py (classes, mask, macro, lidar building heights, lidar trees)
-> terrain.py (terrain.bin, backdrop grid, VALIDATION) -> blocks.py (school roof blocks -> blocks.js)
-> streetview.py (gitignored cache) ; dev/earlofmarch-tiles.html (3D tiles reference, receiver on :5187), dev/earlofmarch.html (viewer:
__s / __look / __sheet / __walk)

## Brand
Lions (green / white / gold / black; Wikipedia + school athletics page). Rival: A.Y. Jackson SS (Jays, blue / white): INFERRED (the other
English public high school in Kanata, same board and league); no source names an official rival. Teams: Lions vs Jays.

## Status
- [x] data + terrain + a loading skeleton (school blocks with the precast / brick wall kit, portables, fence line)
- [ ] school facades per wall (doors, glazed entrances), ladders, signs; Mlacak Centre + library; context buildings
- [ ] grounds: track + field, courts, car parks (stalls, cars), paving truth + kerbs, The Parkway streetscape, boundary barriers
- [ ] textures from references (scrape, material sheet, generate, wire)
- [ ] gameplay: CTF bases (nadir tiles), heli scan -> descriptor, spawns, map check, play test
- [ ] pairs, MAP_NOTES section, final report
