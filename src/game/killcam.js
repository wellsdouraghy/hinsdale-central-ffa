// Kill cam: every client records ~8 s of everyone's movement (remote state history + our own positions) and shot /
// explosion events. When we die to another player, we replay the last ~4 s from over the killer's shoulder.
import { lookForClass } from './classes.js';
import * as THREE from 'three';
import { createCharacter } from '../visuals/character.js';
import { INTERP_DELAY, deathFall, settleCorpse } from './remotePlayer.js';
import { now as clock } from './authority.js';
import { WEAPON_STATS } from './weapons.js';
import { terrainActive, conformToGround, lieWeight } from './groundConform.js';

const KEEP = 8;
const LEAD = 3.6;   // seconds of replay before the kill
const TAIL = 0.7;   // seconds after the kill

export class KillCamRecorder {
  constructor() {
    this.self = [];
    this.events = [];
    this.heli = [];          // helicopter pose track (for helicopter killcams)
    this.lastSelf = -1;
    this.lastHeli = -1;
  }

  /** Helicopter pose as we saw it (pos, yaw/pitch/roll, pilot id), ~30 Hz, kept KEEP seconds. */
  recordHeli(t, hv) {
    if (!hv?.active || t - this.lastHeli < 1 / 30) return;
    this.lastHeli = t;
    const o = hv.vis.object3D, p = hv.pos;
    this.heli.push({ t, p: [p.x, p.y, p.z], yaw: o.rotation.y, pitch: o.rotation.x, roll: o.rotation.z, pilot: hv.s?.pilot ?? null });
    while (this.heli.length && this.heli[0].t < t - KEEP) this.heli.shift();
  }

