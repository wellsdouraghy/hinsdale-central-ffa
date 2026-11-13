// PLACEHOLDER one-seat attack helicopter. Replaced by the Visuals builder (Fable).
import * as THREE from 'three';

// Origin at the skid bottoms (ground contact), nose toward -z when rotation is identity. ~12 m long, rotor ~11 m.
export function createHelicopter() {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b4230, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 6), mat); body.position.set(0, 1.6, -0.5);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 6), mat); tail.position.set(0, 2.0, 5);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rotor.position.y = 2.9;
  for (const m of [body, tail]) m.castShadow = true;
  root.add(body, tail, rotor);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.8, -3.6); root.add(muzzle);
  const podL = new THREE.Object3D(); podL.position.set(-1.4, 1.2, -1); root.add(podL);
  const podR = new THREE.Object3D(); podR.position.set(1.4, 1.2, -1); root.add(podR);
  let rpm = 0, destroyed = false;
  return {
    object3D: root,
    // Local-space attachment points (Object3D children of object3D) for gameplay to read world positions from.
    gunMuzzle: muzzle, rocketPods: [podL, podR],
    seatEye: new THREE.Vector3(0, 2.2, -1.8),   // pilot eye in local space (first-person option)
    setRotorSpeed(v) { rpm = v; },                // 0 (parked) .. 1 (full)
    setDamage(f) { mat.color.setHex(f > 0.6 ? 0x2a2a2a : 0x3b4230); }, // 0 pristine .. 1 about to blow
    fireGun() {},                                  // muzzle flash on the chin gun (tracers/impacts are effects.js)
    fireRocket(side) {},                           // side 0 = left pod, 1 = right pod: launch flash/smoke
    destroy() { destroyed = true; root.rotation.z = 0.6; },   // wreck pose (explosion itself via effects.explosion)
    reset() { destroyed = false; root.rotation.set(0, 0, 0); mat.color.setHex(0x3b4230); },
    update(dt) { if (!destroyed) rotor.rotation.y += rpm * dt * 40; },
    dispose() {},
  };
}

// Rocket projectile visual (gameplay moves object3D along its path). Points along -z.
export function createRocket() {
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x555555 }));
  root.add(m);
  return { object3D: root, update() {}, dispose() { m.geometry.dispose(); } };
}
