// Client-side grenades and smoke markers: local cook/throw, remote throws, simulated arcs, explosions, danger indicator,
// camera shake and ear-ringing on close blasts. The host decides the real detonation point (`boom` / `blast` messages).
import * as THREE from 'three';
import { createGrenade } from '../visuals/grenade.js';
import { Projectile, NADE, throwVelocity } from './grenades.js';

const COOK_MAX = NADE.fuse;
const THROW_ANIM = 0.6;          // viewmodel throw length; release at ~55%

export class Throwables {
  constructor(game) {
    this.game = game;
    this.live = new Map();       // key `${owner}:${cid}` -> { pr, vis, owner, kind, item }
    this.nextCid = 1;
    this.cookStart = null;       // clock time the pin was pulled
    this.pendingThrow = null;    // { at, kind, item, cooked }
    this.frags = 0;
    this.shake = 0;
  }

  resetForSpawn(frags) {
    this.frags = frags;
    this.cookStart = null;
    this.pendingThrow = null;
  }

  // ---------- local input ----------
  /** G pressed: pull the pin (cook). */
  beginCook(t) {
    if (this.frags <= 0 || this.cookStart !== null || this.pendingThrow) { if (this.frags <= 0) this.game.audio.dryFire(); return false; }
    this.cookStart = t;
    this.game.arsenal.viewmodel?.setGrenadeInHand?.(true);
    this.game.audio.pin?.();
    return true;
  }

  /** G released: throw with the remaining fuse. */
  release(t) {
    if (this.cookStart === null) return;
    const cooked = t - this.cookStart;
    this.cookStart = null;
    this._startThrow(t, 'frag', null, cooked);
  }

  /** Killstreak marker (care package / airstrike): thrown like a grenade, no damage. */
  throwMarker(t, item) {
    if (this.pendingThrow || this.cookStart !== null) return false;
    this._startThrow(t, 'marker', item, 0);
    return true;
  }

  _startThrow(t, kind, item, cooked) {
    const g = this.game;
    g.arsenal.viewmodel?.throwGrenade?.(THROW_ANIM);
    g.arsenal.viewmodel?.setGrenadeInHand?.(false);
    this.pendingThrow = { at: t + THROW_ANIM * 0.55, kind, item, cooked };
  }

  cookFraction(t) { return this.cookStart === null ? 0 : Math.min(1, (t - this.cookStart) / COOK_MAX); }

  // ---------- network ----------
  onRemoteThrow(m) {
    const r = this.game.remotes.get(m.id);
    r?.character.throwGrenade?.();
    this._spawn(m.id, m.cid, m.kind, m.o, m.v, m.fuse, m.item);
  }

  onBoom(m) {
    const key = `${m.id}:${m.cid}`;
    const e = this.live.get(key);
    if (e) this._remove(key);
    this.explosionAt(new THREE.Vector3().fromArray(m.p), 7);
  }

  onMarker(m) {
    const key = `${m.id}:${m.cid}`;
    const e = this.live.get(key);
    if (e) this._remove(key);
    const p = new THREE.Vector3().fromArray(m.p);
    const color = m.item === 'airstrike' ? 0xff3322 : 0xffaa22;
    this.game.effects.smokeMarker?.(p, { color, durationSec: m.item === 'airstrike' ? 6 : 12 });
    this.game.killcam?.recordEvent('smoke', p);
  }

