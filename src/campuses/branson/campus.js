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
  },
  sat: { minX: -330, maxX: 330, minZ: -300, maxZ: 300 },
  playBounds: { minX: -215, maxX: 82, minZ: -100, maxZ: 184 },   // (south edge: behind Tallant Science Center and across the toe of the wooded hill south of Ross Creek)
  // Real ground heights (CAMPUSES.md "Terrain"): USGS 3DEP lidar DEM baked by tools/terrain.py, centimetres above Tom Ryan
  // Field (y = 0), 2 m grid over the satellite rectangle; its outer 40 m are blended into the 20 m backdrop grid
  // (gen.terrain), which also answers beyond the rectangle. Pads are flattened by the builder (sitework in world.js).
  terrain: { file: 'campuses/branson/terrain.bin', format: 'i16', nx: 331, nz: 301, scale: 0.01, offset: 0, extent: { minX: -330, maxX: 330, minZ: -300, maxZ: 300 }, outside: backdropY, blend: 20, cell: 2 },
  // Both bases stand on the upper-campus plateau (y ~ 10-11), at its two ends, ~260 m apart, each enclosed by real cover: red
  // (Bulls) = the hedged lawn north of Fernhill Ave at its west end (hedge walls, trees, the house behind); blue (Wildcats) = the
  // lawn beside New House on Circle Drive (houses and trees). QA round 2: the old red base on the edge of the open faculty car
  // park had long sightlines (cover 0.44 vs 0.75); moved rather than dressed with invented cover (rule F31). No overlook on either.
  ctf: { red: [-184, -66], blue: [68, -28] },
  practiceHeli: { x: -33, z: 92, yaw: 0 },
  spawnCenter: [-60, 30],
  spawnBounds: { minX: -205, maxX: 76, minZ: -88, maxZ: 126 },   // (not on the wooded hill south of the field)
  sky: { horizonHaze: 1 },
  ground: { asphaltDeblur: 1 },
  // hidden-helicopter candidates [x, y, z]: found with a scan (dev/world.html __heliScan), y = 0 ground
  heliPark: [[-68, 0, -58], [-88, 0, -23], [-154.8, 0, 0.2], [66.6, 0, -0.5], [-203, 0, 32], [-203, 0, 62], [57, 0, 62], [-203, 0, 172], [-68, 0, 80], [-36, 0, 75], [-4, 0, 70], [-50, 0, 110], [-18, 0, 105], [12, 0, 100]],   // (hidden first: car parks, the courts, the glen, lawns behind buildings, Prize Day Field; four on the pitch as spares. Sitework keeps tree trunks 11.5 m back from each)
  walkSeeds: [[-192, -50], [-188, -28], [68, -28], [-160, 133], [28, -22], [-36, 95], [-95, 48], [-10, -18], [-110, -50], [-112, 30], [-60, 20]],
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
