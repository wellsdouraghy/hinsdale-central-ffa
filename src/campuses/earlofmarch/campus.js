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
  },
  sat: { minX: -360, maxX: 360, minZ: -330, maxZ: 330 },
  // the rectangle round the fence line (kit.js PLAY_EDGE = ctx.playEdge, rule F48: the clamp is that polygon, not this box)
  playBounds: { minX: -176, maxX: 237, minZ: -215.3, maxZ: 232 },
  // Real ground heights (CAMPUSES.md "Terrain"): NRCan HRDEM lidar (City of Ottawa 2020, 1 m) baked by tools/terrain.py,
  // centimetres above y = 0, 2 m grid over the satellite rectangle; its outer 40 m are blended into the 20 m backdrop
  // grid (gen.terrain), which also answers beyond the rectangle. Pads are flattened by the builder (sitework in world.js).
  terrain: { file: 'campuses/earlofmarch/terrain.bin', format: 'i16', nx: 361, nz: 331, scale: 0.01, offset: 0, extent: { minX: -360, maxX: 360, minZ: -330, maxZ: 330 }, outside: backdropY, blend: 20, cell: 2 },
  ctf: { red: [40, -125], blue: [60, 190] },
  practiceHeli: { x: -113, z: 85, yaw: 0 },
  spawnCenter: [20, 10],
  sky: { horizonHaze: 1 },
  ground: { asphaltDeblur: 1 },
  heliPark: [],
  walkSeeds: [[40, -125], [60, 190], [-113, 85], [150, -20], [-60, -60], [120, 110]],
  tour: [
    { name: 'Earl of March', fov: 48,
      pos: [[20, 22, -150], [45, 24, -140], [70, 26, -128], [95, 28, -112]],
      tgt: [[50, 5, -40], [56, 5, -36], [62, 5, -32], [68, 5, -28]] },
  ],
  loadWorld: () => import('./world.js'),
};
