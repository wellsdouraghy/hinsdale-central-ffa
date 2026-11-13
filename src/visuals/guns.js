// Procedural firearm models (original designs in the style of common service weapons). Shared by the first-person
// viewmodels and the third-person characters. Gun space: bore along -z, +y up, +x right; metres.
// Authoring uses "f" = distance forward along the bore (so z = -f).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';

// ---- materials ------------------------------------------------------------------------------------------------------
let MATS = null;
export function gunMaterials() {
  if (MATS) return MATS;
  const rep = (t, n) => { const c = t.clone(); c.repeat.set(n, n); c.needsUpdate = true; return c; };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MATS = {
    // hard-anodized / parkerized receiver metal
    metal: std({ color: 0x3c3e42, metalness: 0.7, roughness: 0.5, roughnessMap: rep(T.wearRoughness(), 1), map: rep(T.wearAlbedo(), 1), normalMap: rep(T.metalNormal(), 6), normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.25 }),
    // phosphate barrel steel
    barrel: std({ color: 0x2b2c2f, metalness: 0.8, roughness: 0.46, envMapIntensity: 1.25, roughnessMap: rep(T.wearRoughness(), 2) }),
    // bare polished steel (bolt, chamber)
    steel: std({ color: 0x9a9da2, metalness: 1, roughness: 0.3, roughnessMap: rep(T.wearRoughness(), 2) }),
    polymer: std({ color: 0x1c1d1f, metalness: 0, roughness: 0.7, roughnessMap: rep(T.wearRoughness(), 1), normalMap: rep(T.polymerNormal(), 5), normalScale: new THREE.Vector2(0.55, 0.55) }),
    grip: std({ color: 0x141516, metalness: 0, roughness: 0.9, normalMap: rep(T.stippleNormal(), 3), normalScale: new THREE.Vector2(0.9, 0.9) }),
    od: std({ color: 0x4a4d38, metalness: 0, roughness: 0.74, roughnessMap: rep(T.wearRoughness(), 1), map: rep(T.wearAlbedo(), 1), normalMap: rep(T.polymerNormal(), 5), normalScale: new THREE.Vector2(0.6, 0.6) }),
    wood: std({ color: 0xffffff, map: rep(T.woodMap(), 1), metalness: 0, roughness: 0.5, roughnessMap: rep(T.woodRoughness(), 1) }),
    rubber: std({ color: 0x0e0e0f, metalness: 0, roughness: 0.95 }),
    black: std({ color: 0x030303, metalness: 0, roughness: 1 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x1a2430, metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.38, envMapIntensity: 1.6 }),
    lensDark: new THREE.MeshPhysicalMaterial({ color: 0x06080c, metalness: 1, roughness: 0.03, envMapIntensity: 1.8 }),
    brass: std({ color: 0xb08a3c, metalness: 1, roughness: 0.32 }),
    white: std({ color: 0xd8d8d2, metalness: 0, roughness: 0.6 }),
  };
  for (const k in MATS) { MATS[k].name = 'gun_' + k; MATS[k].vertexColors = true; }
  return MATS;
}

