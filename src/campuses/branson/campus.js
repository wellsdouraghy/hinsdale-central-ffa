// The Branson School, Ross CA (39 Fernhill Ave). Data + baked assets live in public/campuses/branson/ (see tools/ for how
// they are made; dev/BRANSON_PROGRESS.md for the key coordinates).
import { BRANSON_BRAND } from './brand.js';
import { backdropY } from './backdropY.js';

export default {
  id: 'branson',
  name: 'The Branson School',
  wordmark: ['The', 'Branson School'],
  city: 'Ross, CA',
  stateName: 'California',
  rival: 'Marin Academy',     // the Wildcats: Branson's main rival (Marin IJ: "rival Marin Academy"; confirmed by the user)
  aliases: ['Branson', 'Branson School', 'Branson High School', 'Katharine Branson School', 'KBS', 'Branson Bulls', 'Ross', 'Marin County', 'Bay Area'],
  blurb: 'A wooded hillside campus on its real terrain: Katharine Branson Hall on the upper campus, the Commons in the glen, Tom Ryan Field and the gym below, the academic quad across Ross Creek.',
  legal: 'Fan-made campus game. Not affiliated with The Branson School.',
  ...BRANSON_BRAND,   // short, palette, emblem, teams (Bulls vs Marin Academy Wildcats), letters: see brand.js
  // local frame: x east, z south, metres; height = ellipsoid height of y = 0 (the Tom Ryan Field turf) for 3D tiles
  origin: { lat: 37.96545, lon: -122.56545, height: -16.28 },
  tileRegistration: [[-40, 95], [-60, 90], [-20, 100], [-50, 105], [-30, 82], [-10, 92]],   // on the pitch: the only large level ground at y = 0
  files: {
    campus: 'campuses/branson/campus.json',
    gen: 'campuses/branson/gen.json',
    satellite: 'campuses/branson/satellite.jpg',
    groundMacro: 'campuses/branson/ground_macro.jpg',
    groundMask: 'campuses/branson/ground_mask.png',
    roofs: 'campuses/branson/roofs.jpg',
    surfaceClasses: 'campuses/branson/surface_classes.png',
    textures: 'campuses/branson/tex/tex.json',   // generated building textures (tools/textures/campuses/branson/materials.json); `?tex=0` = without
  },
  sat: { minX: -330, maxX: 330, minZ: -300, maxZ: 300 },
  playBounds: { minX: -215, maxX: 82, minZ: -100, maxZ: 184 },   // (south edge: behind Tallant Science Center and across the toe of the wooded hill south of Ross Creek)
  // Real ground heights (CAMPUSES.md "Terrain"): USGS 3DEP lidar DEM baked by tools/terrain.py, centimetres above Tom Ryan
  // Field (y = 0), 2 m grid over the satellite rectangle; its outer 40 m are blended into the 20 m backdrop grid
  // (gen.terrain), which also answers beyond the rectangle. Pads are flattened by the builder (sitework in world.js).
  terrain: { file: 'campuses/branson/terrain.bin', format: 'i16', nx: 331, nz: 301, scale: 0.01, offset: 0, extent: { minX: -330, maxX: 330, minZ: -300, maxZ: 300 }, outside: backdropY, blend: 20, cell: 2 },
  // Both bases stand on the school's own ground on the upper plateau (y ~ 10), at its two ends, ~240 m apart, and both were put on a
  // nadir tiles shot first (rule F39): red (Bulls) = the wood between the faculty car park and its west drive, south of Fernhill Ave
  // (QA round 4: 24 m in from the west edge, reached from the lot, both drives, the clearing and the wood below);
  // blue (Wildcats) = the lawn north of New House on Circle Drive. Cover (map check, 16 rays, 30 m): 0.50 and 0.50, from trees,
  // hedges, parked cars and buildings that are really there (the oaks round red are the tiles' closed canopy, F31). No overlook on either.
  // (fix round 4: red stands IN the wood, on its leaf-litter floor, three oaks 4-7 m from the flag. The engine snaps bases to its nav cells:
  // red is drawn at (-190, -29), blue at (48, -29); cover there 0.50 / 0.50 in the map check, 3 x 3 means 0.49 / 0.49)
  ctf: { red: [-189.5, -29.5], blue: [48, -28] },
  practiceHeli: { x: -33, z: 92, yaw: 0 },
  spawnCenter: [-60, 30],
  spawnBounds: { minX: -205, maxX: 76, minZ: -88, maxZ: 126 },   // (not on the wooded hill south of the field)
  sky: { horizonHaze: 1 },
  ground: { asphaltDeblur: 1 },
  // hidden-helicopter candidates [x, y, z]: found with a scan (dev/world.html __heliScan), y = 0 ground
  heliPark: [[-88, 0, -23], [66.6, 0, -0.5], [-203, 0, 29.5], [-203, 0, 62], [57, 0, 62], [-202, 0, 166], [-68, 0, 80], [-36, 0, 75], [-4, 0, 70], [-52, 0, 110], [-21, 0, 106], [9, 0, 98], [-30, 0, 26], [-128, 0, -41]],   // (hidden first: car parks, the courts, the glen, lawns behind buildings, Prize Day Field; four on the pitch as spares. Sitework keeps tree trunks 11.5 m back from each)
  walkSeeds: [[-188, -29], [-204, -27], [48, -28], [68, -28], [-160, 133], [28, -22], [-36, 95], [-95, 48], [-10, -18], [-110, -50], [-112, 30], [-60, 20]],
  // Menu camera tour: camera path + look-at path (Catmull-Rom), field of view, caption. -z = north.
  tour: [
    { name: 'Tom Ryan Field', fov: 46,
      pos: [[30, 16, 132], [10, 18, 128], [-12, 20, 126], [-34, 22, 128]],
      tgt: [[-36, 0, 95], [-44, 0, 94], [-54, 1, 94], [-66, 2, 96]] },
    { name: 'Katharine Branson Hall', fov: 46,
      pos: [[-70, 9, 52], [-56, 12, 44], [-42, 15, 38], [-26, 18, 36]],
      tgt: [[-36, 13, -8], [-34, 13, -10], [-32, 13.5, -12], [-30, 14, -14]] },
    { name: 'The Commons', fov: 48,
      pos: [[-84, 12, 52], [-92, 12, 44], [-100, 11, 38], [-108, 10, 34]],
      tgt: [[-128, 5, 14], [-129, 5, 13], [-130, 5, 12], [-131, 5, 11]] },
    { name: 'Academic Quad', fov: 50,
      pos: [[-128, 20, 92], [-136, 18, 102], [-142, 16, 110], [-148, 14, 116]],
      tgt: [[-162, 4, 136], [-163, 4, 137], [-164, 4, 138], [-165, 4, 140]] },
    { name: 'Fernhill Avenue', fov: 50,
      pos: [[-150, 16, -52], [-110, 18, -62], [-70, 19, -74], [-30, 19, -84]],
      tgt: [[-96, 11, -30], [-70, 11, -30], [-44, 12, -30], [-20, 12, -40]] },
  ],
  loadWorld: () => import('./world.js'),
};
