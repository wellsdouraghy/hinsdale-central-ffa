// M67-style fragmentation grenade (original procedural model): olive steel body, fuze, safety lever ("spoon"), pull ring.
// Shared by the thrown world object (createGrenade), the first-person off hand and the third-person character.
import * as THREE from 'three';
import * as T from './textures.js';

let res = null;
function resources() {
  if (res) return res;
  const HALF = Math.PI / 2;
  const nrm = T.metalNormal().clone(); nrm.repeat.set(3, 3); nrm.needsUpdate = true;
  const rough = T.wearRoughness().clone(); rough.repeat.set(0.4, 0.4); rough.needsUpdate = true;
  const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  // body: slightly squat sphere with a flattened base and a neck for the fuze (radius 32 mm)
  const body = [];
  body.push([0, -0.031], [0.012, -0.031], [0.016, -0.0295]);
  for (let i = 1; i <= 14; i++) { const a = -1.15 + (i / 14) * 2.45; body.push([Math.cos(a) * 0.032, Math.sin(a) * 0.031]); }
  body.push([0.0125, 0.031], [0.0125, 0.034]);
  const spoon = new THREE.Shape([[0.0, 0.058], [0.02, 0.058], [0.0335, 0.04], [0.0375, 0.012], [0.0355, -0.016], [0.0335, -0.016], [0.0352, 0.012], [0.0318, 0.0385], [0.019, 0.0555], [0.0, 0.0555]].map(([x, y]) => new THREE.Vector2(x, y)));
  const spoonGeo = new THREE.ExtrudeGeometry(spoon, { depth: 0.013, bevelEnabled: false }); spoonGeo.translate(0, 0, -0.0065);
  const ring = new THREE.TorusGeometry(0.0115, 0.0011, 6, 20); ring.rotateY(HALF);
  const pin = new THREE.CylinderGeometry(0.0009, 0.0009, 0.03, 6); pin.rotateZ(HALF);
  res = {
    body: lathe(body, 28),
    fuze: lathe([[0.0105, 0.033], [0.0125, 0.035], [0.0125, 0.046], [0.0095, 0.048], [0.0095, 0.056], [0.0, 0.056]], 16),
    band: lathe([[0.0322, -0.004], [0.0326, 0.0], [0.0322, 0.004]], 28),
    spoon: spoonGeo, ring, pin,
    mBody: new THREE.MeshStandardMaterial({ color: 0x47502f, roughness: 0.62, metalness: 0.25, roughnessMap: rough, normalMap: nrm, normalScale: new THREE.Vector2(0.5, 0.5) }),
    mFuze: new THREE.MeshStandardMaterial({ color: 0x5b5f55, roughness: 0.45, metalness: 0.8 }),
    mSpoon: new THREE.MeshStandardMaterial({ color: 0x4c5237, roughness: 0.5, metalness: 0.6 }),
    mSteel: new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.3, metalness: 1 }),
    mBand: new THREE.MeshStandardMaterial({ color: 0xc9a520, roughness: 0.7, metalness: 0 }),
  };
  return res;
}

// Returns { group, spoon, ring } with origin at the body centre, fuze toward +y. Geometry/materials are shared.
export function buildGrenadeModel() {
  const r = resources(), group = new THREE.Group();
  const mk = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; group.add(o); return o; };
  mk(r.body, r.mBody); mk(r.fuze, r.mFuze); mk(r.band, r.mBand).position.y = 0.012;
  const spoon = mk(r.spoon, r.mSpoon);
  const ring = new THREE.Group();
  const loop = new THREE.Mesh(r.ring, r.mSteel); loop.position.set(-0.012, 0.047, 0.0125);
  const pin = new THREE.Mesh(r.pin, r.mSteel); pin.position.set(0, 0.051, 0);
  ring.add(loop, pin); group.add(ring);
  return { group, spoon, ring };
}

// World-space thrown grenade (origin at its centre). Gameplay positions/rotates object3D every frame.
// The pin is already pulled and the lever released, as on a live grenade in flight.
export function createGrenade({ armed = true } = {}) {
  const root = new THREE.Group(); root.name = 'grenade';
  const m = buildGrenadeModel();
  m.ring.visible = !armed; m.spoon.visible = !armed;
  root.add(m.group);
  return { object3D: root, model: m, update() {}, dispose() { root.removeFromParent(); } };
}
