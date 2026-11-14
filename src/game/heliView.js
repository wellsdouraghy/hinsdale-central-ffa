// Client-side helicopter: model, remote pose interpolation, rockets, rotor audio, enter prompt, hit volume for
// bullets. The pilot's flight/weapons live in heliPilot.js. All state comes from the host ('heli', 'hst', ...).
import * as THREE from 'three';
import { createHelicopter, createRocket } from '../visuals/helicopter.js';
import { HeliPilot } from './heliPilot.js';
import { now as clock } from './authority.js';

const INTERP = 0.1;
const HELI_HP = 900;
const _v = new THREE.Vector3();

export class HeliView {
  constructor(game, snap) {
    this.game = game;
    this.vis = createHelicopter();
    this.vis.object3D.visible = false;
    game.scene.add(this.vis.object3D);
    this.s = null;              // last host snapshot
    this.buf = [];              // pose samples { t (local), p, yaw, pitch, roll }
    this.rockets = new Map();   // key -> { vis, pos, dir, age }
    this.rotor = 0;
    this.loop = null;
    this.pilot = null;          // HeliPilot when we fly it
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.enterHold = 0;
    if (snap) this.apply(snap);
  }

  get flying() { return this.s?.state === 'flying'; }
  get active() { return this.s && (this.s.state === 'parked' || this.s.state === 'flying'); }
  get mine() { return this.s?.pilot === this.game.localId; }

  apply(s, spawned = false) {
    const prev = this.s;
    this.s = s;
    if (s.pilot !== this.game.localId && this.pilot) { this.pilot.dispose(); this.pilot = null; }
    if (!this.active) { this.vis.object3D.visible = false; this.vis.setOccupied?.(false); this.buf = []; return; }
    this.vis.object3D.visible = true;
    if (!prev || prev.gen !== s.gen) {
      this.vis.reset();
      this.buf = [];
      this._pose(new THREE.Vector3().fromArray(s.pos), s.yaw, 0, 0);
    }
    if (s.state === 'parked') this._pose(new THREE.Vector3().fromArray(s.pos), s.yaw, 0, 0);
    this.vis.setDamage?.(1 - s.hp / HELI_HP);
    this.vis.setOccupied?.(s.pilot !== null);
    const g = this.game;
    if (spawned) g.announce('A helicopter has been spotted somewhere on campus', 'Find it first', '#f2b544', 'neutral');
    // Start / stop piloting.
    if (s.pilot === g.localId && !this.pilot) this.pilot = new HeliPilot(g, this, s);
    if (s.pilot !== g.localId && this.pilot) { this.pilot.dispose(); this.pilot = null; }
    if (this.pilot) this.pilot.syncHost(s);
  }

  onPose(m) {
    if (this.mine || m.gen !== this.s?.gen) return;
    this.buf.push({ t: clock(), p: m.p, yaw: m.yaw, pitch: m.pitch, roll: m.roll });
    if (this.buf.length > 30) this.buf.shift();
    if (this.s) { this.s.hp = m.hp ?? this.s.hp; this.vis.setDamage?.(1 - this.s.hp / HELI_HP); }
  }

  _pose(p, yaw, pitch, roll) {
    this.pos.copy(p);
    const o = this.vis.object3D;
    o.position.copy(p);
    o.rotation.set(pitch, yaw, roll, 'YXZ');
    this.quat.copy(o.quaternion);
  }

  onRocket(m) {
    const vis = createRocket();
    this.game.scene.add(vis.object3D);
    const pos = new THREE.Vector3().fromArray(m.o), dir = new THREE.Vector3().fromArray(m.d).normalize();
    this.rockets.set(`${m.id}:${m.rid}`, { vis, pos, dir, age: 0 });
    this.game.audio.rocket?.(pos.clone());
  }

  /** Local rocket (pilot) starts its visual immediately. */
  addLocalRocket(rid, pos, dir) { this.onRocket({ id: this.game.localId, rid, o: pos.toArray(), d: dir.toArray() }); }

  onRocketBoom(m) {
    const key = `${m.id}:${m.rid}`;
    const r = this.rockets.get(key);
    if (r) { this.game.scene.remove(r.vis.object3D); r.vis.dispose(); this.rockets.delete(key); }
    this.game.throwables.explosionAt(new THREE.Vector3().fromArray(m.p), 4);
  }

  onBoom(m) {
    const p = new THREE.Vector3().fromArray(m.p);
    this.vis.destroy();
    this.game.throwables.explosionAt(p, 14);
    this.game.effects.explosion?.(p.clone().add(new THREE.Vector3(0, 1.5, 0)), { radius: 14 });
    this.game.audio.explosion?.(p.clone());
    setTimeout(() => { if (!this.active) this.vis.object3D.visible = false; }, 6000);
  }

  /** Impact / rotor strike / running someone over: sparks (or blood) and a metal crunch where it happened. */
  onSpark(m) {
    const p = new THREE.Vector3().fromArray(m.p);
    const g = this.game;
    if (m.blood) g.effects.blood(p, new THREE.Vector3(0, 1, 0));
    for (let i = 0; i < (m.big ? 6 : 3); i++) {
      const n = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      g.effects.impact(p.clone().addScaledVector(n, 0.3), n, 'metal');
    }
    g.audio.crunch?.(p.clone(), m.big);
  }

