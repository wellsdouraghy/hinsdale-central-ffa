// Host-authoritative attack helicopter (FFA only, one per match): parking spot, pilot, health, rockets, flight time,
// destruction and respawn. The pilot's client flies it and streams its pose; the host validates and relays.
import * as THREE from 'three';
import { WEAPON_STATS, maxShotDamage } from './weapons.js';

export const HELI = {
  hp: 900,
  flightTime: 75,
  warnTime: 10,
  respawnDelay: 60,
  enterRange: 4.5,
  exitHeight: 3.5,
  cannonDmg: 16,
  cannonRps: 10,
  rocketDmg: 55,
  rocketRadius: 4,
  rocketSpeed: 70,
  rocketReload: 4,
  bulletMult: 0.6,
  sniperMult: 2,
  wreckRadius: 8,
  wreckDamage: 110,
};

const r2 = (x) => Math.round(x * 100) / 100;

export class HeliRules {
  constructor(auth) {
    this.auth = auth;
    this.h = null;
    this.lastSpot = -1;
    this.rockets = new Map();   // key -> { owner, rid, pos, dir, age }
    this.claims = [];
    this.salvo = { shots: 0, readyAt: 0 };
    this.relayT = 0;
    this.pending = null;
    this.park(true);
  }

  _spots() {
    const w = this.auth.world;
    // Practice: always park on Dickinson Field (stadium turf, just north of midfield, nose toward the north end zone).
    if (this.auth.practice) return [{ pos: new THREE.Vector3(-154, 0, -98), yaw: 0 }];
    if (w.heliSpawns?.length) return w.heliSpawns.map((s) => ({ pos: s.pos, yaw: s.yaw ?? 0 }));
    return w.spawnPoints.map((p) => ({ pos: p, yaw: Math.random() * Math.PI * 2 }));
  }

  /** Parks a fresh helicopter at a random spot (different from the last one). */
  park(silent = false) {
    const spots = this._spots();
    let i = Math.floor(Math.random() * spots.length);
    if (spots.length > 1 && i === this.lastSpot) i = (i + 1 + Math.floor(Math.random() * (spots.length - 1))) % spots.length;
    this.lastSpot = i;
    const s = spots[i];
    this.h = { state: 'parked', pos: [s.pos.x, s.pos.y, s.pos.z], yaw: s.yaw, pitch: 0, roll: 0, v: [0, 0, 0], hp: HELI.hp, pilot: null, used: 0, respawnAt: 0, gen: (this.h?.gen || 0) + 1 };
    this.salvo = { shots: 0, readyAt: 0 };
    this.auth.out({ t: 'heli', h: this.snapshot(), spawned: !silent });
  }

  snapshot() {
    const h = this.h;
    if (!h) return null;
    return { state: h.state, pos: h.pos.map(r2), yaw: r2(h.yaw), pitch: r2(h.pitch), roll: r2(h.roll), hp: Math.round(h.hp), pilot: h.pilot, left: Math.max(0, HELI.flightTime - h.used), gen: h.gen };
  }

  _broadcast() { this.auth.out({ t: 'heli', h: this.snapshot() }); }

  get active() { return this.h && (this.h.state === 'parked' || this.h.state === 'flying'); }

  _groundClearance() {
    const h = this.h;
    const hs = this.auth.bots.hitscan;
    const hit = hs.castWorld(new THREE.Vector3(h.pos[0], h.pos[1] + 1, h.pos[2]), new THREE.Vector3(0, -1, 0), 200);
    return hit ? h.pos[1] - hit.point.y : 999;
  }

