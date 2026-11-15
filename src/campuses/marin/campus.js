// Marin Academy, San Rafael CA. Data + baked assets live in public/campuses/marin/ (see tools/ for how they are made).
import { MARIN_BRAND } from './brand.js';

export default {
  id: 'marin',
  name: 'Marin Academy',
  wordmark: ['Marin', 'Academy'],
  city: 'San Rafael, CA',
  stateName: 'California',
  rival: 'San Domenico',     // the Panthers: Marin Academy's main rival
  aliases: ['Marin Academy High School', 'MA', 'San Rafael', 'Marin County', 'Bay Area'],
  blurb: 'Clay-tile roofs, Championship Field, the pool and downtown San Rafael at the gate.',
  legal: 'Fan-made campus game. Not affiliated with Marin Academy.',
  ...MARIN_BRAND,   // short, palette, emblem, teams (Wildcats vs San Domenico Panthers), letters: see brand.js
  // local frame: x east, z south, metres; height = ellipsoid height of the campus ground (Mission Ave) for 3D tiles
  origin: { lat: 37.97575, lon: -122.53505, height: -14.0 },
  tileRegistration: [[80, -6], [60, -20], [100, 5], [-20, -5], [-90, -45], [10, -140], [-25, 60], [82, 58], [-140, 130], [0, 102], [150, 60], [-150, 20]],
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
  // red = the north-east corner of Championship Field by the scorer's tents (cover + 4 fence openings), blue = the
  // downtown car park off 4th St, ~295 m apart
  ctf: { red: [104, -27], blue: [-141, 131] },
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
  // hidden-helicopter candidates [x, y, z]: y = 0 ground, y = roof deck height on flat roofs (validated at load)
  heliPark: [
    [108, 0, -30], [62, 0, -22], [76, 0, -74], [12, 0, -140], [-86, 0, -44], [-20, 0, -5], [84, 0, 58], [-141, 0, 131],
    [-30, 0, 150], [-10, 0, 180], [128, 0, 172], [70, 0, 150], [150, 0, 62], [-160, 0, 160], [100, 0, 258], [-48, 0, 240],
    [-196, 0, 0], [196, 0, 44], [13, 0, 92], [-110, 0, 96], [170, 0, 110], [-150, 0, -150], [60, 0, -190], [180, 0, -60],
  ],
  // Menu camera tour: camera path + look-at path (Catmull-Rom), field of view, caption. -z = north (uphill).
  tour: [
    { name: 'Championship Field', fov: 44,
      pos: [[136, 16, 34], [124, 18, 10], [112, 20, -16], [96, 22, -44]],
      tgt: [[78, 1, -8], [76, 1, -8], [72, 2, -6], [66, 2, -4]] },
    { name: 'Foster Hall', fov: 46,
      pos: [[-52, 3.0, 14], [-47, 3.4, 4], [-41, 4.0, -8], [-34, 4.8, -18]],
      tgt: [[-18, 5.5, -36], [-18, 5.5, -38], [-18, 6, -40], [-18, 6.5, -42]] },
    { name: 'Mission Avenue', fov: 50,
      pos: [[-120, 9, 14], [-84, 10, 18], [-48, 11, 22], [-12, 12, 26]],
      tgt: [[-40, 5, 30], [-4, 5, 34], [30, 5, 38], [66, 5, 44]] },
    { name: 'Gyms and Science Center', fov: 48,
      pos: [[84, 30, -150], [70, 28, -128], [62, 26, -104], [60, 24, -78]],
      tgt: [[14, 8, -100], [16, 8, -90], [18, 8, -76], [20, 8, -58]] },
    { name: 'Aquatic Center', fov: 46,
      pos: [[98, 20, 112], [86, 22, 106], [72, 24, 104], [56, 26, 108]],
      tgt: [[52, 0, 74], [50, 0, 72], [48, 0, 70], [44, 2, 66]] },
    { name: 'Downtown San Rafael', fov: 52,
      pos: [[-170, 46, 236], [-110, 44, 232], [-50, 42, 230], [10, 40, 232]],
      tgt: [[-110, 4, 150], [-60, 4, 140], [-10, 4, 120], [30, 6, 90]] },
  ],
  loadWorld: () => import('./world.js'),
};
