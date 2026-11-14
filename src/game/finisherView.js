// Client side of melee finishers: the host picks a scene and broadcasts { t:'finisher', id, attacker, victim, origin,
// yaw, dur }. Every client plays it on the two characters (remote interpolation paused for them; the local player gets a
// stand-in character), fires the scene's sound / blood events, and - when we are in it - drives the camera along the
// scene's path (raycast-clamped so it never goes inside walls), blending out of / back into first person.
import { lookForClass } from './classes.js';
import * as THREE from 'three';
import { createFinisher } from '../visuals/finishers.js';
import { createCharacter } from '../visuals/character.js';
import { now as clock } from './authority.js';

const BLEND_IN = 0.45, BLEND_OUT = 0.35;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3();
const _look = new THREE.PerspectiveCamera();   // cameras look down -z (Object3D.lookAt would face +z)

export class FinisherView {
  constructor(game) {
    this.game = game;
    this.scenes = [];          // active scenes
    this.cam = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
    this.blendOut = null;      // { t0, pos, quat, fov } after our own scene ends
    this.localBody = null;     // stand-in character for the local victim (left lying until we respawn)
  }

  /** The local player is the attacker of a running scene (input locked, first person off). */
  get localAttacking() { return this.scenes.some((s) => s.attacker === this.game.localId); }
  /** Our camera follows a scene (we are the attacker or the victim). */
  get localScene() { return this.scenes.find((s) => s.attacker === this.game.localId || s.victim === this.game.localId) || null; }
  involves(id) { return this.scenes.some((s) => s.attacker === id || s.victim === id); }

  _actor(id) {
    const g = this.game;
    if (id === g.localId) {
      const e = g.roster.get(id);
      const ch = createCharacter({ color: e?.color ?? 0xcccccc, name: e?.name ?? '', look: lookForClass(e?.cls) });
      ch.setRelation?.('ally');
      const p = g.player;
      ch.object3D.position.copy(p.position);
      ch.object3D.rotation.y = p.yaw;
      ch.setState({ weaponId: g.arsenal.gun?.id || 'ar', grounded: true, speed: 0 });
      g.scene.add(ch.object3D);
      return { character: ch, local: true, remote: null };
    }
    const r = g.remotes.get(id);
    if (!r) return null;
    r.character.object3D.visible = true;
    return { character: r.character, local: false, remote: r };
  }