// ---- geometry kit ---------------------------------------------------------------------------------------------------
const UV_SCALE = 1 / 0.12; // one texture tile per 12 cm
function boxUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    // dominant axis from the face normal (average of the 3 vertex normals)
    const nx = Math.abs(n.getX(i) + n.getX(i + 1) + n.getX(i + 2));
    const ny = Math.abs(n.getY(i) + n.getY(i + 1) + n.getY(i + 2));
    const nz = Math.abs(n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2));
    for (let j = 0; j < 3; j++) {
      const x = p.getX(i + j), y = p.getY(i + j), z = p.getZ(i + j);
      let u, v;
      if (nx >= ny && nx >= nz) { u = z; v = y; } else if (ny >= nz) { u = x; v = z; } else { u = x; v = y; }
      uv[(i + j) * 2] = u * UV_SCALE; uv[(i + j) * 2 + 1] = v * UV_SCALE;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Worn edges: bevel faces of extrusions / rounded boxes get a brighter vertex colour, broken up by position noise.
const WEAR = { metal: 1.9, barrel: 1.3, polymer: 0.55, od: 0.5, grip: 0.3 };
function edgeWear(g, kind, amount) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3).fill(1);
  if (kind && amount > 0) {
    for (let i = 0; i < p.count; i += 3) {
      const nx = Math.abs(n.getX(i) + n.getX(i + 1) + n.getX(i + 2)) / 3, ny = Math.abs(n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, nz = Math.abs(n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2)) / 3;
      const edge = kind === 'prof' ? (nx > 0.2 && nx < 0.93) : ((nx > 0.3) + (ny > 0.3) + (nz > 0.3) >= 2);
      if (!edge) continue;
      for (let j = 0; j < 3; j++) {
        const x = p.getX(i + j), y = p.getY(i + j), z = p.getZ(i + j);
        const h = Math.sin(x * 311.7 + y * 174.3 + z * 97.1) * 0.5 + Math.sin(z * 63.3 - y * 41.7) * 0.5;   // -1..1, smooth-ish
        const w = Math.max(0, 0.35 + h * 0.75);
        c[(i + j) * 3] = c[(i + j) * 3 + 1] = c[(i + j) * 3 + 2] = 1 + amount * w;
      }
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

class Kit {
  constructor() { this.buckets = new Map(); }
  add(mat, g, matrix) {
    if (matrix) g.applyMatrix4(matrix);
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal') n.deleteAttribute(name);
    if (!n.userData.wear && g.userData.wear) n.userData.wear = g.userData.wear;
    n.clearGroups?.();
    edgeWear(n, g.userData.wear, WEAR[mat] ?? 0);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(n);
    return this;
  }
  // Builds one mesh per material into `group`. `pivot` re-centres the geometry so the group can rotate about it.
  build(group, pivot) {
    const mats = gunMaterials();
    for (const [mat, list] of this.buckets) {
      const g = mergeGeometries(list, false);
      if (pivot) { g.translate(-pivot[0], -pivot[1], -pivot[2]); }
      boxUV(g);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mats[mat]);
      mesh.name = mat;
      group.add(mesh);
    }
    if (pivot) group.position.set(pivot[0], pivot[1], pivot[2]);
    return group;
  }
}

const HALF = Math.PI / 2;
// Side profile [[f, y], ...] extruded across x with bevelled edges.
function prof(pts, w, { bevel = 0.002, x = 0, holes = null, seg = 2 } = {}) {
  const s = new THREE.Shape(pts.map(([f, y]) => new THREE.Vector2(f, y)));
  if (holes) for (const h of holes) s.holes.push(new THREE.Path(h.map(([f, y]) => new THREE.Vector2(f, y))));
  const depth = Math.max(0.0002, w - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: seg, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(HALF);          // f -> -z, extrusion -> x
  g.translate(x, 0, 0);
  g.userData.wear = 'prof';
  return g;
}
function cyl(r, fA, fB, { y = 0, x = 0, r2 = r, seg = 20, open = false } = {}) {
  const g = new THREE.CylinderGeometry(r2, r, Math.abs(fB - fA), seg, 1, open); // r at fA (rear), r2 at fB (front)
  g.rotateX(-HALF);
  g.translate(x, y, -(fA + fB) / 2);
  return g;
}
// Lathe around the bore axis. pts = [[radius, f], ...]
function lathe(pts, { y = 0, x = 0, seg = 24 } = {}) {
  let g = new THREE.LatheGeometry(pts.map(([r, f]) => new THREE.Vector2(r, f)), seg);
  // make sure faces point outward
  const p = g.attributes.position, n = g.attributes.normal;
  let s = 0;
  for (let i = 0; i < p.count; i++) s += p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i);
  if (s < 0) g = new THREE.LatheGeometry(pts.slice().reverse().map(([r, f]) => new THREE.Vector2(r, f)), seg);
  g.rotateX(-HALF);
  g.translate(x, y, 0);
  return g;
}
const tube = (rO, rI, fA, fB, o) => lathe([[rI, fA], [rO, fA], [rO, fB], [rI, fB], [rI, fA]], o);
function box(w, h, l, x, y, f, r = 0) {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, l, 2, Math.min(r, w / 2.01, h / 2.01, l / 2.01)) : new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, -f);
  if (r > 0) g.userData.wear = 'box';
  return g;
}
function cylX(r, len, x, y, f, seg = 14) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(HALF);
  g.translate(x, y, -f);
  return g;
}
function cylY(r, len, x, y, f, seg = 14, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.translate(x, y, -f);
  return g;
}
function sphere(r, x, y, f) {
  const g = new THREE.SphereGeometry(r, 14, 10);
  g.translate(x, y, -f);
  return g;
}
const rotAbout = (g, axis, angle, x, y, f) => {
  g.translate(-x, -y, f);
  if (axis === 'x') g.rotateX(angle); else if (axis === 'y') g.rotateY(angle); else g.rotateZ(angle);
  g.translate(x, y, -f);
  return g;
};

// Accessory rail: base strip plus recoil lugs every 10 mm. Top surface ends at y + 0.007.
function rail(k, mat, fA, fB, y, w = 0.0212) {
  k.add(mat, box(w * 0.72, 0.0042, fB - fA, 0, y + 0.0021, (fA + fB) / 2));
  for (let f = fA + 0.004; f < fB - 0.003; f += 0.01) k.add(mat, box(w, 0.0034, 0.0054, 0, y + 0.0055, f, 0.0006));
  return y + 0.0072;
}
// Cross pin visible on both sides.
const pin = (k, f, y, r, halfW, mat = 'barrel') => k.add(mat, cylX(r, halfW * 2 + 0.0012, 0, y, f, 12));

// Compact tube reflex sight on a riser. Returns the optical axis height.
function redDot(k, f0, yRail) {
  const L = 0.062, yA = yRail + 0.034, f1 = f0 + L;
  k.add('metal', box(0.03, 0.011, 0.05, 0, yRail + 0.0045, f0 + L / 2, 0.002));          // clamp
  k.add('metal', box(0.02, 0.016, 0.036, 0, yRail + 0.014, f0 + L / 2, 0.003));          // riser
  k.add('barrel', cylX(0.0045, 0.04, 0, yRail + 0.004, f0 + L / 2 - 0.012));              // clamp bolts
  k.add('barrel', cylX(0.0045, 0.04, 0, yRail + 0.004, f0 + L / 2 + 0.012));
  k.add('metal', lathe([[0.0138, f0], [0.0178, f0], [0.0186, f0 + 0.004], [0.0172, f0 + 0.009], [0.0172, f1 - 0.012], [0.0192, f1 - 0.008], [0.0192, f1], [0.0146, f1], [0.0138, f1 - 0.004], [0.0138, f0]], { y: yA, seg: 28 }));
  k.add('metal', cylY(0.0085, 0.01, 0, yA + 0.02, f0 + L * 0.42, 16));                    // elevation turret
  k.add('barrel', cylY(0.0062, 0.003, 0, yA + 0.026, f0 + L * 0.42, 16));
  const batt = cylX(0.0105, 0.014, 0.021, yA - 0.004, f0 + L * 0.42, 18);                 // battery / brightness cap
  k.add('metal', batt);
  k.add('barrel', cylX(0.0085, 0.003, 0.029, yA - 0.004, f0 + L * 0.42, 18));
  k.add('lens', cyl(0.0142, f1 - 0.0055, f1 - 0.005, { y: yA, seg: 24 }));               // objective (coated)
  k.add('lens', cyl(0.0138, f0 + 0.004, f0 + 0.0045, { y: yA, seg: 24 }));               // ocular
  return yA;
}

