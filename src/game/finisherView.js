// Client side of melee finishers: the host picks a scene and broadcasts { t:'finisher', id, attacker, victim, origin,
// yaw, dur }. Every client plays it on the two characters (remote interpolation paused for them; the local player gets a
// stand-in character), fires the scene's sound / blood / dust events, and - when we are in it - drives the camera along
// the scene's path (cuts, punch-in and shake come from the scene; raycast-clamped so it never goes inside walls) with
// letterbox bars, a darkened frame during slow motion and a short red vignette pulse on the kill blow, blending out of
// / back into first person.
import { lookForClass } from './classes.js';
import * as THREE from 'three';
import { createFinisher, clearSpot } from '../visuals/finishers.js';
import { createCharacter } from '../visuals/character.js';
import { now as clock } from './authority.js';
import { terrainActive, slopeTilt, groundAt } from './groundConform.js';

const BLEND_IN = 0.45, BLEND_OUT = 0.35;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3(), _g = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
// Fallbacks for an audio module without finisher(type, pos, intensity).
const OLD_SOUND = { whoosh: 'melee', impact: 'impact', heavy: 'impact', crack: 'impact', land: 'impact', slam: 'thud', stab: 'stab', slash: 'stab' };
const _look = new THREE.PerspectiveCamera();   // cameras look down -z (Object3D.lookAt would face +z)
const _tq = new THREE.Quaternion(), _sn = new THREE.Vector3();

