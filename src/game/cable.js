// Thin grapple cable drawn between two world points (stretched cylinder; cheap and visible at distance).
import * as THREE from 'three';

const GEO = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2); // along +z, 0..1
const MAT = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.8, roughness: 0.35, emissive: 0x111317 });
const _d = new THREE.Vector3();

export function createCable(scene, radius = 0.014) {
  const mesh = new THREE.Mesh(GEO, MAT);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  scene.add(mesh);
  return {
    set(from, to) {
      _d.subVectors(to, from);
      const len = _d.length();
      if (len < 0.01) { mesh.visible = false; return; }
      mesh.visible = true;
      mesh.position.copy(from);
      mesh.lookAt(to);
      mesh.scale.set(radius, radius, len);
    },
    hide() { mesh.visible = false; },
    dispose() { scene.remove(mesh); },
  };
}
