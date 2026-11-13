// PLACEHOLDER third-person character: colored capsule. Replaced by the Visuals builder.
import * as THREE from 'three';

export function createCharacter({ color = 0xcc3333, name = '' } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 12), new THREE.MeshStandardMaterial({ color }));
  body.position.y = 0.85;
  body.castShadow = true;
  root.add(body);
  let dead = false, crouch = false;
  return {
    object3D: root,
    setState(s) { crouch = !!s.crouching; },
    fire() {},
    die() { dead = true; },
    reset() { dead = false; root.rotation.x = 0; },
    update(dt) {
      body.scale.y = THREE.MathUtils.lerp(body.scale.y, crouch ? 0.7 : 1, Math.min(1, dt * 10));
      body.position.y = 0.85 * body.scale.y;
      if (dead) body.rotation.x = Math.min(Math.PI / 2, body.rotation.x + dt * 4);
      else body.rotation.x = 0;
    },
    dispose() {},
  };
}
