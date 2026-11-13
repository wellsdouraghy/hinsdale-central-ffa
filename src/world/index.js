// World module: builds the Hinsdale Central campus (see CONTRACTS.md for the interface).
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { Builder } from './util.js';
import { loadTextures, createMaterials } from './assets.js';
import { createSky, sunDirection, applyBakedShadow } from './sky.js';
import { createGround, SAT } from './ground.js';
import { createPost } from './post.js';
import { buildSchool, buildHouses } from './buildings.js';
import { buildLandmarks } from './landmarks.js';
import { buildProps } from './props.js';
import { createTrees } from './trees.js';
import { createGrass } from './grass.js';
import { createTiles } from './tiles.js';
import { buildCollision, computeSpawns, nearestOpenGround, spawnsNear } from './collision.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const PLAY_BOUNDS = { minX: -222, maxX: 292, minZ: -212, maxZ: 214 };
const BASE_ATTRIBUTION = 'Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &middot; Imagery &copy; Esri, Maxar, Earthstar Geographics';
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function createWorld({ renderer, scene, camera, settings = {}, onProgress = () => {} }) {
  const quality = ['low', 'medium', 'high'].includes(settings.quality) ? settings.quality : 'high';
  const progress = (f, label) => { try { onProgress(Math.min(1, f), label); } catch (e) { /* ignore */ } };
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const customVisuals = new THREE.Group(); customVisuals.name = 'world-visuals'; root.add(customVisuals);

  progress(0.02, 'Loading campus data');
  const [data, gen] = await Promise.all([
    fetch('./data/campus.json').then((r) => r.json()),
    fetch('./assets/world/gen.json').then((r) => r.json()),
  ]);

  progress(0.05, 'Loading sky');
  const post = createPost({ renderer, scene, camera, quality });
  const sky = await createSky({ renderer, scene, quality });

  progress(0.12, 'Loading textures');
  const T = await loadTextures(renderer, quality, (f) => progress(0.12 + f * 0.28, 'Loading textures'));
  const M = createMaterials(T, quality);
  await tick();

  // surface class lookup for footsteps etc. (1 m grid baked from the surface mask)
  const classNames = ['grass', 'asphalt', 'concrete', 'rubber', 'dirt'];
  let classMap = null;
  try {
    const img = await new THREE.ImageLoader().loadAsync('./assets/world/surface_classes.png');
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    classMap = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
  } catch (e) { /* optional */ }
  function surfaceAt(x, z) {
    if (!classMap) return 'grass';
    const px = Math.floor((x - SAT.minX) / (SAT.maxX - SAT.minX) * classMap.w), pz = Math.floor((z - SAT.minZ) / (SAT.maxZ - SAT.minZ) * classMap.h);
    if (px < 0 || pz < 0 || px >= classMap.w || pz >= classMap.h) return 'grass';
    return classNames[classMap.d[(pz * classMap.w + px) * 4]] || 'grass';
  }

  progress(0.42, 'Building terrain');
  const ground = createGround({ scene: customVisuals, textures: T, shadowUniforms: sky.shadowUniforms, quality });
  const ctx = { data, gen, T, M, quality, scene: customVisuals, B: new Builder(), sky, applyBakedShadow, playBounds: PLAY_BOUNDS, surfaceAt, blockers: [], instanced: [], updaters: [], shrubs: [] };

  progress(0.48, 'Building school'); await tick();
  buildSchool(ctx);
  progress(0.56, 'Building neighbourhood'); await tick();
  buildHouses(ctx);
  progress(0.62, 'Building stadium and fields'); await tick();
  buildLandmarks(ctx);
  progress(0.7, 'Placing vehicles and props'); await tick();
  buildProps(ctx);

  // merge the static geometry: one mesh per material
  progress(0.76, 'Merging geometry'); await tick();
  for (const [key, bucket] of ctx.B.visual) {
    if (!bucket.pos.length) continue;
    const mat = key.startsWith('house') ? M.houseWalls[parseInt(key.slice(5), 10)] : M[key];
    if (!mat) { console.warn('[world] missing material', key); continue; }
    const mesh = new THREE.Mesh(bucket.toGeometry(), mat);
    mesh.name = 'static:' + key; mesh.castShadow = key !== 'groundDecal' && key !== 'wallDecal'; if (key === 'groundDecal' || key === 'wallDecal') { mesh.receiveShadow = false; mesh.renderOrder = 2; } mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    customVisuals.add(mesh);
  }

  progress(0.8, 'Planting trees'); await tick();
  const trees = createTrees(ctx);
  trees.prepare(renderer, camera);
  const grass = quality === 'high' ? createGrass(ctx, ground) : null;

  progress(0.88, 'Building collision'); await tick();
  const collisionGroup = new THREE.Group(); collisionGroup.name = 'world-collision'; collisionGroup.visible = false; root.add(collisionGroup);
  const collisionMeshes = buildCollision(ctx, collisionGroup);
  const spawnPoints = computeSpawns(ctx, collisionMeshes);
  // capture-the-flag: red = Dickinson Field midfield, blue = varsity baseball outfield; team spawns 25-70 m from their base
  const ctfBases = { red: nearestOpenGround(ctx, -153, -101.7), blue: nearestOpenGround(ctx, 66, 130) };
  const ctfSpawns = { red: spawnsNear(ctx, ctfBases.red, 25, 70, 10, ctfBases.blue), blue: spawnsNear(ctx, ctfBases.blue, 25, 70, 10, ctfBases.red) };

  progress(0.93, 'Baking shadows'); await tick();
  scene.updateMatrixWorld(true);
  trees.setForceFull(true, camera);
  sky.bakeShadowMask({ minX: SAT.minX, maxX: SAT.maxX, minZ: SAT.minZ, maxZ: SAT.maxZ });
  trees.setForceFull(false, camera);

  // ---- optional Google Photorealistic 3D Tiles
  let attributionHTML = BASE_ATTRIBUTION;
  let tiles = null;
  const world = {
    collisionMeshes,
    groundY: () => 0,
    spawnPoints,
    ctfBases,
    ctfSpawns,
    playBounds: { ...PLAY_BOUNDS },
    sunDirection: sunDirection.clone(),
    get attributionHTML() { return attributionHTML; },
    // ---- optional extras (see CONTRACTS.md change log)
    quality,
    environment: sky.envTex,
    sun: sky.sun,
    surfaceAt,
    update(dt, cam) {
      const c = cam || camera;
      sky.update(c);
      trees.update(c, dt);
      if (grass) grass.update(c, dt);
      for (const u of ctx.updaters) u(dt, c);
      if (tiles) { tiles.update(c, dt); attributionHTML = tiles.attributionHTML(BASE_ATTRIBUTION); }
    },
    render(overlayScene, overlayCamera) { post.render(overlayScene, overlayCamera); },
    setSize(w, h) { post.setSize(w, h); if (tiles) tiles.setSize(); },
    dispose() {
      if (tiles) tiles.dispose();
      post.dispose(); sky.dispose();
      root.traverse((o) => { if (o.geometry) { if (o.geometry.boundsTree) o.geometry.disposeBoundsTree(); o.geometry.dispose(); } });
      scene.remove(root);
    },
  };

  if (typeof settings.googleTilesKey === 'string' && settings.googleTilesKey.trim()) {
    progress(0.96, 'Connecting to Google 3D Tiles');
    try {
      tiles = await createTiles({ renderer, scene: root, camera, key: settings.googleTilesKey.trim(), quality, customVisuals, sky, collisionMeshes });
      world.googleTilesActive = true; world.tiles = tiles;
    } catch (e) {
      console.warn('[world] Google 3D Tiles unavailable, using the built-in campus instead:', e && e.message ? e.message : e);
      tiles = null; customVisuals.visible = true;
    }
  }

  // warm up: compile shaders before the first visible frame
  progress(0.98, 'Compiling shaders'); await tick();
  try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
  post.setSize(renderer.domElement.clientWidth || window.innerWidth, renderer.domElement.clientHeight || window.innerHeight);
  progress(1, 'Ready');
  return world;
}
