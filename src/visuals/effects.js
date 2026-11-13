// PLACEHOLDER effects: short-lived lines and dots. Replaced by the Visuals builder.
import * as THREE from 'three';

export function createEffects(scene) {
  const live = [];
  const add = (obj, ttl) => { scene.add(obj); live.push({ obj, ttl }); };
  return {
    impact(point) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      m.position.copy(point);
      add(m, 5);
    },
    blood(point) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0x990000 }));
      m.position.copy(point);
      add(m, 0.3);
    },
    tracer(from, to) {
      const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
      add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffeeaa })), 0.05);
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        if ((live[i].ttl -= dt) <= 0) { scene.remove(live[i].obj); live[i].obj.geometry?.dispose(); live.splice(i, 1); }
      }
    },
  };
}