  heliAt(t) {
    const h = this.heli;
    if (!h.length) return null;
    let a = h[0], b = h[h.length - 1];
    if (t <= a.t) return a;
    if (t >= b.t) return b;
    for (let i = 0; i < h.length - 1; i++) if (h[i].t <= t && h[i + 1].t >= t) { a = h[i]; b = h[i + 1]; break; }
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    const ang = (x, y) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * k;
    return { t, p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k],
      yaw: ang(a.yaw, b.yaw), pitch: a.pitch + (b.pitch - a.pitch) * k, roll: a.roll + (b.roll - a.roll) * k, pilot: b.pilot };
  }

  /** ads: the local aim-down-sights amount (0..1); the rest comes from the controller (as in the 'st' state). */
  recordSelf(t, player, ads = 0) {
    if (t - this.lastSelf < 1 / 30) return;
    this.lastSelf = t;
    const p = player.position, v = player.velocity;
    this.self.push({
      t, p: [p.x, p.y, p.z], yaw: player.yaw, pitch: player.pitch, c: player.crouching, v: [v.x, v.y, v.z],
      g: player.grounded, s: player.sprinting, a: ads, m: player.ladder ? 2 : player.mantle ? 3 : player.sliding ? 1 : player.dashT > 0 ? 4 : 0,
      ga: player.grapple ? player.grapple.anchor.clone() : null,
    });
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
    return { ...a, p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k] };
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
    this.ghost = createCharacter({ color: me?.color ?? 0xcccccc, name: me?.name ?? '', look: lookForClass(me?.cls) });
    this.ghost.setRelation?.('ally');
    game.scene.add(this.ghost.object3D);
    this.ghostDead = false;
    this.camPos = null;
    // Helicopter kill: the killer was flying (cannon, rockets, a crash): replay the helicopter, not their seat body.
    const hk = game.killcamRec.heliAt(info.killTime);
    this.heliReplay = !!(game.heliView && game.killcamRec.heli.length &&
      (['heli', 'heligun', 'rocket', 'heliCrash'].includes(info.w) || (hk && hk.pilot === info.killerId && hk.pilot !== null)));
    this.scoped = false;      // the killer is looking through a scope right now (the HUD draws the scope overlay)
    this.scopeK = 0;
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
    if (s && !this.ghostDead && rt >= this.info.killTime) {
      // the same death as everyone else sees for a remote body: away from the killer / blast, momentum, walls, ledges
      this.ghostDead = true;
      this.ghostFeet = new THREE.Vector3().fromArray(s.p);
      const d = deathFall(this.ghostFeet, new THREE.Vector3().fromArray(s.v), s.g !== false, this.info.from || null, s.yaw);
      this.ghostCorpse = d.corpse;
      this.ghost.die(d.fall);
    }
    if (this.ghostDead && this.ghostCorpse && !settleCorpse(this.ghostCorpse, this.ghostFeet, Math.min(dt, 0.05))) this.ghostCorpse = null;
    if (s) {
      if (this.ghostDead) this.ghost.object3D.position.copy(this.ghostFeet);
      else this.ghost.object3D.position.fromArray(s.p);
      if (this.ghostDead && terrainActive()) conformToGround(this.ghost.object3D, s.yaw, lieWeight(rt - this.info.killTime));   // lies on the slope
      else this.ghost.object3D.rotation.y = s.yaw;
      this.ghost.setState({
        speed: Math.hypot(s.v[0], s.v[2]), vx: s.v[0], vy: s.v[1], vz: s.v[2], crouching: s.c, aimPitch: s.pitch, weaponId: g.arsenal.gun?.id || 'ar',
        grounded: s.g !== false, sprinting: !!s.s, ads: s.a || 0, mode: s.m || 0, grapple: s.ga || null,
      });
    }
    this.ghost.update(dt);
    // Replay shots / explosions in the window.
    for (const e of g.killcamRec.events) {
      if (e.t <= prev || e.t > rt) continue;
      if (e.type === 'shot') {
        const r = g.remotes.get(e.id);
        const fromHeli = this.heliReplay && e.id === this.info.killerId;   // cannon rounds leave the helicopter's nose
        if (!fromHeli) r?.character.fire();
        const from = r && !fromHeli ? r.muzzle(new THREE.Vector3()) : e.from;
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
    if (this.heliReplay && this._heliCamera(dt)) return;
    if (this.info.w === 'airstrike') {
      const run = g.strikeView?.runBy(this.info.killerId);
      if (run) { this._strikeCamera(run, dt); return; }
    }
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
    // Aiming down sights: zoom like the killer's own view did (see game.js _updateCamera). A scoped rifle past 85 %
    // goes to the first-person scope picture (camera at the killer's eye, scope overlay on, their body hidden).
    const ws = WEAPON_STATS[sm.w], ads = THREE.MathUtils.clamp(sm.a || 0, 0, 1), base = g._baseVFov();
    const scoped = !!(ws?.scope && ads > 0.85);
    this.scopeK += ((scoped ? 1 : 0) - this.scopeK) * Math.min(1, dt * 14);
    this.scoped = scoped && this.scopeK > 0.6;
    let fov = base;
    if (ws?.scope) fov = base + (ws.adsFov - base) * this.scopeK;
    else if (ws) fov = base * (1 + (ws.adsZoom - 1) * ads);
    cam.position.copy(this.camPos).lerp(eye, this.scopeK);
    cam.lookAt(eye.clone().addScaledVector(fwd, 30));
    if (this.scopeK > 0.5) k.character.object3D.visible = false;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * (ws?.scope ? 18 : 8));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /**
   * Helicopter kills: pose the helicopter from the recorded track and chase it from behind and above, framing the
   * spot where we died. Returns false when there is no track for this moment (falls back to the normal camera).
   */
  _heliCamera(dt) {
    const g = this.game, cam = g.camera, hv = g.heliView;
    const h = g.killcamRec.heliAt(this.rt);
    if (!h || !hv) return false;
    hv._pose(new THREE.Vector3().fromArray(h.p), h.yaw, h.pitch, h.roll);
    hv.vis.object3D.visible = true;
    hv.vis.setRotorSpeed?.(1);
    const pos = hv.pos;
    const fwd = new THREE.Vector3(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
    const victim = this.ghost.object3D.position.clone().add(new THREE.Vector3(0, 1, 0));
    // Behind the helicopter, on the side away from the victim, raised so both are in frame.
    const want = pos.clone().addScaledVector(fwd, -15).add(new THREE.Vector3(0, 5.5, 0));
    const hit = g.hitscan.castWorld(pos, want.clone().sub(pos).normalize(), want.distanceTo(pos));
    if (hit) want.copy(pos).addScaledVector(want.clone().sub(pos).normalize(), Math.max(4, hit.distance - 0.5));
    if (!this.camPos) this.camPos = want.clone();
    else this.camPos.lerp(want, Math.min(1, dt * 6));
    const focus = pos.clone().lerp(victim, 0.55);
    if (!this.look) this.look = focus.clone();
    else this.look.lerp(focus, Math.min(1, dt * 6));
    this.scoped = false;
    cam.position.copy(this.camPos);
    cam.lookAt(this.look);
    cam.fov += (g._baseVFov() - cam.fov) * Math.min(1, dt * 8);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return true;
  }

  /** Airstrike kills: high above and behind the run, panning along the bomb line as the blasts walk down it. */
  _strikeCamera(run, dt) {
    const g = this.game, cam = g.camera;
    const k = THREE.MathUtils.clamp((this.rt - (run.first - 0.8)) / (run.last - run.first + 1.6), 0, 1);
    const focus = run.c.clone().addScaledVector(run.dir, -run.len / 2 + run.len * k);
    const want = run.c.clone().addScaledVector(run.dir, -run.len / 2 - 50).addScaledVector(run.right, 14).add(new THREE.Vector3(0, 48, 0));
    if (!this.camPos) this.camPos = want.clone();
    else this.camPos.lerp(want, Math.min(1, dt * 4));
    if (!this.look) this.look = focus.clone();
    else this.look.lerp(focus, Math.min(1, dt * 5));
    this.scoped = false;
    cam.position.copy(this.camPos);
    cam.lookAt(this.look);
    cam.fov += (g._baseVFov() - cam.fov) * Math.min(1, dt * 8);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  dispose() {
    // Hand the helicopter back to live updates (a parked one is only re-posed when its state changes).
    const hv = this.game.heliView;
    if (this.heliReplay && hv?.s) {
      if (hv.s.state === 'parked') hv._pose(new THREE.Vector3().fromArray(hv.s.pos), hv.s.yaw, hv.s.pitch || 0, hv.s.roll || 0);
      if (!hv.active) hv.vis.object3D.visible = false;
    }
    this.game.scene.remove(this.ghost.object3D);
    this.ghost.dispose();
    // Remote characters resume live interpolation next frame; hide the dead ones again.
    for (const r of this.game.remotes.values()) if (!r.alive && !r.bot) r.character.object3D.visible = false;
    const k = this.game.remotes.get(this.info.killerId);
    if (k?.alive) k.character.object3D.visible = true;   // hidden while we looked through their scope
  }
}
