// Flying the helicopter (local pilot): arcade-but-weighty flight, chase camera, chin cannon with overheat,
// rocket salvos, collisions, flight-time warning, exit. Pose is streamed to the host at 20 Hz.
import * as THREE from 'three';
import { now as clock } from './authority.js';

const DEG = Math.PI / 180;
const MAX_SPEED = 28, BOOST_SPEED = 42, VERT_SPEED = 10, CEILING = 120;
const CANNON_RPS = 10, CANNON_SPREAD = 0.5 * DEG, CANNON_DMG = 20, CANNON_RANGE = 600;
const HEAT_PER_SEC = 1 / 3, COOL_PER_SEC = 0.45, ROCKET_RELOAD = 4;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

export class HeliPilot {
  constructor(game, view, s) {
    this.game = game;
    this.view = view;
    this.pos = new THREE.Vector3().fromArray(s.pos);
    this.vel = new THREE.Vector3();
    this.yaw = s.yaw;
    this.camPitch = -0.15;
    this.tilt = { pitch: 0, roll: 0 };
    this.heat = 0; this.overheated = false; this.nextShot = 0;
    this.rocketsReadyAt = 0; this.rid = 1; this.pendingRocket = null;
    this.sendT = 0;
    this.hp = s.hp;
    this.camPos = null;
    this.grounded = true;
    game.piloting = true;
    game.arsenal.hideAll();
    game.audio.equip();
    game.announce('Helicopter', 'LMB cannon · RMB rockets · Space/C climb/descend · X exit near ground', '#f2b544', 'good');
  }

  syncHost(s) {
    if (s.hp < this.hp - 1) this.game.hud.heliFlash?.();
    this.hp = s.hp;
  }