function finish(root, kits, anchors) {
  const parts = {};
  for (const [name, kit, pivot] of kits) {
    if (name === 'body') { kit.build(root); continue; }
    const g = new THREE.Group();
    g.name = 'part_' + name;
    kit.build(g, pivot);
    root.add(g);
    parts[name] = g;
  }
  root.userData.anchors = anchors;
  return root;
}
const V = (x, y, f) => new THREE.Vector3(x, y, -f);

// ---- M4-style carbine -----------------------------------------------------------------------------------------------
function buildAR() {
  const k = new Kit(), mag = new Kit(), charge = new Kit();
  // upper receiver
  k.add('metal', prof([[0, -0.012], [0, 0.026], [0.006, 0.0305], [0.196, 0.0305], [0.208, 0.02], [0.208, -0.012]], 0.042, { bevel: 0.0035 }));
  // lower receiver with magazine well
  k.add('metal', prof([[0, -0.01], [0.208, -0.01], [0.208, -0.04], [0.198, -0.084], [0.136, -0.09], [0.129, -0.048], [0.064, -0.048], [0.03, -0.037], [0, -0.037]], 0.037, { bevel: 0.003 }));
  k.add('metal', prof([[0.131, -0.07], [0.2, -0.066], [0.198, -0.085], [0.135, -0.091]], 0.041, { bevel: 0.0025 }));   // magwell flare
  k.add('black', box(0.022, 0.002, 0.058, 0, -0.0905, 0.167));
  // ejection port, dust cover, forward assist, brass deflector (right side)
  k.add('steel', box(0.002, 0.016, 0.058, 0.0202, 0.008, 0.125));
  k.add('black', box(0.0022, 0.011, 0.03, 0.0203, 0.008, 0.115));
  k.add('metal', box(0.004, 0.006, 0.062, 0.0215, -0.004, 0.125, 0.0015));
  k.add('metal', prof([[0.062, 0.0], [0.09, 0.0], [0.082, 0.02], [0.07, 0.02]], 0.01, { bevel: 0.002, x: 0.022 }));
  k.add('metal', rotAbout(cyl(0.0065, 0.02, 0.052, { x: 0.026, y: 0.01, seg: 14 }), 'y', -0.3, 0.026, 0.01, 0.036));
  k.add('barrel', rotAbout(cyl(0.0078, 0.012, 0.02, { x: 0.026, y: 0.01, seg: 14 }), 'y', -0.3, 0.026, 0.01, 0.036));
  // pins, selector, bolt catch, mag release
  pin(k, 0.196, -0.028, 0.0034, 0.0185); pin(k, 0.03, -0.022, 0.0034, 0.0185);
  pin(k, 0.085, -0.03, 0.0022, 0.0185); pin(k, 0.107, -0.033, 0.0022, 0.0185);
  k.add('barrel', cylX(0.0058, 0.004, -0.02, -0.02, 0.058, 16));
  k.add('barrel', box(0.003, 0.004, 0.016, -0.0205, -0.017, 0.07, 0.001));
  k.add('barrel', box(0.004, 0.022, 0.01, -0.0205, -0.012, 0.143, 0.0015));
  k.add('barrel', box(0.004, 0.009, 0.012, 0.0205, -0.034, 0.118, 0.002));
  // trigger + guard
  k.add('metal', prof([[0.066, -0.05], [0.128, -0.05], [0.128, -0.086], [0.07, -0.082]], 0.012, { bevel: 0.0015, holes: [[[0.07, -0.052], [0.125, -0.052], [0.125, -0.0825], [0.073, -0.079]]] }));
  k.add('barrel', prof([[0.094, -0.048], [0.101, -0.048], [0.099, -0.062], [0.103, -0.073], [0.098, -0.074], [0.093, -0.062]], 0.006, { bevel: 0.0012 }));
  // pistol grip
  k.add('grip', prof([[0.026, -0.03], [0.07, -0.042], [0.064, -0.075], [0.05, -0.142], [0.006, -0.134], [0.02, -0.08], [0.027, -0.045]], 0.031, { bevel: 0.0075, seg: 3 }));
  // charging handle (moves on reload)
  charge.add('metal', box(0.014, 0.008, 0.03, 0, 0.0225, 0.004, 0.002));
  charge.add('metal', box(0.052, 0.009, 0.011, 0, 0.0225, -0.006, 0.003));
  // receiver extension, castle nut, end plate
  k.add('metal', cyl(0.0148, -0.2, 0.0, { y: 0.003, seg: 22 }));
  k.add('barrel', lathe([[0.0148, -0.02], [0.0195, -0.02], [0.0195, -0.007], [0.0148, -0.007]], { y: 0.003, seg: 12 }));
  k.add('metal', box(0.034, 0.05, 0.004, 0, -0.008, -0.004, 0.0015));
  // collapsible stock
  k.add('polymer', prof([[-0.068, 0.025], [-0.236, 0.025], [-0.246, 0.012], [-0.25, -0.1], [-0.214, -0.106], [-0.15, -0.036], [-0.105, -0.026], [-0.068, -0.02]], 0.04, { bevel: 0.006, seg: 3, holes: [[[-0.2, -0.03], [-0.236, -0.03], [-0.239, -0.086], [-0.218, -0.09], [-0.19, -0.058]]] }));
  k.add('rubber', prof([[-0.246, 0.02], [-0.254, 0.016], [-0.258, -0.098], [-0.25, -0.104]], 0.038, { bevel: 0.004 }));
  k.add('barrel', box(0.02, 0.01, 0.045, 0, -0.03, -0.1, 0.003));     // adjustment latch
  // barrel nut, handguard (octagonal free-float), slots
  const hgA = 0.208, hgB = 0.515, hgY = 0.0035, hgR = 0.0268;
  k.add('barrel', cyl(0.021, hgA, hgA + 0.012, { y: hgY, seg: 20 }));
  const hg = new THREE.CylinderGeometry(hgR, hgR, hgB - hgA - 0.008, 8, 1, false);
  hg.rotateY(Math.PI / 8); hg.rotateX(-HALF); hg.translate(0, hgY, -(hgA + hgB + 0.008) / 2);
  k.add('metal', hg);
  k.add('metal', tube(0.0262, 0.022, hgB - 0.002, hgB + 0.002, { y: hgY, seg: 8 }));
  k.add('black', cyl(0.0225, hgB - 0.001, hgB + 0.0005, { y: hgY, seg: 16 }));
  const flat = hgR * Math.cos(Math.PI / 8);
  for (let i = 0; i < 6; i++) {
    const f = hgA + 0.04 + i * 0.047;
    for (const ang of [0, Math.PI / 4, -Math.PI / 4, Math.PI, Math.PI * 0.75, -Math.PI * 0.75, -HALF]) {
      const s = box(0.0012, 0.0075, 0.032, flat + 0.0001, 0, f);
      s.rotateZ(ang); s.translate(0, hgY, 0);
      k.add('black', s);
    }
  }
  // continuous top rail (receiver + handguard)
  const railTop = rail(k, 'metal', 0.008, 0.194, 0.0303);
  rail(k, 'metal', hgA + 0.006, hgB - 0.004, 0.0303);
  // barrel, gas block, muzzle device
  k.add('barrel', cyl(0.0086, 0.2, 0.612, { y: 0, seg: 18 }));
  k.add('barrel', cyl(0.0115, 0.44, 0.47, { y: 0, seg: 16 }));
  k.add('barrel', lathe([[0.0086, 0.6], [0.0112, 0.606], [0.0112, 0.652], [0.0098, 0.658], [0.0045, 0.658], [0.0045, 0.62]], { seg: 16 }));
  for (let i = 0; i < 6; i++) { const s = box(0.0026, 0.0028, 0.026, 0.0106, 0, 0.634, 0.001); s.rotateZ((i / 6) * Math.PI * 2 + 0.3); k.add('black', s); }
  // folded back-up sights
  k.add('metal', box(0.02, 0.008, 0.034, 0, railTop + 0.004, 0.018, 0.002));
  k.add('metal', box(0.02, 0.008, 0.03, 0, railTop + 0.004, 0.492, 0.002));
  // optic
  const sightY = redDot(k, 0.082, railTop - 0.0005);
  // magazine (separate, animated)
  mag.add('metal', prof([[0.139, -0.052], [0.194, -0.05], [0.201, -0.14], [0.228, -0.242], [0.174, -0.256], [0.151, -0.15]], 0.0225, { bevel: 0.003 }));
  mag.add('polymer', prof([[0.172, -0.25], [0.229, -0.236], [0.232, -0.247], [0.174, -0.262]], 0.027, { bevel: 0.003 }));
  for (let i = 0; i < 4; i++) mag.add('metal', prof([[0.158 + i * 0.012, -0.1], [0.163 + i * 0.012, -0.1], [0.19 + i * 0.012, -0.238 + i * 0.003], [0.185 + i * 0.012, -0.24 + i * 0.003]], 0.0245, { bevel: 0.001 }));
  const root = new THREE.Group();
  return finish(root, [['body', k], ['mag', mag], ['charge', charge]], {
    muzzle: V(0, 0, 0.665), eject: V(0.024, 0.008, 0.125), sight: V(0, sightY, 0.08), dot: V(0, sightY, 0.118),
    gripR: V(0, -0.085, 0.036), gripL: V(0, -0.028, 0.37), butt: V(0, -0.03, -0.255),
  });
}

