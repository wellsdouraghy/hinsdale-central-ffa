// A non-local player (network peer or practice dummy): interpolation buffer, third-person character, hitbox.
import * as THREE from 'three';
import { createCharacter } from '../visuals/character.js';
import { terrainActive, conformToGround, lieWeight, castWorld, floorBelow } from './groundConform.js';

export const INTERP_DELAY = 0.1; // seconds of buffering for smooth playback

export const PLAYER_COLORS = [0xd23a3a, 0x3a7bd2, 0xe0a030, 0x3fae5a, 0x9b4fd0, 0x2fb7b3, 0xe06aa0, 0x8a8f3a, 0xc8642c];

export class RemotePlayer {
  constructor({ id, name, color, scene }) {
    this.id = id;
    this.name = name;
    this.scene = scene;
    this.character = createCharacter({ color, name });
    this.character.object3D.visible = false;
    scene.add(this.character.object3D);
    this.history = [];         // last ~8 s of states (sender clock), kept for the kill cam
    this.buffer = [];          // [{ ts (sender clock sec), p:[x,y,z], v:[...], yaw, pitch, c, s, w, g, a?, m?, ga? }]
    this.offset = null;        // estimate of (local clock - sender clock)
    this.life = -1;
    this.alive = false;
    this.feet = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouch = 0;
    this.weapon = 'ar';
    this.sprinting = false;
    this.grounded = true;
    this.ads = 0;              // aim-down-sights amount 0..1 ('a' in the state; absent = 0)
    this.mode = 0;             // movement mode ('m'): 0 normal, 1 slide, 2 ladder, 3 mantle, 4 dash
    this.stepDist = 0;
    this.lastFireTime = -10;
  }

  /** s: state message. now: local seconds. */
  pushState(s, now) {
    if (s.l !== undefined && s.l !== this.life) return; // state from a previous life
    this.lastRecv = now;
    const o = now - s.ts;
    if (this.offset === null || o < this.offset) this.offset = o;
    else this.offset += (o - this.offset) * 0.01;
    const buf = this.buffer;
    if (buf.length && s.ts <= buf[buf.length - 1].ts) {
      // Unordered channel: insert in order, drop duplicates.
      if (buf.some((e) => e.ts === s.ts)) return;
      buf.push(s);
      buf.sort((x, y) => x.ts - y.ts);
    } else buf.push(s);
    if (buf.length > 40) buf.splice(0, buf.length - 40);
    // Kill cam history (separate from the playback buffer, which is consumed as it plays).
    const h = this.history;
    if (!h.length || s.ts > h[h.length - 1].ts) h.push(s);
    while (h.length && h[0].ts < s.ts - 8) h.shift();
  }

  /** Rebuilds the character with a new accent color (team change). */
  recolor(color) {
    const old = this.character;
    const visible = old.object3D.visible;
    const children = old.object3D.children.filter((c) => c.userData.attachment);
    this.scene.remove(old.object3D);
    old.dispose();
    this.character = createCharacter({ color, name: this.name });
    this.character.object3D.visible = visible;
    for (const c of children) this.character.object3D.add(c);
    this.scene.add(this.character.object3D);
    this._applyTransform();
  }

  /** Static state (practice dummies). */
  setStatic(pos, yaw) {
    this.buffer = [];
    this.feet.copy(pos);
    this.yaw = yaw;
    this._applyTransform();
  }

  spawn(pos, yaw, life) {
    this.life = life;
    this.alive = true;
    this.buffer = [];
    this.feet.copy(pos);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.corpse = null;
    this.character.reset();
    this.character.object3D.visible = true;
    this._applyTransform();
  }

  /** from: world position of the killer (optional): the body falls away from it, carried by its own momentum. */
  kill(from = null) {
    this.alive = false;
    this.deadAt = performance.now() / 1000;
    this.corpse = null;
    if (this.puppeted) { this.character.die(); return; }        // a finisher poses this body
    const v = this.velocity, push = new THREE.Vector3();
    if (from) { push.set(this.feet.x - from.x, 0, this.feet.z - from.z); const l = push.length(); push.multiplyScalar(l > 1e-3 ? 1 / l : 0); }
    push.x += v.x * 0.12; push.z += v.z * 0.12;
    if (push.lengthSq() < 0.04) push.set(Math.sin(this.yaw) + (Math.random() - 0.5) * 0.8, 0, Math.cos(this.yaw)); // backward
    const fall = pickFall(this.feet, push.normalize());
    this.character.die(fall);
    // the body keeps some of its momentum (a runner stumbles on, a jumper drops to the floor) until it settles
    const hs = Math.hypot(v.x, v.z), kh = Math.min(this.grounded ? 0.4 : 1, (this.grounded ? 3 : 8) / Math.max(hs, 1e-3));
    this.corpse = { v: new THREE.Vector3(v.x * kh, Math.min(6, v.y), v.z * kh), t: 0, floor: floorBelow(this.feet) };
    if (!Number.isFinite(this.corpse.floor)) this.corpse.floor = this.feet.y;
  }