  /** Bullet ray vs helicopter hit volume (body + tail spheres). Returns distance or null. */
  rayHit(origin, dir, maxDist) {
    if (!this.active || this.mine) return null;
    const o = this.vis.object3D;
    let best = null;
    for (const [lx, ly, lz, r] of [[0, 1.6, -0.6, 1.9], [0, 1.9, 3.6, 0.9], [0, 2.0, 5.8, 0.7]]) {
      const c = _v.set(lx, ly, lz).applyQuaternion(o.quaternion).add(o.position);
      const oc = origin.clone().sub(c);
      const b = oc.dot(dir), cc = oc.lengthSq() - r * r, disc = b * b - cc;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t >= 0 && t <= maxDist && (best === null || t < best)) best = t;
    }
    return best;
  }

  /** X prompt: near the parked helicopter and nobody flying it. */
  canEnter() {
    const g = this.game;
    if (!this.active || this.s.pilot !== null || !g.alive || this.pilot) return false;
    return g.player.position.distanceTo(this.pos) < 4.5;
  }

  update(dt, t, holdX) {
    const g = this.game;
    // Remote pose interpolation.
    if (this.flying && !this.mine && this.buf.length) {
      const rt = clock() - INTERP;
      let a = this.buf[0], b = this.buf[this.buf.length - 1];
      for (let i = 0; i < this.buf.length - 1; i++) if (this.buf[i].t <= rt && this.buf[i + 1].t >= rt) { a = this.buf[i]; b = this.buf[i + 1]; break; }
      const k = b.t > a.t ? THREE.MathUtils.clamp((rt - a.t) / (b.t - a.t), 0, 1) : 1;
      const p = new THREE.Vector3().fromArray(a.p).lerp(new THREE.Vector3().fromArray(b.p), k);
      this._pose(p, lerpAngle(a.yaw, b.yaw, k), a.pitch + (b.pitch - a.pitch) * k, a.roll + (b.roll - a.roll) * k);
    }
    if (this.pilot) this.pilot.update(dt, t);
    this.rotor += ((this.flying ? 1 : 0) - this.rotor) * Math.min(1, dt * 0.6);
    this.vis.setRotorSpeed(this.rotor);
    // Rotor-wash dust: height of the skids above the ground (one ray, only while the rotor turns).
    if (this.vis.setGroundEffect && this.rotor > 0.05 && this.active) {
      let h = this.pilot?.altitude;
      if (h === undefined) {
        const hit = g.hitscan.castWorld(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, -1, 0), 60);
        h = hit ? Math.max(0, this.pos.y - hit.point.y) : 60;
      }
      this.vis.setGroundEffect(h);
    }
    this.vis.update(dt);
    // Rotor audio: loop positioned at the heli, pitch rises with rotor speed (and a doppler-ish nudge).
    if (this.rotor > 0.02 && this.active) {
      if (!this.loop) this.loop = g.audio.loop?.('rotor');
      if (this.loop) {
        const rel = this.pilot ? 0 : this._approachSpeed();
        this.loop.set(this.pos.clone().add(new THREE.Vector3(0, 2.5, 0)), this.rotor * (this.pilot ? 0.55 : 1), 0.6 + 0.4 * this.rotor + rel * 0.004, !!this.pilot);
      }
    } else if (this.loop) { this.loop.stop(); this.loop = null; }
    // Rockets (visual).
    for (const [key, r] of this.rockets) {
      r.age += dt;
      r.pos.addScaledVector(r.dir, 70 * dt);
      r.vis.object3D.position.copy(r.pos);
      r.vis.object3D.lookAt(r.pos.clone().sub(r.dir));
      r.vis.update(dt);
      if (r.age > 5) { g.scene.remove(r.vis.object3D); r.vis.dispose(); this.rockets.delete(key); }
    }
    // Enter: hold X for 1 s.
    let prompt = null;
    if (this.canEnter()) {
      if (holdX) {
        this.enterHold += dt;
        if (this.enterHold >= 1 && !this.enterSent) { this.enterSent = true; g.session.send({ t: 'heliEnter' }); }
        prompt = { text: 'Entering helicopter', progress: Math.min(1, this.enterHold) };
      } else { this.enterHold = 0; this.enterSent = false; prompt = { text: 'Hold X to fly the helicopter', progress: 0 }; }
    } else { this.enterHold = 0; this.enterSent = false; }
    return prompt;
  }

  _approachSpeed() {
    if (this.buf.length < 2) return 0;
    const a = this.buf[this.buf.length - 2], b = this.buf[this.buf.length - 1];
    const dtt = Math.max(0.02, b.t - a.t);
    const v = new THREE.Vector3().fromArray(b.p).sub(new THREE.Vector3().fromArray(a.p)).divideScalar(dtt);
    const toMe = this.game.camera.position.clone().sub(this.pos).normalize();
    return v.dot(toMe);
  }

  dispose() {
    this.pilot?.dispose();
    this.loop?.stop();
    for (const r of this.rockets.values()) { this.game.scene.remove(r.vis.object3D); r.vis.dispose(); }
    this.game.scene.remove(this.vis.object3D);
    this.vis.dispose();
  }
}

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
