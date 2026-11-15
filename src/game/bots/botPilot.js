// Host-side helicopter pilot for an AI bot. Same flight model and limits as a human pilot (HeliPilot): it produces
// the same messages ('hst' pose, 'heliCrash', 'heliRotor', 'rocket') through HeliRules.handle, and cannon hits go
// through HeliRules.cannonHit, so every host rule (damage, friendly fire, hull, ram / rotor kills) applies unchanged.
// Behaviour: take off to 25-45 m, hunt what it can see (wide view from altitude, line of sight) or has heard, strafe-orbit
// targets at 40-90 m with cannon bursts (no overheating) and rocket pairs at groups / players behind cover, look-ahead
// raycasts against buildings, trees and the ground, stays inside the play area, evades when the hull is low. Never exits.
import * as THREE from 'three';
import { HELI } from '../heli.js';

const DEG = Math.PI / 180;
// Mirrors heliPilot.js (human pilot limits).
const MAX_SPEED = 28, BOOST_SPEED = 42, VERT_SPEED = 10, CEILING = 120;
const CANNON_RPS = 10, CANNON_SPREAD = 0.5 * DEG, CANNON_DMG = 20, CANNON_RANGE = 600;
const HEAT_PER_SEC = 1 / 3, COOL_PER_SEC = 0.45, ROCKET_RELOAD = 4;
const PITCH_MIN = -70 * DEG, PITCH_MAX = 25 * DEG;
const YAW_RATE = 1.7;   // rad/s, roughly a brisk mouse turn

