// PLACEHOLDER capture-the-flag visuals: simple pole + flat flag + base ring. Replaced by the World/Visuals builder (Fable).
import * as THREE from 'three';

// team: 'red' | 'blue'
export function createFlag({ team = 'red' } = {}) {
  const color = team === 'blue' ? 0x2a6bff : 0xe0242c;
  const root = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 }));
  pole.position.y = 1.1;
  pole.castShadow = true;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
  cloth.position.set(0.45, 1.85, 0);
  cloth.castShadow = true;
  root.add(pole, cloth);
  let t = 0, carried = false;
  return {
    object3D: root,
    // When carried, gameplay parents object3D to the carrier's character object3D (origin at feet) and calls setCarried(true);
    // the flag then poses itself as if strapped to the carrier's back (pole tilted, smaller). setCarried(false) restores it.
    setCarried(v) {
      carried = v;
      root.scale.setScalar(v ? 0.7 : 1);
      root.position.set(0, v ? 0.6 : 0, v ? 0.25 : 0);
      root.rotation.set(v ? 0.35 : 0, 0, 0);
    },
    update(dt) { t += dt; cloth.rotation.y = Math.sin(t * 3) * (carried ? 0.4 : 0.2); },
    dispose() {},
  };
}

// Static base marker drawn on the ground where a team's flag lives.
export function createFlagBase({ team = 'red' } = {}) {
  const color = team === 'blue' ? 0x2a6bff : 0xe0242c;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  ring.position.y = 0.03;
  const root = new THREE.Group();
  root.add(ring);
  return { object3D: root, update() {}, dispose() {} };
}
