// Thrown projectiles (frag grenades and smoke markers): deterministic bounce physics against world.collisionMeshes.
// The same code runs on every client (visuals) and on the host (authoritative detonation point and damage).
import * as THREE from 'three';

export const NADE = {
  fuse: 3.0,             // seconds from pin pull
  throwSpeed: 17,
  gravity: 13,
  restitution: 0.35,
  friction: 0.7,         // tangential speed kept per bounce
  radius: 7,             // frag damage radius (m)
  maxDamage: 150,
  markerRest: 1.8,       // smoke markers count as "landed" after this long even if still rolling
  step: 1 / 120,
};

const _ray = new THREE.Raycaster();
_ray.firstHitOnly = true;
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();

export class Projectile {
  /** kind: 'frag' | 'marker'. pos/vel: arrays or Vector3. fuse: seconds until detonation (frag). */
  constructor({ kind = 'frag', pos, vel, fuse = NADE.fuse }) {
    this.kind = kind;
    this.pos = new THREE.Vector3().copy(Array.isArray(pos) ? new THREE.Vector3().fromArray(pos) : pos);
    this.vel = new THREE.Vector3().copy(Array.isArray(vel) ? new THREE.Vector3().fromArray(vel) : vel);
    this.fuse = fuse;
    this.age = 0;
    this.resting = false;
    this.spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    this.rot = new THREE.Euler();
    this.acc = 0;
    this.bounces = 0;
  }

  /** Advances by dt with fixed sub-steps. Returns 'boom' (frag fuse ran out), 'rest' (marker settled) or null. */
  advance(dt, world) {
    this.acc += dt;
    while (this.acc >= NADE.step) {
      this.acc -= NADE.step;
      const r = this._step(NADE.step, world);
      if (r) return r;
    }
    return null;
  }

  _step(h, world) {
    this.age += h;
    if (this.kind === 'frag' && this.age >= this.fuse) return 'boom';
    if (this.kind === 'marker' && (this.resting || this.age >= NADE.markerRest) && !this._reported) {
      this._reported = true;
      return 'rest';
    }
    if (this.resting) return null;
    this.vel.y -= NADE.gravity * h;
    _d.copy(this.vel).multiplyScalar(h);
    const len = _d.length();
    if (len > 1e-6) {
      _ray.set(this.pos, _d.clone().divideScalar(len));
      _ray.near = 0;
      _ray.far = len + 0.04;
      const hit = _ray.intersectObjects(world.collisionMeshes, false)[0];
      if (hit) {
        _n.set(0, 1, 0);
        if (hit.face) _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        if (_n.dot(this.vel) > 0) _n.negate();
        this.pos.copy(hit.point).addScaledVector(_n, 0.04);
        // Reflect: normal component * -restitution, tangential * friction.
        const vn = this.vel.dot(_n);
        const tangent = this.vel.clone().addScaledVector(_n, -vn);
        this.vel.copy(tangent.multiplyScalar(NADE.friction)).addScaledVector(_n, -vn * NADE.restitution);
        this.bounces++;
        this.spin.multiplyScalar(0.6);
        if (this.vel.length() < 0.6 && _n.y > 0.6) { this.resting = true; this.vel.set(0, 0, 0); }
      } else this.pos.add(_d);
    }
    const b = world.playBounds;
    if (b) { this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX - 20, b.maxX + 20); this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ - 20, b.maxZ + 20); }
    if (this.pos.y < -30) { this.resting = true; this.vel.set(0, 0, 0); }
    this.rot.x += this.spin.x * h; this.rot.y += this.spin.y * h; this.rot.z += this.spin.z * h;
    return null;
  }
}

/** Throw velocity from the eye direction plus a little loft and inherited player velocity. */
export function throwVelocity(dir, playerVel, speed = NADE.throwSpeed) {
  return new THREE.Vector3().copy(dir).multiplyScalar(speed)
    .add(new THREE.Vector3(0, 2.5, 0))
    .addScaledVector(new THREE.Vector3(playerVel.x, Math.max(0, playerVel.y), playerVel.z), 0.6);
}

/** Linear falloff blast damage with a line-of-sight check from just above the blast to the target's chest. */
export function blastDamage(world, center, chest, radius = NADE.radius, max = NADE.maxDamage) {
  const d = center.distanceTo(chest);
  if (d >= radius) return 0;
  const from = center.clone().add(new THREE.Vector3(0, 0.3, 0));
  const dir = new THREE.Vector3().subVectors(chest, from);
  const len = dir.length();
  if (len > 0.05) {
    _ray.set(from, dir.divideScalar(len));
    _ray.near = 0;
    _ray.far = len - 0.1;
    const hits = _ray.intersectObjects(world.collisionMeshes, false);
    if (hits.some((h) => !h.object.userData.bulletPassthrough)) return 0;
  }
  return max * (1 - d / radius);
}
