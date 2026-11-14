// One AI bot, simulated on the host: perception (FOV + line of sight + hearing, no wallhacks), goals (roam / hunt /
// CTF roles / TDM push), A* movement with the regular player controller, and human-like aim (reaction time, tracking
// error, recoil, bursts). Thinking is staggered at ~6 Hz; movement and aim run every frame.
import * as THREE from 'three';
import { PlayerController } from '../player.js';
import { Gun, damageAt } from '../weapons.js';
import { classOf } from '../classes.js';
import { NADE } from '../grenades.js';
import { otherTeam } from '../ctf.js';

const DEG = Math.PI / 180;

export const DIFFICULTY = {
  easy:   { reaction: 0.9, aimErr: 6.0, turn: 2.0, fov: 95, hear: 40, sight: 80, burst: [2, 4], pause: [0.6, 1.2], spreadMult: 2.0, recoil: 1.5, nade: 0.03, strafe: 0.4, push: 0.6, hint: 35, aware: 8 },
  normal: { reaction: 0.4, aimErr: 2.2, turn: 3.8, fov: 120, hear: 90, sight: 150, burst: [3, 7], pause: [0.3, 0.7], spreadMult: 0.7, recoil: 0.8, nade: 0.08, strafe: 0.75, push: 0.95, hint: 10 },
  hard:   { reaction: 0.22, aimErr: 1.4, turn: 6.5, fov: 140, hear: 120, sight: 190, burst: [5, 10], pause: [0.12, 0.35], spreadMult: 0.45, recoil: 0.5, nade: 0.14, strafe: 1, push: 0.98, hint: 6 },
};

const PREF_RANGE = { ar: 35, smg: 16, shotgun: 8, sniper: 80, pistol: 16 };
// Beyond this the bot closes distance (sprinting) instead of spraying.
const ENGAGE_RANGE = { ar: 75, smg: 45, shotgun: 22, sniper: 220, pistol: 40 };
const rand = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _eye = new THREE.Vector3(), _tgt = new THREE.Vector3();

export class BotBrain {
  constructor(mgr, p, difficulty, role) {
    this.mgr = mgr;
    this.auth = mgr.auth;
    this.p = p;
    this.d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.role = role;                       // CTF: 'attack' | 'defend'
    this.ctrl = new PlayerController(this.auth.world);
    this.guns = [];
    this.slot = 0;
    this.thinkT = Math.random() * 0.2;
    this.path = null; this.pathI = 0; this.goal = null; this.goalT = 0; this.repathT = 0;
    this.target = null;                     // player record we are fighting
    this.reactAt = 0; this.visible = false; this.lastSeenT = -99;
    this.memory = new Map();                // id -> { pos: Vector3, t }
    this.err = { yaw: 0, pitch: 0 };        // current aim offset (radians)
    this.burstLeft = 0; this.pauseUntil = 0;
    this.strafe = 1; this.strafeT = 0; this.crouchT = 0;
    this.stuckT = 0; this.lastPos = new THREE.Vector3(); this.jump = false;
    this.unstuckT = 0; this.unstuckDir = new THREE.Vector3(); this.stuckCount = 0;
    this.cid = 1;
  }

  get pos() { return this.ctrl.position; }
  get gun() { return this.guns[this.slot]; }

  onSpawn(pos, yaw) {
    this.ctrl.teleport(pos, yaw);
    const cd = classOf(this.p.cls);
    this.guns = [new Gun(cd.primary), new Gun('pistol')];
    this.slot = 0;
    this.ctrl.maxAirJumps = cd.airJumps ?? 1;
    this.path = null; this.goal = null; this.target = null; this.memory.clear();
    this.err.yaw = rand(-1, 1) * this.d.aimErr * DEG; this.err.pitch = rand(-1, 1) * this.d.aimErr * DEG;
    this.lastPos.copy(pos);
  }