  explosionAt(p, radius = 7) {
    const g = this.game;
    const wh = g.hitscan.castWorld(p.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, -1, 0), 2);
    g.effects.explosion?.(p, { radius, surface: wh?.surface || 'dirt' });
    if (!g.effects.explosion) g.effects.impact(p, new THREE.Vector3(0, 1, 0), 'dirt');
    g.audio.explosion?.(p.clone());
    g.killcam?.recordEvent('boom', p);
    const d = g.camera.position.distanceTo(p);
    if (d < 30) this.shake = Math.max(this.shake, Math.min(1, 1.4 - d / 22));
    if (d < 9) g.audio.ringing?.(Math.min(3, 4 - d / 3));
  }

  // ---------- simulation ----------
  _spawn(owner, cid, kind, o, v, fuse, item) {
    const pr = new Projectile({ kind, pos: o, vel: v, fuse });
    let vis = null;
    if (kind === 'frag' || kind === 'marker') {
      vis = createGrenade();
      vis.object3D.position.copy(pr.pos);
      this.game.scene.add(vis.object3D);
    }
    this.live.set(`${owner}:${cid}`, { pr, vis, owner, kind, item });
  }

  _remove(key) {
    const e = this.live.get(key);
    if (!e) return;
    if (e.vis) { this.game.scene.remove(e.vis.object3D); e.vis.dispose(); }
    this.live.delete(key);
  }

  update(dt, t) {
    const g = this.game;
    // Release a pending local throw at the animation's release moment.
    if (this.pendingThrow && t >= this.pendingThrow.at) {
      const pt = this.pendingThrow;
      this.pendingThrow = null;
      if (g.alive) this._launch(pt, t);
    }
    // Cooked too long: it goes off in your hand.
    if (this.cookStart !== null && t - this.cookStart >= COOK_MAX) {
      this.cookStart = null;
      g.arsenal.viewmodel?.setGrenadeInHand?.(false);
      this._launch({ kind: 'frag', item: null, cooked: COOK_MAX, inHand: true }, t);
    }
    for (const [key, e] of this.live) {
      const r = e.pr.advance(dt, g.world);
      if (e.vis) {
        e.vis.object3D.position.copy(e.pr.pos);
        e.vis.object3D.rotation.copy(e.pr.rot);
        e.vis.update(dt);
      }
      // The host announces the real detonation; drop stale visuals if that message never comes.
      if (r === 'boom' || e.pr.age > NADE.fuse + 2.5 || (e.kind === 'marker' && e.pr.age > NADE.markerRest + 2.5)) {
        if (e.kind === 'frag' && e.pr.age > NADE.fuse + 2.5) this._remove(key);
        else if (e.kind === 'marker' && e.pr.age > NADE.markerRest + 2.5) this._remove(key);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
  }

  _launch(pt, t) {
    const g = this.game, p = g.player;
    const eye = p.getEye(new THREE.Vector3());
    const dir = g._viewDir(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const origin = pt.inHand ? eye.clone().addScaledVector(dir, 0.3) : eye.clone().addScaledVector(dir, 0.4).addScaledVector(right, -0.15);
    // Make sure the start point isn't inside a wall.
    const wh = g.hitscan.castWorld(eye, origin.clone().sub(eye).normalize(), eye.distanceTo(origin) + 0.1);
    if (wh) origin.copy(eye);
    const vel = pt.inHand ? new THREE.Vector3() : throwVelocity(dir, p.velocity);
    const fuse = pt.kind === 'frag' ? Math.max(0, NADE.fuse - pt.cooked) : NADE.fuse;
    const cid = this.nextCid++;
    if (pt.kind === 'frag') this.frags = Math.max(0, this.frags - 1);
    const r2 = (x) => Math.round(x * 1000) / 1000;
    this._spawn(g.localId, cid, pt.kind, origin, vel, fuse, pt.item);
    g.session.send({ t: 'nade', cid, kind: pt.kind, item: pt.item, o: origin.toArray().map(r2), v: vel.toArray().map(r2), fuse });
    g.protectUntil = 0;
    g.audio.throwWhoosh?.();
  }

  /** Live frags within `radius` of `pos` (for the HUD danger indicator). */
  dangers(pos, radius = NADE.radius + 1) {
    const out = [];
    for (const e of this.live.values()) if (e.kind === 'frag' && e.pr.pos.distanceTo(pos) < radius) out.push(e.pr.pos);
    return out;
  }

  /** Camera shake offsets (radians) for this frame. */
  shakeOffset(t) {
    const s = this.shake * this.shake;
    return { pitch: Math.sin(t * 61) * 0.02 * s, yaw: Math.sin(t * 47 + 1) * 0.02 * s, roll: Math.sin(t * 53 + 2) * 0.03 * s };
  }

  dispose() {
    for (const key of [...this.live.keys()]) this._remove(key);
  }
}

