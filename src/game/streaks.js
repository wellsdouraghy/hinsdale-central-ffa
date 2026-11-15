// Host-side killstreaks: care packages (marker -> parachute crate -> capture -> random reward), UAV, airstrikes, armor.
// Airstrike: the caller picks a point + heading on the targeting laptop; the host validates, plans the run (3 jets, a
// carpet of bombs along a ~70 m corridor) and broadcasts it so every client animates the same jets / bombs / blasts.
import * as THREE from 'three';

export const STREAK = {
  care: 3, uav: 5, airstrike: 7,
  capTime: 2.0, ownerCapTime: 0.5, capRange: 3.2,
  dropDelay: 5, dropHeight: 120, fallTime: 6,
  uavTime: 30, speedTime: 30, armor: 100,
  crateLinger: 4,
};
/** Airstrike run: jets cross the target `delay + approach / speed` s after the call; bombs fall `fall` s and travel
 *  `drift` m forward while falling. Damage: linear falloff from `damage` at the center to 0 at `radius` (LOS-checked). */
export const STRIKE = {
  delay: 3, approach: 380, speed: 95, alt: 75, length: 70, bombs: 15, fall: 1.5, drift: 40,
  radius: 7, damage: 260, lateral: 9, trail: 11,
  jets: [[0, 0], [-9, 11], [9, 11]],   // [lateral offset m (right +), trail m] per jet
};
export const REWARDS = ['uav', 'armor', 'airstrike', 'resupply', 'speed'];
export const REWARD_NAMES = { uav: 'UAV', armor: 'Body Armor', airstrike: 'Airstrike', resupply: 'Ammo + Frags', speed: 'Speed Boost', care: 'Care Package' };

export class StreakRules {
  constructor(auth) {
    this.auth = auth;
    this.crates = new Map();
    this.strikes = [];        // { owner, team, at, p: Vector3 }
    this.nextCrate = 1;
  }

  _items(p) { this.auth.out({ t: 'items', id: p.id, items: p.items.slice(), streak: p.streak }); }

  grant(p, item) {
    p.items.push(item);
    this._items(p);
  }

  onKill(killer, victim) {
    if (!killer || killer === victim) return;
    if (killer.bot) {
      // AI bots only earn the airstrike (they call it in themselves); practice dummies earn nothing.
      if (!killer.ai) return;
      killer.streak = (killer.streak || 0) + 1;
      if (killer.streak === STREAK.airstrike) killer.items.push('airstrike');
      return;
    }
    killer.streak = (killer.streak || 0) + 1;
    if (killer.streak === STREAK.care) this.grant(killer, 'care');
    else if (killer.streak === STREAK.uav) this.grant(killer, 'uav');
    else if (killer.streak === STREAK.airstrike) this.grant(killer, 'airstrike');
    else this._items(killer);
  }

  onDeath(victim) {
    victim.streak = 0;
    if (!victim.bot) this._items(victim);
  }

  /** Laptop confirm from a client: { x, z, h } (target + compass heading, radians, 0 = north/-z, +pi/2 = east/+x). */
  useStrike(p, msg) {
    if (!p.alive || !Number.isFinite(msg.x) || !Number.isFinite(msg.z) || !Number.isFinite(msg.h)) return false;
    const i = p.items.indexOf('airstrike');
    if (i < 0) return false;
    p.items.splice(i, 1);
    if (!p.bot) this._items(p);
    if (p.spawnInfo) p.spawnInfo.dirty = true;
    this.callStrike(p.id, msg.x, msg.z, msg.h);
    return true;
  }

  _groundAt(x, z) {
    const hs = this.auth.bots.hitscan;
    const hit = hs.castWorld(_o.set(x, 250, z), _down, 400);
    if (hit) return hit.point.y;
    return this.auth.world.groundY ? this.auth.world.groundY(x, z) : 0;
  }

  /** Plans the run and schedules the bombs (damage is applied on the host at each impact time). */
  callStrike(ownerId, x, z, h) {
    const owner = this.auth.players.get(ownerId);
    const b = this.auth.world.playBounds;
    if (b) { x = Math.max(b.minX, Math.min(b.maxX, x)); z = Math.max(b.minZ, Math.min(b.maxZ, z)); }
    const S = STRIKE, now = this.auth.time();
    const dx = Math.sin(h), dz = -Math.cos(h);      // flight direction
    const rx = -dz, rz = dx;                         // right of the flight direction
    const gy = this._groundAt(x, z);
    const tc = S.delay + S.approach / S.speed;       // lead jet over the target, seconds from now
    const bombs = [];
    for (let i = 0; i < S.bombs; i++) {
      const s = -S.length / 2 + (S.length * i) / (S.bombs - 1) + (Math.random() - 0.5) * 2;
      const j = i % S.jets.length;
      const [lat, back] = S.jets[j];
      const l = lat * 0.3 + (Math.random() - 0.5) * 2;   // tight carpet: bombs land near the centre line
      const bx = x + dx * s + rx * l, bz = z + dz * s + rz * l;
      const by = this._groundAt(bx, bz);
      const at = tc + (s - S.drift + back) / S.speed + S.fall;
      bombs.push([r2(bx), r2(by), r2(bz), Math.round(at * 1000) / 1000, j]);
      this.strikes.push({ owner: ownerId, at: now + at, p: new THREE.Vector3(bx, by, bz) });
    }
    this.auth.out({
      t: 'strike', owner: ownerId, team: owner?.team ?? null, c: [r2(x), r2(gy), r2(z)], h: Math.round(h * 1000) / 1000,
      tc, alt: S.alt, v: S.speed, fall: S.fall, drift: S.drift, len: S.length, jets: S.jets, bombs,
    });
  }

