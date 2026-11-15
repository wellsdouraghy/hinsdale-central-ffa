// Alexander Hamilton High School, Los Angeles CA (LAUSD, 2955 S Robertson Blvd, Castle Heights / Palms).
// Data + baked assets live in public/campuses/hamilton/ (see tools/ for how they are made).
import { HAMILTON_BRAND } from './brand.js';

// The neighbourhood street grid is rotated 18.5 deg: G(a, b) turns street-grid metres (a east along Cattaraugus Ave,
// b south along Canfield Ave) into the world frame (x east, z south). Everything below is plain numbers once evaluated.
const CA = Math.cos(18.5 * Math.PI / 180), SA = Math.sin(18.5 * Math.PI / 180);
const r1 = (v) => Math.round(v * 10) / 10;
const G = (a, b) => [r1(a * CA - b * SA), r1(a * SA + b * CA)];
const G3 = (a, y, b) => { const p = G(a, b); return [p[0], y, p[1]]; };
const shot = (name, fov, pos, tgt) => ({ name, fov, pos: pos.map((p) => G3(...p)), tgt: tgt.map((p) => G3(...p)) });
const heli = G(-106.5, -12);

export default {
  id: 'hamilton',
  name: 'Hamilton High School',
  wordmark: ['Alexander', 'Hamilton'],
  city: 'Los Angeles, CA',
  stateName: 'California',
  rival: 'Palisades',     // the Dolphins (Palisades Charter High): Hamilton's Western League rival
  aliases: ['Alexander Hamilton High School', 'Alexander Hamilton', 'Hamilton High', 'Hami', 'Hami High', 'AHHS', 'LAUSD', 'Los Angeles', 'LA', 'Castle Heights', 'Palms', 'Culver City', 'Robertson', 'Westside', 'Pali'],
  blurb: 'Brown Hall and its copper bell tower, Al Michaels Field, solar car parks and Robertson Boulevard.',
  legal: 'Fan-made campus game. Not affiliated with Alexander Hamilton High School or LAUSD.',
  ...HAMILTON_BRAND,   // short, palette, emblem, teams (Yankees vs Palisades Dolphins), letters: see brand.js
  origin: { lat: 34.03416, lon: -118.39164 },   // local frame origin (x east, z south, metres)
  files: {
    campus: 'campuses/hamilton/campus.json',
    gen: 'campuses/hamilton/gen.json',
    satellite: 'campuses/hamilton/satellite.jpg',
    groundMacro: 'campuses/hamilton/ground_macro.jpg',
    groundMask: 'campuses/hamilton/ground_mask.png',
    roofs: 'campuses/hamilton/roofs.jpg',
    surfaceClasses: 'campuses/hamilton/surface_classes.png',
  },
  sat: { minX: -400, maxX: 400, minZ: -360, maxZ: 360 },
  playBounds: { minX: -224, maxX: 236, minZ: -196, maxZ: 192 },
  // red = the plaza south of Al Michaels Field (ticket canopies, planters, four ways in), blue = the fig-tree lawn in
  // front of Brown Hall on Robertson Blvd (trees, planter walls, gates), ~310 m apart with the whole school between
  ctf: { red: G(-112, 91), blue: G(164, -60) },
  practiceHeli: { x: heli[0], z: heli[1], yaw: -1.25 },
  spawnCenter: G(20, 0),
  spawnBounds: { minX: -168, maxX: 196, minZ: -150, maxZ: 150 },
  sky: { horizonHaze: 1 },
  ground: { asphaltDeblur: 1 },
  // hidden-helicopter candidates [x, y, z] (y = 0 ground; roof spots are added by the builder), validated at load
  heliPark: [
    [-106.5, -12], [-106.5, -52], [-106.5, 30], [-19, -30.5], [-68.8, 124], [28, 148], [140, 55.5], [164, -9], [110, 82], [196.8, -20], [195.5, 60], [60, 132], [-19, -4.5],
  ].map(([a, b]) => G3(a, 0, b)),
  // Menu camera tour: camera path + look-at path in street-grid coordinates [a, y, b]
  tour: [
    shot('Brown Hall', 44, [[196, 9, 30], [192, 10, 6], [188, 11, -20], [184, 12, -44]], [[136, 12, -28], [136, 12, -34], [136, 13, -40], [136, 14, -44]]),
    shot('Al Michaels Field', 46, [[-70, 22, 70], [-80, 24, 40], [-92, 26, 10], [-100, 28, -24]], [[-120, 1, 10], [-118, 1, -10], [-114, 1, -36], [-110, 2, -60]]),
    shot('Robertson Boulevard', 50, [[206, 14, 150], [202, 15, 110], [198, 16, 70], [196, 17, 30]], [[170, 5, 80], [166, 6, 40], [160, 7, 0], [150, 9, -40]]),
    shot('The quad', 48, [[-20, 26, -96], [0, 28, -70], [16, 30, -44], [28, 32, -20]], [[50, 6, -50], [56, 6, -36], [62, 6, -20], [70, 7, -4]]),
    shot('Solar car park', 48, [[-96, 24, 176], [-64, 26, 172], [-30, 28, 168], [4, 30, 164]], [[-50, 2, 120], [-30, 2, 114], [-10, 3, 106], [10, 4, 96]]),
    shot('Castle Heights', 52, [[240, 60, 190], [190, 64, 200], [130, 66, 206], [70, 68, 208]], [[150, 6, 40], [110, 6, 20], [70, 8, 0], [30, 8, -20]]),
  ],
  loadWorld: () => import('./world.js'),
};
