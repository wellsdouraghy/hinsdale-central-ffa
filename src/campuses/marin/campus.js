// Marin Academy, San Rafael CA. Data + baked assets live in public/campuses/marin/ (see tools/ for how they are made).
import { MARIN_BRAND } from './brand.js';
import { backdropY } from './backdropY.js';

export default {
  id: 'marin',
  name: 'Marin Academy',
  wordmark: ['Marin', 'Academy'],
  city: 'San Rafael, CA',
  stateName: 'California',
  rival: 'San Domenico',     // the Panthers: Marin Academy's main rival
  aliases: ['Marin Academy High School', 'MA', 'San Rafael', 'Marin County', 'Bay Area'],
  blurb: 'A hillside campus on its real terrain: Foster Hall, Championship Field, the gyms up the hill and downtown San Rafael below.',
  legal: 'Fan-made campus game. Not affiliated with Marin Academy.',
  ...MARIN_BRAND,   // short, palette, emblem, teams (Wildcats vs San Domenico Panthers), letters: see brand.js
  // local frame: x east, z south, metres; height = ellipsoid height of y = 0 (the Championship Field turf) for 3D tiles
  origin: { lat: 37.97575, lon: -122.53505, height: -13.5 },
  tileRegistration: [[80, -6], [60, -20], [100, 5], [70, -50], [100, -30], [50, 5]],   // on the pitch: the only large level ground at y = 0
  files: {
    campus: 'campuses/marin/campus.json',
    gen: 'campuses/marin/gen.json',
    satellite: 'campuses/marin/satellite.jpg',
    groundMacro: 'campuses/marin/ground_macro.jpg',
    groundMask: 'campuses/marin/ground_mask.png',
    roofs: 'campuses/marin/roofs.jpg',
    surfaceClasses: 'campuses/marin/surface_classes.png',
  },
  sat: { minX: -330, maxX: 330, minZ: -300, maxZ: 300 },
  playBounds: { minX: -186, maxX: 182, minZ: -176, maxZ: 204 },
  // Real ground heights (CAMPUSES.md "Terrain"): USGS 3DEP lidar DEM baked by tools/terrain.py, centimetres above the
  // Championship Field (y = 0), 2 m grid over the satellite rectangle; its outer 40 m are already blended into the 20 m
  // backdrop grid (gen.terrain), which also answers beyond the rectangle. Pads (field, pool deck, courts, building
  // entrances) are flattened by the builder (sitework in world.js) before anything is placed.
  terrain: { file: 'campuses/marin/terrain.bin', format: 'i16', nx: 331, nz: 301, scale: 0.01, offset: 0, extent: { minX: -330, maxX: 330, minZ: -300, maxZ: 300 }, outside: backdropY, blend: 20, cell: 2 },
  // red = the plaza between the gyms, the Science Center and Foster Hall (buildings on every side), blue = the downtown car
  // park off 4th St, ~260 m apart. Red used to stand in the north-east corner of Championship Field: on the real ground the
  // gym plaza and the hill lanes look down on the pitch from 6-13 m (map check overlook: 1584 m2 against 0), and the only
  // thing that hid it was an invented evergreen belt. The real cover there is open woodland, so the base moved instead.
  ctf: { red: [3, -73], blue: [-150, 136] },   // (blue: the open car park; [-141, 131] is inside the red cottage at the back of that court, so the base used to be nudged 9 m)
  practiceHeli: { x: 62, z: -22, yaw: -1.45 },
  spawnCenter: [-10, 20],
  // free-for-all spawns stay on and around campus (needs computeSpawns to honour it; ignored otherwise)
  spawnBounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 170 },
  // Visual-only extras (see src/world/sky.js, ground.js): a soft haze band hides the seam between the fogged ground and the
  // sky on the horizon (very visible from the helicopter), and smeared satellite paint on asphalt is smoothed up close.
  sky: { horizonHaze: 1 },
  ground: { asphaltDeblur: 1 },
  // Water features (visual only, see src/world/water.js). Aquatic centre: 25 yd x ~34 m competition pool on the street
  // grid (rotated 7.2 deg), fourteen 25 yd lanes running east-west, deep end to the south.
  water: [
    { kind: 'pool', rect: { cx: 53.5, cz: 73.6, w: 23.6, d: 33.6, angle: 0.12566 }, depth: [1.2, 3.8], deepEnd: 1, lanes: { count: 14, along: 'short' }, ladders: 4 },
  ],
  // hidden-helicopter candidates [x, y, z]: y = 0 ground, y = roof deck height on flat roofs. Every entry is checked at
  // load (src/world/collision.js pickHeliSpawns: exact 8.5 m rotor clearance, trees >= 10.5 m, open sky, deck under the
  // skids) and by the map check; entries closer than 30 m to an accepted one are skipped.
  heliPark: [
    // found with a scan on the terrain (5 m grid, exact 8.5 m rotor clearance, <= 0.28 m of ground relief under the skids,
    // trunks >= 11.5 m, never on a street): car parks first, then the pitch and lawns
    [-6, 0, -152], [22, 0, -140], [-90, 0, -44], [82, 0, 68], [122, 0, 136], [-150, 0, 144], [6, 0, 144], [-26, 0, 160], [-138, 0, 48],
    [74, 0, -68], [114, 0, 20], [50, 0, -8], [14, 0, 88], [26, 0, 176], [34, 0, -112],
    [-66, 0, 142], [-84, 0, 104], [-152, 0, 170], [126, 0, 172], [8, 0, -146], [92, 0, -44],   // spare lots and turf (the list had exactly the 12 the check asks for)
    [22, 15.5, -52],   // flat roof: the Science + Innovation Center penthouse (absolute deck height; the west classroom block roof is covered by its solar array)
  ],
  // walkable flood-fill seeds (CAMPUSES.md). Spelled out so the reachable area does not depend on the helicopter list:
  // the flag bases, the practice pad and open ground around campus.
  walkSeeds: [[3, -73], [104, -27], [-150, 136], [62, -22], [108, -30], [76, -74], [12, -140], [-86, -44], [-20, -5], [84, 58], [-30, 150], [-10, 180],
    [128, 172], [70, 150], [150, 62], [-160, 160], [13, 92], [-110, 96], [170, 110], [-150, -150], [180, -60]],
  // Menu camera tour: camera path + look-at path (Catmull-Rom), field of view, caption. -z = north (uphill).
  tour: [
    { name: 'Championship Field', fov: 44,
      pos: [[136, 16, 34], [124, 18, 10], [112, 20, -16], [96, 22, -44]],
      tgt: [[78, 1, -8], [76, 1, -8], [72, 2, -6], [66, 2, -4]] },
    { name: 'Foster Hall', fov: 46,
      pos: [[-52, 5.6, 14], [-47, 7.0, 4], [-41, 8.6, -8], [-34, 10.4, -18]],
      tgt: [[-18, 12.5, -36], [-18, 12.5, -38], [-18, 13, -40], [-18, 13.5, -42]] },
    { name: 'Mission Avenue', fov: 50,
      pos: [[-120, 8, 14], [-84, 11, 18], [-48, 13, 22], [-12, 12, 26]],
      tgt: [[-40, 5, 30], [-4, 4, 34], [30, 3, 38], [66, 2, 44]] },
    { name: 'Gyms and Science Center', fov: 48,
      pos: [[84, 44, -150], [70, 40, -128], [62, 36, -104], [60, 32, -78]],
      tgt: [[14, 17, -100], [16, 17, -90], [18, 16, -76], [20, 14, -58]] },
    { name: 'Aquatic Center', fov: 46,
      pos: [[98, 20, 112], [86, 22, 106], [72, 24, 104], [56, 26, 108]],
      tgt: [[52, -4, 74], [50, -4, 72], [48, -4, 70], [44, -2, 66]] },
    { name: 'Downtown San Rafael', fov: 52,
      pos: [[-170, 46, 236], [-110, 44, 232], [-50, 42, 230], [10, 40, 232]],
      tgt: [[-110, -3, 150], [-60, -3, 140], [-10, -2, 120], [30, 0, 90]] },
  ],
  loadWorld: () => import('./world.js'),
};