// ---- MP5-style submachine gun --------------------------------------------------------------------------------------
function buildSMG() {
  const k = new Kit(), mag = new Kit(), charge = new Kit();
  // stamped receiver: tube top, boxy lower
  k.add('metal', cyl(0.0205, 0, 0.275, { y: 0.012, seg: 22 }));
  k.add('metal', prof([[0, 0.012], [0.275, 0.012], [0.275, -0.022], [0.262, -0.034], [0.03, -0.034], [0, -0.02]], 0.038, { bevel: 0.004 }));
  k.add('metal', lathe([[0.0, 0.0], [0.018, 0.0], [0.0215, -0.004], [0.0215, -0.012], [0, -0.012]], { y: 0.012, seg: 20 })); // end cap
  // ribs pressed into the receiver sides
  for (const sx of [-1, 1]) { k.add('metal', box(0.003, 0.006, 0.15, sx * 0.0195, 0.006, 0.14, 0.0015)); }
  // ejection port (right)
  k.add('black', box(0.003, 0.014, 0.04, 0.0196, 0.016, 0.2));
  k.add('steel', box(0.0025, 0.012, 0.018, 0.0192, 0.016, 0.19));
  // trigger housing (polymer) + grip
  k.add('polymer', prof([[0.035, -0.03], [0.185, -0.03], [0.185, -0.05], [0.168, -0.058], [0.07, -0.058], [0.05, -0.05]], 0.034, { bevel: 0.004 }));
  k.add('grip', prof([[0.036, -0.04], [0.082, -0.05], [0.07, -0.1], [0.054, -0.152], [0.01, -0.144], [0.026, -0.09], [0.034, -0.055]], 0.032, { bevel: 0.008, seg: 3 }));
  k.add('polymer', prof([[0.08, -0.056], [0.14, -0.056], [0.14, -0.092], [0.086, -0.088]], 0.012, { bevel: 0.0015, holes: [[[0.084, -0.058], [0.137, -0.058], [0.137, -0.0885], [0.089, -0.085]]] }));
  k.add('barrel', prof([[0.108, -0.056], [0.114, -0.056], [0.112, -0.068], [0.116, -0.08], [0.111, -0.081], [0.106, -0.068]], 0.006, { bevel: 0.0012 }));
  k.add('barrel', cylX(0.0045, 0.042, 0, -0.038, 0.066, 14));    // selector axle
  k.add('barrel', box(0.003, 0.005, 0.02, -0.02, -0.035, 0.074, 0.001));
  pin(k, 0.18, -0.026, 0.003, 0.019); pin(k, 0.012, -0.012, 0.003, 0.019);
  // magazine well
  k.add('metal', prof([[0.19, -0.03], [0.236, -0.03], [0.24, -0.075], [0.194, -0.078]], 0.03, { bevel: 0.003 }));
  k.add('barrel', box(0.012, 0.014, 0.004, 0, -0.07, 0.186, 0.0015));   // paddle release
  // handguard (wide polymer)
  k.add('polymer', prof([[0.275, 0.036], [0.43, 0.034], [0.436, 0.02], [0.436, -0.028], [0.42, -0.04], [0.29, -0.04], [0.275, -0.03]], 0.05, { bevel: 0.011, seg: 3 }));
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) k.add('black', box(0.002, 0.005, 0.02, sx * 0.0245, 0.0, 0.3 + i * 0.027, 0.001));
  // cocking tube + handle (left side)
  k.add('metal', cyl(0.0115, 0.27, 0.452, { y: 0.036, seg: 18 }));
  k.add('barrel', cyl(0.0125, 0.448, 0.458, { y: 0.036, seg: 18 }));
  charge.add('barrel', cylX(0.0055, 0.026, -0.024, 0.036, 0.405, 14));
  charge.add('polymer', cylX(0.0075, 0.012, -0.038, 0.036, 0.405, 14));
  k.add('black', box(0.003, 0.006, 0.09, -0.0105, 0.036, 0.37));
  // barrel with tri-lug, front sight tower with hood
  k.add('barrel', cyl(0.0082, 0.43, 0.5, { y: 0.008, seg: 16 }));
  k.add('barrel', cyl(0.0098, 0.478, 0.486, { y: 0.008, seg: 6 }));
  k.add('black', cyl(0.0046, 0.4995, 0.5005, { y: 0.008, seg: 12 }));
  k.add('metal', prof([[0.44, 0.012], [0.462, 0.012], [0.46, 0.05], [0.442, 0.05]], 0.012, { bevel: 0.002 }));
  k.add('metal', tube(0.0125, 0.0105, 0.443, 0.459, { y: 0.058, seg: 20 }));
  k.add('metal', box(0.002, 0.012, 0.003, 0, 0.053, 0.451));
  // rear drum sight + top rail with optic
  k.add('metal', cylY(0.011, 0.012, 0, 0.038, 0.03, 18));
  k.add('metal', box(0.024, 0.008, 0.03, 0, 0.034, 0.03, 0.002));
  const railTop = rail(k, 'metal', 0.06, 0.2, 0.0318, 0.021);
  k.add('metal', box(0.018, 0.006, 0.14, 0, 0.031, 0.13, 0.001));
  const sightY = redDot(k, 0.098, railTop - 0.0005);
  // fixed polymer stock
  k.add('polymer', prof([[-0.004, 0.034], [-0.03, 0.036], [-0.225, 0.03], [-0.238, 0.02], [-0.244, -0.098], [-0.21, -0.104], [-0.13, -0.03], [-0.03, -0.024], [-0.004, -0.02]], 0.038, { bevel: 0.008, seg: 3 }));
  k.add('rubber', prof([[-0.238, 0.026], [-0.248, 0.02], [-0.253, -0.098], [-0.244, -0.104]], 0.036, { bevel: 0.004 }));
  // curved magazine
  mag.add('metal', prof([[0.196, -0.035], [0.232, -0.035], [0.24, -0.13], [0.268, -0.255], [0.228, -0.266], [0.203, -0.14]], 0.0235, { bevel: 0.003 }));
  mag.add('metal', prof([[0.226, -0.258], [0.269, -0.247], [0.272, -0.256], [0.228, -0.27]], 0.027, { bevel: 0.002 }));
  for (let i = 0; i < 2; i++) mag.add('metal', prof([[0.208 + i * 0.012, -0.09], [0.213 + i * 0.012, -0.09], [0.24 + i * 0.012, -0.25 + i * 0.003], [0.235 + i * 0.012, -0.252 + i * 0.003]], 0.0255, { bevel: 0.001 }));
  return finish(new THREE.Group(), [['body', k], ['mag', mag], ['charge', charge]], {
    muzzle: V(0, 0.008, 0.505), eject: V(0.024, 0.016, 0.2), sight: V(0, sightY, 0.096), dot: V(0, sightY, 0.134),
    gripR: V(0, -0.095, 0.042), gripL: V(0, -0.04, 0.355), butt: V(0, -0.03, -0.25),
  });
}