  handle(p, msg) {
    const h = this.h;
    if (!h) return;
    switch (msg.t) {
      case 'heliEnter': {
        if (!p.alive || p.inHeli || !this.active || h.pilot !== null || !p.pos) return;
        if (Math.hypot(p.pos[0] - h.pos[0], p.pos[1] - h.pos[1], p.pos[2] - h.pos[2]) > HELI.enterRange + 1.5) return;
        h.pilot = p.id;
        h.state = 'flying';
        p.inHeli = true;
        this.ctrlLife = p.life;
        this._broadcast();
        break;
      }
      case 'heliExit': {
        if (h.pilot !== p.id) return;
        if (this._groundClearance() > HELI.exitHeight) { this.auth.out({ t: 'notice', text: 'Too high to exit' }, p.id); return; }
        this._eject(p, 'parked');
        break;
      }
      case 'hst': {
        if (h.pilot !== p.id || h.state !== 'flying' || !Array.isArray(msg.p)) return;
        const b = this.auth.world.playBounds;
        h.pos = [THREE.MathUtils.clamp(msg.p[0], b.minX, b.maxX), Math.min(msg.p[1], 200), THREE.MathUtils.clamp(msg.p[2], b.minZ, b.maxZ)];
        h.yaw = msg.yaw; h.pitch = msg.pitch; h.roll = msg.roll; h.v = msg.v || [0, 0, 0];
        p.pos = [h.pos[0], h.pos[1] + 1.2, h.pos[2]];
        this.pending = { t: 'hst', ts: msg.ts, p: h.pos, yaw: h.yaw, pitch: h.pitch, roll: h.roll, v: h.v, gen: h.gen };
        break;
      }
      case 'rocket': {
        if (h.pilot !== p.id || h.state !== 'flying' || !Array.isArray(msg.o) || !Array.isArray(msg.d)) return;
        const t = this.auth.time();
        if (t < this.salvo.readyAt) return;
        this.salvo.shots++;
        if (this.salvo.shots >= 2) { this.salvo.shots = 0; this.salvo.readyAt = t + HELI.rocketReload - 0.3; }
        const o = new THREE.Vector3().fromArray(msg.o);
        if (o.distanceTo(new THREE.Vector3().fromArray(h.pos)) > 8) return;
        const dir = new THREE.Vector3().fromArray(msg.d).normalize();
        this.rockets.set(`${p.id}:${msg.rid}`, { owner: p.id, rid: msg.rid, pos: o, dir, age: 0 });
        this.auth.out({ t: 'rocket', id: p.id, rid: msg.rid, o: msg.o, d: msg.d }, null, p.id);
        break;
      }
      case 'heliCrash': {
        if (h.pilot !== p.id) return;
        this.damage(p, Math.min(300, Math.max(0, Number(msg.dmg) || 0)));
        break;
      }
      default: break;
    }
  }

  /** Bullets from players hitting the helicopter (any seat-side validation is light: weapon + damage cap + rate). */
  bulletHit(a, msg) {
    if (!this.active || !a.alive || a.id === this.h.pilot) return;
    const w = msg.w;
    if (!WEAPON_STATS[w]) return;
    const dmg = Math.min(Number(msg.dmg) || 0, maxShotDamage(w));
    if (!(dmg > 0)) return;
    const t = this.auth.time();
    a.heliClaims = (a.heliClaims || []).filter((c) => t - c < 1);
    if (a.heliClaims.length > WEAPON_STATS[w].rpm / 60 * 1.5 + 3) return;
    a.heliClaims.push(t);
    this.damage(a, dmg * (w === 'sniper' ? HELI.sniperMult : HELI.bulletMult));
    this.auth.out({ t: 'hitc', target: 'heli', hp: Math.round(this.h.hp), armor: 0 }, a.id);
  }

  /** Chin cannon hits claimed by the pilot. */
  cannonHit(a, msg) {
    const h = this.h;
    if (!h || h.pilot !== a.id || h.state !== 'flying') return;
    const v = this.auth.players.get(msg.target);
    if (!v || v === a || !v.alive) return;
    const t = this.auth.time();
    this.claims = this.claims.filter((c) => t - c < 1);
    if (this.claims.length > HELI.cannonRps * 1.3 + 2) return;
    this.claims.push(t);
    if (v.pos && Math.hypot(v.pos[0] - h.pos[0], v.pos[1] - h.pos[1], v.pos[2] - h.pos[2]) > 700) return;
    this.auth.applyDamage(a, v, Math.min(HELI.cannonDmg, Number(msg.dmg) || 0), false, 'heli');
    if (v.alive) this.auth.out({ t: 'hitc', target: v.id, hp: Math.round(v.hp), armor: Math.round(v.armor) }, a.id);
  }

  /** Explosions near the helicopter (frags full damage; its own rockets don't hurt it). */
  blast(a, center, radius, max, weapon) {
    if (!this.active || weapon === 'rocket' || weapon === 'heli') return;
    const h = this.h;
    const d = center.distanceTo(new THREE.Vector3(h.pos[0], h.pos[1] + 1.6, h.pos[2]));
    const r = radius + 2;
    if (d < r) this.damage(a, max * (1 - d / r));
  }

  damage(attacker, amount) {
    const h = this.h;
    if (!this.active || amount <= 0) return;
    h.hp -= amount;
    if (h.hp <= 0) this.destroy(attacker);
    else this._broadcast();
  }

