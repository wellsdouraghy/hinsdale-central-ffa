// PLACEHOLDER frag grenade mesh. Replaced by the Visuals builder (Fable).
import * as THREE from 'three';

// World-space thrown grenade (origin at its center, ~7 cm wide). Gameplay positions/rotates object3D every frame.
export function createGrenade() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.7 }));
  body.scale.y = 1.25;
  body.castShadow = true;
  root.add(body);
  return { object3D: root, update() {}, dispose() { body.geometry.dispose(); body.material.dispose(); } };
}
