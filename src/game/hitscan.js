// Hitscan against static world geometry (BVH raycast) and simple player hitboxes (head sphere + body capsule).
import * as THREE from 'three';

export const HITBOX = {
  stand: { head: 1.62, bodyTop: 1.25, hip: 0.9 },
  crouch: { head: 1.04, bodyTop: 0.72, hip: 0.55 },
  headR: 0.17,
  bodyR: 0.29,
  bodyBottom: 0.33,
};

const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function createHitscan(world) {
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;

  /** Nearest world hit along ray, or null. */
  function castWorld(origin, dir, maxDist) {
    raycaster.set(origin, dir);
    raycaster.near = 0;
    raycaster.far = maxDist;
    const hits = raycaster.intersectObjects(world.collisionMeshes, false);
    const h = hits[0];
    if (!h) return null;
    const normal = new THREE.Vector3(0, 1, 0);
    if (h.face) normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
    if (normal.dot(dir) > 0) normal.negate();
    return { distance: h.distance, point: h.point.clone(), normal, surface: h.object.userData.surface || 'concrete' };
  }

  /**
   * Nearest player hit. targets: [{ id, feet: Vector3, crouch: 0..1 }].
   * Returns { id, distance, point, headshot } or null.
   */
  function castTargets(origin, dir, maxDist, targets) {
    let best = null;
    for (const t of targets) {
      const r = hitTarget(origin, dir, maxDist, t);
      if (r && (!best || r.distance < best.distance)) best = r;
    }
    return best;
  }

  return { castWorld, castTargets, raycaster };
}

export function hitboxHeights(crouch) {
  const c = THREE.MathUtils.clamp(crouch, 0, 1);
  return {
    head: THREE.MathUtils.lerp(HITBOX.stand.head, HITBOX.crouch.head, c),
    bodyTop: THREE.MathUtils.lerp(HITBOX.stand.bodyTop, HITBOX.crouch.bodyTop, c),
    hip: THREE.MathUtils.lerp(HITBOX.stand.hip, HITBOX.crouch.hip, c),
  };
}

function hitTarget(origin, dir, maxDist, t) {
  const hh = hitboxHeights(t.crouch || 0);
  // Head sphere.
  _p.set(t.feet.x, t.feet.y + hh.head, t.feet.z);
  const headD = raySphere(origin, dir, _p, HITBOX.headR);
  // Body capsule.
  _a.set(t.feet.x, t.feet.y + HITBOX.bodyBottom, t.feet.z);
  _b.set(t.feet.x, t.feet.y + hh.bodyTop, t.feet.z);
  const bodyD = rayCapsule(origin, dir, maxDist, _a, _b, HITBOX.bodyR);
  let d = null, headshot = false;
  if (headD !== null && (bodyD === null || headD < bodyD + 0.35)) { d = headD; headshot = true; }
  else if (bodyD !== null) d = bodyD;
  if (d === null || d > maxDist) return null;
  const point = origin.clone().addScaledVector(dir, d);
  // Zone: head / torso (above the hip) / legs.
  const zone = headshot ? 'head' : point.y - t.feet.y >= hh.hip ? 'torso' : 'legs';
  return { id: t.id, distance: d, point, headshot, zone };
}

function raySphere(o, d, c, r) {
  _q.subVectors(o, c);
  const b = _q.dot(d);
  const cc = _q.lengthSq() - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

/** Ray vs capsule (segment a-b, radius r). Approximate entry distance. */
function rayCapsule(o, d, maxDist, a, b, r) {
  // Closest points between ray segment [o, o + d*maxDist] and [a, b].
  const ab = _n.subVectors(b, a);
  const w0 = _q.subVectors(o, a);
  const A = 1; // d normalized
  const B = d.dot(ab);
  const C = ab.dot(ab);
  const D = d.dot(w0);
  const E = ab.dot(w0);
  const den = A * C - B * B;
  let s, t;
  if (den < 1e-9) { s = 0; t = THREE.MathUtils.clamp(E / C, 0, 1); }
  else {
    s = THREE.MathUtils.clamp((B * E - C * D) / den, 0, maxDist);
    t = THREE.MathUtils.clamp((B * s + E) / C, 0, 1);
    s = THREE.MathUtils.clamp(B * t - D, 0, maxDist);
  }
  const px = o.x + d.x * s, py = o.y + d.y * s, pz = o.z + d.z * s;
  const qx = a.x + ab.x * t, qy = a.y + ab.y * t, qz = a.z + ab.z * t;
  const dist2 = (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
  if (dist2 > r * r) return null;
  // Entry point: sphere at closest segment point.
  _p.set(qx, qy, qz);
  const entry = raySphere(o, d, _p, r);
  return entry !== null ? entry : s;
}
