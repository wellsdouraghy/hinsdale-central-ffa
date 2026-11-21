// Host-side AI bots: creation/removal, per-frame brains, host-authoritative bot gunfire, and 20 Hz state output so
// every client renders bots like any other remote player (kill cams, killfeed, scoreboard all just work).
import * as THREE from 'three';
import { BotBrain } from './botBrain.js';
import { navFor } from './nav.js';
import { perchesFor } from './perches.js';
import { createHitscan } from '../hitscan.js';
import { damageAt } from '../weapons.js';
import { CLASS_IDS } from '../classes.js';
import { ctfBases, otherTeam, TEAMS } from '../ctf.js';

/** Team orders a player can give their team's bots (team modes). 'auto' = the balanced default mix. */
export const ORDERS = ['auto', 'attack', 'defend', 'escort'];
export const ORDER_NAMES = { auto: 'Balanced', attack: 'All attack', defend: 'All defend', escort: 'Escort me' };
const CRATE_RANGE = 90;        // bots consider landed care packages within this distance (m)
const CRATE_PER_TEAM = 2;      // at most this many bots per team (FFA: in total) go for the same package

const NAMES = ['Jenkins', 'Marlow', 'Okafor', 'Reyes', 'Petrov', 'Lindqvist', 'Tanaka', 'Brooks', 'Haddad', 'Novak', 'Quinn', 'Ferreira', 'Kowalski', 'Mbeki'];
const DEG = Math.PI / 180;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

export class BotManager {
  constructor(auth) {
    this.auth = auth;
    this.brains = new Map();
    this.nextId = 200;
    this.difficulty = 'normal';
    this.stTimer = 0;
    this._nav = null;
    this._hitscan = null;
    this.names = NAMES.slice().sort(() => Math.random() - 0.5);
    this.orders = { red: { o: 'auto', by: null }, blue: { o: 'auto', by: null } };
    this.crateT = 0;
  }

  /** A team order from player `by` (host-validated in Authority): re-plans that team's bots right away. */
  setOrder(team, o, by) {
    if (!TEAMS.includes(team) || !ORDERS.includes(o)) return false;
    this.orders[team] = { o, by: o === 'auto' ? null : by };
    this.assignRoles();
    for (const b of this.brains.values()) if (b instanceof BotBrain && b.p.team === team) { b.goal = null; b.path = null; b.repathT = 0; b.viaDone = false; b.via = null; b.chase = null; b.post = null; }
    return true;
  }

  orderOf(team) { return this.orders[team] || { o: 'auto', by: null }; }

  /**
   * Roles per team from the team order: auto = attackers first, then alternating (ceil(n/2) attack), attack / defend /
   * escort = everyone. Each bot also gets its slot within its role group (defenders spread round the base, attackers
   * take different lanes), so they never stack on one spot.
   */
  assignRoles() {
    if (!this.auth.teamMode) return;
    for (const team of TEAMS) {
      const bots = [...this.brains.values()].filter((b) => b instanceof BotBrain && b.p.team === team).sort((a, b) => a.p.id - b.p.id);
      const o = this.orderOf(team).o;
      const nAtt = o === 'attack' ? bots.length : o === 'defend' || o === 'escort' ? 0 : Math.ceil(bots.length / 2);
      const groups = {};
      bots.forEach((b, i) => {
        b.role = o === 'escort' ? 'escort' : i < nAtt ? 'attack' : 'defend';
        (groups[b.role] ||= []).push(b);
      });
      for (const g of Object.values(groups)) g.forEach((b, i) => { if (b.roleSlot !== i || b.roleSlots !== g.length) b.post = null; b.roleSlot = i; b.roleSlots = g.length; });
    }
  }

  get nav() { return this._nav || (this._nav = navFor(this.auth.world)); }
  get hitscan() { return this._hitscan || (this._hitscan = createHitscan(this.auth.world)); }
  /** Roof / elevated perch map (built a slice per frame while bots are in the match). */
  get perches() { return this._perches || (this._perches = perchesFor(this.auth.world, this.hitscan)); }

