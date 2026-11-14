// Host-authoritative attack helicopter (FFA only, one per match): parking spot, pilot, health, rockets, flight time,
// destruction and respawn. The pilot's client flies it and streams its pose; the host validates and relays.
import * as THREE from 'three';
import { WEAPON_STATS, maxShotDamage } from './weapons.js';
import { createHelicopter } from '../visuals/helicopter.js';

/**
 * Airframe collision volume measured from the actual model at rest (skids at y=0, nose toward -z):
 * union of all mesh boxes except the rotor blades / discs (anything spanning > 8 m). Falls back to fixed numbers.
 */
let AIRFRAME = null;
function airframe() {
  if (AIRFRAME) return AIRFRAME;
  let box = null;
  try {
    const m = createHelicopter();
    m.object3D.updateMatrixWorld(true);
    const b = new THREE.Box3(), mb = new THREE.Box3();
    m.object3D.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      mb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      const sz = mb.getSize(new THREE.Vector3());
      if (sz.x > 8 || sz.z > 8 && sz.x > 3) return; // main rotor blades / disc
      b.union(mb);
    });
    m.dispose?.();
    if (!b.isEmpty()) box = b;
  } catch { /* fall back */ }
  if (!box) box = new THREE.Box3(new THREE.Vector3(-1.3, 0, -6.5), new THREE.Vector3(1.3, 3.4, 7.6));
  AIRFRAME = {
    // cabin: front ~55% of the length, full width; tail boom: rear part, narrower
    cabin: { x: Math.min(1.6, (box.max.x - box.min.x) / 2 + 0.35), y0: box.min.y - 0.3, y1: Math.min(box.max.y, 3.4) + 0.3, z0: box.min.z - 0.35, z1: box.min.z + (box.max.z - box.min.z) * 0.5 },
    tail: { x: 0.85, y0: 0.8, y1: box.max.y + 0.3, z0: box.min.z + (box.max.z - box.min.z) * 0.5, z1: box.max.z + 0.35 },
  };
  return AIRFRAME;
}

