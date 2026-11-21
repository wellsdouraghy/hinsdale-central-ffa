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
import { STREAK } from '../streaks.js';
import { ctfBases } from '../ctf.js';
import { BODY } from './nav.js';

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
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _eye = new THREE.Vector3(), _tgt = new THREE.Vector3(), _g = new THREE.Vector3();
const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _wish = new THREE.Vector3();

export class BotBrain {
  constructor(mgr, p, difficulty, role) {
    this.mgr = mgr;
    this.auth = mgr.auth;
    this.p = p;
    this.d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.role = role;                       // team modes: 'attack' | 'defend' | 'escort' (BotManager.assignRoles)
    this.roleSlot = 0; this.roleSlots = 1;  // index / size of this bot's role group (spread posts, attack lanes)
    this.viaDone = false;                   // attack lane waypoint reached this life
    this.chase = null;                      // { carrier, yes }: sticky decision to chase our flag's carrier
    this.post = null; this.postT = 0;       // defender / escort post (re-picked now and then: patrol)
    this.crate = null;                      // { cid, p, capT } care package this bot is going for (BotManager)
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
    this.jump = false;
    this.win = { t: 0, want: 0, max: 0, x: 0, y: 0, z: 0 }; this.winL = { t: 0, want: 0, max: 0, x: 0, y: 0, z: 0 };   // stuck windows
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
    this.viaDone = false; this.via = null; this.chase = null; this.post = null; this.crate = null;
    this.err.yaw = rand(-1, 1) * this.d.aimErr * DEG; this.err.pitch = rand(-1, 1) * this.d.aimErr * DEG;
    this.stuckCount = 0; this.unstuckT = 0; this.stuckRef = null; this.hopUntil = 0; this.roam = null;
    this._winReset(this.win); this._winReset(this.winL);
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
    if (auth.ctf && p.team) goal = this._ctfGoal(t);
    else if (auth.mode === 'tdm' && p.team) goal = this._tdmGoal(t);
    // Care package claimed for us by BotManager (it already weighed role, order and fights).
    if (this.crate && !(auth.ctf && auth.ctf.carrying(p))) goal = new THREE.Vector3().fromArray(this.crate.p);
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
      // (TDM "all attack" order: always push, with a tighter hint.)
      const allAttack = auth.mode === 'tdm' && this.mgr.orderOf(p.team).o === 'attack';
      if (!this.goal || this.pos.distanceTo(this.goal) < 5 || t > this.goalT) {
        let pick = null, bestScore = Infinity;
        for (const o of auth.players.values()) {
          if (!this._enemy(o) || !o.pos) continue;
          const d = Math.hypot(o.pos[0] - this.pos.x, o.pos[2] - this.pos.z);
          // (sticky: keep heading for the same player unless another is clearly nearer, or bots run back and forth
          // between two players at similar distances every few seconds)
          const score = d * (o.ai ? 1.6 : 1) * rand(0.9, 1.1) * (o.id === this.roamId ? 0.65 : 1);
          if (score < bestScore) { bestScore = score; pick = o; }
        }
        this.roamId = pick ? pick.id : null;
        // The roam plan (push toward a player's area, or wander to a central point, and the hint offset) is kept
        // until it is reached or ~10 s old: re-rolling it every few seconds sent bots back and forth across the map.
        const reached = (this.goal && this.pos.distanceTo(this.goal) < 5) || (this.path && this.pathI >= this.path.length);
        const h = this.d.hint * (allAttack ? 0.5 : 1);
        if (!this.roam || reached || t > this.roam.until) {
          const b = auth.world.playBounds;
          this.roam = {
            push: !!pick && (allAttack || Math.random() < this.d.push), until: t + rand(8, 12), ox: rand(-h, h), oz: rand(-h, h),
            wx: (b.minX + b.maxX) / 2 + rand(-90, 90), wz: (b.minZ + b.maxZ) / 2 + rand(-70, 70),
          };
        }
        const R = this.roam;
        goal = R.push && pick ? new THREE.Vector3(pick.pos[0] + R.ox, 0, pick.pos[2] + R.oz) : new THREE.Vector3(R.wx, 0, R.wz);
        if (auth.world.terrain) goal.y = auth.world.groundY(goal.x, goal.z);   // (goal distances are 3D: keep goals on the hills)
        this.goalT = t + rand(3, 5);
      } else goal = this.goal;
    }
    if (goal && (!this.goal || goal.distanceTo(this.goal) > 4 || t > this.repathT || !this.path)) {
      this.goal = goal.clone();
      this.path = this.mgr.nav.findPath(this.pos, this.goal, undefined, t);
      this.pathI = 0; this.steerI = 0; this.lookT = 0; this.blindT = 0;
      this.repathT = t + 3 + Math.random() * 2;
    }
  }

  /** Ground point (x, z) snapped to the nearest walkable nav cell, so posts / lanes are reachable. */
  _onNav(x, z) {
    const nav = this.mgr.nav;
    const i = nav.nearest(x, z, 8);
    if (i >= 0) return nav.center(i, new THREE.Vector3());
    const v = new THREE.Vector3(x, 0, z);
    if (this.auth.world.groundY) v.y = this.auth.world.groundY(x, z);
    return v;
  }

  /**
   * Defender post: this bot's own spot on a ring round `center` (slot angle, the first one facing `face`), alternating
   * rMin / rMax out, re-picked with a little jitter every 8-14 s (patrol), so defenders spread out instead of stacking.
   */
  _postAround(center, face, t, rMin = 9, rMax = 20) {
    if (this.post && this.post.kind === 'post' && t < this.postT && this.post.c.distanceTo(center) < 6) return this.post.v;
    const n = Math.max(1, this.roleSlots);
    const a0 = Math.atan2(face.z - center.z, face.x - center.x);
    const a = a0 + (this.roleSlot / n) * Math.PI * 2 + rand(-0.35, 0.35);
    const r = (this.roleSlot % 2 ? rMax : rMin) + rand(-2, 2);
    const v = this._onNav(center.x + Math.cos(a) * r, center.z + Math.sin(a) * r);
    this.post = { v, c: center.clone(), kind: 'post' };
    this.postT = t + rand(8, 14);
    return v;
  }

  /** Escort spot: a few metres off `who`, spread by slot round them. */
  _escortSpot(who, t) {
    const c = new THREE.Vector3().fromArray(who.pos);
    if (this.post && this.post.kind === who.id && t < this.postT && this.post.c.distanceTo(c) < 6) return this.post.v;
    const n = Math.max(1, this.roleSlots);
    const a = (this.roleSlot / n) * Math.PI * 2 + rand(-0.4, 0.4);
    const r = rand(4, 7);
    const v = this._onNav(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
    this.post = { v, c, kind: who.id };
    this.postT = t + rand(2, 4);
    return v;
  }

  /** Living teammate who gave the escort order (or null). */
  _escortee() {
    const by = this.mgr.orderOf(this.p.team).by;
    const o = by !== null ? this.auth.players.get(by) : null;
    return o && o.alive && o.pos && o.team === this.p.team && o !== this.p ? o : null;
  }

  /** Remembered enemy (fresh, <= 6 s) within `r` m of `c`: defenders go after intruders near the base. */
  _intruder(c, r, t) {
    let best = null, bd = r;
    for (const m of this.memory.values()) {
      if (t - m.t > 6) continue;
      const d = Math.hypot(m.pos.x - c.x, m.pos.z - c.z);
      if (d < bd) { bd = d; best = m.pos; }
    }
    return best ? best.clone() : null;
  }

  _ctfGoal(t) {
    const ctf = this.auth.ctf, p = this.p;
    const my = p.team, en = otherTeam(my);
    const ef = ctf.flags[en], of = ctf.flags[my];
    const v = (a) => new THREE.Vector3().fromArray(a);
    const base = v(ctf.bases[my]), ebase = v(ctf.bases[en]);
    const order = this.mgr.orderOf(my).o;
    const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    if (ef.carrier === p.id) return base;                                  // bring it home
    // Our flag on the ground: defenders / escorts always return it (also on DEFEND), attackers when it is close, or
    // (balanced mix) nearer than the enemy flag.
    if (of.state === 'dropped') {
      const fp = v(of.pos), d = hd(fp, this.pos);
      if (this.role !== 'attack' || d < 40 || (order !== 'attack' && d < hd(v(ef.pos), this.pos))) return fp;
    }
    // Our flag carried: defenders chase the carrier (shown on the minimap); others make one sticky decision per
    // carrier (no flip-flopping between goals every think): chase when close, or (balanced mix) much nearer to it than
    // to the enemy flag, or by chance. Anyone chases when our own carrier is stuck waiting (cannot capture).
    if (of.state === 'carried') {
      const c = this.auth.players.get(of.carrier);
      if (c?.pos) {
        if (!this.chase || this.chase.carrier !== of.carrier) {
          const dc = hd(v(c.pos), this.pos), dflag = hd(v(ef.pos), this.pos);
          this.chase = { carrier: of.carrier, yes: dc < 35 || (order === 'auto' && (dc < dflag * 0.6 || Math.random() < 0.35)) };
        }
        const stuck = ef.state === 'carried';
        if (this.role === 'defend' || stuck || (this.role !== 'escort' && this.chase.yes)) return v(c.pos);
      }
    } else this.chase = null;
    if (this.role === 'escort') {
      // Stay with our flag carrier, else with the player who gave the order, else hold round the base.
      const carrier = ef.state === 'carried' ? this.auth.players.get(ef.carrier) : null;
      const who = carrier?.alive && carrier.pos ? carrier : this._escortee();
      if (who) return this._escortSpot(who, t);
      return this._postAround(base, ebase, t);
    }
    if (this.role === 'attack') {
      if (ef.state === 'carried') {
        const c = this.auth.players.get(ef.carrier);
        return c?.pos ? this._escortSpot(c, t) : base;                    // escort our carrier home
      }
      const fp = v(ef.pos);
      // Lanes: with several attackers, the outer ones swing wide through a waypoint left / right of the straight line
      // between the bases (snapped to the nav grid) before going in, so they do not all arrive down one street.
      if (!this.viaDone && ef.state === 'home' && this.roleSlots > 1) {
        const lane = [0, -1, 1, -0.5, 0.5][this.roleSlot % 5];
        if (lane) {
          if (!this.via) {
            const mid = base.clone().lerp(fp, 0.55);
            const dir = fp.clone().sub(base).setY(0);
            const L = dir.length() || 1;
            const off = new THREE.Vector3(-dir.z / L, 0, dir.x / L).multiplyScalar(lane * Math.min(70, L * 0.3));
            const b = this.auth.world.playBounds;
            const x = THREE.MathUtils.clamp(mid.x + off.x, b.minX + 8, b.maxX - 8), z = THREE.MathUtils.clamp(mid.z + off.z, b.minZ + 8, b.maxZ - 8);
            this.via = this._onNav(x, z);
          }
          // Done when close, or once the flag is nearer than the waypoint is (we are past it).
          if (hd(this.via, this.pos) < 10 || hd(fp, this.pos) < hd(fp, this.via)) { this.viaDone = true; this.via = null; }
          else return this.via;
        } else this.viaDone = true;
      }
      return fp;
    }
    // Defend: own post round the base (spread by slot, patrols a little); go after intruders seen near the base.
    const intr = this._intruder(base, 35, t);
    if (intr) return intr;
    return this._postAround(base, ebase, t);
  }

  /** Team Deathmatch orders: DEFEND holds posts round the team's side, ESCORT follows the issuer; else roam (null). */
  _tdmGoal(t) {
    const o = this.mgr.orderOf(this.p.team).o;
    if (o === 'escort') { const who = this._escortee(); return who ? this._escortSpot(who, t) : null; }
    if (o !== 'defend' || this.visible) return null;                       // in a fight: fight as usual
    const bases = ctfBases(this.auth.world);
    const base = bases[this.p.team], ebase = bases[otherTeam(this.p.team)];
    const intr = this._intruder(base, 45, t);
    if (intr) return intr;
    return this._postAround(base, ebase, t, 10, 26);
  }

  /**
   * Care package capture (every frame): within reach, stand still and hold (capBegin, then capture after the same
   * hold time a human needs; the host validates both like a human's). Moving off or a fight resets the hold.
   * Returns true while holding (no movement).
   */
  _crateHold(t) {
    const c = this.crate;
    if (!c) return false;
    const sr = this.auth.streaks, live = sr?.crates.get(c.cid);
    if (!live || live.state !== 'landed') { this.crate = null; return false; }
    const d = Math.hypot(c.p[0] - this.pos.x, c.p[2] - this.pos.z);
    const fighting = this.visible && this.target && !this.target.heli && t >= this.reactAt;
    if (d > 2.4 || fighting) { c.capT = null; return false; }
    if (c.capT === null) { c.capT = t; sr.capBegin(this.p, c.cid); }
    const need = this.p.id === live.owner ? STREAK.ownerCapTime : STREAK.capTime;
    if (t - c.capT >= need + 0.05) { sr.capture(this.p, c.cid); this.crate = null; }
    return true;
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
    const holding = this._crateHold(t);   // capturing a care package: stand still
    if (holding) this.wantCrouch = false;
    else if (this.path && this.pathI < this.path.length) {
      this._followPath(t, dir);
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
    const onFoot = !kitBusy && !this.ctrl.grapple && !this.ctrl.mantle && !this.ctrl.ladder;

    // Local avoidance: keep off other players and off walls / poles (slide along them instead of pushing into them).
    _wish.copy(dir);                        // where the path / fight wants to go (for the stuck handling below)
    if (onFoot && !holding) this._avoid(dir);

    // Stuck handling (no progress while trying to move): hop low obstacles, back off toward open space, penalise the
    // spot for everyone and repath, and eventually pick a new goal. Never a teleport.
    if (this.unstuckT > 0) {
      this.unstuckT -= dt;
      if (onFoot) dir.copy(this.unstuckDir);
    }
    const fighting = this.visible && !this.outOfRange;
    const wantsMove = dir.lengthSq() > 0.1 && onFoot && !fighting && !holding;
    // Progress = how far we got from where each window started (net, horizontal; climbing counts): jitter against a
    // wall, bobbing on a step or turning back and forth add up to a long walk but no progress. Two windows: 0.6 s
    // (pushing against something) and 3 s (wandering about one spot: avoidance / waypoint ping-pong).
    const W = this.win, WL = this.winL, pos = this.pos;
    for (const w of [W, WL]) {
      w.t += dt; if (wantsMove) w.want += dt;
      const ex = Math.hypot(pos.x - w.x, pos.z - w.z) + Math.max(0, Math.abs(pos.y - w.y) - 0.3);
      if (ex > w.max) w.max = ex;
    }
    const P = this.path, end = P && P.length ? P[P.length - 1] : null;
    const atEnd = end && this.pathI >= P.length - 1 && Math.hypot(end.x - pos.x, end.z - pos.z) < 3.5;
    if (W.t > 0.6) {
      const want = W.want > 0.45 && wantsMove, moved = W.max;
      if (want && moved < 0.35 && atEnd && this.unstuckT <= 0) {
        this.pathI = P.length;              // nearly at a post / spot that others crowd: close enough, stand here
        this.stuckCount = 0;
      } else if (want && moved < 0.35 && this.unstuckT <= 0) {
        if (!this.stuckCount) this.stuckRef = { x: pos.x, z: pos.z, t };
        this.stuckCount++;
        this._unstick(t, _wish.lengthSq() > 0.01 ? _wish : dir);
      } else if (!want || !this.stuckRef || Math.hypot(pos.x - this.stuckRef.x, pos.z - this.stuckRef.z) > 4 || t - this.stuckRef.t > 12) this.stuckCount = 0;
      // (moving about during the back-off is not progress: only getting well away from the spot clears the count, so a spot
      // that keeps blocking us escalates to a nav penalty + repath instead of looping)
      this._winReset(W);
    }
    if (WL.t > 3) {
      if (WL.want > 2.4 && wantsMove && WL.max < 1.5 && this.unstuckT <= 0) {
        if (atEnd) this.pathI = P.length;
        else {
          // milling about one spot for 3 s: straight to the nav penalty + repath step
          if (!this.stuckCount) this.stuckRef = { x: pos.x, z: pos.z, t };
          this.stuckCount = Math.max(2, this.stuckCount + 1);
          this._unstick(t, _wish.lengthSq() > 0.01 ? _wish : dir);
        }
      }
      this._winReset(WL);
    }
    // Walking into something knee-high (a rail, a planter, a low wall, a bench) with nothing at chest height: hop it
    // straight away (the controller's mantle takes us over), instead of pushing against it until the stuck check.
    if (wantsMove && this.unstuckT <= 0 && this.ctrl.grounded && t > (this.hopT || 0) && Math.hypot(this.ctrl.velocity.x, this.ctrl.velocity.z) < 2) {
      this.hopT = t + 0.25;
      const L = Math.hypot(dir.x, dir.z);
      _f.set(dir.x / L, 0, dir.z / L);
      const hs = this.mgr.hitscan;
      _o.set(pos.x, pos.y + 0.6, pos.z);
      if (hs.castWorld(_o, _f, 0.7)) {
        _o.y = pos.y + 1.5;
        if (!hs.castWorld(_o, _f, 1.2)) { this.jump = true; this.hopUntil = t + 0.8; this.hopT = t + 0.8; }
      }
    }
    // Hopping a rail / low wall: thruster-jump near the top of the hop if the feet would still not clear it.
    if (t < (this.hopUntil || 0) && !this.ctrl.grounded && this.ctrl.velocity.y < 1.2 && this.ctrl.airJumps > 0 && (dir.x || dir.z)) {
      const L = Math.hypot(dir.x, dir.z);
      _f.set(dir.x / L, 0, dir.z / L);
      _o.set(this.pos.x, this.pos.y + 0.1, this.pos.z);
      if (this.mgr.hitscan.castWorld(_o, _f, 0.8)) { this.jump = true; this.hopUntil = 0; }
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
    const w = this.auth.world;
    if (this.ctrl.position.y < (w.terrain ? w.terrain.heightAt(this.ctrl.position.x, this.ctrl.position.z) : 0) - 20) this.ctrl.teleport(this.mgr.nav.randomPoint(), this.ctrl.yaw);

    // Weapons (bots never run dry on reserve ammo).
    for (const g of this.guns) { g.update(t, dt, false); if (g.reserve < g.stats.mag) g.reserve = g.stats.mag * 3; }
    this._melee(t);
    this._fire(t);
    p.pos = [this.pos.x, this.pos.y, this.pos.z];
    p.crouch = this.ctrl.crouching;
  }

  _winReset(w) { w.t = 0; w.want = 0; w.max = 0; w.x = this.pos.x; w.y = this.pos.y; w.z = this.pos.z; }

  /** Near the ground (where the nav grid and the clearance field apply), not on a roof / platform. */
  _nearGround() {
    const p = this.pos, w = this.auth.world;
    return p.y - (w.groundY ? w.groundY(p.x, p.z) : 0) < 0.8;
  }

  /**
   * Path following: arrive at waypoints with a small radius (no early turn into a corner), skip a waypoint once the
   * next one is in clear view (with room for the body), steer at the farthest of the next few waypoints in clear view
   * (smooth lines, still never through a corner), and repath when the current waypoint is out of view (pushed off the
   * path in a fight, slid along a wall).
   */
  _followPath(t, dir) {
    const nav = this.mgr.nav, P = this.path, pos = this.pos;
    const ground = this._nearGround();
    while (this.pathI < P.length) {
      const wp = P[this.pathI];
      const d = Math.hypot(wp.x - pos.x, wp.z - pos.z);
      const last = this.pathI === P.length - 1;
      if (d < (last ? 1.0 : 0.7)) { this.pathI++; continue; }
      if (!last && ground && d < 3 && nav.clearLine(pos, P[this.pathI + 1], BODY, 0.6)) { this.pathI++; this.lookT = 0; continue; }
      break;
    }
    if (this.pathI >= P.length) return;
    if (t >= (this.lookT || 0)) {
      this.lookT = t + 0.2;
      this.steerI = this.pathI;
      if (ground) {
        for (let j = Math.min(P.length - 1, this.pathI + 3); j > this.pathI; j--) if (nav.clearLine(pos, P[j], BODY, 0.6)) { this.steerI = j; break; }
        const wp = P[this.pathI];
        if (this.steerI === this.pathI && Math.hypot(wp.x - pos.x, wp.z - pos.z) > 1.5 && !nav.clearLine(pos, wp, 0.3, 0.6)) {
          this.blindT = (this.blindT || 0) + 0.2;
          if (this.blindT > 0.6 && t > (this.repathMinT || 0)) { this.repathT = 0; this.repathMinT = t + 1.5; this.blindT = 0; }
        } else this.blindT = 0;
      }
    }
    const sp = P[Math.min(P.length - 1, Math.max(this.steerI || 0, this.pathI))];
    _v.set(sp.x - pos.x, 0, sp.z - pos.z);
    const L = _v.length();
    if (L > 0.05) dir.copy(_v.divideScalar(L));
  }

  /**
   * Local avoidance on `dir` (magnitude kept): separation from other players (and a sidestep for one coming the other
   * way), and sliding along walls / poles / trunks instead of pushing into them (clearance field gradient).
   */
  _avoid(dir) {
    const pos = this.pos;
    const mag = Math.hypot(dir.x, dir.z);
    // Walls / poles / trunks first (clearance field gradient): drop the part of the heading that goes into them, so
    // the bot slides along. Never turned back: heading (nearly) straight at it is left alone (the path goes there,
    // the controller slides, and the stuck handling takes over if it really is blocked), so this cannot ping-pong.
    if (mag > 0.1 && this._nearGround()) {
      const nav = this.mgr.nav;
      const c = nav.clearAt(pos.x, pos.z);
      if (c < 0.7 && nav.clr.gradient(pos.x, pos.z, _g)) {
        const k = Math.min(1, (0.7 - c) / 0.3);
        const into = (dir.x * _g.x + dir.z * _g.z) / mag;          // < 0: heading toward the obstacle
        if (into < 0 && into > -0.9) {
          const tx = dir.x - _g.x * into * mag, tz = dir.z - _g.z * into * mag;
          dir.x += (tx - dir.x) * k; dir.z += (tz - dir.z) * k;
          const m = Math.hypot(dir.x, dir.z);
          if (m > 1e-4) { dir.x *= mag / m; dir.z *= mag / m; }
        }
      }
    }
    let ax = 0, az = 0;
    for (const o of this.auth.players.values()) {
      if (o === this.p || !o.alive || !o.pos || o.inHeli) continue;
      const dx = pos.x - o.pos[0], dz = pos.z - o.pos[2];
      if (Math.abs(dx) > 3 || Math.abs(dz) > 3 || Math.abs(pos.y - o.pos[1]) > 1.8) continue;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d < 1.3) { const w = (1.3 - d) / 1.3 * (mag > 0.1 ? 1.4 : 0.8); ax += dx / d * w; az += dz / d * w; }
      if (mag > 0.1) {
        // someone ahead within ~2.6 m of our line: step aside, away from their side (head-on: both keep right)
        const ahead = -(dx * dir.x + dz * dir.z) / mag;
        const lat = (dx * dir.z - dz * dir.x) / mag;
        if (ahead > 0 && ahead < 2.6 && Math.abs(lat) < 1.1) {
          const side = Math.abs(lat) < 0.15 ? 1 : -Math.sign(lat);
          const w = 0.7 * (1 - ahead / 2.6);
          ax += -dir.z / mag * side * w; az += dir.x / mag * side * w;
        }
      }
    }
    if (mag < 0.1 && Math.hypot(ax, az) < 0.15) return;
    if (!ax && !az) return;
    dir.x += ax; dir.z += az;
    const m2 = Math.hypot(dir.x, dir.z);
    const want = Math.max(mag, Math.min(0.6, Math.hypot(ax, az)));
    if (m2 > 1e-4) { dir.x *= want / m2; dir.z *= want / m2; }
  }

  /**
   * No progress while trying to move (`wish` = where we wanted to go). 1st/2nd time: hop a low obstacle (bench, kerb,
   * low wall: the controller mantles it) or back off toward the most open nearby direction. From the 2nd: the spot is
   * penalised on the nav grid for every bot (A* routes round it) and we repath. 5th: give up on this goal.
   */
  _unstick(t, wish) {
    const nav = this.mgr.nav, pos = this.pos, c = this.ctrl, n = this.stuckCount;
    const wl = Math.hypot(wish.x, wish.z) || 1;
    _f.set(wish.x / wl, 0, wish.z / wl);
    const hs = this.mgr.hitscan;
    const ray = (y, d, far) => { _o.set(pos.x, pos.y + y, pos.z); return hs.castWorld(_o, d, far); };
    const desc = this.mob.state === 'descend' && this.mob.descend;
    if (desc && !(ray(0.6, _f, 0.9) && !ray(1.5, _f, 1.2))) {
      // Coming down off a roof and this edge is walled off: try the next way down (the mobility kit's edge search).
      desc.bad.add(desc.k); desc.fails = 0;
      this.mob._pickDescend();
      if (n >= 3) this.stuckCount = 1;
      return;
    }
    if (n <= 2 && ray(0.6, _f, 0.9) && !ray(1.5, _f, 1.2)) {
      // low obstacle ahead with a clear chest line: jump (the controller's mantle takes us over it)
      this.jump = true; this.unstuckDir.copy(_f); this.unstuckT = 0.6; this.hopUntil = t + 0.8;
    } else {
      // most open direction ~1 m out: clearance there, nothing in the way at knee / chest height, not straight back
      let best = -Infinity;
      const ground = this._nearGround();
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6;
        _v.set(Math.cos(a), 0, Math.sin(a));
        const x = pos.x + _v.x, z = pos.z + _v.z;
        let s = (_v.x * _f.x + _v.z * _f.z) * 0.5 + Math.random() * 0.2;
        if (ground) s += Math.min(1.2, nav.clearAt(x, z)) * 1.5 + (nav.walkableAt(x, z) ? 0.4 : 0);
        if (ray(0.6, _v, 1.0) || ray(1.3, _v, 1.0)) s -= 3;
        if (s > best) { best = s; this.unstuckDir.copy(_v); }
      }
      this.unstuckT = 0.45 + 0.15 * Math.min(n, 3);
      if (n === 3 && c.grounded) this.jump = true;
    }
    if (n >= 2) {
      if (this._nearGround()) nav.markBad(pos.x + _f.x * 0.8, pos.z + _f.z * 0.8, 25, t);
      this.path = null; this.repathT = 0;
    }
    if (n >= 5) { this.goal = null; this.path = null; this.goalT = 0; this.stuckCount = 0; this.post = null; this.via = null; this.viaDone = true; }
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
