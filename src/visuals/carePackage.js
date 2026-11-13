// PLACEHOLDER care package crate + parachute. Replaced by the Visuals builder (Fable).
import * as THREE from 'three';

// Origin at the bottom center of the crate (~1.2 x 0.9 x 0.9 m). Gameplay moves object3D while it falls.
export function createCarePackage({ team = null } = {}) {
  const root = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x4b5a32, roughness: 0.8 }));
  crate.position.y = 0.45;
  crate.castShadow = true;
  const chute = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdedede, side: THREE.DoubleSide }));
  chute.position.y = 5;
  root.add(crate, chute);
  let opened = false;
  return {
    object3D: root,
    setParachute(v) { chute.visible = !!v; },   // true while descending; false once landed
    open() { opened = true; crate.scale.y = 0.6; }, // play the opening animation once captured
    update(dt) { if (chute.visible) chute.rotation.y += dt * 0.5; },
    dispose() { crate.geometry.dispose(); chute.geometry.dispose(); },
  };
}