  /** Dead body: slides out its momentum (stopped by walls) and drops onto the floor under it. */
  _settleCorpse(dt) {
    const c = this.corpse, v = c.v, f = this.feet;
    c.t += dt;
    if (c.t > 4) { this.corpse = null; return; }
    const hs = Math.hypot(v.x, v.z);
    if (hs > 0.05) {
      _dir.set(v.x / hs, 0, v.z / hs);
      if (castWorld(_org.set(f.x, f.y + 0.45, f.z), _dir, hs * dt + 0.4)) v.x = v.z = 0;
      else {
        f.x += v.x * dt; f.z += v.z * dt;
        const fl = floorBelow(f);
        if (Number.isFinite(fl)) c.floor = fl;
      }
    }
    if (f.y > c.floor + 1e-3 || v.y > 0) {
      v.y -= 22 * dt;
      f.y = Math.max(c.floor, f.y + v.y * dt);
    }
    if (f.y <= c.floor + 1e-3) { f.y = c.floor; v.y = 0; const k = Math.exp(-6 * dt); v.x *= k; v.z *= k; }
  }

  hide() {
    this.alive = false;
    this.character.object3D.visible = false;
  }

  update(dt, now) {
    // A melee finisher is moving this character (FinisherView keeps `feet` on it): no interpolation meanwhile.
    if (this.puppeted) { this.character.update(dt); return; }
    if (this.alive && this.buffer.length && this.offset !== null) this._interpolate(now - this.offset - INTERP_DELAY);
    else if (!this.alive && this.corpse) this._settleCorpse(Math.min(dt, 0.05));
    this._applyTransform();
    const v = this.velocity, live = this.alive;
    this.character.setState({
      speed: live ? Math.hypot(v.x, v.z) : 0, vx: live ? v.x : 0, vy: live ? v.y : 0, vz: live ? v.z : 0,
      crouching: this.crouch > 0.5,
      aimPitch: this.pitch,
      weaponId: this.weapon,
      grounded: this.grounded,
      sprinting: this.sprinting,
      ads: live ? this.ads : 0, mode: live ? this.mode : 0, grapple: live ? this.grappleAnchor : null,
    });
    this.character.update(dt);
  }