// ---- bolt-action precision rifle ------------------------------------------------------------------------------------
function buildSniper() {
  const k = new Kit(), mag = new Kit(), bolt = new Kit();
  // one-piece stock / chassis in olive polymer
  k.add('od', prof([
    [-0.345, 0.012], [-0.35, -0.118], [-0.31, -0.124], [-0.2, -0.062], [-0.125, -0.06], [-0.1, -0.145], [-0.056, -0.15],
    [-0.03, -0.075], [0.0, -0.05], [0.055, -0.05], [0.16, -0.056], [0.2, -0.05], [0.56, -0.04], [0.585, -0.03], [0.585, -0.008], [0.19, -0.008],
    [0.19, -0.02], [-0.04, -0.02], [-0.085, -0.004], [-0.14, 0.012],
  ], 0.052, { bevel: 0.01, seg: 3 }));
  k.add('od', box(0.04, 0.03, 0.15, 0, 0.022, -0.235, 0.01));                 // adjustable cheek piece
  k.add('barrel', cylY(0.004, 0.03, -0.012, 0.004, -0.2)); k.add('barrel', cylY(0.004, 0.03, -0.012, 0.004, -0.27));
  k.add('rubber', prof([[-0.345, 0.014], [-0.36, 0.008], [-0.366, -0.116], [-0.35, -0.122]], 0.048, { bevel: 0.006 }));
  k.add('grip', prof([[-0.118, -0.07], [-0.036, -0.078], [-0.058, -0.146], [-0.098, -0.141]], 0.054, { bevel: 0.009, seg: 3 }));
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) k.add('black', box(0.002, 0.008, 0.03, sx * 0.0262, -0.024, 0.27 + i * 0.055, 0.001)); // forend vents
  k.add('barrel', cylX(0.005, 0.06, 0, -0.03, 0.54, 12));                     // sling / bipod stud
  // action
  k.add('metal', cyl(0.0172, -0.03, 0.225, { y: 0, seg: 24 }));
  k.add('black', box(0.004, 0.014, 0.075, 0.0158, 0.004, 0.1));               // ejection port
  k.add('steel', box(0.003, 0.012, 0.03, 0.0156, 0.004, 0.08));
  k.add('metal', lathe([[0.0172, 0.225], [0.0195, 0.228], [0.0195, 0.25], [0.0155, 0.256]], { seg: 20 })); // barrel shank / recoil lug
  k.add('metal', box(0.006, 0.01, 0.014, -0.0185, 0.0, 0.008, 0.002));        // bolt release
  // trigger guard, trigger, detachable box magazine
  k.add('metal', prof([[0.0, -0.05], [0.064, -0.05], [0.064, -0.086], [0.006, -0.083]], 0.014, { bevel: 0.0015, holes: [[[0.004, -0.052], [0.061, -0.052], [0.061, -0.0825], [0.009, -0.08]]] }));
  k.add('steel', prof([[0.03, -0.05], [0.036, -0.05], [0.034, -0.062], [0.038, -0.074], [0.033, -0.075], [0.028, -0.062]], 0.006, { bevel: 0.0012 }));
  mag.add('metal', prof([[0.072, -0.03], [0.158, -0.03], [0.156, -0.098], [0.076, -0.094]], 0.03, { bevel: 0.004 }));
  mag.add('polymer', prof([[0.073, -0.092], [0.158, -0.096], [0.158, -0.105], [0.073, -0.101]], 0.034, { bevel: 0.003 }));
  // heavy fluted barrel + muzzle brake
  k.add('barrel', lathe([[0.0155, 0.25], [0.0145, 0.32], [0.0115, 0.83], [0.0, 0.83]], { seg: 22 }));
  for (let i = 0; i < 6; i++) { const s = box(0.003, 0.004, 0.34, 0.0124, 0, 0.56, 0.0015); s.rotateZ((i / 6) * Math.PI * 2); k.add('black', s); }
  k.add('barrel', box(0.03, 0.024, 0.062, 0, 0, 0.858, 0.004));
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) k.add('black', box(0.002, 0.016, 0.009, sx * 0.0145, 0, 0.84 + i * 0.018, 0.0008));
  k.add('black', cyl(0.0045, 0.8885, 0.8895, { seg: 12 }));
  // scope base + rings
  const railTop = rail(k, 'metal', -0.02, 0.215, 0.0165, 0.0212);
  const sY = railTop + 0.0295;
  for (const f of [0.03, 0.175]) {
    k.add('metal', box(0.03, 0.012, 0.022, 0, railTop + 0.004, f, 0.002));
    k.add('metal', tube(0.0205, 0.0152, f - 0.011, f + 0.011, { y: sY, seg: 24 }));
    k.add('metal', box(0.012, 0.014, 0.022, 0, railTop + 0.011, f, 0.002));
    for (const sx of [-1, 1]) k.add('barrel', cylY(0.0026, 0.012, sx * 0.019, sY, f - 0.004, 8));
  }
  // scope body (one lathe), turrets, lenses
  k.add('metal', lathe([
    [0.017, -0.13], [0.0222, -0.127], [0.0222, -0.07], [0.0205, -0.062], [0.0205, -0.05], [0.0153, -0.03], [0.0153, 0.235], [0.0265, 0.3], [0.029, 0.31], [0.029, 0.4], [0.0262, 0.4],
    [0.0262, 0.388], [0.012, 0.3], [0.012, -0.05], [0.017, -0.12], [0.017, -0.13],
  ], { y: sY, seg: 28 }));
  k.add('barrel', tube(0.0228, 0.0205, -0.092, -0.078, { y: sY, seg: 28 }));            // zoom ring
  k.add('metal', box(0.034, 0.03, 0.034, 0, sY, 0.105, 0.008));                          // turret saddle
  k.add('metal', cylY(0.0125, 0.02, 0, sY + 0.026, 0.105, 20)); k.add('barrel', cylY(0.0135, 0.008, 0, sY + 0.036, 0.105, 20));
  k.add('metal', cylX(0.0125, 0.02, 0.026, sY, 0.105, 20)); k.add('barrel', cylX(0.0135, 0.008, 0.036, sY, 0.105, 20));
  k.add('metal', cylX(0.0125, 0.016, -0.024, sY, 0.105, 20)); k.add('barrel', cylX(0.0135, 0.006, -0.033, sY, 0.105, 20));
  k.add('lens', cyl(0.0258, 0.3895, 0.39, { y: sY, seg: 28 }));
  k.add('lensDark', cyl(0.0168, -0.1225, -0.122, { y: sY, seg: 28 }));
  // bolt: body, shroud, handle with ball knob (pivot on the bore axis)
  bolt.add('steel', cyl(0.0095, -0.045, 0.02, { y: 0, seg: 16 }));
  bolt.add('metal', lathe([[0, -0.07], [0.011, -0.066], [0.0135, -0.05], [0.0135, -0.03], [0.0095, -0.03]], { seg: 16 }));
  const handle = new THREE.CylinderGeometry(0.0042, 0.0052, 0.055, 12); handle.translate(0, -0.0275, 0); handle.rotateZ(1.0); handle.translate(0.012, 0, 0.036);
  bolt.add('steel', handle);
  bolt.add('polymer', sphere(0.0115, 0.012 + Math.sin(1.0) * 0.062, -Math.cos(1.0) * 0.062, -0.036));
  return finish(new THREE.Group(), [['body', k], ['mag', mag], ['bolt', bolt, [0, 0, 0]]], {
    muzzle: V(0, 0, 0.895), eject: V(0.022, 0.006, 0.1), sight: V(0, sY, -0.13), dot: null,
    gripR: V(0, -0.105, -0.078), gripL: V(0, -0.045, 0.3), butt: V(0, -0.05, -0.365), scope: true,
  });
}

