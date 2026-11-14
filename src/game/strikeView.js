// Client-side airstrike runs: three jets in a tight formation sweep along the host-planned heading, release sticks of
// bombs that fall onto the planned impact points, and the blasts go off on schedule (damage is applied by the host at
// the same moments). Everything is a pure function of time, so the kill cam can replay a run from above.
import * as THREE from 'three';
import { createStrikeJet, createBomb } from '../visuals/airstrike.js';
import { now as clock } from './authority.js';

const VISIBLE_ALONG = 900;    // jets are drawn while within this many meters of the target along the run
const KEEP_AFTER = 14;        // seconds a finished run is kept (kill cam replay)
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _vel = new THREE.Vector3();

export class StrikeView {
  constructor(game) {
    this.game = game;
    this.runs = [];
  }

  onStrike(m) {
    const g = this.game, t0 = clock();
    const dir = new THREE.Vector3(Math.sin(m.h), 0, -Math.cos(m.h));
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const c = new THREE.Vector3().fromArray(m.c);
    const run = {
      owner: m.owner, team: m.team, c, dir, right, h: m.h, v: m.v, fall: m.fall, len: m.len ?? 70,
      tc: t0 + m.tc, alt: c.y + m.alt,
      jets: m.jets.map(([lat, back], i) => ({ lat, back, lift: i === 0 ? 0 : 3, vis: null, voice: null })),
      bombs: m.bombs.map((b) => ({ p: new THREE.Vector3(b[0], b[1], b[2]), at: t0 + b[3], j: b[4], vis: null, done: false })),
    };
    run.first = Math.min(...run.bombs.map((b) => b.at));
    run.last = Math.max(...run.bombs.map((b) => b.at));
    run.end = run.tc + (VISIBLE_ALONG + 60) / run.v;
    this.runs.push(run);
    const mine = m.owner === g.localId || (g.isTeams && m.team && m.team === g.myTeam);
    g.announce(mine ? 'Airstrike inbound' : 'Enemy airstrike inbound', mine ? (m.owner === g.localId ? '' : `Called by ${g.nameOf(m.owner)}`) : 'Take cover', mine ? '#f2b544' : '#ff4d55', mine ? 'neutral' : 'bad');
  }

  /** The most recent run called by `ownerId` (kill cam). */
  runBy(ownerId) {
    for (let i = this.runs.length - 1; i >= 0; i--) if (this.runs[i].owner === ownerId) return this.runs[i];
    return null;
  }

  jetPos(run, jet, t, out) {
    const along = (t - run.tc) * run.v - jet.back;
    return out.copy(run.c).addScaledVector(run.dir, along).addScaledVector(run.right, jet.lat).setY(run.alt + jet.lift);
  }

  /** Bomb position while falling (released under its jet, decelerating forward, accelerating down). */
  bombPos(run, b, t, out) {
    const rel = b.at - run.fall;
    const jet = run.jets[b.j] || run.jets[0];
    const k = THREE.MathUtils.clamp((t - rel) / run.fall, 0, 1);
    this.jetPos(run, jet, rel, _q);
    const kh = 1 - Math.pow(1 - k, 3);
    out.set(_q.x + (b.p.x - _q.x) * kh, _q.y + (b.p.y - _q.y) * k * k, _q.z + (b.p.z - _q.z) * kh);
    return out;
  }

  /** t: the clock time to show (the kill cam passes its replay time). live: trigger blasts / audio. */
  update(dt, t, live = true) {
    const g = this.game, now = clock();
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i];
      // Jets.
      for (const jet of run.jets) {
        const along = (t - run.tc) * run.v - jet.back;
        const show = Math.abs(along) < VISIBLE_ALONG;
        if (show && !jet.vis) {
          jet.vis = createStrikeJet();
          jet.vis.setAfterburner?.(true);
          g.scene.add(jet.vis.object3D);
        }
        if (jet.vis) {
          jet.vis.object3D.visible = show;
          if (show) {
            this.jetPos(run, jet, t, jet.vis.object3D.position);
            jet.vis.object3D.rotation.set(0, -run.h, 0);
            jet.vis.update?.(dt);
          }
        }
        // Roar (live only): one voice per jet, doppler from the motion.
        if (live && show && !jet.voice) jet.voice = g.audio.jetFlyby?.(jet === run.jets[0] ? 1 : 0.6) || null;
        if (jet.voice) {
          if (!live || !show) { jet.voice.stop(); jet.voice = null; }
          else jet.voice.update(this.jetPos(run, jet, t, _p), _vel.copy(run.dir).multiplyScalar(run.v));
        }
      }
      // Bombs.
      for (const b of run.bombs) {
        const falling = t >= b.at - run.fall && t < b.at;
        if (falling && !b.vis) { b.vis = createBomb(); g.scene.add(b.vis.object3D); }
        if (b.vis) {
          if (!falling) { g.scene.remove(b.vis.object3D); b.vis.dispose?.(); b.vis = null; }
          else {
            const o = b.vis.object3D;
            this.bombPos(run, b, t, o.position);
            this.bombPos(run, b, t + 0.03, _p);
            o.lookAt(_q.copy(o.position).multiplyScalar(2).sub(_p));   // -z (nose) along the velocity
            b.vis.update?.(dt);
          }
        }
        if (!b.done && now >= b.at) {
          b.done = true;
          if (live) g.throwables.explosionAt(b.p, 7);   // records a kill-cam 'boom' too
        }
      }
      if (now > run.end + KEEP_AFTER) { this._dispose(run); this.runs.splice(i, 1); }
      else if (live && t > run.end) for (const jet of run.jets) if (jet.vis) jet.vis.object3D.visible = false;
    }
  }

  _dispose(run) {
    const g = this.game;
    for (const jet of run.jets) {
      jet.voice?.stop();
      if (jet.vis) { g.scene.remove(jet.vis.object3D); jet.vis.dispose?.(); }
    }
    for (const b of run.bombs) if (b.vis) { g.scene.remove(b.vis.object3D); b.vis.dispose?.(); }
  }

  reset() { for (const r of this.runs) this._dispose(r); this.runs.length = 0; }
  dispose() { this.reset(); }
}
