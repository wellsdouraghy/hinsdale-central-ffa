// One AI bot, simulated on the host: perception (FOV + line of sight + hearing, no wallhacks), goals (roam / hunt /
// CTF roles / TDM push), A* movement with the regular player controller, and human-like aim (reaction time, tracking
// error, recoil, bursts). Thinking is staggered at ~6 Hz; movement and aim run every frame.
import * as THREE from 'three';
import { PlayerController } from '../player.js';
import { Gun, damageAt } from '../weapons.js';
import { classOf } from '../classes.js';
import { NADE } from '../grenades.js';
import { otherTeam } from '../ctf.js';
import { BotPilot } from './botPilot.js';
import { BotMobility } from './botMobility.js';
import { HELI } from '../heli.js';

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
    this.pilot = null;                      // BotPilot while flying the helicopter
    this.heliRolls = new Set();             // heli generations this bot already rolled for
    this.heliGoal = false;                  // walking to a parked helicopter it found
    this.seen = 0;                          // enemies in sight within 50 m (last think)
    this.mob = new BotMobility(this);       // grapple / dash / double jump / roofs
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
    this.pilot = null; this.heliGoal = false;
    this.err.yaw = rand(-1, 1) * this.d.aimErr * DEG; this.err.pitch = rand(-1, 1) * this.d.aimErr * DEG;
    this.lastPos.copy(pos);
    this.stuckCount = 0;
    this.mob.onSpawn(this.auth.time());
  }

  onDamaged(attacker) {
    if (!attacker?.pos || attacker === this.p) return;
    if (attacker.inHeli) this.heliHurtT = this.auth.time();
    this.mob.onHurt(this.auth.time());
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
    let seen = 0;
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
      if (this.mgr.hitscan.castWorld(eye, _v.normalize(), len - 0.3, { bullets: true })) continue; // no wallhacks (fences are see-through)
      this.memory.set(o.id, { pos: new THREE.Vector3().fromArray(o.pos), t });
      if (d < 50) seen++;
      // Stick with the current target (switching restarts the reaction delay); humans are slightly preferred.
      const score = d * (o === this.target ? 0.5 : 1) * (o.ai ? 1.15 : 1);
      if (score < bestD) { best = o; bestD = score; bestDist = d; }
    }
    // An enemy helicopter: engage it when it is the closest threat we can see.
    const ht = this._heliThreat(t, eye, fwdYaw);
    if (ht && ht.visible && (!best || ht.dist < bestDist * 1.1)) { best = this.heliTgt; bestDist = ht.dist; }
    if (best && best !== this.target) this.reactAt = t + this.d.reaction * rand(0.75, 1.3);
    if (best) { this.target = best; this.visible = true; this.lastSeenT = t; }
    else {
      this.visible = false;
      if (this.target && (t - this.lastSeenT > 3 || !this.target.alive)) this.target = null;
    }
    for (const [id, m] of this.memory) if (t - m.t > 10 || !auth.players.get(id)?.alive) this.memory.delete(id);

    this.seen = seen;
    // Goal selection.
    this._chooseGoal(t);
    // Movement kit: grapple / dash decisions, roof perch and descent.
    this.mob.think(t);

    // Reload / weapon housekeeping.
    const bd = bestDist;
    const g = this.gun;
    if (!this.visible && g.ammo < g.stats.mag * 0.4 && g.reserve > 0 && !g.reloading) g.startReload(t);
    if (!this.visible && this.slot === 1 && !this.guns[0].reloading) this.slot = 0;
    if (this.visible && this.slot === 0 && g.ammo === 0 && bd < 15) { g.cancelReload?.(); this.slot = 1; }

    // Frag at a visible enemy at mid range now and then.
    const fragOk = !best?.heli || (ht && ht.alt < 6);   // frags only at a helicopter that is low / landed
    if (this.visible && fragOk && p.frags > 0 && bd > 8 && bd < 26 && Math.random() < this.d.nade * (best?.heli ? 3 : 1)) this._throw(best, bd);

    // Crouch / strafe rhythm in fights.
    if (this.visible && t > this.strafeT) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = t + rand(0.5, 1.4); }
    if (this.visible && t > this.crouchT) { this.wantCrouch = Math.random() < 0.25 * this.d.strafe; this.crouchT = t + rand(1, 3); }
    if (!this.visible) this.wantCrouch = false;

    this._noticeHeli(t, eye);

    // Airstrike reward: after a short beat, bomb the densest cluster of enemies this bot knows about.
    if (p.items.includes('airstrike')) {
      if (this.strikeAt === undefined) this.strikeAt = t + rand(1.5, 4);
      if (t >= this.strikeAt && this._callStrike(t)) this.strikeAt = undefined;
    }
  }

  /**
   * Enemy helicopter awareness (no wallhacks): heard within ~150 m (it is loud), seen with line of sight inside the view
   * cone at long range. Keeps `this.heliTgt` (a pseudo target aimed at the hull center, led by its velocity) current and
   * decides when to break line of sight (it is attacking us). Returns { dist, visible, alt } or null.
   */
  _heliThreat(t, eye, fwdYaw) {
    const hr = this.auth.heli, h = hr?.h;
    if (!h || h.state !== 'flying' || h.pilot === null || h.pilot === this.p.id) { if (this.heliTgt) this.heliTgt.alive = false; return null; }
    const pilot = this.auth.players.get(h.pilot);
    if (!pilot || (this.auth.teamMode && pilot.team === this.p.team)) { if (this.heliTgt) this.heliTgt.alive = false; return null; }
    const c = new THREE.Vector3(h.pos[0], h.pos[1] + 1.6, h.pos[2]);
    const dist = c.distanceTo(eye);
    if (dist < 150) this.heliHeardT = t;
    const heard = t - (this.heliHeardT ?? -99) < 2;
    let da = Math.atan2(-(c.x - eye.x), -(c.z - eye.z)) - fwdYaw; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const inView = (Math.abs(da) < (this.d.fov / 2) * DEG || heard) && dist < this.d.sight * 1.6;
    let visible = false;
    if (inView) {
      _v.subVectors(c, eye);
      const len = _v.length();
      const hit = this.mgr.hitscan.castWorld(eye, _v.normalize(), len, { bullets: true });
      visible = !hit || hit.distance > len - 3;
    }
    // Aim point: hull center, led by the helicopter's velocity (state latency + reaction).
    const v = h.v || [0, 0, 0];
    const lead = 0.12 + dist / 900;
    const tg = this.heliTgt || (this.heliTgt = { id: 'heli', heli: true, pos: [0, 0, 0], crouch: false, alive: true, ai: false });
    tg.alive = true;
    tg.pos[0] = c.x + v[0] * lead; tg.pos[1] = c.y - 1.25 + v[1] * lead; tg.pos[2] = c.z + v[2] * lead;
    const ground = this.auth.world.groundY ? this.auth.world.groundY(h.pos[0], h.pos[2]) : 0;
    const alt = h.pos[1] - ground;
    // Take cover when it is coming for us: recently hurt by it, or close with its nose on us.
    if (visible) {
      const toMe = Math.atan2(-(eye.x - c.x), -(eye.z - c.z));
      let nose = toMe - h.yaw; while (nose > Math.PI) nose -= 2 * Math.PI; while (nose < -Math.PI) nose += 2 * Math.PI;
      const attacking = t - (this.heliHurtT ?? -99) < 2.5 || (dist < 90 && Math.abs(nose) < 20 * DEG);
      if (attacking && t > (this.coverUntil ?? 0) + 2.5 && Math.random() < 0.5 * this.d.strafe) this._seekCover(c, t);
    }
    return { dist, visible, alt };
  }

  /** Nearby spot (6-14 m) with no line of sight from `threat`; walk there and hide for a moment. */
  _seekCover(threat, t) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = rand(6, 14);
      const q = new THREE.Vector3(this.pos.x + Math.cos(a) * r, this.pos.y + 1.2, this.pos.z + Math.sin(a) * r);
      if (this.auth.world.groundY) q.y = this.auth.world.groundY(q.x, q.z) + 1.2;
      _v.subVectors(q, threat);
      const len = _v.length();
      if (!this.mgr.hitscan.castWorld(threat, _v.normalize(), len - 0.5)) continue;   // still exposed
      const d = q.distanceTo(this.pos);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (!best) return;
    best.y -= 1.2;
    this.coverGoal = best;
    this.coverUntil = t + rand(2.5, 4.5);
    this.goal = null; this.repathT = 0;
  }

  /** Chance (by difficulty) to go for the parked helicopter: only once per helicopter, only within ~30 m with line
   *  of sight (bots never know where it is parked; they have to stumble on it). */
  _noticeHeli(t, eye) {
    const hr = this.auth.heli, h = hr?.h;
    if (!h || h.state !== 'parked' || h.pilot !== null) { this.heliGoal = false; return; }
    if (this.heliGoal || this.heliRolls.has(h.gen)) return;
    if (this.auth.ctf && this.auth.ctf.carrying(this.p)) return;
    const c = _tgt.set(h.pos[0], h.pos[1] + 1.6, h.pos[2]);
    if (c.distanceTo(eye) > 30) return;
    _v.subVectors(c, eye);
    const len = _v.length();
    const blocker = this.mgr.hitscan.castWorld(eye, _v.normalize(), len);
    if (blocker && blocker.distance < len - 4) return;   // something other than the helicopter itself is in the way
    this.heliRolls.add(h.gen);
    const chance = { easy: 0.25, normal: 0.5, hard: 0.8 }[this.mgr.difficulty] ?? 0.5;
    if (Math.random() < chance) { this.heliGoal = true; this.goal = null; this.repathT = 0; }
  }

  /** Walking to the parked helicopter: climb in once in range (same host rules as a human). */
  _tryEnterHeli() {
    const hr = this.auth.heli, h = hr?.h;
    if (!h || h.state !== 'parked' || h.pilot !== null) { this.heliGoal = false; return false; }
    const d = Math.hypot(h.pos[0] - this.pos.x, h.pos[1] - this.pos.y, h.pos[2] - this.pos.z);
    if (d > HELI.enterRange) return false;
    hr.handle(this.p, { t: 'heliEnter' });
    this.heliGoal = false;
    if (h.pilot === this.p.id) {
      this.ctrl.grapple = null; this.mob.reset(this.auth.time());
      this.pilot = new BotPilot(this); this.path = null; return true;
    }
    return false;
  }

  /** Picks a target from what this bot has seen / heard recently (no wallhacks). Returns true if called. */
  _callStrike(t) {
    const me = this.pos;
    const ffa = !this.auth.teamMode;
    const pts = [...this.memory.values()].filter((m) => t - m.t < 8).map((m) => m.pos)
      .filter((q) => !ffa || Math.hypot(q.x - me.x, q.z - me.z) > 22);   // FFA: keep clear of our own bombs
    if (!pts.length) return false;
    let best = null, bestN = 0;
    for (const a of pts) {
      const near = pts.filter((q) => Math.hypot(q.x - a.x, q.z - a.z) < 20);
      if (near.length > bestN) { bestN = near.length; best = near; }
    }
    const x = best.reduce((s, q) => s + q.x, 0) / best.length;
    const z = best.reduce((s, q) => s + q.z, 0) / best.length;
    // Fly the run from the bot toward the target (so the carpet stretches away from it).
    const dx = x - me.x, dz = z - me.z;
    const h = Math.hypot(dx, dz) > 5 ? Math.atan2(dx, -dz) : Math.random() * Math.PI * 2;
    return this.auth.streaks.useStrike(this.p, { x, z, h });
  }

  _chooseGoal(t) {
    const auth = this.auth, p = this.p;
    let goal = null;
    if (auth.ctf && p.team) goal = this._ctfGoal();
    if (this.coverGoal && t < this.coverUntil) goal = this.coverGoal;
    else this.coverGoal = null;
    if (!goal && this.heliGoal && !this.visible && this.auth.heli?.h) goal = new THREE.Vector3().fromArray(this.auth.heli.h.pos);
    if (!goal && this.target && this.visible && !this.target.heli) {
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
    if (this.auth.finishers?.has(p.id)) { this.ctrl.grapple = null; return; }   // playing a melee finisher: frozen (the host places us after it)
    if (this.pilot) {
      if (this.pilot.update(dt, t)) return;
      this.pilot = null;
    }
    if (this.heliGoal && this._tryEnterHeli()) return;
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
    if (this.visible && this.target && !this.target.heli) {
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
    // Movement kit state (aiming / riding the grapple, fling air control, perched on a roof, walking off it).
    const mv = this.mob.steer(dt, t, dir);
    if (mv.sprint !== undefined) sprint = mv.sprint;
    const kitBusy = this.mob.state !== 'idle' && this.mob.state !== 'descend';

    // Stuck handling: hop, sidestep, skip the waypoint, and eventually pick a new goal.
    this.stuckT += dt;
    if (this.unstuckT > 0) {
      this.unstuckT -= dt;
      dir.copy(this.unstuckDir);
    }
    if (this.stuckT > 0.9) {
      const moved = this.lastPos.distanceTo(this.pos);
      const wantsMove = dir.lengthSq() > 0.1 && !this.visible && !kitBusy && !this.ctrl.grapple;
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
    const aimTarget = this.target && (this.visible || t - this.lastSeenT < 1.5);
    if (mv.look && (mv.lookForce || !aimTarget)) {
      wantYaw = mv.look.yaw; wantPitch = mv.look.pitch;
    } else if (aimTarget) {
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
    const input = { forward: THREE.MathUtils.clamp(fwd, -1, 1), strafe: THREE.MathUtils.clamp(right, -1, 1), jump: this.jump || mv.jump, crouchToggle: false, sprint };
    this.jump = false;
    // (No crouching while aiming / riding the grapple / in the air: it would block the mantle onto a ledge.)
    const wantCrouch = !!this.wantCrouch && (!kitBusy || this.mob.state === 'perch') && !this.ctrl.grapple;
    if (wantCrouch !== this.ctrl.crouching && !this.ctrl.sliding) input.crouchToggle = true;
    const cd = classOf(p.cls);
    const engaging = this.visible && !this.outOfRange;
    this.ctrl.update(dt, input, { ads: engaging ? 0.6 : 0, moveMult: this.gun.stats.moveMult * (cd.speedMult ?? 1), blockSprint: engaging });
    // What other players see (stance, scoped kill cam): sights up while engaging; a scoped rifle goes fully onto
    // the scope at range. Display only: movement and accuracy keep using the 0.6 above.
    const gs = this.gun.stats, tp = engaging && this.target?.pos;
    const far = tp && gs.scope && Math.hypot(tp[0] - this.ctrl.position.x, tp[2] - this.ctrl.position.z) > 14;
    const busy = this.ctrl.grapple || this.ctrl.mantle || this.ctrl.ladder || this.ctrl.sprinting;
    if (engaging && !busy) { this.adsWant = far ? 1 : 0.6; this.adsHold = t + 0.6; }       // stays on the sights a beat after the shot
    else if (busy || t > (this.adsHold || 0)) this.adsWant = 0;
    this.adsVis = (this.adsVis || 0) + THREE.MathUtils.clamp((this.adsWant || 0) - (this.adsVis || 0), -dt / 0.2, dt / (gs.adsTime || 0.25));
    this.mob.afterMove(t, this.ctrl.events);
    this.ctrl.events.length = 0;
    if (this.ctrl.position.y < -20) this.ctrl.teleport(this.mgr.nav.randomPoint(), this.ctrl.yaw);

    // Weapons (bots never run dry on reserve ammo).
    for (const g of this.guns) { g.update(t, dt, false); if (g.reserve < g.stats.mag) g.reserve = g.stats.mag * 3; }
    this._melee(t);
    this._fire(t);
    p.pos = [this.pos.x, this.pos.y, this.pos.z];
    p.crouch = this.ctrl.crouching;
  }

  /** Point-blank: knife them (always a one-hit kill, plays a finisher). */
  _melee(t) {
    const tg = this.target;
    if (!this.visible || !tg || tg.heli || t < this.reactAt || t < (this.meleeAt || 0)) return;
    const d = Math.hypot(tg.pos[0] - this.pos.x, tg.pos[2] - this.pos.z);
    if (d > 1.9 || Math.abs(tg.pos[1] - this.pos.y) > 1.2) return;
    this.meleeAt = t + 1.1;
    if (Math.random() < 0.55 + 0.35 * this.d.strafe) this.mgr.botMelee(this, tg);
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
    if (dist > (this.target.heli ? st.maxRange : Math.min(st.maxRange, ENGAGE_RANGE[g.id] || 60))) return;
    if (this.burstLeft <= 0) this.burstLeft = Math.round(rand(...this.d.burst)) * (st.mode === 'auto' ? 1 : 0.4) + 1;
    g.consume(t);
    this.burstLeft--;
    if (this.burstLeft <= 0) this.pauseUntil = t + rand(...this.d.pause) + (st.mode === 'bolt' ? 0.6 : 0);
    this.err.pitch += st.recoil.pitch * DEG * this.d.recoil * 0.6;
    this.err.yaw += (Math.random() - 0.5) * st.recoil.yaw * DEG * this.d.recoil;
    if (this.target.heli) this.mgr.botShotHeli(this, g, eye, t);
    else this.mgr.botShot(this, g, eye, t);
  }
}
