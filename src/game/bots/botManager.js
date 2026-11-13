// Host-side AI bots: creation/removal, per-frame brains, host-authoritative bot gunfire, and 20 Hz state output so
// every client renders bots like any other remote player (kill cams, killfeed, scoreboard all just work).
import * as THREE from 'three';
import { BotBrain } from './botBrain.js';
import { navFor } from './nav.js';
import { createHitscan } from '../hitscan.js';
import { damageAt } from '../weapons.js';
import { CLASS_IDS } from '../classes.js';

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
  }

  get nav() { return this._nav || (this._nav = navFor(this.auth.world)); }
  get hitscan() { return this._hitscan || (this._hitscan = createHitscan(this.auth.world)); }

  /** Adds `count` bots (respecting the 8-player cap) at the given difficulty. */
  configure({ count = 0, difficulty = 'normal' } = {}) {
    this.difficulty = difficulty;
    for (let i = 0; i < count; i++) this.add();
  }

  add() {
    const humansAndBots = [...this.auth.players.values()].filter((p) => !(p.bot && !p.ai)).length;
    if (humansAndBots >= 8) return null;
    const id = this.nextId++;
    const name = 'Bot ' + this.names[(id - 200) % this.names.length];
    const cls = CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)];
    // Brain first: addPlayer spawns immediately and calls onSpawn.
    const placeholder = { id };
    this.brains.set(id, placeholder);
    const p = this.auth.addPlayer(id, name, { bot: true, ai: true, cls });
    // CTF roles per team: attackers first, then alternate (so every team has someone going for the flag).
    let att = 0, def = 0;
    for (const b of this.brains.values()) if (b instanceof BotBrain && b.p.team === p.team) { if (b.role === 'attack') att++; else def++; }
    const role = att <= def ? 'attack' : 'defend';
    const brain = new BotBrain(this, p, this.difficulty, role);
    this.brains.set(id, brain);
    if (p.alive && p.pos) brain.onSpawn(new THREE.Vector3().fromArray(p.pos), 0);
    return id;
  }

  remove(id) {
    if (!this.brains.has(id)) return;
    this.brains.delete(id);
    this.auth.removePlayer(id);
  }

  onSpawn(p, pos, yaw) {
    const b = this.brains.get(p.id);
    if (b instanceof BotBrain) {
      // New life, maybe a new class.
      if (Math.random() < 0.3) p.cls = CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)];
      b.onSpawn(pos, yaw);
    }
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
    for (const b of this.brains.values()) if (b instanceof BotBrain && playing) b.update(Math.min(dt, 0.05), t);
    // 20 Hz movement state, same format as human clients send.
    this.stTimer += dt;
    if (this.stTimer < 0.05) return;
    this.stTimer = 0;
    for (const b of this.brains.values()) {
      if (!(b instanceof BotBrain) || !b.p.alive) continue;
      const c = b.ctrl;
      this.auth.pendingStates.set(b.p.id, {
        t: 'st', id: b.p.id, l: b.p.life, ts: r3(t),
        p: [r2(c.position.x), r2(c.position.y), r2(c.position.z)], v: [r2(c.velocity.x), r2(c.velocity.y), r2(c.velocity.z)],
        yaw: r3(c.yaw), pitch: r3(c.pitch), c: c.crouching ? 1 : 0, s: c.sprinting ? 1 : 0, w: b.gun?.id || 'ar', g: c.grounded ? 1 : 0,
      });
    }
  }

  /** Host-side hitscan for a bot shot: world first, then enemy hitboxes; damage applied directly. */
  botShot(brain, gun, eye, t) {
    const auth = this.auth, st = gun.stats, p = brain.p;
    p.protectUntil = 0;
    const aim = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(brain.ctrl.pitch, brain.ctrl.yaw, 0, 'YXZ'));
    const spread = (st.spread.hip * 0.5 + st.spread.ads * 0.5) * DEG * brain.d.spreadMult + gun.bloom * DEG;
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
      const wh = this.hitscan.castWorld(eye, dir, st.maxRange);
      const th = this.hitscan.castTargets(eye, dir, wh ? wh.distance : st.maxRange, targets);
      if (th) {
        const a = dmgBy.get(th.id) || { dmg: 0, hs: false, ik: false };
        a.dmg += damageAt(st, th.distance) * (th.headshot ? st.headMult : 1);
        a.hs = a.hs || th.headshot;
        if (gun.id === 'sniper' && th.zone !== 'legs') a.ik = true;
        dmgBy.set(th.id, a);
        ends.push([r2(th.point.x), r2(th.point.y), r2(th.point.z), 2]);
      } else if (wh) {
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