  _interpolate(rt) {
    const buf = this.buffer;
    let a = buf[0], b = null;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i].ts <= rt) a = buf[i];
      else { b = buf[i]; break; }
    }
    // Drop samples we no longer need (keep the one before render time).
    const ai = buf.indexOf(a);
    if (ai > 0) buf.splice(0, ai);
    if (!b || rt < a.ts) {
      // Extrapolate up to 120 ms past the last sample.
      const ex = Math.min(0.12, Math.max(0, rt - a.ts));
      this.feet.set(a.p[0] + a.v[0] * ex, a.p[1] + Math.max(0, a.v[1]) * ex, a.p[2] + a.v[2] * ex);
      this._copyMeta(a);
      return;
    }
    const k = (rt - a.ts) / Math.max(1e-6, b.ts - a.ts);
    this.feet.set(lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k));
    this._copyMeta(k < 0.5 ? a : b);
    // velocity drives the stride and leans: blend it too, so 20 Hz samples don't step the gait
    this.velocity.set(lerp(a.v[0], b.v[0], k), lerp(a.v[1], b.v[1], k), lerp(a.v[2], b.v[2], k));
    this.yaw = lerpAngle(a.yaw, b.yaw, k);
    this.pitch = lerp(a.pitch, b.pitch, k);
    this.crouch = lerp(a.c ? 1 : 0, b.c ? 1 : 0, k);
    this.ads = lerp(a.a || 0, b.a || 0, k);
  }

  _copyMeta(s) {
    this.yaw = s.yaw;
    this.pitch = s.pitch;
    this.crouch = s.c ? 1 : 0;
    this.velocity.set(s.v[0], s.v[1], s.v[2]);
    this.weapon = s.w || this.weapon;
    this.sprinting = !!s.s;
    this.grounded = s.g !== 0;
    this.ads = s.a || 0;
    this.mode = s.m || 0;
    if (s.ga) (this.grappleAnchor ||= new THREE.Vector3()).fromArray(s.ga);
    else this.grappleAnchor = null;
  }

  _applyTransform() {
    const o = this.character.object3D;
    o.position.copy(this.feet);
    if (!terrainActive()) { o.rotation.y = this.yaw; return; }
    // terrain: a dead body lies on the slope (the death fall pivots about the feet); upright otherwise
    if (!this.alive && this.deadAt !== undefined) conformToGround(o, this.yaw, lieWeight(performance.now() / 1000 - this.deadAt));
    else o.rotation.set(0, this.yaw, 0);
  }

  /** Interpolated historical state at sender time `ts` (kill cam), or null when outside the recorded range. */
  sampleAt(ts) {
    const h = this.history;
    if (!h.length || ts < h[0].ts - 0.3 || ts > h[h.length - 1].ts + 0.3) return null;
    let a = h[0], b = h[h.length - 1];
    for (let i = 0; i < h.length - 1; i++) if (h[i].ts <= ts && h[i + 1].ts >= ts) { a = h[i]; b = h[i + 1]; break; }
    const k = b.ts > a.ts ? THREE.MathUtils.clamp((ts - a.ts) / (b.ts - a.ts), 0, 1) : 0;
    return {
      p: [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)],
      yaw: lerpAngle(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), c: k < 0.5 ? a.c : b.c,
      v: a.v, w: a.w, s: a.s, g: a.g, ga: k < 0.5 ? a.ga : b.ga, a: lerp(a.a || 0, b.a || 0, k), m: k < 0.5 ? a.m : b.m,
    };
  }

  /** Poses the character from a historical sample (kill cam playback). */
  applySample(sm, dt) {
    this.feet.fromArray(sm.p);
    this.yaw = sm.yaw;
    this.pitch = sm.pitch;
    this.crouch = sm.c ? 1 : 0;
    this.weapon = sm.w || this.weapon;
    this.ads = sm.a || 0;
    this.mode = sm.m || 0;
    if (sm.ga) (this.grappleAnchor ||= new THREE.Vector3()).fromArray(sm.ga);
    else this.grappleAnchor = null;
    this._applyTransform();
    this.character.object3D.visible = true;
    this.character.setState({
      speed: Math.hypot(sm.v[0], sm.v[2]), vx: sm.v[0], vy: sm.v[1], vz: sm.v[2], crouching: !!sm.c, aimPitch: sm.pitch, weaponId: this.weapon,
      grounded: sm.g !== 0, sprinting: !!sm.s, ads: this.ads, mode: this.mode, grapple: this.grappleAnchor,
    });
    this.character.update(dt);
  }

  /** Approximate third-person muzzle position for tracers. */
  muzzle(target) {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const h = this.crouch > 0.5 ? 0.95 : 1.42;
    return target.set(this.feet.x - sy * 0.6 + cy * 0.18, this.feet.y + h, this.feet.z - cy * 0.6 - sy * 0.18);
  }

  eye(target) {
    return target.set(this.feet.x, this.feet.y + (this.crouch > 0.5 ? 1.05 : 1.65), this.feet.z);
  }

  hitbox() {
    return { id: this.id, feet: this.feet, crouch: this.crouch };
  }

  dispose() {
    this.scene.remove(this.character.object3D);
    this.character.dispose();
  }
}

const _dir = new THREE.Vector3(), _org = new THREE.Vector3(), _fd = new THREE.Vector3();
const FALL_TRY = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI];
/**
 * Death fall direction that keeps the body out of walls: the preferred push if there is room for a 1.75 m body,
 * else the nearest clear direction, else the roomiest one with the fall cut short (slumped against the wall).
 */
function pickFall(feet, push) {
  let best = null, bestC = -1;
  for (const a of FALL_TRY) {
    const s = Math.sin(a), c = Math.cos(a);
    _fd.set(push.x * c + push.z * s, 0, -push.x * s + push.z * c);
    let clear = 1.9;
    for (const h of [0.45, 1.0]) {
      const hit = castWorld(_org.set(feet.x, feet.y + h, feet.z), _fd, clear);
      if (hit) clear = Math.min(clear, hit.distance);
    }
    if (clear >= 1.8) return { dir: _fd.clone(), maxAngle: Math.PI / 2 };
    if (clear > bestC) { bestC = clear; best = _fd.clone(); }
  }
  return { dir: best, maxAngle: Math.asin(Math.min(1, Math.max(0.3, (bestC - 0.2) / 1.7))) };
}

function lerp(a, b, k) { return a + (b - a) * k; }
function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