  /**
   * Adds bots (humans + bots <= the match cap) at the given difficulty. Team modes may give an explicit split
   * ({ red, blue }); otherwise `count` bots fill the smaller team each time.
   */
  configure({ count = 0, difficulty = 'normal', red = null, blue = null } = {}) {
    this.difficulty = difficulty;
    void this.nav;   // nav grid + clearance field (~0.1-0.5 s) now, while the match is being set up, not mid-game
    if (this.auth.teamMode && (red !== null || blue !== null)) {
      for (let i = 0; i < (red || 0); i++) this.add('red');
      for (let i = 0; i < (blue || 0); i++) this.add('blue');
      return;
    }
    for (let i = 0; i < count; i++) this.add();
  }

  add(team = null) {
    const humansAndBots = [...this.auth.players.values()].filter((p) => !(p.bot && !p.ai)).length;
    if (humansAndBots >= this.auth.maxPlayers) return null;
    const id = this.nextId++;
    const name = 'Bot ' + this.names[(id - 200) % this.names.length];
    const cls = CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)];
    // Brain first: addPlayer spawns immediately and calls onSpawn.
    const placeholder = { id };
    this.brains.set(id, placeholder);
    const p = this.auth.addPlayer(id, name, { bot: true, ai: true, cls, team });
    const brain = new BotBrain(this, p, this.difficulty, 'attack');
    this.brains.set(id, brain);
    this.assignRoles();   // roles come from the team order and the team's bot count (rebalanced on add / remove)
    if (p.alive && p.pos) brain.onSpawn(new THREE.Vector3().fromArray(p.pos), 0);
    return id;
  }

  remove(id) {
    if (!this.brains.has(id)) return;
    this.brains.delete(id);
    this.auth.removePlayer(id);
    this.assignRoles();
  }

  /** Before a bot respawns (called by Authority.spawn ahead of the spawn message, so every client and the frag count
   *  see the class the bot actually plays this life): maybe a new class. */
  preSpawn(p) {
    if (this.brains.get(p.id) instanceof BotBrain && p.life > 0 && Math.random() < 0.3) p.cls = CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)];
  }

  onSpawn(p, pos, yaw) {
    const b = this.brains.get(p.id);
    if (b instanceof BotBrain) b.onSpawn(pos, yaw);
  }

  onDamaged(victim, attacker) {
    const b = this.brains.get(victim.id);
    if (b instanceof BotBrain) b.onDamaged(attacker);
  }

  /** Gunfire is audible to bots within their hearing range. */
  onShot(shooter, pos) {
    for (const b of this.brains.values()) if (b instanceof BotBrain && b.p.alive) b.hear(shooter, pos);
  }

  update(dt) {
    if (!this.brains.size) return;
    const t = this.auth.time();
    const playing = this.auth.state === 'playing';
    if (!this.perches.ready) this.perches.step(700);
    this.crateT -= dt;
    if (playing && this.crateT <= 0) { this.crateT = 0.5; this._assignCrates(t); }
    for (const b of this.brains.values()) if (b instanceof BotBrain && playing) b.update(Math.min(dt, 0.05), t);
    // 20 Hz movement state, same format as human clients send.
    this.stTimer += dt;
    if (this.stTimer < 0.05) return;
    this.stTimer = 0;
    for (const b of this.brains.values()) {
      if (!(b instanceof BotBrain) || !b.p.alive || b.p.inHeli) continue;
      const c = b.ctrl;
      this.auth.pendingStates.set(b.p.id, {
        t: 'st', id: b.p.id, l: b.p.life, ts: r3(t),
        p: [r2(c.position.x), r2(c.position.y), r2(c.position.z)], v: [r2(c.velocity.x), r2(c.velocity.y), r2(c.velocity.z)],
        yaw: r3(c.yaw), pitch: r3(c.pitch), c: c.crouching ? 1 : 0, s: c.sprinting ? 1 : 0, w: b.gun?.id || 'ar', g: c.grounded ? 1 : 0,
        // Grapple anchor (same field humans send): every client draws the cable and plays the remote grapple sound.
        ...(c.grapple ? { ga: [r2(c.grapple.anchor.x), r2(c.grapple.anchor.y), r2(c.grapple.anchor.z)] } : {}),
        // Aim-down-sights amount and movement mode (same optional fields humans send; see game.js _sendState).
        ...(b.adsVis > 0.05 ? { a: Math.round(b.adsVis * 10) / 10 } : {}),
        ...(c.ladder ? { m: 2 } : c.mantle ? { m: 3 } : c.sliding ? { m: 1 } : c.dashT > 0 ? { m: 4 } : {}),
      });
    }
  }

  /**
   * Care packages: every landed crate gets up to CRATE_PER_TEAM claimers per team (FFA: in total), the nearest bots
   * for which a detour is reasonable: alive, on foot, not carrying a flag, not in a close fight, within CRATE_RANGE
   * with a nav path, and allowed by their role / team order (defenders and DEFEND: only near the base and only while
   * our flag is home; ATTACK: only roughly on the way to the enemy flag; escorts: only close by and never while a
   * teammate carries the flag). Anyone may open any crate (game rule); a living teammate's crate is left to its owner
   * for its first 15 s on the ground. Brains do the walking and the hold-to-capture (same host rules as a human).
   */
  _assignCrates(t) {
    const auth = this.auth, sr = auth.streaks;
    const brains = [...this.brains.values()].filter((b) => b instanceof BotBrain);
    const crates = sr ? [...sr.crates.values()].filter((c) => c.state === 'landed') : [];
    const live = new Set(crates.map((c) => c.cid));
    for (const b of brains) if (b.crate && !live.has(b.crate.cid)) b.crate = null;
    if (!crates.length) return;
    const ctf = auth.ctf;
    const bases = ctf ? ctf.bases : auth.teamMode ? Object.fromEntries(Object.entries(ctfBases(auth.world)).map(([k, v]) => [k, v.toArray()])) : null;
    const hd = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
    for (const c of crates) {
      if (c.landedT === undefined) c.landedT = t;
      const owner = auth.players.get(c.owner);
      const cand = [];
      for (const b of brains) {
        const p = b.p;
        if (!p.alive || !p.pos || p.inHeli || b.pilot) { if (b.crate?.cid === c.cid) b.crate = null; continue; }
        if (b.crate && b.crate.cid !== c.cid) continue;   // already busy with another crate
        let ok = this._crateOk(b, c, owner, t, bases, hd);
        const d = hd(p.pos, c.p);
        if (ok && !b.crate) {
          // Path check once when first claimed (A* is not free).
          const path = this.nav.findPath(b.pos, new THREE.Vector3().fromArray(c.p));
          ok = !!path;
        }
        if (ok) cand.push({ b, d });
        else if (b.crate?.cid === c.cid) b.crate = null;
      }
      // Keep the nearest few per team (current claimers win ties so they do not flip-flop).
      cand.sort((x, y) => (x.d - (x.b.crate ? 10 : 0)) - (y.d - (y.b.crate ? 10 : 0)));
      const count = {};
      for (const { b } of cand) {
        const k = auth.teamMode ? b.p.team : 'all';
        count[k] = (count[k] || 0) + 1;
        if (count[k] <= CRATE_PER_TEAM) { if (!b.crate) b.crate = { cid: c.cid, p: c.p.slice(), capT: null }; }
        else if (b.crate?.cid === c.cid) b.crate = null;
      }
    }
  }

  _crateOk(b, c, owner, t, bases, hd) {
    const auth = this.auth, p = b.p;
    const d = hd(p.pos, c.p);
    if (d > CRATE_RANGE) return false;
    if (auth.ctf?.carrying(p)) return false;
    // Close fight (enemy in sight within 25 m): fight first. A bot already at the crate keeps capturing.
    if (b.visible && b.target?.pos && !b.target.heli && hd(b.target.pos, p.pos) < 25 && d > 4) return false;
    // A living teammate's package: theirs for its first 15 s on the ground.
    if (auth.teamMode && owner && owner !== p && owner.team === p.team && owner.alive && !owner.ai && t - c.landedT < 15) return false;
    if (!auth.teamMode) return true;
    const team = p.team, o = this.orderOf(team).o;
    const base = bases?.[team];
    if (auth.ctf) {
      const of = auth.ctf.flags[team], ef = auth.ctf.flags[otherTeam(team)];
      if (of.state !== 'home' && b.role !== 'attack') return false;                     // our flag is out: get it back
      if (b.role === 'escort' || o === 'escort') return ef.state !== 'carried' && d < 30;
      if (b.role === 'defend' || o === 'defend') return base && hd(c.p, base) < 40;
      // Attackers: only roughly on the way to the enemy flag (a detour of at most ~35 m).
      const ep = ef.state === 'carried' ? null : ef.pos;
      if (!ep) return d < 30;
      return d + hd(c.p, ep) < hd(p.pos, ep) + 35;
    }
    // TDM.
    if (o === 'defend') return base && hd(c.p, base) < 50;
    if (o === 'escort') return d < 30;
    return true;
  }

  /**
   * A bot shooting at an enemy helicopter: rays against a host-side hull volume (cabin + tail spheres, like the
   * clients' hit volume); the damage goes through HeliRules.bulletHit (weapon cap, rate limit, 0.6x / sniper 2x).
   */
  botShotHeli(brain, gun, eye, t) {
    const auth = this.auth, st = gun.stats, p = brain.p, hr = auth.heli, h = hr?.h;
    if (!h || h.state !== 'flying') return;
    p.protectUntil = 0;
    const aim = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(brain.ctrl.pitch, brain.ctrl.yaw, 0, 'YXZ'));
    const spread = (st.spread.hip * 0.5 + st.spread.ads * 0.5) * DEG * brain.d.spreadMult + gun.bloom * DEG;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(h.pitch, h.yaw, h.roll, 'YXZ'));
    const base = new THREE.Vector3().fromArray(h.pos);
    const spheres = [
      [new THREE.Vector3(0, 1.6, -1.2).applyQuaternion(q).add(base), 2.3],
      [new THREE.Vector3(0, 2.0, 4.8).applyQuaternion(q).add(base), 1.2],
    ];
    let dmg = 0;
    const ends = [];
    for (let i = 0; i < st.pellets; i++) {
      const dir = cone(aim, spread);
      const wh = this.hitscan.castWorld(eye, dir, st.maxRange, { bullets: true });
      let best = Infinity;
      for (const [c, r] of spheres) {
        const oc = new THREE.Vector3().subVectors(eye, c);
        const b = oc.dot(dir), cc = oc.lengthSq() - r * r, disc = b * b - cc;
        if (disc >= 0) { const d = -b - Math.sqrt(disc); if (d > 0 && d < best) best = d; }
      }
      if (best < (wh ? wh.distance : st.maxRange)) {
        dmg += damageAt(st, best);
        const e = eye.clone().addScaledVector(dir, best);
        ends.push([r2(e.x), r2(e.y), r2(e.z), 1, 0, 1, 0, 'metal']);
      } else if (wh) ends.push([r2(wh.point.x), r2(wh.point.y), r2(wh.point.z), 1, r3(wh.normal.x), r3(wh.normal.y), r3(wh.normal.z), wh.surface]);
      else { const e = eye.clone().addScaledVector(dir, Math.min(st.maxRange, 300)); ends.push([r2(e.x), r2(e.y), r2(e.z), 0]); }
    }
    auth.out({ t: 'shot', id: p.id, w: gun.id, o: [r2(eye.x), r2(eye.y - 0.2), r2(eye.z)], e: ends });
    this.onShot(p, p.pos);
    if (dmg > 0) hr.bulletHit(p, { w: gun.id, dmg });
  }

  /** Bot knife attack on a target within reach (validated like a human melee claim: one hit kills). */
  botMelee(brain, v) {
    const auth = this.auth, p = brain.p;
    if (!v.alive || !v.pos || v.inHeli) return;
    p.protectUntil = 0;
    auth.out({ t: 'melee', id: p.id, hit: true }, null, p.id);
    auth.applyDamage(p, v, v.hp + v.armor + 1, false, 'melee');
  }

  /** Host-side hitscan for a bot shot: world first, then enemy hitboxes; damage applied directly. */
  botShot(brain, gun, eye, t) {
    const auth = this.auth, st = gun.stats, p = brain.p;
    p.protectUntil = 0;
    const aim = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(brain.ctrl.pitch, brain.ctrl.yaw, 0, 'YXZ'));
    // Shooting while riding the grapple costs accuracy, as it does for humans (+1.5 deg).
    const spread = (st.spread.hip * 0.5 + st.spread.ads * 0.5) * DEG * brain.d.spreadMult + gun.bloom * DEG + (brain.ctrl.grapple ? 1.5 * DEG : 0);
    const targets = [];
    for (const o of auth.players.values()) {
      if (!o.alive || !o.pos || o === p || o.inHeli) continue;
      if (auth.teamMode && o.team === p.team) continue;
      targets.push({ id: o.id, feet: new THREE.Vector3().fromArray(o.pos), crouch: o.crouch ? 1 : 0 });
    }
    const dmgBy = new Map();
    const ends = [];
    for (let i = 0; i < st.pellets; i++) {
      const dir = cone(aim, spread);
      const wh = this.hitscan.castWorld(eye, dir, st.maxRange, { bullets: true });
      // Nearest bodies first; piercing rounds (sniper) pass through up to `pierce` players.
      const hits = [];
      for (let pool = targets; hits.length < (st.pierce || 1);) {
        const h = this.hitscan.castTargets(eye, dir, wh ? wh.distance : st.maxRange, pool);
        if (!h) break;
        hits.push(h);
        pool = pool.filter((x) => x.id !== h.id);
      }
      for (const th of hits) {
        const a = dmgBy.get(th.id) || { dmg: 0, hs: false, ik: false };
        a.dmg += damageAt(st, th.distance) * (th.headshot ? st.headMult : 1);
        a.hs = a.hs || th.headshot;
        if (gun.id === 'sniper' && th.zone !== 'legs') a.ik = true;
        dmgBy.set(th.id, a);
        ends.push([r2(th.point.x), r2(th.point.y), r2(th.point.z), 2]);
      }
      if (hits.length && !(st.pierce > 1)) continue;   // stopped in the body
      if (wh) {
        ends.push([r2(wh.point.x), r2(wh.point.y), r2(wh.point.z), 1, r3(wh.normal.x), r3(wh.normal.y), r3(wh.normal.z), wh.surface]);
      } else {
        const e = eye.clone().addScaledVector(dir, Math.min(st.maxRange, 300));
        ends.push([r2(e.x), r2(e.y), r2(e.z), 0]);
      }
    }
    auth.out({ t: 'shot', id: p.id, w: gun.id, o: [r2(eye.x), r2(eye.y - 0.2), r2(eye.z)], e: ends });
    this.onShot(p, p.pos);
    for (const [id, a] of dmgBy) {
      const v = auth.players.get(id);
      if (!v) continue;
      auth.applyDamage(p, v, a.ik ? v.hp + v.armor + 1 : a.dmg, a.hs, gun.id);
    }
  }
}

function cone(aim, spread) {
  if (spread <= 0) return aim.clone();
  const up = Math.abs(aim.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(aim, up).normalize();
  const v = new THREE.Vector3().crossVectors(u, aim).normalize();
  const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
  const tr = Math.tan(r);
  return aim.clone().addScaledVector(u, Math.cos(a) * tr).addScaledVector(v, Math.sin(a) * tr).normalize();
}