  /** Player activated an item. UAV is instant; care/airstrike need a thrown marker (handled by the projectile). */
  useInstant(p, item) {
    const i = p.items.indexOf(item);
    if (i < 0) return false;
    p.items.splice(i, 1);
    this._items(p);
    if (item === 'uav') this._uav(p);
    return true;
  }

  /** Removes the item when its marker is thrown; returns false if the player doesn't own it. */
  consumeForMarker(p, item) {
    const i = p.items.indexOf(item);
    if (i < 0) return false;
    p.items.splice(i, 1);
    this._items(p);
    return true;
  }

  _uav(p) {
    this.auth.out({ t: 'uav', owner: p.id, team: p.team, dur: STREAK.uavTime });
  }

  /** A marker smoke settled at pos: call in the drop or the strike. */
  markerLanded(ownerId, item, pos) {
    const owner = this.auth.players.get(ownerId);
    const now = this.auth.time();
    const ground = pos.clone();
    if (this.auth.world.groundY) ground.y = Math.max(ground.y - 0.1, this.auth.world.groundY(ground.x, ground.z));
    // terrain: the crate box (1.2 x 0.9 m) settles on the lowest ground under it, so no corner hangs over a slope
    const T = this.auth.world.terrain;
    if (T && ground.y - T.heightAt(ground.x, ground.z) < 0.5) ground.y = Math.min(ground.y, T.minIn(ground.x, ground.z, 0.75));
    if (item === 'care') {
      const cid = this.nextCrate++;
      const c = { cid, owner: ownerId, team: owner?.team ?? null, p: ground.toArray(), t0: now, landAt: now + STREAK.dropDelay + STREAK.fallTime, state: 'incoming', caps: new Map() };
      this.crates.set(cid, c);
      this.auth.out({ t: 'crate', c: this._pub(c) });
    }
  }

  _pub(c) {
    const now = this.auth.time();
    return { cid: c.cid, owner: c.owner, p: c.p, state: c.state, land: Math.max(0, c.landAt - now), fall: STREAK.fallTime, by: c.by ?? null, reward: c.reward ?? null };
  }

  snapshot() { return [...this.crates.values()].map((c) => this._pub(c)); }

  /** Client started holding the capture key on a crate. */
  capBegin(p, cid) {
    const c = this.crates.get(cid);
    if (c && c.state === 'landed') c.caps.set(p.id, this.auth.time());
  }

  /** Client finished holding: validate time + distance, then open the crate. */
  capture(p, cid) {
    const c = this.crates.get(cid);
    if (!c || c.state !== 'landed' || !p.alive || !p.pos) return;
    const start = c.caps.get(p.id);
    const need = (p.id === c.owner ? STREAK.ownerCapTime : STREAK.capTime) - 0.35;
    if (start === undefined || this.auth.time() - start < need) return;
    if (Math.hypot(p.pos[0] - c.p[0], p.pos[2] - c.p[2]) > STREAK.capRange + 0.5) return;
    const reward = REWARDS[Math.floor(Math.random() * REWARDS.length)];
    c.state = 'taken'; c.by = p.id; c.reward = reward; c.goneAt = this.auth.time() + STREAK.crateLinger;
    this.auth.out({ t: 'crate', c: this._pub(c) });
    if (reward === 'armor') { p.armor = STREAK.armor; this.auth.out({ t: 'armor', id: p.id, armor: p.armor }); }
    else if (reward === 'uav') this._uav(p);
    else if (reward === 'airstrike') this.grant(p, 'airstrike');
    else if (reward === 'resupply') p.frags = Math.max(p.frags, 2);
    // resupply / speed are applied by the capturing client on the 'crate' message.
  }

  update() {
    const now = this.auth.time();
    for (const c of this.crates.values()) {
      if (c.state === 'incoming' && now >= c.landAt) { c.state = 'landed'; this.auth.out({ t: 'crate', c: this._pub(c) }); }
      if (c.state === 'taken' && now >= c.goneAt) { this.crates.delete(c.cid); this.auth.out({ t: 'crate', c: { cid: c.cid, state: 'gone' } }); }
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      if (now < s.at) continue;
      this.strikes.splice(i, 1);
      this.auth.explode(s.owner, s.p, STRIKE.radius, STRIKE.damage, 'airstrike', true);
    }
  }

  reset() { this.crates.clear(); this.strikes.length = 0; }
}


const r2 = (v) => Math.round(v * 100) / 100;
const _o = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