// ---- pump-action shotgun --------------------------------------------------------------------------------------------
function buildShotgun() {
  const k = new Kit(), pump = new Kit();
  // receiver
  k.add('metal', prof([[0, -0.03], [0, 0.016], [0.012, 0.024], [0.205, 0.024], [0.222, 0.012], [0.222, -0.036], [0.03, -0.04]], 0.04, { bevel: 0.005, seg: 3 }));
  k.add('black', box(0.003, 0.016, 0.07, 0.0192, 0.004, 0.13));               // ejection port
  k.add('steel', box(0.0025, 0.014, 0.05, 0.0188, 0.004, 0.12));
  k.add('black', box(0.022, 0.002, 0.08, 0, -0.0385, 0.165));                 // loading port
  pin(k, 0.07, -0.016, 0.003, 0.02); pin(k, 0.12, -0.022, 0.003, 0.02);
  k.add('barrel', cylX(0.004, 0.044, 0, -0.03, 0.045, 12));                   // cross-bolt safety
  // trigger group
  k.add('metal', prof([[0.035, -0.038], [0.11, -0.038], [0.108, -0.078], [0.045, -0.074]], 0.014, { bevel: 0.0015, holes: [[[0.04, -0.04], [0.105, -0.04], [0.104, -0.0745], [0.049, -0.071]]] }));
  k.add('steel', prof([[0.07, -0.038], [0.076, -0.038], [0.074, -0.05], [0.078, -0.062], [0.073, -0.063], [0.068, -0.05]], 0.006, { bevel: 0.0012 }));
  // walnut stock with pistol-grip wrist, rubber recoil pad
  k.add('wood', prof([[0.002, 0.018], [-0.07, 0.01], [-0.11, 0.004], [-0.335, -0.018], [-0.34, -0.14], [-0.3, -0.142], [-0.15, -0.078], [-0.1, -0.09], [-0.06, -0.082], [-0.02, -0.05], [0.002, -0.03]], 0.044, { bevel: 0.013, seg: 4 }));
  k.add('rubber', prof([[-0.335, -0.014], [-0.356, -0.018], [-0.36, -0.14], [-0.34, -0.144]], 0.042, { bevel: 0.006 }));
  k.add('black', prof([[-0.333, -0.016], [-0.337, -0.016], [-0.342, -0.142], [-0.338, -0.142]], 0.045, { bevel: 0.002 }));
  // barrel, magazine tube, clamp, bead
  const bY = 0.008, mY = -0.0205;
  k.add('barrel', lathe([[0.0125, 0.215], [0.0125, 0.26], [0.0108, 0.3], [0.0108, 0.74], [0.0092, 0.74], [0.0092, 0.7]], { y: bY, seg: 20 }));
  k.add('barrel', cyl(0.0122, 0.215, 0.69, { y: mY, seg: 18 }));
  k.add('metal', lathe([[0.0122, 0.69], [0.0135, 0.692], [0.0135, 0.712], [0.011, 0.72], [0, 0.72]], { y: mY, seg: 18 }));
  k.add('metal', prof([[0.655, bY + 0.013], [0.672, bY + 0.013], [0.672, mY - 0.015], [0.655, mY - 0.015]], 0.03, { bevel: 0.004 }));
  const ribY = 0.0245, beadY = 0.0286;
  k.add('metal', box(0.0075, 0.003, 0.5, 0, ribY, 0.475, 0.001));              // ventilated rib
  for (let i = 0; i < 8; i++) k.add('metal', box(0.004, 0.006, 0.012, 0, ribY - 0.004, 0.24 + i * 0.068));
  k.add('brass', sphere(0.0024, 0, beadY, 0.718));
  // pump forend (separate, animated) + action bars
  pump.add('wood', lathe([[0.019, 0.37], [0.0225, 0.38], [0.0235, 0.45], [0.0225, 0.54], [0.019, 0.55], [0.0125, 0.55], [0.0125, 0.37]], { y: mY - 0.002, seg: 20 }));
  for (let i = 0; i < 9; i++) pump.add('black', tube(0.0237, 0.022, 0.392 + i * 0.016, 0.3945 + i * 0.016, { y: mY - 0.002, seg: 20 }));
  for (const sx of [-1, 1]) pump.add('barrel', box(0.002, 0.008, 0.2, sx * 0.0135, mY + 0.004, 0.29));
  return finish(new THREE.Group(), [['body', k], ['pump', pump]], {
    muzzle: V(0, bY, 0.745), eject: V(0.024, 0.006, 0.13), sight: V(0, beadY, 0.718), dot: null,
    gripR: V(0, -0.062, -0.062), gripL: V(0, mY - 0.006, 0.46), butt: V(0, -0.07, -0.36),
  });
}

