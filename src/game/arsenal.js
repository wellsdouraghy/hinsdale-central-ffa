// Local player's carried weapons: loadout, slot switching, ADS progress, reload, recoil offsets, viewmodels.
import * as THREE from 'three';
import { createViewmodel, WEAPONS } from '../visuals/weapons.js';
import { Gun, WEAPON_STATS } from './weapons.js';

/** createViewmodel with a minimal stand-in if the visuals module fails, so gameplay never breaks. */
function safeViewmodel(id) {
  try {
    return createViewmodel(id);
  } catch (err) {
    console.error('[viewmodel] createViewmodel failed for', id, err);
    const object3D = new THREE.Group();
    return {
      object3D, update() {}, fire() {}, reload() {}, equip() {}, dispose() {},
      muzzleWorldPosition: (t, oc, wc) => t.set(0.1, -0.1, -0.6).applyMatrix4(wc.matrixWorld),
    };
  }
}

export function weaponName(id) {
  if (id === 'melee') return 'Melee';
  if (id === 'frag') return 'Frag Grenade';
  if (id === 'airstrike') return 'Airstrike';
  if (id === 'heli' || id === 'heligun') return 'Helicopter';
  if (id === 'rotor') return 'Rotor blades';
  if (id === 'crash') return 'Helicopter crash';
  if (id === 'rocket') return 'Heli Rocket';
  return WEAPONS?.[id]?.name || WEAPON_STATS[id]?.label || id;
}

export class Arsenal {
  constructor(overlayScene, audio) {
    this.overlayScene = overlayScene;
    this.audio = audio;
    this.guns = [];
    this.viewmodels = [];
    this.slot = 0;
    this.ads = 0;
    this.switchUntil = 0;
    this.recoil = { pitch: 0, yaw: 0 };
    this.primaryId = null;
  }

  get gun() { return this.guns[this.slot]; }
  get viewmodel() { return this.viewmodels[this.slot]; }

  /** (Re)builds guns for a primary + pistol; refills ammo. */
  setLoadout(primaryId, t) {
    if (this.primaryId !== primaryId || !this.viewmodels.length) {
      this.disposeViewmodels();
      this.primaryId = primaryId;
      this.guns = [new Gun(primaryId), new Gun('pistol')];
      this.viewmodels = this.guns.map((g) => {
        const vm = safeViewmodel(g.id);
        vm.object3D.visible = false;
        this.overlayScene.add(vm.object3D);
        return vm;
      });
    } else {
      for (const g of this.guns) g.refill();
    }
    this.slot = 0;
    this.ads = 0;
    this.recoil.pitch = 0;
    this.recoil.yaw = 0;
    this._show();
    this.switchUntil = t + this.gun.stats.equipTime;
    this.viewmodel.equip();
  }

  _show() {
    this.viewmodels.forEach((vm, i) => { vm.object3D.visible = i === this.slot; });
  }

  hideAll() { this.viewmodels.forEach((vm) => { vm.object3D.visible = false; }); }

  switchTo(i, t) {
    if (i === this.slot || !this.guns[i]) return;
    this.gun.cancelReload();
    this.slot = i;
    this.ads = 0;
    this._show();
    this.switchUntil = t + this.gun.stats.equipTime;
    this.viewmodel.equip();
    this.audio.equip();
  }

  startReload(t) {
    const g = this.gun;
    const dur = g.startReload(t);
    if (dur > 0) {
      this.viewmodel.reload(dur);
      this.audio.reload(g.id, dur);
    }
    return dur;
  }

  /** Advances ADS toward `want` and decays recoil offsets. */
  update(dt, t, wantAds, firing) {
    const st = this.gun.stats;
    const target = wantAds ? 1 : 0;
    const step = dt / st.adsTime;
    this.ads = target > this.ads ? Math.min(target, this.ads + step) : Math.max(target, this.ads - step * 1.3);
    const k = Math.exp(-st.recoil.recover * dt * (firing ? 0.35 : 1));
    this.recoil.pitch *= k;
    this.recoil.yaw *= k;
    for (const g of this.guns) g.update(t, dt, firing && g === this.gun);
  }

  switching(t) { return t < this.switchUntil; }

  disposeViewmodels() {
    for (const vm of this.viewmodels) {
      this.overlayScene.remove(vm.object3D);
      vm.dispose?.();
    }
    this.viewmodels = [];
  }
}
