// Earl of March Secondary School, Kanata (Ottawa), Ontario: 4 The Parkway. Data + baked assets live in
// public/campuses/earlofmarch/ (see tools/ for how they are made; dev/EARLOFMARCH_PROGRESS.md for the key coordinates).
import { EOM_BRAND } from './brand.js';
import { backdropY } from './backdropY.js';

export default {
  id: 'earlofmarch',
  name: 'Earl of March Secondary School',
  wordmark: ['Earl of', 'March'],
  city: 'Kanata, ON',
  stateName: 'Ontario',
  rival: 'A.Y. Jackson',     // the Jays: the other English public high school in Kanata (same board, same league; inferred, see brand.js)
  aliases: ['Earl of March', 'Earl of March SS', 'Earl of March High School', 'EOM', 'EOMSS', 'The Earl', 'Earl of March Lions', 'Kanata', 'Beaverbrook', 'Ottawa', 'OCDSB', 'Canada'],
  blurb: 'A 1971 precast-and-brick school among the rock outcrops and pines of Beaverbrook, on its real lidar ground: the school and its portables, the track, the Mlacak Centre and the library, The Parkway.',
  legal: 'Fan-made campus game. Not affiliated with Earl of March Secondary School or the Ottawa-Carleton District School Board.',
  ...EOM_BRAND,   // short, palette, emblem, teams (Lions vs A.Y. Jackson Jays), letters: see brand.js
  // local frame: x east, z south, metres; height = ellipsoid height of y = 0 (the ground round the school, CGVD2013 93.66 m)
  // for 3D tiles: 223 open-ground tile samples sit at viewer height 60 - 0.51, the same in every quadrant (tools/terrain.py)
  origin: { lat: 45.32305, lon: -75.89570, height: 59.49 },
  tileRegistration: [[45, -120], [60, -105], [20, -125], [70, -95], [-115, 85], [-110, 60]],   // the north car park and the track infield: level, open, at y ~ 0
  files: {
    campus: 'campuses/earlofmarch/campus.json',
    gen: 'campuses/earlofmarch/gen.json',
    satellite: 'campuses/earlofmarch/satellite.jpg',
    groundMacro: 'campuses/earlofmarch/ground_macro.jpg',
    groundMask: 'campuses/earlofmarch/ground_mask.png',
    roofs: 'campuses/earlofmarch/roofs.jpg',
    surfaceClasses: 'campuses/earlofmarch/surface_classes.png',
    textures: 'campuses/earlofmarch/tex/tex.json',   // generated from the reference measurements (tools/textures/campuses/earlofmarch/materials.json)
  },
  sat: { minX: -360, maxX: 360, minZ: -330, maxZ: 330 },
  // the rectangle round the fence line (kit.js PLAY_EDGE = ctx.playEdge, rule F48: the clamp is that polygon, not this box)
  playBounds: { minX: -176, maxX: 237, minZ: -215.3, maxZ: 232 },
  // Real ground heights (CAMPUSES.md "Terrain"): NRCan HRDEM lidar (City of Ottawa 2020, 1 m) baked by tools/terrain.py,
  // centimetres above y = 0, 2 m grid over the satellite rectangle; its outer 40 m are blended into the 20 m backdrop
  // grid (gen.terrain), which also answers beyond the rectangle. Pads are flattened by the builder (sitework in world.js).
  terrain: { file: 'campuses/earlofmarch/terrain.bin', format: 'i16', nx: 361, nz: 331, scale: 0.01, offset: 0, extent: { minX: -360, maxX: 360, minZ: -330, maxZ: 330 }, outside: backdropY, blend: 20, cell: 2 },
  // Both bases stand on lawn at opposite ends of the school, 259 m apart, with the school between them: red (Lions) on the green
  // between the portable rows north-west of the school, blue (Jays) on the lawn between the Mlacak Centre and the wood beside the
  // track. Found with a scan of the map check's own cover measure (16 rays, 30 m; 5-point means 0.44 / 0.47) over every nav cell
  // 14 m inside the fence, then put on nadir tiles shots (rule F39). The built site is level: no overlook on either (0 / 0 cells).
  ctf: { red: [-32, -86], blue: [-56, 172] },
  practiceHeli: { x: -113, z: 85, yaw: 0 },   // the track infield
  spawnCenter: [20, 10],
  spawnBounds: { minX: -160, maxX: 205, minZ: -180, maxZ: 218 },
  sky: { horizonHaze: 1 },
  ground: { asphaltDeblur: 1 },
  // hidden-helicopter candidates [x, y, z]: accepted by a scan (world.js: every level 5 m cell clear of streets, buildings and the
  // fence -> the shared exact rotor test), thinned to 34 m apart, lawns first; parked cars and trees keep clear of them
  heliPark: [[-79, 0, -103.3], [-109, 0, -83.3], [-134, 0, -48.3], [-119, 0, 41.7], [1, 0, 56.7], [-49, 0, 71.7], [-124, 0, 101.7], [126, 0, 121.7], [-139, 0, 171.7], [-164, 0, 206.7],
    [31, 0, -173.3], [111, 0, -83.3], [136, 0, -58.3], [-84, 0, -43.3], [111, 0, -33.3]],
  walkSeeds: [[-32, -86], [-56, 172], [-113, 85], [45, -120], [150, -20], [120, 110], [60, 160]],
  // Menu camera tour: camera path + look-at path (Catmull-Rom), field of view, caption. -z = north.
  tour: [
    { name: 'Earl of March', fov: 48,
      pos: [[150, 14, -110], [130, 16, -92], [112, 18, -74], [100, 20, -58]],
      tgt: [[70, 5, -30], [72, 5, -26], [76, 5, -20], [80, 5, -14]] },
    { name: 'The North Wing', fov: 48,
      pos: [[-30, 10, -120], [-10, 12, -112], [10, 13, -106], [30, 14, -102]],
      tgt: [[20, 5, -50], [28, 5, -52], [36, 5, -54], [44, 5, -56]] },
    { name: 'The Track', fov: 50,
      pos: [[-170, 16, 150], [-160, 18, 120], [-150, 19, 90], [-140, 20, 60]],
      tgt: [[-112, 0, 100], [-112, 0, 84], [-110, 1, 68], [-100, 2, 50]] },
    { name: 'Mlacak Centre', fov: 50,
      pos: [[110, 14, 210], [100, 15, 190], [90, 16, 172], [84, 17, 156]],
      tgt: [[20, 4, 186], [22, 4, 176], [24, 4, 166], [30, 5, 150]] },
    { name: 'Grades 7-8 Wing', fov: 48,
      pos: [[200, 10, 70], [190, 12, 84], [176, 13, 98], [160, 14, 110]],
      tgt: [[150, 5, 40], [142, 5, 52], [132, 5, 64], [120, 5, 74]] },
  ],
  loadWorld: () => import('./world.js'),
};