// ---- M9-style pistol ------------------------------------------------------------------------------------------------
function buildPistol() {
  const k = new Kit(), slide = new Kit(), mag = new Kit();
  // slide (animated)
  slide.add('metal', prof([[0, 0.002], [0, 0.021], [0.004, 0.026], [0.2, 0.026], [0.208, 0.02], [0.208, 0.002]], 0.027, { bevel: 0.0035, seg: 3 }));
  slide.add('black', box(0.02, 0.003, 0.05, 0.004, 0.0255, 0.1));                         // ejection port / open top
  slide.add('steel', box(0.016, 0.003, 0.034, 0.003, 0.0252, 0.1));
  for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) slide.add('black', rotAbout(box(0.0012, 0.017, 0.0022, sx * 0.0134, 0.013, 0.012 + i * 0.0052), 'x', 0.25, 0, 0.013, 0.012 + i * 0.0052));
  slide.add('barrel', box(0.014, 0.0045, 0.008, 0, 0.0282, 0.012, 0.001));               // rear sight
  slide.add('black', box(0.004, 0.0042, 0.0085, 0, 0.0292, 0.012));
  slide.add('barrel', box(0.003, 0.0048, 0.006, 0, 0.0284, 0.197, 0.0008));              // front sight
  slide.add('white', box(0.0016, 0.0016, 0.0004, 0, 0.0292, 0.1938));
  slide.add('barrel', box(0.004, 0.006, 0.016, -0.0142, 0.014, 0.03, 0.0015));           // safety lever
  // barrel
  k.add('barrel', lathe([[0.0, 0.06], [0.0068, 0.06], [0.0068, 0.214], [0.0046, 0.214], [0.0046, 0.19]], { y: 0.014, seg: 16 }));
  // frame, dust cover, trigger guard
  k.add('metal', prof([[-0.004, 0.003], [0.2, 0.003], [0.2, -0.012], [0.135, -0.02], [0.062, -0.02], [0.05, -0.012], [-0.012, -0.012], [-0.016, -0.004]], 0.0255, { bevel: 0.003 }));
  k.add('metal', prof([[0.06, -0.018], [0.135, -0.018], [0.138, -0.03], [0.134, -0.058], [0.07, -0.062]], 0.011, { bevel: 0.0015, holes: [[[0.068, -0.02], [0.131, -0.02], [0.13, -0.054], [0.074, -0.058]]] }));
  k.add('steel', prof([[0.092, -0.018], [0.098, -0.018], [0.096, -0.03], [0.1, -0.042], [0.095, -0.043], [0.09, -0.03]], 0.006, { bevel: 0.0012 }));
  // grip frame + checkered panels
  k.add('metal', prof([[-0.014, -0.006], [0.066, -0.016], [0.058, -0.06], [0.044, -0.128], [-0.022, -0.118], [-0.004, -0.045]], 0.026, { bevel: 0.006, seg: 3 }));
  k.add('grip', prof([[-0.004, -0.024], [0.052, -0.03], [0.036, -0.118], [-0.014, -0.11], [0.0, -0.05]], 0.0325, { bevel: 0.004, seg: 3 }));
  for (const sx of [-1, 1]) { k.add('barrel', cylX(0.0028, 0.001, sx * 0.0164, -0.04, 0.03, 10)); k.add('barrel', cylX(0.0028, 0.001, sx * 0.0164, -0.1, 0.012, 10)); }
  // hammer, slide stop, takedown lever, mag release
  k.add('barrel', prof([[-0.012, 0.0], [-0.004, 0.004], [-0.007, 0.016], [-0.016, 0.013]], 0.007, { bevel: 0.0015 }));
  k.add('barrel', box(0.003, 0.004, 0.03, -0.0138, -0.002, 0.075, 0.001));
  k.add('barrel', box(0.003, 0.006, 0.01, -0.0138, -0.005, 0.12, 0.001));
  k.add('barrel', cylX(0.0038, 0.03, 0, -0.024, 0.06, 12));
  // magazine with base plate
  mag.add('steel', prof([[0.002, -0.03], [0.044, -0.034], [0.03, -0.124], [-0.012, -0.118]], 0.018, { bevel: 0.002 }));
  mag.add('polymer', prof([[-0.022, -0.118], [0.047, -0.129], [0.045, -0.137], [-0.024, -0.126]], 0.028, { bevel: 0.003 }));
  return finish(new THREE.Group(), [['body', k], ['slide', slide], ['mag', mag]], {
    muzzle: V(0, 0.014, 0.218), eject: V(0.012, 0.03, 0.1), sight: V(0, 0.0313, 0.012), dot: null,
    gripR: V(0, -0.07, 0.018), gripL: V(0, -0.075, 0.03), butt: V(0, -0.02, -0.02),
  });
}

const BUILDERS = { ar: buildAR, smg: buildSMG, sniper: buildSniper, shotgun: buildShotgun, pistol: buildPistol };
const templates = new Map();

// Returns { root, parts, anchors }. Geometry and materials are shared between instances (never dispose them).
export function buildGun(id) {
  if (!BUILDERS[id]) id = 'ar';
  if (!templates.has(id)) templates.set(id, BUILDERS[id]());
  const tpl = templates.get(id);
  const root = tpl.clone(true);
  const parts = {};
  for (const c of root.children) if (c.name.startsWith('part_')) parts[c.name.slice(5)] = c;
  return { root, parts, anchors: tpl.userData.anchors };
}

export function gunTriangleCount(id) {
  let n = 0;
  buildGun(id).root.traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count / 3; });
  return n;
}
