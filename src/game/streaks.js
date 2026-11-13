// Host-side killstreaks: care packages (marker -> parachute crate -> capture -> random reward), UAV, airstrikes, armor.
import * as THREE from 'three';

export const STREAK = {
  care: 3, uav: 5, airstrike: 7,
  capTime: 2.0, ownerCapTime: 0.5, capRange: 3.2,
  dropDelay: 5, dropHeight: 120, fallTime: 6,
  uavTime: 30, speedTime: 30, armor: 100,
  strikeDelay: 3, strikeCount: 5, strikeSpacing: 6, strikeGap: 0.35, strikeRadius: 8, strikeDamage: 160,
  crateLinger: 4,
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
    if (!killer || killer === victim || killer.bot) return;
    killer.streak = (killer.streak || 0) + 1;
    if (killer.streak === STREAK.care) this.grant(killer, 'care');
    else if (killer.streak === STREAK.uav) this.grant(killer, 'uav');
    else if (killer.streak === STREAK.airstrike) this.grant(killer, 'airstrike');
    else this._items(killer);
  }

  onDeath(victim) {
    if (victim.bot) return;
    victim.streak = 0;
    this._items(victim);
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
    if (item === 'care') {
      const cid = this.nextCrate++;
      const c = { cid, owner: ownerId, team: owner?.team ?? null, p: ground.toArray(), t0: now, landAt: now + STREAK.dropDelay + STREAK.fallTime, state: 'incoming', caps: new Map() };
      this.crates.set(cid, c);
      this.auth.out({ t: 'crate', c: this._pub(c) });
    } else if (item === 'airstrike') {
      // Sweep across the marker along the thrower's facing (or east-west if unknown).
      let dir = new THREE.Vector3(1, 0, 0);
      if (owner?.pos) { dir.set(ground.x - owner.pos[0], 0, ground.z - owner.pos[2]); if (dir.lengthSq() < 1) dir.set(1, 0, 0); dir.normalize(); }
      const pts = [];
      for (let i = 0; i < STREAK.strikeCount; i++) {
        const off = (i - (STREAK.strikeCount - 1) / 2) * STREAK.strikeSpacing;
        const q = ground.clone().addScaledVector(dir, off);
        if (this.auth.world.groundY) q.y = this.auth.world.groundY(q.x, q.z);
        pts.push(q);
        this.strikes.push({ owner: ownerId, team: owner?.team ?? null, at: now + STREAK.strikeDelay + i * STREAK.strikeGap, p: q });
      }
      this.auth.out({ t: 'strike', owner: ownerId, pts: pts.map((q) => q.toArray().map((v) => Math.round(v * 100) / 100)), delay: STREAK.strikeDelay, gap: STREAK.strikeGap });
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
      this.auth.explode(s.owner, s.p, STREAK.strikeRadius, STREAK.strikeDamage, 'airstrike');
    }
  }

  reset() { this.crates.clear(); this.strikes.length = 0; }
}

