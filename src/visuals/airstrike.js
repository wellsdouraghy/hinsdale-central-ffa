// PLACEHOLDER airstrike visuals: targeting laptop (first-person), strike jet, bomb. Replaced by the Visuals builder (Fable).
import * as THREE from 'three';

// First-person rugged laptop held in both hands (add to the overlay scene, camera-space like the viewmodel).
// open(): flips open quickly (~0.35 s); close(): folds and lowers (~0.25 s). screenRect(): where the screen sits on the
// display in normalized device coords {x0,y0,x1,y1} (-1..1) once open, so gameplay can align its HTML map UI over it.
export function createTargetingLaptop() {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), new THREE.MeshStandardMaterial({ color: 0x2b2f26 }));
  const lid = new THREE.Group();
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.015), new THREE.MeshStandardMaterial({ color: 0x2b2f26, emissive: 0x0a2a12 }));
  lidMesh.position.y = 0.12; lid.add(lidMesh); lid.position.z = -0.12;
  root.add(base, lid);
  root.position.set(0, -0.32, -0.42); root.visible = false;
  let t = 0, target = 0;
  return {
    object3D: root,
    open() { root.visible = true; target = 1; },
    close() { target = 0; },
    isOpen() { return t > 0.98; },
    screenRect() { return { x0: -0.55, y0: -0.35, x1: 0.55, y1: 0.55 }; },
    update(dt) {
      t += Math.sign(target - t) * Math.min(Math.abs(target - t), dt / 0.3);
      lid.rotation.x = -Math.PI / 2 * (1 - t) - 0.15 * t;
      root.position.y = -0.55 + 0.23 * t;
      if (t <= 0.001 && target === 0) root.visible = false;
    },
    dispose() {},
  };
}

// Strike jet (world space, origin at center, nose toward -z). Gameplay moves it along its flight path.
export function createStrikeJet() {
  const root = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x55595e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 14), m);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 3.5), m);
  root.add(body, wing);
  return { object3D: root, setAfterburner() {}, update() {}, dispose() {} };
}

// Falling bomb (world space, points along -z = direction of travel; gameplay orients it to its velocity).
export function createBomb() {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a5040 })));
  return { object3D: root, update() {}, dispose() {} };
}