// Difficulty: cannon spread multiplier, aim wobble (deg), burst length (s), pause (s), sight (m).
const SKILL = {
  easy:   { spread: 4.0, wobble: 3.5, burst: [0.4, 0.8], pause: [0.9, 1.6], sight: 140, react: 1.0, rockets: 0.35 },
  normal: { spread: 2.2, wobble: 1.8, burst: [0.6, 1.2], pause: [0.5, 1.0], sight: 190, react: 0.55, rockets: 0.6 },
  hard:   { spread: 1.3, wobble: 0.9, burst: [0.9, 1.6], pause: [0.3, 0.6], sight: 240, react: 0.3, rockets: 0.9 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class BotPilot {
  constructor(brain) {
    this.brain = brain;
    this.p = brain.p;
    this.auth = brain.auth;
    this.heli = this.auth.heli;
    this.hs = brain.mgr.hitscan;
    const h = this.heli.h;
    this.pos = new THREE.Vector3().fromArray(h.pos);
    this.vel = new THREE.Vector3();
    this.yaw = h.yaw;
    this.aimPitch = 0;
    this.tilt = { pitch: 0, roll: 0 };
    this.heat = 0; this.overheated = false; this.nextShot = 0;
    this.burstUntil = 0; this.pauseUntil = 0;
    this.rocketsReadyAt = 0; this.rid = 1; this.pendingRocket = null;
    this.sendT = 0; this.thinkT = 0;
    this.grounded = true;
    this.cruise = rand(28, 42);
    this.orbitR = rand(45, 85);
    this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.orbitT = 0;
    this.target = null; this.visible = false; this.lastSeenT = -99; this.reactAt = 0;
    this.patrol = null; this.patrolT = 0;
    this.evadeDir = 1; this.evadeT = 0;
    this.k = SKILL[brain.mgr.difficulty] || SKILL.normal;
    this.wob = { yaw: 0, pitch: 0 };
  }

  get center() { return _a.copy(this.pos).add(_b.set(0, 1.6, 0)); }

  _enemy(o) {
    if (!o || o === this.p || !o.alive || !o.pos || o.inHeli || (o.bot && !o.ai)) return false;
    return !this.auth.teamMode || o.team !== this.p.team;
  }

  _chest(o, out) { return out.set(o.pos[0], o.pos[1] + (o.crouch ? 0.7 : 1.15), o.pos[2]); }

  _los(from, to) {
    _d.subVectors(to, from);
    const len = _d.length();
    return !this.hs.castWorld(from, _d.normalize(), len - 0.4, { bullets: true });
  }

  // ---------------- perception (~5 Hz) ----------------
  _think(t) {
    const brain = this.brain;
    const eye = this.center.clone();
    const fwdYaw = this.yaw;
    let best = null, bestScore = Infinity;
    for (const o of this.auth.players.values()) {
      if (!this._enemy(o)) continue;
      const dx = o.pos[0] - eye.x, dz = o.pos[2] - eye.z;
      const d = Math.hypot(dx, dz, o.pos[1] - eye.y);
      if (d > this.k.sight) continue;
      // Wide field of view from altitude (everything except straight behind), or a fresh memory.
      let da = Math.atan2(-dx, -dz) - fwdYaw; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) > 115 * DEG && !brain.memory.has(o.id)) continue;
      if (!this._los(eye, this._chest(o, _c))) continue;
      brain.memory.set(o.id, { pos: new THREE.Vector3().fromArray(o.pos), t });
      const score = d * (o === this.target ? 0.6 : 1);
      if (score < bestScore) { bestScore = score; best = o; }
    }
    if (best && best !== this.target) this.reactAt = t + this.k.react * rand(0.8, 1.3);
    if (best) { this.target = best; this.visible = true; this.lastSeenT = t; }
    else {
      this.visible = false;
      if (this.target && (!this.target.alive || t - this.lastSeenT > 4)) this.target = null;
    }
    for (const [id, m] of brain.memory) if (t - m.t > 12 || !this.auth.players.get(id)?.alive) brain.memory.delete(id);
    if (t > this.orbitT) { this.orbitT = t + rand(5, 9); if (Math.random() < 0.35) this.orbitDir *= -1; this.orbitR = rand(45, 85); }
  }

  _groundBelow(x, z, fromY) {
    const hit = this.hs.castWorld(_c.set(x, fromY, z), DOWN, 400);
    return hit ? hit.point.y : (this.auth.world.groundY ? this.auth.world.groundY(x, z) : 0);
  }

  // ---------------- per frame ----------------
  update(dt, t) {
    const h = this.heli.h;
    if (!h || h.pilot !== this.p.id || h.state !== 'flying') return false;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.2; this._think(t); }
    const hp = h.hp / HELI.hp;

    // ---- where do we want to be? ----
    const ground = this._groundBelow(this.pos.x, this.pos.z, this.pos.y + 2);
    const alt = this.pos.y - ground;
    const want = new THREE.Vector3();        // desired horizontal velocity
    let wantAlt = this.cruise;
    let faceYaw = null;
    const tgt = this.target && (this.visible || t - this.lastSeenT < 2) ? this.target : null;
    const evading = hp < 0.35;
    if (evading) {
      // Back off: away from the nearest threat, climb, weave.
      wantAlt = Math.min(CEILING - 10, this.cruise + 18);
      let threat = tgt ? new THREE.Vector3().fromArray(tgt.pos) : null;
      if (!threat) for (const m of this.brain.memory.values()) if (!threat || m.pos.distanceTo(this.pos) < threat.distanceTo(this.pos)) threat = m.pos;
      if (threat) {
        want.set(this.pos.x - threat.x, 0, this.pos.z - threat.z).normalize();
        if (t > this.evadeT) { this.evadeT = t + rand(0.8, 1.6); this.evadeDir *= -1; }
        want.add(_b.set(-want.z, 0, want.x).multiplyScalar(0.6 * this.evadeDir)).normalize().multiplyScalar(BOOST_SPEED);
      } else want.set(0, 0, 0);
    } else if (tgt) {
      // Strafe-orbit the target at 40-90 m, nose on it.
      const tp = _c.fromArray(tgt.pos);
      const r = _b.set(this.pos.x - tp.x, 0, this.pos.z - tp.z);
      const d = r.length() || 1;
      r.divideScalar(d);
      const tang = new THREE.Vector3(-r.z, 0, r.x).multiplyScalar(this.orbitDir);
      want.copy(tang).multiplyScalar(MAX_SPEED * 0.75).addScaledVector(r, THREE.MathUtils.clamp((this.orbitR - d) * 0.6, -MAX_SPEED, MAX_SPEED));
      faceYaw = Math.atan2(-(tp.x - this.pos.x), -(tp.z - this.pos.z));
      wantAlt = THREE.MathUtils.clamp(this.cruise, 25, 45);
    } else {
      // Hunt the freshest memory (sightings / gunfire heard), else patrol.
      let m = null;
      for (const mm of this.brain.memory.values()) if (!m || mm.t > m.t) m = mm;
      let goal = m ? m.pos : null;
      if (!goal) {
        if (!this.patrol || t > this.patrolT || Math.hypot(this.patrol.x - this.pos.x, this.patrol.z - this.pos.z) < 20) {
          const b = this.auth.world.playBounds;
          this.patrol = new THREE.Vector3(rand(b.minX + 60, b.maxX - 60), 0, rand(b.minZ + 60, b.maxZ - 60));
          this.patrolT = t + rand(12, 20);
        }
        goal = this.patrol;
      }
      want.set(goal.x - this.pos.x, 0, goal.z - this.pos.z);
      const d = want.length();
      // Slow down near a remembered contact so we can orbit / look around.
      want.normalize().multiplyScalar(m && d < this.orbitR ? MAX_SPEED * 0.4 : d > 150 ? BOOST_SPEED : MAX_SPEED);
    }
    // Take off before moving off.
    if (alt < 8) want.multiplyScalar(0.15);

    // ---- avoidance: look ahead along the motion, keep clear of the play-area edges ----
    let upIn = THREE.MathUtils.clamp((wantAlt - alt) / 6, -1, 1);
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const look = this.center.clone();
    const dirMove = hv > 2 ? _b.set(this.vel.x, 0, this.vel.z).normalize() : _b.set(want.x, 0, want.z).normalize();
    if (dirMove.lengthSq() > 0.5) {
      const ahead = hv * 2.2 + 14;
      const hit = this.hs.castWorld(look, dirMove, ahead);
      const low = this.hs.castWorld(look.clone().add(_d.set(0, -2.5, 0)), dirMove, ahead);
      if (hit || low) {
        upIn = 1;                                  // climb over it
        const dist = Math.min(hit?.distance ?? 999, low?.distance ?? 999);
        if (dist < ahead * 0.5) {
          // Too close: brake and veer toward the clearer side.
          const left = new THREE.Vector3(-dirMove.z, 0, dirMove.x);
          const cl = this.hs.castWorld(look, left, 25)?.distance ?? 99;
          const cr = this.hs.castWorld(look, left.clone().negate(), 25)?.distance ?? 99;
          want.multiplyScalar(0.2).addScaledVector(cl > cr ? left : left.negate(), MAX_SPEED * 0.6);
        }
      }
    }
    if (alt < 12 && !this.grounded) upIn = Math.max(upIn, 0.6);
    const b = this.auth.world.playBounds, M = 45;
    if (this.pos.x < b.minX + M) want.x += (b.minX + M - this.pos.x) * 1.2;
    if (this.pos.x > b.maxX - M) want.x -= (this.pos.x - (b.maxX - M)) * 1.2;
    if (this.pos.z < b.minZ + M) want.z += (b.minZ + M - this.pos.z) * 1.2;
    if (this.pos.z > b.maxZ - M) want.z -= (this.pos.z - (b.maxZ - M)) * 1.2;

    // ---- steer: yaw toward the target (or the travel direction) at a limited rate ----
    if (faceYaw === null && Math.hypot(want.x, want.z) > 3) faceYaw = Math.atan2(-want.x, -want.z);
    if (faceYaw !== null) {
      let dy = faceYaw - this.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      this.yawRate = THREE.MathUtils.clamp(dy * 3, -YAW_RATE, YAW_RATE);
      this.yaw += this.yawRate * dt;
    } else this.yawRate = 0;

    // ---- the same flight model as a human pilot (inputs are clamped to the stick range) ----
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const boost = evading || (!tgt && Math.hypot(want.x, want.z) > MAX_SPEED + 1);
    const top = boost ? BOOST_SPEED : MAX_SPEED;
    let fwdIn = THREE.MathUtils.clamp(want.dot(fwd) / top, -1, 1);
    let strIn = THREE.MathUtils.clamp(want.dot(right) / MAX_SPEED, -1, 1);
    const inV = new THREE.Vector3().copy(fwd).multiplyScalar(fwdIn).addScaledVector(right, strIn);
    if (inV.lengthSq() > 1) inV.normalize();
    inV.multiplyScalar(boost && fwdIn > 0 ? BOOST_SPEED : MAX_SPEED);
    const kh = 1 - Math.exp(-1.1 * dt), kv = 1 - Math.exp(-2.2 * dt);
    this.vel.x += (inV.x - this.vel.x) * kh;
    this.vel.z += (inV.z - this.vel.z) * kh;
    this.vel.y += (upIn * VERT_SPEED - this.vel.y) * kv;
    if (this.grounded && upIn <= 0) { this.vel.x *= 0.9; this.vel.z *= 0.9; }
    this._move(dt, t, fwd);
    this._rotorStrike(t);

    // Banking / nose tilt (as heliPilot).
    const fwdSpeed = this.vel.x * -Math.sin(this.yaw) + this.vel.z * -Math.cos(this.yaw);
    const sideSpeed = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    const kt = 1 - Math.exp(-3 * dt);
    // (terrain campuses: landed on a slope, the airframe lies on it)
    const T = this.auth.world.terrain, n = T && this.grounded ? T.normalAt(this.pos.x, this.pos.z) : null;
    const gp = n ? Math.atan((n.x * Math.sin(this.yaw) + n.z * Math.cos(this.yaw)) / n.y) : 0, gr = n ? Math.atan(-(n.x * Math.cos(this.yaw) - n.z * Math.sin(this.yaw)) / n.y) : 0;
    this.tilt.pitch += ((this.grounded ? gp : -fwdSpeed / BOOST_SPEED * 0.35) - this.tilt.pitch) * kt;
    this.tilt.roll += ((this.grounded ? gr : -sideSpeed / MAX_SPEED * 0.4 - this.yawRate * 0.12) - this.tilt.roll) * kt;

    // Keep the on-foot controller with us (hearing distances, respawn bookkeeping).
    this.brain.ctrl.position.set(this.pos.x, this.pos.y + 0.6, this.pos.z);

    this._weapons(dt, t, tgt);

    // Stream the pose exactly like a human pilot's client.
    this.sendT += dt;
    if (this.sendT >= 0.05) {
      this.sendT = 0;
      this.heli.handle(this.p, { t: 'hst', ts: r3(t), p: [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)], yaw: r3(this.yaw), pitch: r3(this.tilt.pitch), roll: r3(this.tilt.roll), v: [r2(this.vel.x), r2(this.vel.y), r2(this.vel.z)] });
    }
    return true;
  }

  _move(dt, t, fwd) {
    const hs = this.hs;
    const step = this.vel.clone().multiplyScalar(dt);
    const len = step.length();
    if (len > 1e-4) {
      const c = this.center.clone();
      const hit = hs.castWorld(c, step.clone().divideScalar(len), len + 2.4);
      // Floor-like surfaces below are handled by the skid/ground settle (the 2.4 m body margin used to stop the
      // descent ~0.85 m above the ground: the "hovering" landing).
      if (hit && hit.distance < len + 2.4 && !(hit.normal.y > 0.6 && this.vel.y < 0)) {
        const impact = Math.max(0, -this.vel.dot(hit.normal));
        const nose = fwd.dot(hit.normal) < -0.7;
        this._impact(t, impact, hit.point, nose);
        const vn = this.vel.dot(hit.normal);
        if (vn < 0) this.vel.addScaledVector(hit.normal, -vn * 1.3);
        step.copy(this.vel).multiplyScalar(dt);
      }
      this.pos.add(step);
    }
    const groundY = this._groundBelow(this.pos.x, this.pos.z, this.pos.y + 2);
    this.grounded = this.pos.y <= groundY + 0.05;
    if (this.pos.y < groundY) {
      const flip = Math.abs(this.tilt.roll) > 70 * DEG || Math.abs(this.tilt.pitch) > 70 * DEG;
      if (this.vel.y < -1 || flip) this._impact(t, -this.vel.y, this.pos.clone(), false, flip);
      this.pos.y = groundY;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    const terrain = this.auth.world.groundY ? this.auth.world.groundY(this.pos.x, this.pos.z) : 0;
    if (this.pos.y > terrain + CEILING) { this.pos.y = terrain + CEILING; this.vel.y = Math.min(0, this.vel.y); }
    const b = this.auth.world.playBounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
  }

  _impact(t, speed, point, nose = false, flip = false) {
    if (speed < 6 && !flip) return;
    if (t < (this.crashT || 0)) return;
    this.crashT = t + 0.35;
    this.heli.handle(this.p, { t: 'heliCrash', speed: Math.round(speed * 10) / 10, nose, flip, p: [r2(point.x), r2(point.y), r2(point.z)] });
  }

  _quat() { return new THREE.Quaternion().setFromEuler(new THREE.Euler(this.tilt.pitch, this.yaw, this.tilt.roll, 'YXZ')); }

  _rotorStrike(t) {
    if (t < (this.rotorT || 0)) return;
    this.rotorT = t + 0.1;
    const q = this._quat();
    const hub = new THREE.Vector3(0, HELI.rotorY, 0).applyQuaternion(q).add(this.pos);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(q);
      const hit = this.hs.castWorld(hub, dir, HELI.rotorRadius);
      if (hit) {
        this.rotorT = t + 0.6;
        this.heli.handle(this.p, { t: 'heliRotor', p: [r2(hit.point.x), r2(hit.point.y), r2(hit.point.z)] });
        this.vel.addScaledVector(dir, -6);
        return;
      }
    }
  }

  // ---------------- weapons ----------------
  _weapons(dt, t, tgt) {
    // Heat: identical to the human cannon, but the bot lets go before it overheats.
    const wantFire = this._cannonWanted(t, tgt);
    const firing = wantFire && !this.overheated;
    if (firing) this.heat = Math.min(1, this.heat + HEAT_PER_SEC * dt);
    else this.heat = Math.max(0, this.heat - COOL_PER_SEC * dt);
    if (this.heat >= 1) this.overheated = true;
    if (this.overheated && this.heat < 0.35) this.overheated = false;
    if (this.heat > 0.85) { this.burstUntil = 0; this.pauseUntil = t + 1.4; }
    if (firing && t >= this.nextShot && tgt) {
      this.nextShot = t + 1 / CANNON_RPS;
      this._cannon(tgt);
    }
    // Rocket pairs: at groups, or at a target that just ducked behind cover.
    if (tgt && t >= this.rocketsReadyAt && t >= this.reactAt) {
      const tp = _c.fromArray(tgt.pos);
      const d = tp.distanceTo(this.pos);
      let group = 0;
      for (const o of this.auth.players.values()) if (o !== tgt && this._enemy(o) && Math.hypot(o.pos[0] - tp.x, o.pos[2] - tp.z) < 7) group++;
      const covered = !this.visible && t - this.lastSeenT < 1.5;
      if (d < 160 && this._onTarget(tp, 12) && (group > 0 || covered || Math.random() < 0.02) && Math.random() < this.k.rockets) {
        this.rocketsReadyAt = t + ROCKET_RELOAD;
        const aim = tp.clone();
        this._rocket(0, aim);
        this.pendingRocket = { at: t + 0.15, aim };
      } else if (d < 160) this.rocketsReadyAt = t + 0.5;   // re-check shortly
    }
    if (this.pendingRocket && t >= this.pendingRocket.at) { this._rocket(1, this.pendingRocket.aim); this.pendingRocket = null; }
  }

  /** The cannon looks where the nose points (yaw) within the human camera's pitch range. */
  _onTarget(tp, tolDeg) {
    const c = this.center;
    const dx = tp.x - c.x, dz = tp.z - c.z;
    let dy = Math.atan2(-dx, -dz) - this.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    const pitch = Math.atan2(tp.y + 1 - c.y, Math.hypot(dx, dz));
    return Math.abs(dy) < tolDeg * DEG && pitch > PITCH_MIN && pitch < PITCH_MAX;
  }

  _cannonWanted(t, tgt) {
    if (!tgt || !this.visible || t < this.reactAt || this.overheated) return false;
    const tp = _c.fromArray(tgt.pos);
    if (tp.distanceTo(this.pos) > 220 || !this._onTarget(tp, 9)) return false;
    if (t < this.pauseUntil) return false;
    if (t >= this.burstUntil) {
      if (this.burstUntil > 0) { this.burstUntil = 0; this.pauseUntil = t + rand(...this.k.pause); return false; }
      this.burstUntil = t + rand(...this.k.burst);
    }
    return true;
  }

  _muzzle(out) {
    const q = this._quat();
    return out.set(0, 0.8, -4.2).applyQuaternion(q).add(this.pos);
  }

  _cannon(tgt) {
    const auth = this.auth, p = this.p;
    const muzzle = this._muzzle(new THREE.Vector3());
    // Aim center mass with a slowly wandering, difficulty-scaled error (hitscan: no lead needed).
    this.wob.yaw += (rand(-1, 1) * this.k.wobble * DEG - this.wob.yaw) * 0.15;
    this.wob.pitch += (rand(-1, 1) * this.k.wobble * DEG - this.wob.pitch) * 0.15;
    const aim = this._chest(tgt, new THREE.Vector3()).sub(muzzle).normalize();
    aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.wob.yaw);
    aim.y += this.wob.pitch;
    aim.normalize();
    const dir = cone(aim, CANNON_SPREAD * this.k.spread);
    const wh = this.hs.castWorld(muzzle, dir, CANNON_RANGE, { bullets: true });
    const targets = [];
    for (const o of auth.players.values()) if (this._enemy(o)) targets.push({ id: o.id, feet: new THREE.Vector3().fromArray(o.pos), crouch: o.crouch ? 1 : 0 });
    const th = this.hs.castTargets(muzzle, dir, wh ? wh.distance : CANNON_RANGE, targets);
    let e;
    if (th) e = [r2(th.point.x), r2(th.point.y), r2(th.point.z), 2];
    else if (wh) e = [r2(wh.point.x), r2(wh.point.y), r2(wh.point.z), 1, r3(wh.normal.x), r3(wh.normal.y), r3(wh.normal.z), wh.surface];
    else { const end = muzzle.clone().addScaledVector(dir, CANNON_RANGE); e = [r2(end.x), r2(end.y), r2(end.z), 0]; }
    auth.out({ t: 'shot', id: p.id, w: 'heligun', o: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], e: [e] });
    this.brain.mgr.onShot(p, p.pos);
    if (th) this.heli.cannonHit(p, { target: th.id, dmg: CANNON_DMG });
  }

  _rocket(side, aimPoint) {
    const q = this._quat();
    const o = new THREE.Vector3(side ? 1.9 : -1.9, 0.9, -0.6).applyQuaternion(q).add(this.pos);
    const d = aimPoint.clone().sub(o).normalize();
    this.heli.handle(this.p, { t: 'rocket', rid: this.rid++, o: o.toArray().map(r2), d: d.toArray().map(r3) });
  }
}

function cone(aim, spread) {
  const up = Math.abs(aim.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(aim, up).normalize();
  const v = new THREE.Vector3().crossVectors(u, aim).normalize();
  const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
  return aim.clone().addScaledVector(u, Math.cos(a) * Math.tan(r)).addScaledVector(v, Math.sin(a) * Math.tan(r)).normalize();
}