  onDamaged(attacker) {
    if (!attacker?.pos || attacker === this.p) return;
    this.memory.set(attacker.id, { pos: new THREE.Vector3().fromArray(attacker.pos), t: this.auth.time() });
    if (!this.target) { this.goal = null; this.repathT = 0; }
  }

  hear(shooter, pos) {
    if (!pos || shooter === this.p || !this._enemy(shooter)) return;
    const d = Math.hypot(pos[0] - this.pos.x, pos[2] - this.pos.z);
    if (d < this.d.hear) this.memory.set(shooter.id, { pos: new THREE.Vector3().fromArray(pos), t: this.auth.time() });
  }

  _enemy(o) {
    if (!o || o === this.p || !o.alive || o.inHeli || (o.bot && !o.ai)) return false;
    return !this.auth.teamMode || o.team !== this.p.team;
  }

  _eyeOf(o, out) { return out.set(o.pos[0], o.pos[1] + (o.crouch ? 1.05 : 1.6), o.pos[2]); }

  // ---------------- thinking (~6 Hz) ----------------
  think(t) {
    const p = this.p, auth = this.auth;
    const eye = this.ctrl.getEye(_eye);
    // Perception.
    let best = null, bestD = Infinity, bestDist = Infinity;
    const fwdYaw = this.ctrl.yaw;
    for (const o of auth.players.values()) {
      if (!this._enemy(o) || !o.pos) continue;
      const dx = o.pos[0] - eye.x, dz = o.pos[2] - eye.z;
      const d = Math.hypot(dx, dz);
      if (d > this.d.sight) continue;
      const ang = Math.atan2(-dx, -dz);
      let da = ang - fwdYaw; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      // Peripheral awareness (footsteps) up to ~22 m (Easy: 8 m); otherwise the view cone or a fresh memory.
      const inFov = Math.abs(da) < (this.d.fov / 2) * DEG || d < (this.d.aware ?? 22) || this.memory.has(o.id);
      if (!inFov) continue;
      const chest = this._eyeOf(o, _tgt);
      chest.y -= 0.4;
      _v.subVectors(chest, eye);
      const len = _v.length();
      if (this.mgr.hitscan.castWorld(eye, _v.normalize(), len - 0.3)) continue; // no wallhacks
      this.memory.set(o.id, { pos: new THREE.Vector3().fromArray(o.pos), t });
      // Stick with the current target (switching restarts the reaction delay); humans are slightly preferred.
      const score = d * (o === this.target ? 0.5 : 1) * (o.ai ? 1.15 : 1);
      if (score < bestD) { best = o; bestD = score; bestDist = d; }
    }
    if (best && best !== this.target) this.reactAt = t + this.d.reaction * rand(0.75, 1.3);
    if (best) { this.target = best; this.visible = true; this.lastSeenT = t; }
    else {
      this.visible = false;
      if (this.target && (t - this.lastSeenT > 3 || !this.target.alive)) this.target = null;
    }
    for (const [id, m] of this.memory) if (t - m.t > 10 || !auth.players.get(id)?.alive) this.memory.delete(id);

    // Goal selection.
    this._chooseGoal(t);

    // Reload / weapon housekeeping.
    const g = this.gun;
    if (!this.visible && g.ammo < g.stats.mag * 0.4 && g.reserve > 0 && !g.reloading) g.startReload(t);
    if (!this.visible && this.slot === 1 && !this.guns[0].reloading) this.slot = 0;
    if (this.visible && this.slot === 0 && g.ammo === 0 && bd < 15) { g.cancelReload?.(); this.slot = 1; }

    // Frag at a visible enemy at mid range now and then.
    const bd = bestDist;
    if (this.visible && p.frags > 0 && bd > 8 && bd < 26 && Math.random() < this.d.nade) this._throw(best, bd);

    // Crouch / strafe rhythm in fights.
    if (this.visible && t > this.strafeT) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = t + rand(0.5, 1.4); }
    if (this.visible && t > this.crouchT) { this.wantCrouch = Math.random() < 0.25 * this.d.strafe; this.crouchT = t + rand(1, 3); }
    if (!this.visible) this.wantCrouch = false;
  }

  _chooseGoal(t) {
    const auth = this.auth, p = this.p;
    let goal = null;
    if (auth.ctf && p.team) goal = this._ctfGoal();
    if (!goal && this.target && this.visible) {
      const pref = PREF_RANGE[this.gun.id] || 20;
      const tp = new THREE.Vector3().fromArray(this.target.pos);
      const d = tp.distanceTo(this.pos);
      if (d > pref + 8 || d > (ENGAGE_RANGE[this.gun.id] || 60)) goal = tp;          // close in
    }
    if (!goal && !this.visible) {
      // Hunt the freshest memory (gunfire, damage, last sighting).
      let m = null;
      for (const mm of this.memory.values()) if (!m || mm.t > m.t) m = mm;
      if (m) goal = m.pos.clone();
    }
    if (!goal) {
      // Roam: push toward a coarse "hint" of the nearest enemy's area (never an exact position through walls),
      // preferring human players so they see action; otherwise a contested central point.
      if (!this.goal || this.pos.distanceTo(this.goal) < 5 || t > this.goalT) {
        let pick = null, bestScore = Infinity;
        for (const o of auth.players.values()) {
          if (!this._enemy(o) || !o.pos) continue;
          const d = Math.hypot(o.pos[0] - this.pos.x, o.pos[2] - this.pos.z);
          const score = d * (o.ai ? 1.6 : 1) * rand(0.8, 1.2);
          if (score < bestScore) { bestScore = score; pick = o; }
        }
        if (pick && Math.random() < this.d.push) {
          const h = this.d.hint;
          goal = new THREE.Vector3(pick.pos[0] + rand(-h, h), 0, pick.pos[2] + rand(-h, h));
        } else {
          const b = auth.world.playBounds;
          const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
          goal = new THREE.Vector3(cx + rand(-90, 90), 0, cz + rand(-70, 70));
        }
        this.goalT = t + rand(3, 5);
      } else goal = this.goal;
    }
    if (goal && (!this.goal || goal.distanceTo(this.goal) > 4 || t > this.repathT || !this.path)) {
      this.goal = goal.clone();
      this.path = this.mgr.nav.findPath(this.pos, this.goal);
      this.pathI = 0;
      this.repathT = t + 3 + Math.random() * 2;
    }
  }

  _ctfGoal() {
    const ctf = this.auth.ctf, p = this.p;
    const my = p.team, en = otherTeam(my);
    const ef = ctf.flags[en], of = ctf.flags[my];
    const v = (a) => new THREE.Vector3().fromArray(a);
    if (ef.carrier === p.id) return v(ctf.bases[my]);                      // bring it home
    if (of.state === 'dropped') return v(of.pos);                          // return our flag
    if (of.state === 'carried' && (this.role === 'defend' || Math.random() < 0.5)) {
      const c = this.auth.players.get(of.carrier);
      if (c?.pos) return v(c.pos);                                         // chase the carrier (shown on the minimap)
    }
    if (this.role === 'attack') {
      if (ef.state === 'carried') {
        const c = this.auth.players.get(ef.carrier);
        return c?.pos ? v(c.pos).add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6))) : v(ctf.bases[my]);
      }
      return v(ef.pos);
    }
    // Defend: loiter around our base.
    if (!this.goal || this.goal.distanceTo(v(ctf.bases[my])) > 30 || this.pos.distanceTo(this.goal) < 3) {
      const a = Math.random() * Math.PI * 2, r = rand(8, 22);
      return v(ctf.bases[my]).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    return this.goal;
  }

  _throw(target, dist) {
    const p = this.p;
    const eye = this.ctrl.getEye(new THREE.Vector3());
    const dx = target.pos[0] - eye.x, dz = target.pos[2] - eye.z;
    const h = Math.hypot(dx, dz);
    const theta = 35 * DEG;
    const speed = Math.min(NADE.throwSpeed, Math.sqrt((dist * NADE.gravity) / Math.sin(2 * theta)) * 0.8);
    const v = [dx / h * Math.cos(theta) * speed, Math.sin(theta) * speed, dz / h * Math.cos(theta) * speed];
    this.auth.handleThrow(p, { t: 'nade', cid: this.cid++, kind: 'frag', o: [eye.x, eye.y, eye.z], v, fuse: NADE.fuse - 0.6 });
  }

  // ---------------- every frame ----------------
  update(dt, t) {
    const p = this.p;
    if (!p.alive) return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.15 + Math.random() * 0.05; this.think(t); }

    // Desired movement direction (world space).
    const dir = _w.set(0, 0, 0);
    let sprint = false;
    if (this.path && this.pathI < this.path.length) {
      const wp = this.path[this.pathI];
      _v.set(wp.x - this.pos.x, 0, wp.z - this.pos.z);
      if (_v.length() < 1.2) this.pathI++;
      else dir.copy(_v.normalize());
      sprint = !this.visible && this.pathI < this.path.length - 1;
    }
    if (this.visible && this.target) {
      // Fight: strafe around the preferred range instead of walking straight.
      const tp = _v.fromArray(this.target.pos);
      const to = tp.sub(this.pos).setY(0);
      const d = to.length();
      to.normalize();
      const pref = PREF_RANGE[this.gun.id] || 20;
      const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.strafe * this.d.strafe);
      const carrying = this.auth.ctf && this.auth.ctf.carrying(p);
      this.outOfRange = d > (ENGAGE_RANGE[this.gun.id] || 60);
      if (this.outOfRange) {
        if (dir.lengthSq() < 0.01) dir.copy(to);
        sprint = true;                      // close the gap fast, no strafing
      } else if (!carrying) {
        dir.multiplyScalar(d > pref + 8 ? 1 : 0.2).add(side);
        if (d < pref - 6) dir.addScaledVector(to, -0.8);
      }
    }
    // Stuck handling: hop, sidestep, skip the waypoint, and eventually pick a new goal.
    this.stuckT += dt;
    if (this.unstuckT > 0) {
      this.unstuckT -= dt;
      dir.copy(this.unstuckDir);
    }
    if (this.stuckT > 0.9) {
      const moved = this.lastPos.distanceTo(this.pos);
      const wantsMove = dir.lengthSq() > 0.1 && !this.visible;
      if (wantsMove && moved < 0.7) {
        this.stuckCount = (this.stuckCount || 0) + 1;
        this.jump = true;
        const a = Math.random() * Math.PI * 2;
        this.unstuckDir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        this.unstuckT = 0.7;
        if (this.stuckCount >= 2 && this.path) this.pathI = Math.min(this.path.length, this.pathI + 1);
        if (this.stuckCount >= 4) { this.goal = null; this.path = null; this.goalT = 0; this.stuckCount = 0; }
      } else this.stuckCount = 0;
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
    }

    // Get out from under a low-flying helicopter (rotor wash = death).
    const hh = this.auth.heli?.h;
    if (hh && hh.state === 'flying') {
      const ax = this.pos.x - hh.pos[0], az = this.pos.z - hh.pos[2];
      const hd = Math.hypot(ax, az);
      if (hd < 8 && hh.pos[1] - this.pos.y < 6) { dir.set(ax / (hd || 1), 0, az / (hd || 1)); sprint = true; }
    }

    // Aim: desired view toward the target (with error), otherwise toward travel direction.
    let wantYaw = this.ctrl.yaw, wantPitch = 0;
    if (this.target && (this.visible || t - this.lastSeenT < 1.5)) {
      const eye = this.ctrl.getEye(_eye);
      const head = this._eyeOf(this.target, _tgt);
      head.y -= 0.35; // aim center mass
      _v.subVectors(head, eye);
      wantYaw = Math.atan2(-_v.x, -_v.z) + this.err.yaw;
      wantPitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z)) + this.err.pitch;
    } else if (dir.lengthSq() > 0.01) wantYaw = Math.atan2(-dir.x, -dir.z);
    let dy = wantYaw - this.ctrl.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    const turn = this.d.turn * dt;
    this.ctrl.yaw += THREE.MathUtils.clamp(dy, -turn, turn);
    this.ctrl.pitch += THREE.MathUtils.clamp(wantPitch - this.ctrl.pitch, -turn, turn);
    // Tracking error settles while the target is held; recoil kicks it back up.
    const settle = Math.exp(-dt * (this.visible ? 1.8 : 0.5));
    this.err.yaw = this.err.yaw * settle + (Math.random() - 0.5) * this.d.aimErr * DEG * 0.08;
    this.err.pitch = this.err.pitch * settle + (Math.random() - 0.5) * this.d.aimErr * DEG * 0.08;

    // Local-space input for the shared player controller.
    const sy = Math.sin(this.ctrl.yaw), cy = Math.cos(this.ctrl.yaw);
    const fwd = -dir.x * sy - dir.z * cy;
    const right = dir.x * cy - dir.z * sy;
    const input = { forward: THREE.MathUtils.clamp(fwd, -1, 1), strafe: THREE.MathUtils.clamp(right, -1, 1), jump: this.jump, crouchToggle: false, sprint };
    this.jump = false;
    if (!!this.wantCrouch !== this.ctrl.crouching) input.crouchToggle = true;
    const cd = classOf(p.cls);
    const engaging = this.visible && !this.outOfRange;
    this.ctrl.update(dt, input, { ads: engaging ? 0.6 : 0, moveMult: this.gun.stats.moveMult * (cd.speedMult ?? 1), blockSprint: engaging });
    this.ctrl.events.length = 0;
    if (this.ctrl.position.y < -20) this.ctrl.teleport(this.mgr.nav.randomPoint(), this.ctrl.yaw);

    // Weapons (bots never run dry on reserve ammo).
    for (const g of this.guns) { g.update(t, dt, false); if (g.reserve < g.stats.mag) g.reserve = g.stats.mag * 3; }
    this._fire(t);
    p.pos = [this.pos.x, this.pos.y, this.pos.z];
    p.crouch = this.ctrl.crouching;
  }

  _fire(t) {
    const g = this.gun, st = g.stats;
    if (!this.visible || !this.target || t < this.reactAt || t < this.pauseUntil) return;
    if (g.ammo <= 0) { if (!g.reloading) g.startReload(t); return; }
    if (!g.ready(t)) return;
    // Only pull the trigger when roughly on target.
    const eye = this.ctrl.getEye(_eye);
    const tp = this._eyeOf(this.target, _tgt);
    tp.y -= 0.35;
    _v.subVectors(tp, eye);
    const dist = _v.length();
    const wantYaw = Math.atan2(-_v.x, -_v.z), wantPitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    let dy = wantYaw - this.ctrl.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    if (Math.abs(dy) > 8 * DEG || Math.abs(wantPitch - this.ctrl.pitch) > 8 * DEG) return;
    if (dist > Math.min(st.maxRange, ENGAGE_RANGE[g.id] || 60)) return;
    if (this.burstLeft <= 0) this.burstLeft = Math.round(rand(...this.d.burst)) * (st.mode === 'auto' ? 1 : 0.4) + 1;
    g.consume(t);
    this.burstLeft--;
    if (this.burstLeft <= 0) this.pauseUntil = t + rand(...this.d.pause) + (st.mode === 'bolt' ? 0.6 : 0);
    this.err.pitch += st.recoil.pitch * DEG * this.d.recoil * 0.6;
    this.err.yaw += (Math.random() - 0.5) * st.recoil.yaw * DEG * this.d.recoil;
    this.mgr.botShot(this, g, eye, t);
  }
}
