// Client-side killstreaks: streak/items HUD state, care-package crates (descent, collision, hold-X capture),
// UAV minimap sweep, rewards (armor, resupply, speed). Host-authoritative: this mirrors host messages.
import * as THREE from 'three';
import { createCarePackage } from '../visuals/carePackage.js';
import { STREAK, REWARD_NAMES } from './streaks.js';
import { now as clock } from './authority.js';

const CRATE_SIZE = [1.2, 0.9, 0.9];

export class StreakView {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.streak = 0;
    this.crates = new Map();   // cid -> { cid, owner, p: Vector3, state, landAt, vis, collider }
    this.uavUntil = 0;
    this.speedUntil = 0;
    this.armor = 0;
    this.capturing = null;     // { cid, start, need }
  }

  // ---------- messages ----------
  onItems(m) {
    if (m.id !== this.game.localId) return;
    const before = this.items.length;
    this.items = m.items;
    this.streak = m.streak;
    if (m.items.length > before) {
      const it = m.items[m.items.length - 1];
      this.game.announce(`${REWARD_NAMES[it]} ready`, 'Press 4 to use', '#f2b544', 'good');
    }
  }

  onUav(m) {
    const g = this.game;
    const mine = m.owner === g.localId || (g.isCtf && m.team && m.team === g.myTeam);
    if (mine) {
      this.uavUntil = clock() + m.dur;
      g.announce('UAV online', 'Enemies revealed on the minimap', '#6fe3ff', 'good');
    } else g.announce('Enemy UAV online', '', '#ff4d55', 'bad');
  }

  onArmor(m) {
    if (m.id === this.game.localId) this.armor = m.armor;
  }

  onStrike(m) {
    const g = this.game;
    const mine = m.owner === g.localId;
    g.announce(mine ? 'Airstrike inbound' : 'Enemy airstrike inbound', mine ? '' : 'Get clear of the red smoke', mine ? '#f2b544' : '#ff4d55', mine ? 'neutral' : 'bad');
    g.audio.jet?.(new THREE.Vector3().fromArray(m.pts[Math.floor(m.pts.length / 2)]), m.delay);
  }

  onCrate(m) {
    const c = m.c, g = this.game;
    let e = this.crates.get(c.cid);
    if (c.state === 'gone') { if (e) this._removeCrate(e); return; }
    if (!e) {
      const vis = createCarePackage({ team: g.roster.get(c.owner)?.team ?? null });
      g.scene.add(vis.object3D);
      e = { cid: c.cid, owner: c.owner, p: new THREE.Vector3().fromArray(c.p), state: c.state, landAt: clock() + c.land, fall: c.fall, vis, collider: null };
      this.crates.set(c.cid, e);
      vis.setParachute(c.state === 'incoming');
      if (c.state === 'incoming') g.audio.plane?.(e.p.clone());
    }
    e.state = c.state;
    if (c.state === 'landed') this._land(e);
    if (c.state === 'taken') {
      this._land(e);
      e.vis.open();
      if (this.capturing?.cid === c.cid) this.capturing = null;
      const name = g.nameOf(c.by);
      const rn = REWARD_NAMES[c.reward] || c.reward;
      if (c.by === g.localId) {
        g.announce(rn, 'Care package secured', '#f2b544', 'capture');
        this._applyReward(c.reward);
      } else g.ui.toast(`${name} got ${rn}`);
    }
  }

  _applyReward(reward) {
    const g = this.game;
    if (reward === 'resupply') {
      for (const gun of g.arsenal.guns) gun.refill();
      g.throwables.frags = Math.max(g.throwables.frags, g.classDef.frags);
    } else if (reward === 'speed') this.speedUntil = clock() + STREAK.speedTime;
  }

  _land(e) {
    if (e.collider) return;
    e.vis.setParachute(false);
    e.vis.object3D.position.copy(e.p);
    // Solid crate for player movement.
    const geo = new THREE.BoxGeometry(...CRATE_SIZE);
    geo.translate(e.p.x, e.p.y + CRATE_SIZE[1] / 2, e.p.z);
    geo.computeBoundsTree?.();
    if (geo.boundsTree) {
      e.collider = new THREE.Mesh(geo);
      e.collider.userData.surface = 'wood';
      this.game.player.addDynamicCollider(e.collider);
    }
    this.game.audio.crateLand?.(e.p.clone());
  }

  _removeCrate(e) {
    this.game.scene.remove(e.vis.object3D);
    e.vis.dispose();
    if (e.collider) { this.game.player.removeDynamicCollider(e.collider); e.collider.geometry.dispose(); }
    this.crates.delete(e.cid);
  }

  // ---------- per frame ----------
  /** Returns HUD info for the capture prompt. */
  update(dt, t, holdX) {
    const g = this.game, p = g.player;
    for (const e of this.crates.values()) {
      if (e.state === 'incoming') {
        const left = e.landAt - t;
        if (left > e.fall) { e.vis.object3D.visible = false; continue; }
        e.vis.object3D.visible = true;
        const k = Math.max(0, left / e.fall);
        e.vis.object3D.position.set(e.p.x + Math.sin(t * 0.7) * 2 * k, e.p.y + STREAK.dropHeight * k * k * 0.6 + STREAK.dropHeight * 0.4 * k, e.p.z + Math.cos(t * 0.6) * 2 * k);
      }
      e.vis.update(dt);
    }
    // Capture (hold X near a landed crate).
    let prompt = null;
    if (g.alive) {
      let best = null;
      for (const e of this.crates.values()) {
        if (e.state !== 'landed') continue;
        const d = Math.hypot(p.position.x - e.p.x, p.position.z - e.p.z);
        if (d < STREAK.capRange && Math.abs(p.position.y - e.p.y) < 2.5 && (!best || d < best.d)) best = { e, d };
      }
      if (best) {
        const need = best.e.owner === g.localId ? STREAK.ownerCapTime : STREAK.capTime;
        if (holdX) {
          if (!this.capturing || this.capturing.cid !== best.e.cid) {
            this.capturing = { cid: best.e.cid, start: t, need, sent: false };
            g.session.send({ t: 'capBegin', cid: best.e.cid });
          }
          const prog = (t - this.capturing.start) / need;
          if (prog >= 1 && !this.capturing.sent) { this.capturing.sent = true; g.session.send({ t: 'capture', cid: best.e.cid }); }
          prompt = { text: 'Capturing care package', progress: Math.min(1, prog) };
        } else {
          this.capturing = null;
          prompt = { text: 'Hold X to capture care package', progress: 0 };
        }
      } else this.capturing = null;
    }
    return prompt;
  }

  get uavActive() { return clock() < this.uavUntil; }
  get speedMult() { return clock() < this.speedUntil ? 1.25 : 1; }

  /** Key 4: use the most recent item. */
  useItem(t) {
    const g = this.game;
    const item = this.items[this.items.length - 1];
    if (!item) { g.audio.grappleDeny(); return; }
    if (item === 'uav') g.session.send({ t: 'item', item: 'uav' });
    else if (g.throwables.throwMarker(t, item)) { /* consumed by the host when the marker is thrown */ }
  }

  resetForSpawn() { this.armor = 0; this.capturing = null; }

  dispose() {
    for (const e of [...this.crates.values()]) this._removeCrate(e);
  }
}
