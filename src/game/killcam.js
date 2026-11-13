// Kill cam: every client records ~8 s of everyone's movement (remote state history + our own positions) and shot /
// explosion events. When we die to another player, we replay the last ~4 s from over the killer's shoulder.
import * as THREE from 'three';
import { createCharacter } from '../visuals/character.js';
import { INTERP_DELAY } from './remotePlayer.js';
import { now as clock } from './authority.js';

const KEEP = 8;
const LEAD = 3.6;   // seconds of replay before the kill
const TAIL = 0.7;   // seconds after the kill

export class KillCamRecorder {
  constructor() {
    this.self = [];
    this.events = [];
    this.lastSelf = -1;
  }

  recordSelf(t, player) {
    if (t - this.lastSelf < 1 / 30) return;
    this.lastSelf = t;
    const p = player.position;
    this.self.push({ t, p: [p.x, p.y, p.z], yaw: player.yaw, pitch: player.pitch, c: player.crouching, v: [player.velocity.x, 0, player.velocity.z] });
    while (this.self.length && this.self[0].t < t - KEEP) this.self.shift();
  }

  recordShot(id, from, ends, weapon) {
    this.events.push({ t: clock(), type: 'shot', id, from: from.clone(), ends: ends.map((e) => new THREE.Vector3(e[0], e[1], e[2])), weapon });
    this._prune();
  }

  recordEvent(type, p) {
    this.events.push({ t: clock(), type, p: p.clone() });
    this._prune();
  }

  _prune() {
    const t = clock();
    while (this.events.length && this.events[0].t < t - KEEP) this.events.shift();
  }

  selfAt(t) {
    const h = this.self;
    if (!h.length) return null;
    let a = h[0], b = h[h.length - 1];
    if (t <= a.t) return a;
    if (t >= b.t) return b;
    for (let i = 0; i < h.length - 1; i++) if (h[i].t <= t && h[i + 1].t >= t) { a = h[i]; b = h[i + 1]; break; }
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    return { p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k], yaw: a.yaw, pitch: a.pitch, c: a.c, v: a.v };
  }
}

export class KillCam {
  /** info: { killerId, killTime (local clock), weapon, killerHp, killerName } */
  constructor(game, info) {
    this.game = game;
    this.info = info;
    this.t0 = info.killTime - LEAD;
    this.t1 = info.killTime + TAIL;
    this.rt = this.t0;
    this.done = false;
    const me = game.roster.get(game.localId);
    this.ghost = createCharacter({ color: me?.color ?? 0xcccccc, name: me?.name ?? '' });
    game.scene.add(this.ghost.object3D);
    this.ghostDead = false;
    this.camPos = null;
  }

  update(dt) {
    const g = this.game;
    const prev = this.rt;
    this.rt += dt;
    const rt = this.rt;
    // Remote players from their histories (what we saw at that moment, incl. the interpolation delay).
    for (const r of g.remotes.values()) {
      if (r.offset === null) continue;
      const sm = r.sampleAt(rt - r.offset - INTERP_DELAY);
      if (sm) r.applySample(sm, dt);
      else if (!r.bot) r.character.object3D.visible = false;
    }
    // Us (the victim).
    const s = g.killcamRec.selfAt(rt);
    if (s) {
      this.ghost.object3D.position.fromArray(s.p);
      this.ghost.object3D.rotation.y = s.yaw;
      this.ghost.setState({ speed: Math.hypot(s.v[0], s.v[2]), crouching: s.c, aimPitch: s.pitch, weaponId: g.arsenal.gun?.id || 'ar', grounded: true, sprinting: false });
    }
    if (!this.ghostDead && rt >= this.info.killTime) { this.ghostDead = true; this.ghost.die(); }
    this.ghost.update(dt);
    // Replay shots / explosions in the window.
    for (const e of g.killcamRec.events) {
      if (e.t <= prev || e.t > rt) continue;
      if (e.type === 'shot') {
        const r = g.remotes.get(e.id);
        r?.character.fire();
        const from = r ? r.muzzle(new THREE.Vector3()) : e.from;
        for (const end of e.ends.slice(0, 3)) g.effects.tracer(from, end);
        if (e.id === this.info.killerId) g.audio.shot(e.weapon, from.clone());
      } else if (e.type === 'boom') {
        g.effects.explosion?.(e.p, { radius: 7 });
        g.audio.explosion?.(e.p.clone());
      } else if (e.type === 'smoke') g.effects.smokeMarker?.(e.p, { durationSec: 4 });
    }
    this._camera(dt);
    if (rt >= this.t1) this.done = true;
    return this.done;
  }

  /** Over-the-shoulder camera on the killer, pulled in if a wall is behind them. */
  _camera(dt) {
    const g = this.game, cam = g.camera;
    const k = g.remotes.get(this.info.killerId);
    if (!k || k.offset === null) return;
    const sm = k.sampleAt(this.rt - k.offset - INTERP_DELAY);
    if (!sm) return;
    const eye = new THREE.Vector3(sm.p[0], sm.p[1] + (sm.c ? 1.05 : 1.65), sm.p[2]);
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(sm.pitch, sm.yaw, 0, 'YXZ'));
    const right = new THREE.Vector3(Math.cos(sm.yaw), 0, -Math.sin(sm.yaw));
    const want = eye.clone().addScaledVector(fwd, -2.3).addScaledVector(right, 0.65).add(new THREE.Vector3(0, 0.35, 0));
    const dir = want.clone().sub(eye);
    const dist = dir.length();
    const hit = g.hitscan.castWorld(eye, dir.normalize(), dist + 0.3);
    if (hit) want.copy(eye).addScaledVector(dir, Math.max(0.4, hit.distance - 0.3));
    if (!this.camPos) this.camPos = want.clone();
    else this.camPos.lerp(want, Math.min(1, dt * 12));
    cam.position.copy(this.camPos);
    cam.lookAt(eye.clone().addScaledVector(fwd, 30));
    cam.fov += (g._baseVFov() - cam.fov) * Math.min(1, dt * 8);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  dispose() {
    this.game.scene.remove(this.ghost.object3D);
    this.ghost.dispose();
    // Remote characters resume live interpolation next frame; hide the dead ones again.
    for (const r of this.game.remotes.values()) if (!r.alive && !r.bot) r.character.object3D.visible = false;
  }
}