export const HELI = {
  hp: 900,
  warnTime: 10,
  respawnDelay: 60,
  enterRange: 4.5,
  exitHeight: 3.5,
  cannonDmg: 20,
  cannonRps: 10,
  rocketDmg: 55,
  rocketRadius: 4,
  rocketSpeed: 70,
  rocketReload: 4,
  bulletMult: 0.6,
  sniperMult: 2,
  wreckRadius: 8,
  wreckDamage: 110,
  // Crashes (impact speed against world, m/s): harmless below, scaled between, destroyed above.
  crashSafe: 6,
  crashFatal: 14,
  crashMaxDamage: 520,
  rotorWallDamage: 120,
  ramDamage: 60,          // cost to the helicopter per player run over / chopped
  ramSpeed: 4,            // fuselage kills only above this speed
  rotorRadius: 5.5,
  rotorY: 3.25,           // main rotor plane height above the skids (local, from the model)
  rotorBand: 1.2,
  tailRotor: [0, 2.36, 7.5], tailRotorR: 0.95,
  creditWindow: 10,       // a crash shortly after taking damage credits the last attacker
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
    this.h = { state: 'parked', pos: [s.pos.x, s.pos.y, s.pos.z], yaw: s.yaw, pitch: 0, roll: 0, v: [0, 0, 0], hp: HELI.hp, pilot: null, respawnAt: 0, gen: (this.h?.gen || 0) + 1 };
    this.salvo = { shots: 0, readyAt: 0 };
    this.auth.out({ t: 'heli', h: this.snapshot(), spawned: !silent });
  }

  snapshot() {
    const h = this.h;
    if (!h) return null;
    return { state: h.state, pos: h.pos.map(r2), yaw: r2(h.yaw), pitch: r2(h.pitch), roll: r2(h.roll), hp: Math.round(h.hp), pilot: h.pilot, gen: h.gen };
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
        // Pilot-reported impact (the pilot is authoritative for the flight path, like player movement).
        if (h.pilot !== p.id || h.state !== 'flying') return;
        const speed = Math.min(80, Math.max(0, Number(msg.speed) || 0));
        if (Array.isArray(msg.p)) this.auth.out({ t: 'heliSpark', p: msg.p.map(r2), big: speed > HELI.crashFatal });
        if (msg.flip || speed > HELI.crashFatal || (msg.nose && speed > HELI.crashFatal * 0.75)) { this.destroy(null, 'crash'); return; }
        if (speed > HELI.crashSafe) {
          const k = (speed - HELI.crashSafe) / (HELI.crashFatal - HELI.crashSafe);
          this.damage(null, k * HELI.crashMaxDamage, 'crash');
        }
        break;
      }
      case 'heliRotor': {
        // Main rotor clipped a wall/building.
        if (h.pilot !== p.id || h.state !== 'flying') return;
        const t = this.auth.time();
        if (t < (this.rotorStrikeT || 0)) return;
        this.rotorStrikeT = t + 0.6;
        if (Array.isArray(msg.p)) this.auth.out({ t: 'heliSpark', p: msg.p.map(r2), big: false });
        this.damage(null, HELI.rotorWallDamage, 'crash');
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
    if (!this.active) return;
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

  /** attacker: player record or null (self-inflicted: crash / rotor strike / running people over). */
  damage(attacker, amount, cause = 'weapon') {
    const h = this.h;
    if (!this.active || amount <= 0) return;
    if (attacker && attacker.id !== h.pilot) this.lastDamager = { id: attacker.id, t: this.auth.time() };
    h.hp -= amount;
    if (h.hp <= 0) this.destroy(attacker, cause);
    else this._broadcast();
  }

  /** Whoever recently shot the helicopter gets credit for a crash; otherwise it's on the pilot. */
  _crashCredit() {
    const ld = this.lastDamager;
    if (ld && this.auth.time() - ld.t <= HELI.creditWindow) return this.auth.players.get(ld.id) || null;
    return null;
  }

  destroy(attacker, cause = 'weapon') {
    const h = this.h;
    const pilot = h.pilot !== null ? this.auth.players.get(h.pilot) : null;
    if (!attacker || attacker === pilot) attacker = this._crashCredit();
    h.state = 'down';
    h.hp = 0;
    h.respawnAt = this.auth.time() + HELI.respawnDelay;
    const center = new THREE.Vector3(h.pos[0], h.pos[1] + 1.5, h.pos[2]);
    this.auth.out({ t: 'heliBoom', p: center.toArray().map(r2), by: attacker?.id ?? null, cause });
    const killer = attacker || pilot;
    if (pilot) {
      h.pilot = null;
      pilot.inHeli = false;
      this.auth.applyDamage(killer, pilot, 9999, false, cause === 'crash' && !attacker ? 'crash' : 'heli');
    }
    this.lastDamager = null;
    this._broadcast();
    // The wreck explodes (credited to whoever brought it down, else the pilot).
    if (killer) this.auth.explode(killer.id, center, HELI.wreckRadius, HELI.wreckDamage, 'heli');
  }

  /** Players touching the moving fuselage, inside the spinning main rotor disc, or in the tail rotor die instantly. */
  _ramChecks() {
    const h = this.h;
    const pilot = this.auth.players.get(h.pilot);
    if (!pilot) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(h.pitch, h.yaw, h.roll, 'YXZ'));
    const inv = q.clone().invert();
    const origin = new THREE.Vector3().fromArray(h.pos);
    const speed = Math.hypot(h.v[0], h.v[1], h.v[2]);
    const lf = new THREE.Vector3(), lh = new THREE.Vector3();
    for (const v of [...this.auth.players.values()]) {
      if (!v.alive || !v.pos || v === pilot || v.inHeli) continue;
      if (Math.hypot(v.pos[0] - h.pos[0], v.pos[2] - h.pos[2]) > 12) continue;
      lf.fromArray(v.pos).sub(origin).applyQuaternion(inv);                       // feet, heli-local
      lh.set(v.pos[0], v.pos[1] + 1.7, v.pos[2]).sub(origin).applyQuaternion(inv); // head, heli-local
      let how = null;
      // Main rotor disc.
      const rd = Math.hypot((lf.x + lh.x) / 2, (lf.z + lh.z) / 2);
      const ry = HELI.rotorY;
      if (rd < HELI.rotorRadius && Math.max(lf.y, lh.y) > ry - HELI.rotorBand && Math.min(lf.y, lh.y) < ry + HELI.rotorBand) how = 'rotor';
      // Tail rotor.
      const tr = HELI.tailRotor;
      if (!how) for (const pnt of [lf, lh, lf.clone().lerp(lh, 0.5)]) if (Math.hypot(pnt.x - tr[0], pnt.y - tr[1], pnt.z - tr[2]) < HELI.tailRotorR + 0.35) how = 'rotor';
      // Fuselage (box around cabin + tail boom), only when moving.
      if (!how && speed > HELI.ramSpeed) {
        const af = airframe();
        const inBox = (p, b) => Math.abs(p.x) < b.x && p.y > b.y0 && p.y < b.y1 && p.z > b.z0 && p.z < b.z1;
        const mid = lf.clone().lerp(lh, 0.5);
        for (const p of [lf, mid, lh]) {
          if (inBox(p, af.cabin) || inBox(p, af.tail)) { how = 'heli'; break; }
        }
      }
      if (!how) continue;
      this.auth.applyDamage(pilot, v, 9999, false, how);
      this.auth.out({ t: 'heliSpark', p: [r2(v.pos[0]), r2(v.pos[1] + 1.2), r2(v.pos[2])], big: false, blood: true });
      this.damage(null, HELI.ramDamage, 'crash');
      if (!this.active) return;
    }
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

  /** Pilot left the match: the unmanned helicopter goes down. */
  onPlayerGone(p) {
    if (this.h?.pilot === p.id) { this.h.pilot = null; this.destroy(null, 'crash'); }
  }

  update(dt) {
    const h = this.h;
    if (!h) return;
    const t = this.auth.time();
    if (h.state === 'flying' && h.pilot !== null) {
      const pilot = this.auth.players.get(h.pilot);
      if (!pilot || !pilot.alive) { this.h.pilot = null; this.destroy(null, 'crash'); return; }
      this._ramChecks();
      if (h.state !== 'flying') return;
      this.snapT = (this.snapT || 0) + dt;
      if (this.snapT >= 1) { this.snapT = 0; this._broadcast(); } // hull for the pilot's HUD
      this.relayT += dt;
      if (this.relayT >= 0.05 && this.pending) {
        this.relayT = 0;
        this.auth.out({ ...this.pending, hp: Math.round(h.hp) }, null, h.pilot);
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
