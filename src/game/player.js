// First-person capsule character controller colliding with world.collisionMeshes via three-mesh-bvh shapecast.
import * as THREE from 'three';

export const RADIUS = 0.35;
export const STAND = { height: 1.8, eye: 1.65 };
export const CROUCH = { height: 1.2, eye: 1.05 };

const GRAVITY = 22;
const JUMP_V = 6.4;
const SPEED = { walk: 5, sprint: 7.5, crouch: 2.5, ads: 3, slide: 10 };
const STEP = 0.45;            // max curb / step height climbed automatically
const SPRINT_OUT = 0.18;      // seconds after sprint ends before the gun can fire
const SLIDE_TIME = 0.8;

// Exo-suit movement kit.
export const KIT = {
  doubleJumpV: 6.2,           // vertical speed set by the mid-air thruster jump
  dashSpeed: 12,              // horizontal burst speed
  dashTime: 0.28,             // seconds the dash ignores ground friction
  dashCooldown: 2,
  grappleRange: 60,
  grappleCooldown: 3,
  grappleMaxSpeed: 24,
  grappleAccel: 38,
  grappleUpBias: 3.2,
  grappleMaxTime: 3.2,
  flingBoost: 4.5,            // extra upward speed when releasing the grapple with Space
  mantleReach: 1.3,           // ledge top may be this far above eye level
  mantleTime: 0.35,
  airAccel: 5,
};

const _seg = new THREE.Line3();
const _segLocal = new THREE.Line3();
const _box = new THREE.Box3();
const _tri = new THREE.Vector3();
const _cap = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _push = new THREE.Vector3();
const _v = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m1 = new THREE.Vector3();
const _m2 = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);

export class PlayerController {
  constructor(world) {
    this.world = world;
    this.position = new THREE.Vector3();   // feet
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.sprinting = false;
    this.sliding = false;
    this.grounded = false;
    this.height = STAND.height;
    this.eye = STAND.eye;
    this.slideTime = 0;
    this.airTime = 0;
    this.sprintEndTime = -10;
    this.time = 0;
    this.onFellOut = null;
    this._colliders = [];
    this._colliderCount = -1;
    // Movement kit state.
    this.airJumps = 1;
    this.dashT = 0;
    this.grapple = null;      // { anchor: Vector3, speed, t, lastDist, stuckT }
    this.mantle = null;       // { from, to, t }
    this.events = [];         // 'doubleJump' | 'mantle' | 'land' | 'grappleArrive' | 'grappleBreak'
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;
  }

  /** Nearest hit against collision meshes (ignores bulletPassthrough surfaces). */
  raycast(origin, dir, far) {
    this.ray.set(origin, dir);
    this.ray.near = 0;
    this.ray.far = far;
    const hits = this.ray.intersectObjects(this.world.collisionMeshes, false);
    for (const h of hits) if (!h.object.userData.bulletPassthrough) return h;
    return null;
  }

