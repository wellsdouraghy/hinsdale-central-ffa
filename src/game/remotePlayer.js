// A non-local player (network peer or practice dummy): interpolation buffer, third-person character, hitbox.
import * as THREE from 'three';
import { createCharacter } from '../visuals/character.js';

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
    this.buffer = [];          // [{ ts (sender clock sec), p:[x,y,z], v:[...], yaw, pitch, c, s, w, g }]
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
    this.stepDist = 0;
    this.lastFireTime = -10;
  }

  /** s: state message. now: local seconds. */
  pushState(s, now) {
    if (s.l !== undefined && s.l !== this.life) return; // state from a previous life
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
    this.character.reset();
    this.character.object3D.visible = true;
    this._applyTransform();
  }

  kill() {
    this.alive = false;
    this.character.die();
  }

  hide() {
    this.alive = false;
    this.character.object3D.visible = false;
  }

  update(dt, now) {
    if (this.alive && this.buffer.length && this.offset !== null) this._interpolate(now - this.offset - INTERP_DELAY);
    this._applyTransform();
    this.character.setState({
      speed: this.alive ? Math.hypot(this.velocity.x, this.velocity.z) : 0,
      crouching: this.crouch > 0.5,
      aimPitch: this.pitch,
      weaponId: this.weapon,
      grounded: this.grounded,
      sprinting: this.sprinting,
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
    this.yaw = lerpAngle(a.yaw, b.yaw, k);
    this.pitch = lerp(a.pitch, b.pitch, k);
    this.crouch = lerp(a.c ? 1 : 0, b.c ? 1 : 0, k);
  }

  _copyMeta(s) {
    this.yaw = s.yaw;
    this.pitch = s.pitch;
    this.crouch = s.c ? 1 : 0;
    this.velocity.set(s.v[0], s.v[1], s.v[2]);
    this.weapon = s.w || this.weapon;
    this.sprinting = !!s.s;
    this.grounded = s.g !== 0;
  }

  _applyTransform() {
    const o = this.character.object3D;
    o.position.copy(this.feet);
    o.rotation.y = this.yaw;
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

function lerp(a, b, k) { return a + (b - a) * k; }
function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
