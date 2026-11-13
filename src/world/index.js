// PLACEHOLDER world: flat satellite-textured ground + extruded OSM buildings. Replaced by the World builder.
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export async function createWorld({ renderer, scene, camera, settings, onProgress = () => {} }) {
  onProgress(0.1, 'Loading campus data');
  const data = await (await fetch('./data/campus.json')).json();
  const sat = data.satellite;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene.background = new THREE.Color(0x9cc4e8);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5040, 1.2));
  const sunDirection = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.copy(sunDirection).multiplyScalar(100);
  scene.add(sun);

  onProgress(0.4, 'Loading satellite imagery');
  const tex = await new THREE.TextureLoader().loadAsync(sat.file.replace('assets/', './assets/'));
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = sat.maxX - sat.minX, h = sat.maxZ - sat.minZ;
  const groundGeo = new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);
  groundGeo.translate((sat.minX + sat.maxX) / 2, 0, (sat.minZ + sat.maxZ) / 2);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  ground.userData.surface = 'grass';
  scene.add(ground);

  const collisionMeshes = [ground];
  const mat = new THREE.MeshStandardMaterial({ color: 0xb8a58c, roughness: 0.9 });
  for (const b of data.buildings) {
    const levels = parseFloat(b.tags['building:levels'] || '1');
    const height = parseFloat(b.tags.height || '') || levels * 4.2;
    for (const outer of b.outer) {
      const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const inner of b.inner) shape.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }).rotateX(-Math.PI / 2);
      geo.computeBoundsTree();
      const m = new THREE.Mesh(geo, mat);
      m.userData.surface = 'brick';
      scene.add(m);
      collisionMeshes.push(m);
    }
  }
  groundGeo.computeBoundsTree();

  const playBounds = { minX: -222, maxX: 292, minZ: -212, maxZ: 214 };
  const spawnPoints = [];
  const rc = new THREE.Raycaster();
  for (let i = 0; spawnPoints.length < 24 && i < 2000; i++) {
    const p = new THREE.Vector3(
      THREE.MathUtils.lerp(playBounds.minX + 10, playBounds.maxX - 10, Math.random()), 200,
      THREE.MathUtils.lerp(playBounds.minZ + 10, playBounds.maxZ - 10, Math.random()));
    rc.set(p, new THREE.Vector3(0, -1, 0));
    const hit = rc.intersectObjects(collisionMeshes, false)[0];
    if (hit && hit.object === ground) spawnPoints.push(new THREE.Vector3(p.x, 0, p.z));
  }
  onProgress(1, 'Ready');

  return {
    collisionMeshes,
    groundY: () => 0,
    spawnPoints,
    playBounds,
    sunDirection,
    update() {},
    render(overlayScene, overlayCamera) {
      renderer.autoClear = true;
      renderer.render(scene, camera);
      if (overlayScene) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(overlayScene, overlayCamera);
        renderer.autoClear = true;
      }
    },
    setSize(w2, h2) { renderer.setSize(w2, h2); },
    attributionHTML: 'Map data &copy; OpenStreetMap contributors &middot; Imagery &copy; Esri, Maxar, Earthstar Geographics',
    dispose() {},
  };
}