  // ----- movement kit -----
  dash(dirX, dirZ) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const dx = dirX / len, dz = dirZ / len;
    const along = this.velocity.x * dx + this.velocity.z * dz;
    const add = Math.max(0, KIT.dashSpeed - along);
    this.velocity.x += dx * add;
    this.velocity.z += dz * add;
    if (!this.grounded && this.velocity.y < 1) this.velocity.y = 1;
    this.dashT = KIT.dashTime;
    this.sliding = false;
  }

  startGrapple(anchor) {
    this.grapple = { anchor: anchor.clone(), speed: Math.max(8, this.velocity.length()), t: 0, lastDist: 1e9, stuckT: 0, checkT: 0 };
    this.sliding = false;
    this.mantle = null;
    if (this.grounded) this.velocity.y = Math.max(this.velocity.y, 4);
  }

  /** fling: release with Space (keeps momentum, small upward boost). */
  releaseGrapple(fling = false) {
    if (!this.grapple) return;
    this.grapple = null;
    if (fling) this.velocity.y = Math.max(this.velocity.y, 0) + KIT.flingBoost;
  }

  /** Cache per-mesh world AABB and inverse matrix (static world). */
  _refreshColliders() {
    const meshes = this.world.collisionMeshes;
    if (meshes.length === this._colliderCount) return;
    this._colliderCount = meshes.length;
    this._colliders = meshes.filter((m) => m.geometry?.boundsTree).map((m) => {
      m.updateWorldMatrix(true, false);
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      return {
        mesh: m,
        box: m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld),
        inv: m.matrixWorld.clone().invert(),
        identity: isIdentity(m.matrixWorld),
      };
    });
  }

  teleport(pos, yaw = this.yaw) {
    this.grapple = null;
    this.mantle = null;
    this.dashT = 0;
    this.airJumps = 1;
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.crouching = false;
    this.sliding = false;
    this.sprinting = false;
    this.height = STAND.height;
    this.eye = STAND.eye;
    this.grounded = true;
  }

  getEye(target) {
    return target.set(this.position.x, this.position.y + this.eye, this.position.z);
  }

  /** Seconds since sprint ended is < SPRINT_OUT, or currently sprinting/sliding. */
  gunBlocked() {
    return this.sprinting || this.time - this.sprintEndTime < SPRINT_OUT;
  }

  horizontalSpeed() { return Math.hypot(this.velocity.x, this.velocity.z); }

  /**
   * input: { forward, strafe (-1..1), jump (edge), crouchToggle (edge), sprint (held) }
   * opts: { ads (0..1), moveMult, blockSprint }
   */
  update(dt, input, opts = {}) {
    this._refreshColliders();
    this.time += dt;
    const ads = opts.ads || 0;
    const moveMult = opts.moveMult || 1;

    // Crouch toggle / slide start.
    if (input.crouchToggle) {
      if (this.sprinting && this.grounded && this.horizontalSpeed() > 6) {
        this.sliding = true;
        this.slideTime = SLIDE_TIME;
        this.crouching = true;
        const sp = Math.max(SPEED.slide, this.horizontalSpeed() * 1.2);
        _dir.set(this.velocity.x, 0, this.velocity.z).normalize().multiplyScalar(sp);
        this.velocity.x = _dir.x;
        this.velocity.z = _dir.z;
      } else if (this.crouching) {
        if (this._canStand()) this.crouching = false;
      } else {
        this.crouching = true;
      }
    }

    // Sprint: forward only, not while aiming, cancels crouch.
    const wantSprint = input.sprint && input.forward > 0.3 && !opts.blockSprint && ads < 0.3 && !this.sliding;
    if (wantSprint && this.crouching && this._canStand()) this.crouching = false;
    const sprintNow = wantSprint && !this.crouching;
    if (this.sprinting && !sprintNow) this.sprintEndTime = this.time;
    this.sprinting = sprintNow;

    // Mantle in progress: scripted climb, no other movement.
    if (this.mantle) { this._updateMantle(dt); return; }

    // Jump (crouched jump stands up instead). Mid-air: one thruster double jump (Space while grappling = fling).
    const canJump = this.grounded || this.airTime < 0.1;
    if (input.jump && this.grapple) {
      this.releaseGrapple(true);
    } else if (input.jump && !canJump && this.airJumps > 0) {
      this.airJumps--;
      this.velocity.y = Math.max(this.velocity.y * 0.4, 0) + KIT.doubleJumpV;
      this.events.push('doubleJump');
    } else if (input.jump && canJump) {
      if (this.crouching && !this.sliding) {
        if (this._canStand()) this.crouching = false;
      } else {
        if (this.sliding) { this.sliding = false; if (this._canStand()) this.crouching = false; }
        this.velocity.y = JUMP_V;
        this.grounded = false;
        this.airTime = 1;
      }
    }

    // Target velocity.
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    _wish.set(-sinY * input.forward + cosY * input.strafe, 0, -cosY * input.forward - sinY * input.strafe);
    if (_wish.lengthSq() > 1) _wish.normalize();
    let speed = SPEED.walk;
    if (this.sprinting) speed = SPEED.sprint;
    else if (this.crouching) speed = SPEED.crouch;
    speed = THREE.MathUtils.lerp(speed, Math.min(speed, SPEED.ads), ads);
    speed *= moveMult;

    if (this.grapple) {
      this._updateGrapple(dt);
    } else if (this.sliding) {
      this.slideTime -= dt;
      const friction = this.grounded ? 2.2 : 0.3;
      const k = Math.exp(-friction * dt);
      this.velocity.x *= k;
      this.velocity.z *= k;
      // slight steering
      this.velocity.x += _wish.x * 4 * dt;
      this.velocity.z += _wish.z * 4 * dt;
      if (this.slideTime <= 0 || this.horizontalSpeed() < SPEED.crouch) this.sliding = false;
    } else if (this.dashT > 0) {
      this.dashT -= dt;
      // Dash: keep the burst, allow a little steering.
      this.velocity.x += _wish.x * 6 * dt;
      this.velocity.z += _wish.z * 6 * dt;
    } else if (this.grounded) {
      const k = 1 - Math.exp(-14 * dt);
      this.velocity.x += (_wish.x * speed - this.velocity.x) * k;
      this.velocity.z += (_wish.z * speed - this.velocity.z) * k;
    } else if (_wish.lengthSq() > 0.01) {
      // Air control: steer toward the input without bleeding momentum from flings/dashes.
      const hs = this.horizontalSpeed();
      const target = Math.max(speed, hs * 0.995);
      const k = 1 - Math.exp(-KIT.airAccel * dt);
      this.velocity.x += (_wish.x * target - this.velocity.x) * k;
      this.velocity.z += (_wish.z * target - this.velocity.z) * k;
    }

    // Integrate with substeps.
    const travel = this.velocity.length() * dt;
    const steps = Math.min(6, Math.max(1, Math.ceil(travel / 0.12)));
    const h = dt / steps;
    const wasGrounded = this.grounded;
    let groundedAny = false;
    const grav = this.grapple ? GRAVITY * 0.15 : GRAVITY;
    for (let i = 0; i < steps; i++) {
      this.velocity.y -= grav * h;
      groundedAny = this._step(h, wasGrounded || groundedAny) || groundedAny;
    }
    if (groundedAny && !wasGrounded && this.airTime > 0.25) this.events.push('land');
    this.grounded = groundedAny;
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.grounded) this.airJumps = 1;

    // Mantle onto ledges when airborne and pushing forward (or while being reeled in).
    if (!this.grounded && (input.forward > 0.2 || this.grapple) && !this.crouching) this._tryMantle();

    // Crouch height / eye smoothing.
    const target = this.crouching ? CROUCH : STAND;
    const ks = 1 - Math.exp(-14 * dt);
    this.height += (target.height - this.height) * ks;
    this.eye += (target.eye - this.eye) * ks;

    // Play bounds (invisible walls).
    const b = this.world.playBounds;
    if (b) {
      const px = THREE.MathUtils.clamp(this.position.x, b.minX + RADIUS, b.maxX - RADIUS);
      const pz = THREE.MathUtils.clamp(this.position.z, b.minZ + RADIUS, b.maxZ - RADIUS);
      if (px !== this.position.x) { this.position.x = px; this.velocity.x = 0; }
      if (pz !== this.position.z) { this.position.z = pz; this.velocity.z = 0; }
    }
    if (this.position.y < -20 && this.onFellOut) this.onFellOut();
  }

  _updateGrapple(dt) {
    const g = this.grapple;
    g.t += dt;
    const eye = _m1.set(this.position.x, this.position.y + this.eye, this.position.z);
    const to = _m2.subVectors(g.anchor, eye);
    const dist = to.length();
    if (dist < 1.6 || g.t > KIT.grappleMaxTime) {
      this.grapple = null;
      this.events.push('grappleArrive');
      this._tryMantle(true);
      return;
    }
    // Stuck (no progress) or cable obstructed -> release.
    if (dist > g.lastDist - 0.02) g.stuckT += dt; else g.stuckT = 0;
    g.lastDist = Math.min(g.lastDist, dist);
    g.checkT -= dt;
    if (g.checkT <= 0) {
      g.checkT = 0.1;
      const hit = this.raycast(eye, to.clone().normalize(), dist - 0.6);
      if (hit) { this.grapple = null; this.events.push('grappleBreak'); return; }
    }
    if (g.stuckT > 0.45) { this.grapple = null; this.events.push('grappleBreak'); this._tryMantle(true); return; }
    g.speed = Math.min(KIT.grappleMaxSpeed, g.speed + KIT.grappleAccel * dt);
    to.normalize();
    const k = 1 - Math.exp(-7 * dt);
    this.velocity.x += (to.x * g.speed - this.velocity.x) * k;
    this.velocity.z += (to.z * g.speed - this.velocity.z) * k;
    this.velocity.y += (to.y * g.speed + KIT.grappleUpBias - this.velocity.y) * k;
  }

  /** Looks for a climbable ledge just ahead; starts a short scripted mantle if found. */
  _tryMantle(force = false) {
    const hs = this.horizontalSpeed();
    const fx = hs > 0.5 ? this.velocity.x / hs : -Math.sin(this.yaw);
    const fz = hs > 0.5 ? this.velocity.z / hs : -Math.cos(this.yaw);
    // Must face the motion direction roughly.
    if (fx * -Math.sin(this.yaw) + fz * -Math.cos(this.yaw) < 0.3 && !this.grapple && !force) return;
    const chest = _m1.set(this.position.x, this.position.y + 1.0, this.position.z);
    const fwd = _m2.set(fx, 0, fz);
    const wall = this.raycast(chest, fwd, RADIUS + (force ? 2.2 : 0.45));
    if (!wall) return;
    // Probe down onto the ledge top just past the wall face.
    const topY = this.position.y + this.eye + KIT.mantleReach;
    const probe = new THREE.Vector3(wall.point.x + fx * 0.45, topY + 0.05, wall.point.z + fz * 0.45);
    const down = this.raycast(probe, _down, topY - this.position.y - 0.35);
    if (!down) return;
    if (down.face && down.face.normal.clone().transformDirection(down.object.matrixWorld).y < 0.7) return;
    if (down.point.y < this.position.y + 0.45) return;
    // Find a spot with standing room on top (step past parapets / copings).
    let target = null, crouch = false;
    for (const off of [0.2, 0.55, 0.95, 1.4]) {
      const q = new THREE.Vector3(wall.point.x + fx * (0.45 + off), topY + 0.05, wall.point.z + fz * (0.45 + off));
      const d2 = this.raycast(q, _down, topY - this.position.y - 0.35);
      if (!d2 || d2.point.y < this.position.y + 0.3) continue;
      const t2 = new THREE.Vector3(q.x, d2.point.y + 0.06, q.z);
      if (this._resolve(t2, STAND.height, _dir).lengthSq() < 1e-4) { target = t2; break; }
      if (this._resolve(t2, CROUCH.height, _dir).lengthSq() < 1e-4) { target = t2; crouch = true; break; }
    }
    if (!target) return;
    if (crouch) this.crouching = true;
    this.grapple = null;
    this.mantle = { from: this.position.clone(), to: target, t: 0 };
    this.velocity.set(0, 0, 0);
    this.events.push('mantle');
  }

  _updateMantle(dt) {
    const m = this.mantle;
    m.t += dt / KIT.mantleTime;
    const k = Math.min(1, m.t);
    // Rise first, then roll forward over the edge.
    const up = Math.min(1, k / 0.6), fwd = Math.max(0, (k - 0.35) / 0.65);
    this.position.set(
      m.from.x + (m.to.x - m.from.x) * fwd,
      m.from.y + (m.to.y - m.from.y) * (1 - (1 - up) * (1 - up)),
      m.from.z + (m.to.z - m.from.z) * fwd,
    );
    if (k >= 1) {
      this.mantle = null;
      this.grounded = true;
      this.airTime = 0;
      this.airJumps = 1;
      const f = _m1.subVectors(m.to, m.from).setY(0).normalize();
      this.velocity.set(f.x * 3, 0, f.z * 3);
    }
  }

  _step(h, allowStepUp) {
    const start = _a.copy(this.position);
    const want = _b.copy(this.velocity).multiplyScalar(h);
    this.position.add(want);
    const push = this._resolve(this.position, this.height, _push);
    let grounded = push.y > Math.abs(want.y) * 0.25 && push.y > 1e-6 && this.velocity.y <= 0.01;
    this.position.add(push);

    // Step-up assist when blocked horizontally while on the ground.
    const wantH = Math.hypot(want.x, want.z);
    if (allowStepUp && wantH > 1e-4) {
      const gotH = Math.hypot(this.position.x - start.x, this.position.z - start.z);
      if (gotH < wantH * 0.6) {
        const alt = _v.copy(start);
        alt.y += STEP;
        if (this._resolve(alt, this.height, _dir).lengthSq() < 1e-6) {
          alt.x += want.x; alt.z += want.z;
          alt.add(this._resolve(alt, this.height, _dir));
          alt.y -= STEP + 0.05;
          const down = this._resolve(alt, this.height, _dir);
          alt.add(down);
          const altH = Math.hypot(alt.x - start.x, alt.z - start.z);
          if (down.y > 0 && altH > gotH + 1e-4 && alt.y - start.y <= STEP + 0.01) {
            this.position.copy(alt);
            this.velocity.y = 0;
            return true;
          }
        }
      }
    }

    if (grounded) {
      this.velocity.y = Math.max(0, this.velocity.y);
    } else if (push.lengthSq() > 1e-10) {
      _dir.copy(push).normalize();
      const d = _dir.dot(this.velocity);
      if (d < 0) this.velocity.addScaledVector(_dir, -d);
    }
    return grounded;
  }

  /** Returns the push vector that moves a capsule at `feet` out of all colliders. */
  _resolve(feet, height, out) {
    _seg.start.set(feet.x, feet.y + RADIUS, feet.z);
    _seg.end.set(feet.x, feet.y + height - RADIUS, feet.z);
    const origStartX = _seg.start.x, origStartY = _seg.start.y, origStartZ = _seg.start.z;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this._colliders) {
        _box.makeEmpty();
        _box.expandByPoint(_seg.start).expandByPoint(_seg.end);
        _box.min.addScalar(-RADIUS);
        _box.max.addScalar(RADIUS);
        if (!_box.intersectsBox(c.box)) continue;
        _segLocal.copy(_seg);
        if (!c.identity) {
          _segLocal.start.applyMatrix4(c.inv);
          _segLocal.end.applyMatrix4(c.inv);
          _box.makeEmpty().expandByPoint(_segLocal.start).expandByPoint(_segLocal.end);
          _box.min.addScalar(-RADIUS);
          _box.max.addScalar(RADIUS);
        }
        let moved = false;
        c.mesh.geometry.boundsTree.shapecast({
          intersectsBounds: (bb) => bb.intersectsBox(_box),
          intersectsTriangle: (tri) => {
            const dist = tri.closestPointToSegment(_segLocal, _tri, _cap);
            if (dist < RADIUS) {
              const depth = RADIUS - dist;
              if (dist < 1e-6) tri.getNormal(_cap); else _cap.sub(_tri).normalize();
              _segLocal.start.addScaledVector(_cap, depth);
              _segLocal.end.addScaledVector(_cap, depth);
              moved = true;
            }
          },
        });
        if (moved) {
          if (!c.identity) {
            _segLocal.start.applyMatrix4(c.mesh.matrixWorld);
            _segLocal.end.applyMatrix4(c.mesh.matrixWorld);
          }
          _seg.copy(_segLocal);
        }
      }
    }
    return out.set(_seg.start.x - origStartX, _seg.start.y - origStartY, _seg.start.z - origStartZ);
  }

  _canStand() {
    _v.copy(this.position);
    _v.y += 0.08;
    return this._resolve(_v, STAND.height, _dir).lengthSq() < 1e-5;
  }
}

function isIdentity(m) {
  const e = m.elements;
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let i = 0; i < 16; i++) if (Math.abs(e[i] - id[i]) > 1e-9) return false;
  return true;
}