export class FinisherView {
  constructor(game) {
    this.game = game;
    this.scenes = [];          // active scenes
    this.cam = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
    this.blendOut = null;      // { t0, pos, quat, fov } after our own scene ends
    this.localBody = null;     // stand-in character for the local victim (left lying until we respawn)
    this.pulse = 0;            // red vignette on the kill blow (0..1, decays)
    this.cine = 0;             // letterbox amount (0..1)
    this.dark = 0;             // slow-motion darkening (0..1)
    this.ui = null;            // overlay elements, created on first use
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
      f.fitCamera(g.hitscan.castWorld);   // walls nearby: swing the shots round to the open side
      this.blendOut = null;
    }
    if (s.attacker === g.localId) {
      g.arsenal.hideAll();
      g.adsToggled = false;
      g.announce(f.name, 'Finisher', '#f2b544', 'neutral');
    }
    if (!g.audio.finisher) g.audio.melee?.(origin.clone().setY(origin.y + 1.2));
  }

  /** Attacker or victim killed / gone: stop the scene (the victim stays down). */
  cancelFor(id) { for (const s of [...this.scenes]) if (s.attacker === id || s.victim === id) this._end(s, true); }
  cancelAll() { for (const s of [...this.scenes]) this._end(s, true); }

  update(dt) {
    const g = this.game, t = clock();
    for (const s of [...this.scenes]) {
      const lt = t - s.t0;
      s.f.update(lt);
      const dyA = terrainActive() ? this._conform(s) : 0;
      if (s.A.local) s.A.character.update(dt);
      if (s.V.local) s.V.character.update(dt);
      // Keep hitboxes / minimap / audio on the puppets.
      const hips = s.f.bonePosition('Hips', _a, 'attacker');
      if (s.A.remote) s.A.remote.feet.set(hips.x, s.origin.y + dyA, hips.z);
      if (s.A.local) { g.player.position.set(hips.x, s.origin.y + dyA, hips.z); g.player.velocity.set(0, 0, 0); }
      if (s.V.remote) s.V.remote.feet.copy(s.origin);
      // Sound / blood events.
      while (s.ev < s.f.events.length && lt >= s.f.events[s.ev].t) this._event(s, s.f.events[s.ev++]);
      if (lt >= s.dur) this._end(s, false);
    }
  }

  /**
   * Terrain: the scene is authored on level ground at the victim's feet. On a slope (the host allows up to ~18 degrees)
   * the victim's root is tilted onto the slope plane as the body goes down (rotation about the origin, which lies on the
   * ground, maps the scene's floor onto the slope), and the attacker is raised / lowered to the slope under their hips.
   * Returns the attacker's height offset. Called after every f.update (which resets both roots).
   */
  _conform(s, lie = null) {
    const o = s.origin, n = this.game.world.groundNormal(o.x, o.z, _sn);
    if (n.y > 0.9995) return 0;
    const dy = (x, z) => -(n.x * (x - o.x) + n.z * (z - o.z)) / n.y;
    if (lie === null) { const hv = s.f.bonePosition('Hips', _b, 'victim'); const k = Math.max(0, Math.min(1, (0.85 - (hv.y - o.y)) / 0.5)); lie = k * k * (3 - 2 * k); }
    if (lie > 0) s.V.character.object3D.quaternion.premultiply(slopeTilt(o.x, o.z, lie, _tq));
    const ha = s.f.bonePosition('Hips', _b, 'attacker'); const d = dy(ha.x, ha.z);
    s.A.character.object3D.position.y += d;
    return d;
  }

  _sound(type, pos, intensity) {
    const a = this.game.audio;
    if (a.finisher) a.finisher(type, pos, intensity);
    else if (OLD_SOUND[type]) a[OLD_SOUND[type]]?.(pos);
  }

  /** Ground point under `p` and its surface type. */
  _ground(s, p) {
    const top = terrainActive() ? Math.max(s.origin.y, p.y, groundAt(p.x, p.z)) : s.origin.y;
    const h = this.game.hitscan.castWorld(_g.set(p.x, top + 0.8, p.z), DOWN, terrainActive() ? 3 : 2);
    return { point: new THREE.Vector3(p.x, h ? h.point.y : s.origin.y, p.z), surface: h?.surface || 'dirt' };
  }

  _event(s, e) {
    const g = this.game, fx = g.effects;
    const p = s.f.bonePosition(e.bone || 'Spine1', new THREE.Vector3(), e.who);
    const mine = s.attacker === g.localId || s.victim === g.localId;
    if (e.type) this._sound(e.type, p, e.intensity);
    if (e.fx === 'blood' || e.fx === 'gush') {
      const dir = _dir.subVectors(p, s.f.bonePosition('Hips', _b, 'attacker')).setY(0);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
      dir.normalize();
      if (e.up) dir.multiplyScalar(0.35).setY(1);
      else if (e.side) dir.set(Math.cos(s.m.yaw), 0.25, -Math.sin(s.m.yaw));   // the scene's +x (attacker's right)
      else dir.setY(0.3);
      const amount = e.fx === 'gush' ? 1.8 : 0.7;
      if (fx.bloodBurst) fx.bloodBurst(p, dir.clone().normalize(), amount); else fx.blood(p, dir.clone().normalize());
    } else if (e.fx === 'dust' || e.fx === 'puff') {
      const gr = this._ground(s, p);
      if (fx.dustRing) fx.dustRing(gr.point, e.fx === 'puff' ? 0.45 : e.big ? 1.3 : 0.9, gr.surface, e.fx === 'puff' ? 0.3 : e.big ? 1.4 : 0.8);
      else fx.impact?.(gr.point, UP, 'dirt');
    } else if (e.fx === 'pool') fx.bloodPool?.(this._ground(s, p).point, 0.3);
    if (mine) { if (e.pulse) this.pulse = Math.max(this.pulse, e.pulse); }
    else if (e.shake && g.camera.position.distanceTo(p) < 8) g.throwables.shake = Math.max(g.throwables.shake, e.shake * 0.25);   // bystanders feel the big hits a little
  }

  _end(s, cancelled) {
    if (s.ended) return;
    s.ended = true;
    const g = this.game;
    s.f.finish();
    if (terrainActive() && s.V.local) this._conform(s, 1);   // finish() re-posed the scene on level ground: lay our body on the slope again
    this.scenes.splice(this.scenes.indexOf(s), 1);
    if (s.A.remote) s.A.remote.puppeted = false;
    if (s.V.remote) s.V.remote.puppeted = false;
    if (s.A.local) {
      // Back to first person at the scene's end mark (unless we died during it).
      const cam = g.camera;
      this.blendOut = { t0: clock(), pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };
      if (!cancelled && g.alive) {
        const end = s.f.attackerEnd;
        const spot = clearSpot(g.hitscan.castWorld, s.origin, end.position);
        g.player.teleport(spot.setY((terrainActive() ? g.world.terrain.standY(spot.x, spot.z) : s.origin.y) + 0.05), end.yaw);
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
      const floor = terrainActive() ? Math.max(s.origin.y - 1, groundAt(c.pos.x, c.pos.z)) + 0.2 : s.origin.y + 0.2;
      if (c.pos.y < floor) c.pos.y = floor;
      _look.position.copy(c.pos);
      _look.lookAt(c.target);
      if (c.roll) _look.rotateZ(c.roll);
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
      this._overlay(dt, 1, 1 - s.f.rate(lt));
      return true;
    }
    this._overlay(dt, 0, 0);
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

  /** Letterbox bars, slow-motion darkening and the kill-blow vignette (DOM overlay under the HUD). */
  _overlay(dt, cine, slow) {
    if (!this.ui) {
      if (!cine || typeof document === 'undefined') return;
      const mk = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;right:0;pointer-events:none;z-index:9;' + css; document.body.appendChild(d); return d; };
      this.ui = {
        top: mk('top:0;height:9vh;background:#000;transform:translateY(-100%)'), bottom: mk('bottom:0;height:9vh;background:#000;transform:translateY(100%)'),
        dark: mk('top:0;bottom:0;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 40%,rgba(0,0,0,0.75) 100%)'),
        red: mk('top:0;bottom:0;opacity:0;background:radial-gradient(ellipse at center,rgba(90,0,0,0) 45%,rgba(120,4,4,0.6) 100%)'),
      };
    }
    const k = (rate) => 1 - Math.exp(-rate * Math.min(dt, 0.1));
    this.cine += (cine - this.cine) * k(9);
    this.dark += (slow - this.dark) * k(slow > this.dark ? 30 : 7);
    this.pulse = Math.max(0, this.pulse - Math.min(dt, 0.1) * 2.6);
    const u = this.ui, off = (1 - this.cine) * 100;
    u.top.style.transform = `translateY(${-off.toFixed(1)}%)`; u.bottom.style.transform = `translateY(${off.toFixed(1)}%)`;
    u.dark.style.opacity = (this.dark * 0.6).toFixed(3); u.red.style.opacity = (this.pulse * this.pulse * 0.7).toFixed(3);
    if (!cine && this.cine < 0.004 && this.pulse <= 0 && this.dark < 0.004) { for (const d of Object.values(u)) d.remove(); this.ui = null; this.cine = this.dark = 0; }
  }

  dispose() {
    this.cancelAll();
    this.clearLocalBody();
    if (this.ui) { for (const d of Object.values(this.ui)) d.remove(); this.ui = null; }
  }
}

function smooth(x) { return x * x * (3 - 2 * x); }