  get center() { return this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)); }

  update(dt, t) {
    const g = this.game, inp = g.input, hs = g.hitscan;
    const active = inp.active && g.match.state === 'playing';
    const key = (c) => active && inp.isDown(c);
    // Mouse: yaw steers, vertical look aims the guns (the chase camera follows the aim).
    const sens = 0.0021 * g.settings.sensitivity;
    if (active) {
      this.yaw -= g._frameDx * sens;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch - g._frameDy * sens, -70 * DEG, 25 * DEG);
    }
    const fwdIn = (key('KeyW') ? 1 : 0) - (key('KeyS') ? 1 : 0);
    const strIn = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
    const upIn = (key('Space') ? 1 : 0) - (key('KeyC') || key('ControlLeft') || key('ControlRight') ? 1 : 0);
    const boost = key('ShiftLeft') || key('ShiftRight');
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = fwd.multiplyScalar(fwdIn).addScaledVector(right, strIn);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(boost && fwdIn > 0 ? BOOST_SPEED : MAX_SPEED);
    const kh = 1 - Math.exp(-1.1 * dt), kv = 1 - Math.exp(-2.2 * dt);
    this.vel.x += (want.x - this.vel.x) * kh;
    this.vel.z += (want.z - this.vel.z) * kh;
    this.vel.y += (upIn * VERT_SPEED - this.vel.y) * kv;
    if (this.grounded && upIn <= 0) { this.vel.x *= 0.9; this.vel.z *= 0.9; }
    // Move + collide.
    const step = this.vel.clone().multiplyScalar(dt);
    const len = step.length();
    if (len > 1e-4) {
      const c = this.center;
      const hit = hs.castWorld(c, step.clone().divideScalar(len), len + 2.4);
      if (hit && hit.distance < len + 2.4) {
        // Impact speed into the surface; nose-first = flying forward into it.
        const impact = Math.max(0, -this.vel.dot(hit.normal));
        const nose = fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).dot(hit.normal) < -0.7;
        this._impact(t, impact, hit.point, nose);
        // Slide along the surface.
        const vn = this.vel.dot(hit.normal);
        if (vn < 0) this.vel.addScaledVector(hit.normal, -vn * 1.3);
        step.copy(this.vel).multiplyScalar(dt);
      }
      this.pos.add(step);
    }
    // Ground / landing.
    const down = hs.castWorld(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(0, -1, 0), 400);
    const groundY = down ? down.point.y : 0;
    this.grounded = this.pos.y <= groundY + 0.05;
    if (this.pos.y < groundY) {
      // Touchdown: hard landings hurt, landing upside-down / heavily rolled is fatal.
      const flip = Math.abs(this.tilt.roll) > 70 * DEG || Math.abs(this.tilt.pitch) > 70 * DEG;
      if (this.vel.y < -1 || flip) this._impact(t, -this.vel.y, this.pos.clone(), false, flip);
      this.pos.y = groundY;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    this._rotorStrike(t);
    this.altitude = this.pos.y - groundY;
    const terrain = g.world.groundY ? g.world.groundY(this.pos.x, this.pos.z) : 0;
    if (this.pos.y > terrain + CEILING) { this.pos.y = terrain + CEILING; this.vel.y = Math.min(0, this.vel.y); }
    const b = g.world.playBounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
    // Banking / nose tilt with speed and input.
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const fwdSpeed = this.vel.x * -Math.sin(this.yaw) + this.vel.z * -Math.cos(this.yaw);
    const sideSpeed = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    const kt = 1 - Math.exp(-3 * dt);
    this.tilt.pitch += ((this.grounded ? 0 : -fwdSpeed / BOOST_SPEED * 0.35) - this.tilt.pitch) * kt;
    this.tilt.roll += ((this.grounded ? 0 : -sideSpeed / MAX_SPEED * 0.4 - (g._frameDx || 0) * sens * 4) - this.tilt.roll) * kt;
    this.view._pose(this.pos, this.yaw, this.tilt.pitch, this.tilt.roll);

    // Keep the pilot's player body in the seat (host uses it for distance checks; others see the pilot).
    g.player.position.set(this.pos.x, this.pos.y + 0.6, this.pos.z);
    g.player.velocity.copy(this.vel);
    g.player.yaw = this.yaw;
    g.player.pitch = this.camPitch;

    this._camera(dt);
    this._weapons(dt, t, active);

    // Exit (X) near the ground.
    if (active && g._framePressed?.has('KeyX')) {
      if (this.altitude <= 3.5) g.session.send({ t: 'heliExit' });
      else g.ui.toast('Too high to exit');
    }
    // Stream pose to the host.
    this.sendT += dt;
    if (this.sendT >= 0.05) {
      this.sendT = 0;
      g.session.send({ t: 'hst', ts: r3(clock()), p: [r2(this.pos.x), r2(this.pos.y), r2(this.pos.z)], yaw: r3(this.yaw), pitch: r3(this.tilt.pitch), roll: r3(this.tilt.roll), v: [r2(this.vel.x), r2(this.vel.y), r2(this.vel.z)] });
    }
    g.hud.heli({ hp: this.hp / 900, heat: this.heat, overheated: this.overheated, rockets: Math.max(0, this.rocketsReadyAt - t), speed: hv, alt: this.altitude });
    // Low-hull warning beeps.
    if (this.hp / 900 < 0.3 && t > (this.beepT || 0)) { this.beepT = t + 0.9; g.audio.beep?.(); }
  }

  /** Reports an impact to the host (it decides the damage); local crunch, sparks and cockpit shake. */
  _impact(t, speed, point, nose = false, flip = false) {
    const g = this.game;
    if (speed < 6 && !flip) { if (speed > 2.5 && t > (this.thudT || 0)) { this.thudT = t + 0.4; g.audio.footstep?.('metal', null, 1.2); } return; }
    if (t < (this.crashT || 0)) return;
    this.crashT = t + 0.35;
    g.session.send({ t: 'heliCrash', speed: Math.round(speed * 10) / 10, nose, flip, p: [r2(point.x), r2(point.y), r2(point.z)] });
    g.throwables.shake = Math.min(1, 0.4 + speed / 20);
    g.hud.heliFlash?.();
  }

  /** Main rotor tips against walls (8 radial probes at rotor height). */
  _rotorStrike(t) {
    if (t < (this.rotorT || 0)) return;
    this.rotorT = t + 0.1;
    const o = this.view.vis.object3D;
    const hub = new THREE.Vector3(0, 3.25, 0).applyQuaternion(o.quaternion).add(o.position);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(o.quaternion);
      const hit = this.game.hitscan.castWorld(hub, dir, 5.5);
      if (hit) {
        this.rotorT = t + 0.6;
        this.game.session.send({ t: 'heliRotor', p: [r2(hit.point.x), r2(hit.point.y), r2(hit.point.z)] });
        this.game.throwables.shake = Math.max(this.game.throwables.shake, 0.6);
        this.game.hud.heliFlash?.();
        // Bounce away from what the blades hit.
        this.vel.addScaledVector(dir, -6);
        return;
      }
    }
  }

  aimRay() {
    const cam = this.game.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const hit = this.game.hitscan.castWorld(cam.position, dir, CANNON_RANGE);
    return hit ? hit.point : cam.position.clone().addScaledVector(dir, CANNON_RANGE);
  }

  _camera(dt) {
    const g = this.game, cam = g.camera;
    const look = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.camPitch, this.yaw, 0, 'YXZ'));
    const pivot = this.center.add(new THREE.Vector3(0, 1.4, 0));
    const want = pivot.clone().addScaledVector(look, -14).add(new THREE.Vector3(0, 2.5, 0));
    const dir = want.clone().sub(pivot);
    const dist = dir.length();
    const hit = g.hitscan.castWorld(pivot, dir.normalize(), dist);
    if (hit) want.copy(pivot).addScaledVector(dir, Math.max(2, hit.distance - 0.5));
    if (!this.camPos) this.camPos = want.clone(); else this.camPos.lerp(want, 1 - Math.exp(-10 * dt));
    cam.position.copy(this.camPos);
    cam.lookAt(pivot.clone().addScaledVector(look, 40));
    const fov = g._baseVFov() * (1 + Math.min(0.12, Math.hypot(this.vel.x, this.vel.z) / 350));
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 6);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  _weapons(dt, t, active) {
    const g = this.game, inp = g.input, vis = this.view.vis;
    const firing = active && inp.isDown('Mouse0') && !this.overheated;
    if (firing) this.heat = Math.min(1, this.heat + HEAT_PER_SEC * dt);
    else this.heat = Math.max(0, this.heat - COOL_PER_SEC * dt);
    if (this.heat >= 1) { this.overheated = true; g.audio.dryFire(); }
    if (this.overheated && this.heat < 0.35) this.overheated = false;
    const aimPoint = this.aimRay();
    // Turret follows the aim (local angles).
    const local = this.view.vis.object3D.worldToLocal(aimPoint.clone());
    vis.aimGun?.(Math.atan2(-local.x, -local.z), Math.atan2(local.y - 0.8, Math.hypot(local.x, local.z)));
    if (firing && t >= this.nextShot) {
      this.nextShot = t + 1 / CANNON_RPS;
      this._cannon(aimPoint);
    }
    // Rockets: RMB, two per salvo, 4 s reload.
    if (active && g._framePressed?.has('Mouse2') && t >= this.rocketsReadyAt) {
      this.rocketsReadyAt = t + ROCKET_RELOAD;
      this._rocket(0, aimPoint);
      this.pendingRocket = { at: t + 0.15, aimPoint };
    }
    if (this.pendingRocket && t >= this.pendingRocket.at) { this._rocket(1, this.pendingRocket.aimPoint); this.pendingRocket = null; }
  }

  _cannon(aimPoint) {
    const g = this.game, vis = this.view.vis;
    vis.object3D.updateMatrixWorld(true);
    const muzzle = vis.gunMuzzle.getWorldPosition(new THREE.Vector3());
    const base = aimPoint.clone().sub(muzzle).normalize();
    const dir = cone(base, CANNON_SPREAD);
    const wh = g.hitscan.castWorld(muzzle, dir, CANNON_RANGE);
    const targets = [];
    for (const r of g.remotes.values()) if (r.alive && !r.inHeliSeat) targets.push(r.hitbox());
    const th = g.hitscan.castTargets(muzzle, dir, wh ? wh.distance : CANNON_RANGE, targets);
    let end, kind;
    if (th) {
      end = th.point; kind = 2;
      g.effects.blood(end, dir);
      g.session.send({ t: 'hit', target: th.id, dmg: CANNON_DMG, w: 'heligun' });
      g.hud.hitmarker('hit');
      g.audio.hitmarker('hit');
    } else if (wh) { end = wh.point; kind = 1; g.effects.impact(end, wh.normal, wh.surface); }
    else { end = muzzle.clone().addScaledVector(dir, CANNON_RANGE); kind = 0; }
    g.effects.tracer(muzzle, end);
    vis.fireGun();
    g.audio.cannon?.(null);
    const e = kind === 1 ? [r2(end.x), r2(end.y), r2(end.z), 1, r3(wh.normal.x), r3(wh.normal.y), r3(wh.normal.z), wh.surface] : [r2(end.x), r2(end.y), r2(end.z), kind];
    g.session.send({ t: 'shot', w: 'heligun', o: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], e: [e] });
  }

  _rocket(side, aimPoint) {
    const g = this.game, vis = this.view.vis;
    vis.object3D.updateMatrixWorld(true);
    const o = vis.rocketPods[side].getWorldPosition(new THREE.Vector3());
    const d = aimPoint.clone().sub(o).normalize();
    const rid = this.rid++;
    this.view.addLocalRocket(rid, o, d);
    vis.fireRocket(side);
    g.session.send({ t: 'rocket', rid, o: o.toArray().map(r2), d: d.toArray().map(r3) });
  }

  dispose() {
    this.game.piloting = false;
    this.game.hud.heli(null);
  }
}

function cone(aim, spread) {
  const up = Math.abs(aim.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(aim, up).normalize();
  const v = new THREE.Vector3().crossVectors(u, aim).normalize();
  const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
  return aim.clone().addScaledVector(u, Math.cos(a) * Math.tan(r)).addScaledVector(v, Math.sin(a) * Math.tan(r)).normalize();
}
