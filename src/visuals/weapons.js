// PLACEHOLDER viewmodels: grey boxes. Replaced by the Visuals builder.
import * as THREE from 'three';

export const WEAPONS = {
  ar: { name: 'M4 Assault Rifle' },
  smg: { name: 'MP5 SMG' },
  sniper: { name: 'Bolt-Action Sniper' },
  shotgun: { name: 'Pump Shotgun' },
  pistol: { name: 'M9 Pistol' },
};

export function createViewmodel(weaponId) {
  const root = new THREE.Group();
  const len = { ar: 0.7, smg: 0.45, sniper: 1.0, shotgun: 0.8, pistol: 0.22 }[weaponId] ?? 0.6;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, len), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  gun.position.set(0, 0, -len / 2);
  root.add(gun);
  const hip = new THREE.Vector3(0.18, -0.17, -0.25), ads = new THREE.Vector3(0, -0.1, -0.2);
  let kick = 0, reloadT = 0, reloadDur = 0;
  root.position.copy(hip);
  return {
    object3D: root,
    update(dt, s) {
      kick = Math.max(0, kick - dt * 8);
      if (reloadT > 0) reloadT = Math.max(0, reloadT - dt);
      root.position.lerpVectors(hip, ads, s.ads ?? 0);
      root.position.z += kick * 0.05;
      root.rotation.x = kick * 0.1 - (reloadT > 0 ? Math.sin((reloadT / reloadDur) * Math.PI) * 0.6 : 0);
    },
    fire() { kick = 1; },
    reload(d) { reloadT = reloadDur = d; },
    equip() {},
    muzzleWorldPosition(target, overlayCamera, worldCamera) {
      const p = new THREE.Vector3(0, 0, -len);
      gun.localToWorld(p);
      p.applyMatrix4(overlayCamera.matrixWorldInverse);
      return target.copy(p).applyMatrix4(worldCamera.matrixWorld);
    },
    dispose() {},
  };
}