  onFinisher(m) {
    const g = this.game;
    // One scene per player at a time: a newer one replaces anything they were in.
    for (const s of [...this.scenes]) if (s.attacker === m.attacker || s.victim === m.victim || s.attacker === m.victim) this._end(s, true);
    const A = this._actor(m.attacker), V = this._actor(m.victim);
    if (!A || !V) { this._disposeActor(A); this._disposeActor(V); return; }
    const f = createFinisher({ id: m.id, attacker: A.character, victim: V.character });
    const origin = new THREE.Vector3().fromArray(m.origin);
    f.setOrigin(origin, m.yaw);
    const s = { m, f, A, V, origin, attacker: m.attacker, victim: m.victim, t0: clock(), dur: m.dur ?? f.duration, ev: 0, camStart: null, ended: false };
    if (A.remote) A.remote.puppeted = true;
    if (V.remote) V.remote.puppeted = true;
    this.scenes.push(s);
    if (s.attacker === g.localId || s.victim === g.localId) {
      const cam = g.camera;
      s.camStart = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };
      this.blendOut = null;
    }
    if (s.attacker === g.localId) {
      g.arsenal.hideAll();
      g.adsToggled = false;
      g.announce(f.name, 'Finisher', '#f2b544', 'neutral');
    }
    g.audio.melee?.(origin.clone().setY(origin.y + 1.2));
  }

  /** Attacker or victim killed / gone: stop the scene (the victim stays down). */
  cancelFor(id) { for (const s of [...this.scenes]) if (s.attacker === id || s.victim === id) this._end(s, true); }
  cancelAll() { for (const s of [...this.scenes]) this._end(s, true); }

  update(dt) {
    const g = this.game, t = clock();
    for (const s of [...this.scenes]) {
      const lt = t - s.t0;
      s.f.update(lt);
      if (s.A.local) s.A.character.update(dt);
      if (s.V.local) s.V.character.update(dt);
      // Keep hitboxes / minimap / audio on the puppets.
      const hips = s.f.bonePosition('Hips', _a, 'attacker');
      if (s.A.remote) s.A.remote.feet.set(hips.x, s.origin.y, hips.z);
      if (s.A.local) { g.player.position.set(hips.x, s.origin.y, hips.z); g.player.velocity.set(0, 0, 0); }
      if (s.V.remote) s.V.remote.feet.copy(s.origin);
      // Sound / blood events.
      while (s.ev < s.f.events.length && lt >= s.f.events[s.ev].t) this._event(s, s.f.events[s.ev++]);
      if (lt >= s.dur) this._end(s, false);
    }
  }

  _event(s, e) {
    const g = this.game;
    const p = s.f.bonePosition(e.bone || 'Spine1', new THREE.Vector3());
    if (e.type === 'whoosh') g.audio.melee?.(p);
    else if (e.type === 'impact') g.audio.impact?.(p);
    else if (e.type === 'thud') { g.audio.thud?.(p); g.effects.impact?.(p.clone().setY(s.origin.y + 0.05), new THREE.Vector3(0, 1, 0), 'dirt'); }
    else if (e.type === 'blood') {
      const dir = _dir.subVectors(p, s.f.bonePosition('Hips', _b, 'attacker')).setY(0.3).normalize();
      g.effects.blood(p, dir.clone());
      g.audio.stab?.(p);
    }
    if (e.type === 'impact' || e.type === 'blood') {
      const d = g.camera.position.distanceTo(p);
      if (s.attacker === g.localId || s.victim === g.localId) g.throwables.shake = Math.max(g.throwables.shake, 0.25);
      else if (d < 10) g.throwables.shake = Math.max(g.throwables.shake, 0.1);
    }
  }

  _end(s, cancelled) {
    if (s.ended) return;
    s.ended = true;
    const g = this.game;
    s.f.finish();
    this.scenes.splice(this.scenes.indexOf(s), 1);
    if (s.A.remote) s.A.remote.puppeted = false;
    if (s.V.remote) s.V.remote.puppeted = false;
    if (s.A.local) {
      // Back to first person at the scene's end mark (unless we died during it).
      const cam = g.camera;
      this.blendOut = { t0: clock(), pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };
      if (!cancelled && g.alive) {
        const end = s.f.attackerEnd;
        g.player.teleport(end.position.clone().setY(s.origin.y + 0.05), end.yaw);
        g.player.pitch = -0.1;
        g.arsenal.viewmodel?.equip?.();
        g.stateTimer = 1;   // send the new position right away
      }
      this._disposeActor(s.A);
    }
    if (s.V.local) {
      // Leave our body lying where the scene left it until we respawn.
      if (this.localBody) this._disposeActor({ character: this.localBody, local: true });
      this.localBody = s.V.character;
    }
    if (s.victim === g.localId) g.finisherDone?.(s);
  }

  _disposeActor(A) {
    if (!A || !A.local) return;
    this.game.scene.remove(A.character.object3D);
    A.character.dispose?.();
  }

  /** Local respawn: remove our stand-in body. */
  clearLocalBody() {
    if (!this.localBody) return;
    this._disposeActor({ character: this.localBody, local: true });
    this.localBody = null;
  }

  /** Overrides the camera while we are in a scene, and blends back into first person after ours ends. */
  applyCamera(dt) {
    const g = this.game, cam = g.camera, t = clock();
    const s = this.localScene;
    if (s) {
      const lt = Math.min(t - s.t0, s.dur);
      const c = s.f.camera(lt, this.cam);
      // Never inside walls: clamp from the target toward the camera, and within the scene's camera radius.
      const rad = s.f.cameraRadius;
      if (rad) {
        _dir.set(c.pos.x - s.origin.x, 0, c.pos.z - s.origin.z);
        const h = _dir.length();
        if (h > rad) c.pos.addScaledVector(_dir.normalize(), rad - h);
      }
      _dir.subVectors(c.pos, c.target);
      const len = _dir.length();
      if (len > 1e-3) {
        _dir.divideScalar(len);
        const hit = g.hitscan.castWorld(c.target, _dir, len + 0.5);
        if (hit) c.pos.copy(c.target).addScaledVector(_dir, Math.max(0.45, hit.distance - 0.5));
      }
      _look.position.copy(c.pos);
      _look.lookAt(c.target);
      const k = s.camStart ? smooth(Math.min(1, (t - s.t0) / BLEND_IN)) : 1;
      if (k < 1) {
        cam.position.lerpVectors(s.camStart.pos, c.pos, k);
        cam.quaternion.slerpQuaternions(s.camStart.quat, _look.quaternion, k);
        cam.fov = s.camStart.fov + (c.fov - s.camStart.fov) * k;
      } else {
        cam.position.copy(c.pos);
        cam.quaternion.copy(_look.quaternion);
        cam.fov = c.fov;
      }
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      return true;
    }
    const b = this.blendOut;
    if (b) {
      const k = smooth(Math.min(1, (t - b.t0) / BLEND_OUT));
      if (k >= 1 || !g.alive) { this.blendOut = null; return false; }
      // The normal first-person camera has been placed this frame: ease into it.
      cam.position.lerpVectors(b.pos, cam.position, k);
      cam.quaternion.slerpQuaternions(b.quat, cam.quaternion.clone(), k);
      cam.fov = b.fov + (cam.fov - b.fov) * k;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    }
    return false;
  }

  dispose() {
    this.cancelAll();
    this.clearLocalBody();
  }
}

function smooth(x) { return x * x * (3 - 2 * x); }