  destroy(attacker) {
    const h = this.h;
    const pilot = h.pilot !== null ? this.auth.players.get(h.pilot) : null;
    h.state = 'down';
    h.hp = 0;
    h.respawnAt = this.auth.time() + HELI.respawnDelay;
    const center = new THREE.Vector3(h.pos[0], h.pos[1] + 1.5, h.pos[2]);
    this.auth.out({ t: 'heliBoom', p: center.toArray().map(r2), by: attacker?.id ?? null });
    if (pilot) {
      h.pilot = null;
      pilot.inHeli = false;
      const killer = attacker && attacker !== pilot ? attacker : pilot;
      this.auth.applyDamage(killer, pilot, 9999, false, 'heli');
    }
    this._broadcast();
    // The wreck explodes (credited to whoever brought it down).
    if (attacker) this.auth.explode(attacker.id, center, HELI.wreckRadius, HELI.wreckDamage, 'heli');
  }

  _eject(p, nextState) {
    const h = this.h;
    h.pilot = null;
    p.inHeli = false;
    h.state = nextState;
    const side = new THREE.Vector3(Math.cos(h.yaw), 0, -Math.sin(h.yaw)).multiplyScalar(3.2);
    const out = [h.pos[0] + side.x, h.pos[1], h.pos[2] + side.z];
    const hit = this.auth.bots.hitscan.castWorld(new THREE.Vector3(out[0], out[1] + 3, out[2]), new THREE.Vector3(0, -1, 0), 250);
    if (hit) out[1] = hit.point.y;
    p.pos = out;
    p.lastSt = null;
    this.auth.out({ t: 'heliExit', id: p.id, p: out.map(r2) });
    this._broadcast();
  }

  /** Flight time over: put the pilot down and remove the helicopter. */
  expire() {
    const h = this.h;
    const pilot = h.pilot !== null ? this.auth.players.get(h.pilot) : null;
    if (pilot) this._eject(pilot, 'down');
    h.state = 'down';
    h.respawnAt = this.auth.time() + HELI.respawnDelay;
    this.auth.out({ t: 'heliGone', p: h.pos.map(r2) });
    this._broadcast();
  }

  onPlayerGone(p) {
    if (this.h?.pilot === p.id) { this.h.pilot = null; this.expire(); }
  }

  update(dt) {
    const h = this.h;
    if (!h) return;
    const t = this.auth.time();
    if (h.state === 'flying' && h.pilot !== null) {
      const pilot = this.auth.players.get(h.pilot);
      if (!pilot || !pilot.alive) { this.expire(); return; }
      h.used += dt;
      if (h.used >= HELI.flightTime) { this.expire(); return; }
      this.snapT = (this.snapT || 0) + dt;
      if (this.snapT >= 1) { this.snapT = 0; this._broadcast(); } // fuel / hull for the pilot's HUD
      this.relayT += dt;
      if (this.relayT >= 0.05 && this.pending) {
        this.relayT = 0;
        this.auth.out({ ...this.pending, left: Math.max(0, HELI.flightTime - h.used), hp: Math.round(h.hp) }, null, h.pilot);
        this.pending = null;
      }
    }
    if (h.state === 'down' && t >= h.respawnAt) this.park(false);
    // Rockets: straight, fast; detonate on world or near a player.
    const hs = this.auth.bots.hitscan;
    for (const [key, r] of this.rockets) {
      r.age += dt;
      const step = HELI.rocketSpeed * dt;
      const wh = hs.castWorld(r.pos, r.dir, step + 0.5);
      let boom = null;
      if (wh) boom = wh.point;
      else {
        r.pos.addScaledVector(r.dir, step);
        for (const v of this.auth.players.values()) {
          if (!v.alive || !v.pos || v.id === r.owner) continue;
          if (Math.hypot(v.pos[0] - r.pos.x, v.pos[1] + 1 - r.pos.y, v.pos[2] - r.pos.z) < 1.6) { boom = r.pos.clone(); break; }
        }
        if (r.age > 4) boom = r.pos.clone();
      }
      if (boom) {
        this.rockets.delete(key);
        this.auth.out({ t: 'rboom', id: r.owner, rid: r.rid, p: boom.toArray().map(r2) });
        this.auth.explode(r.owner, boom, HELI.rocketRadius, HELI.rocketDmg, 'rocket', true);
      }
    }
  }

  reset() {
    this.rockets.clear();
    for (const p of this.auth.players.values()) p.inHeli = false;
    this.park(true);
  }
}
