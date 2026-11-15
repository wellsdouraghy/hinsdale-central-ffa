// Hinsdale Central High School, Hinsdale IL (the original map). Assets keep their original paths.
export default {
  id: 'hinsdale',
  name: 'Hinsdale Central',
  wordmark: ['Hinsdale', 'Central'],
  city: 'Hinsdale, IL',
  stateName: 'Illinois',
  rival: 'Lyons Township',   // the Lions (LT): Hinsdale Central's main rival
  aliases: ['Hinsdale Central High School', 'HC', 'HCHS', 'Hinsdale Township', 'District 86', 'D86', 'Chicago'],
  blurb: 'Red brick, Dickinson Field, the water tower and a lot of rooftops.',
  legal: 'Fan-made campus game. Not affiliated with Hinsdale Central High School or District 86.',
  short: 'HC',
  brand: { red: '#e3242b', accent: '#e0393e', accent2: '#ff5a5f' },
  // Title emblem (inside a 100 x 112 SVG): Red Devils horns + pitchfork shield.
  emblem: `<path class="lm-horn" d="M22 34C12 24 9 12 14 0c4 12 12 19 24 23z" />
    <path class="lm-horn" d="M78 34C88 24 91 12 86 0c-4 12-12 19-24 23z" />
    <path class="lm-shield" d="M50 16 86 30 82 66c-4 20-17 34-32 44C35 100 22 86 18 66L14 30z" />
    <path class="lm-inner" d="M50 24 78 35 75 64c-3 16-13 28-25 36-12-8-22-20-25-36L22 35z" />
    <path class="lm-fork" d="M48 46h4v44h-4zM34 40l5 4v10c0 6 5 9 11 9s11-3 11-9V44l5-4v14c0 10-7 15-16 15s-16-5-16-15zM50 30l5 12h-10z" />`,
  teams: { red: 'Red Devils', blue: 'Lions' },
  letters: { red: 'H', blue: 'L' },
  origin: { lat: 41.78725, lon: -87.93375, height: 187.9 },
  tileRegistration: [[-150, 60], [-160, 90], [245, 30], [262, 48], [60, 150], [85, 140], [-60, 160], [240, -70], [-153, -100], [-59, 37], [150, 150], [-216, 0], [0, -203]],
  files: {
    campus: 'data/campus.json',
    gen: 'assets/world/gen.json',
    satellite: 'assets/satellite/campus_z19.jpg',
    groundMacro: 'assets/world/ground_macro.jpg',
    groundMask: 'assets/world/ground_mask.png',
    roofs: 'assets/world/roofs.jpg',
    surfaceClasses: 'assets/world/surface_classes.png',
  },
  sat: { minX: -394.85, maxX: 394.85, minZ: -305.44, maxZ: 305.44 },
  playBounds: { minX: -222, maxX: 292, minZ: -212, maxZ: 214 },
  // Visual-only extras (see src/world/ground.js, sky.js): the woods carry on to the horizon from the air, a soft haze band
  // hides the fog/sky seam, and smeared satellite paint on asphalt is smoothed up close.
  ground: { canopy: { y: 9, inset: 6 }, asphaltDeblur: 1 },
  sky: { horizonHaze: 1 },
  // red = Dickinson Field stadium (west end), blue = east ball fields across the east street (~395 m apart)
  ctf: { red: [-154, -88], blue: [241, -95] },
  practiceHeli: { x: -154, z: -98, yaw: 0 },
  // Layout hints for the generic collision / spawn / nav code (src/world/collision.js).
  walkSeeds: [[-150, 60], [0, -175], [240, 20], [60, 150]],
  spawnCenter: [35, 0],
  navSeed: [-150, 60],
  // Every entry is checked at load (src/world/collision.js pickHeliSpawns: exact 8.5 m rotor clearance, trees >= 10.5 m,
  // open sky, deck under the skids) and by the map check; entries closer than 30 m to an accepted one are skipped.
  heliPark: [
    // ground: service yards, behind buildings, field edges and corners
    [123, 0, 150], [164, 0, 170], [270, 0, 66], [-20, 0, 90], [-47, 0, 162], [-80, 0, 128], [-186, 0, 122], [-198, 0, 30],
    [-195, 0, -32], [-114, 0, -26], [-64, 0, -50], [-31, 0, -153], [272, 0, -182], [228, 0, -36], [262, 0, 150], [228, 0, 196],
    [29, 0, 196], [107, 0, 78], [8, 0, 72], [-121, 0, 60], [180, 0, -170], [-196, 0, -170], [240, 0, -161], [20, 0, 131],
    // flat rooftops (deck height = wing height - 0.4), clear of roof units, penthouses and parapets
    [135, 13.1, -72], [19, 11.6, 11], [61, 10.6, 30], [-10, 9.6, -78], [30, 9.6, -46],
  ],
  // Menu camera tour: camera path + look-at path (Catmull-Rom), field of view, caption. -z = north (55th St).
  tour: [
    { name: 'Dickinson Field', fov: 42,
      pos: [[-92, 16, -52], [-100, 19, -86], [-104, 21, -122], [-100, 22, -152]],
      tgt: [[-150, 3, -96], [-152, 3, -100], [-152, 3, -104], [-150, 4, -108]] },
    { name: '55th Street entrance', fov: 48,
      pos: [[28, 3.2, -196], [38, 3.4, -195], [48, 3.8, -194], [58, 4.2, -193]],
      tgt: [[54, 7, -150], [57, 7, -150], [60, 7, -150], [63, 7, -150]] },
    { name: 'Water tower', fov: 46,
      pos: [[-8.0, 24.0, 74.8], [7.4, 26.5, 87.7], [17.5, 29.0, 105.2], [21.0, 31.5, 125.0]],
      tgt: [[-37, 22, 125], [-37, 23, 125], [-37, 24, 125], [-37, 25, 125]] },
    { name: 'Rooftops', fov: 52,
      pos: [[150, 58, -28], [110, 52, -46], [70, 48, -62], [30, 46, -74]],
      tgt: [[80, 8, -110], [50, 8, -112], [20, 8, -110], [-10, 8, -106]] },
    { name: 'Tennis courts', fov: 44,
      pos: [[-8, 32, -186], [-12, 30, -160], [-14, 29, -132], [-14, 28, -104]],
      tgt: [[-66, 0, -150], [-66, 0, -134], [-66, 0, -118], [-66, 0, -100]] },
    { name: 'Track & field', fov: 40,
      pos: [[-206, 7, -150], [-204, 9, -118], [-202, 11, -86], [-198, 13, -54]],
      tgt: [[-150, 6, -128], [-150, 5, -104], [-150, 5, -82], [-150, 6, -64]] },
  ],
  loadWorld: () => import('./world.js'),
};
