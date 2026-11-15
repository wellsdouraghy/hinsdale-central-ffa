// World module: builds the active campus (see CONTRACTS.md for the interface, CAMPUSES.md for campuses).
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { Builder } from './util.js';
import { loadTextures, createMaterials } from './assets.js';
import { createSky, sunDirection, applyBakedShadow } from './sky.js';
import { createGround, SAT, GROUND_BAKE_LAYER } from './ground.js';
import { createTerrain, installBuilderHelpers } from './terrain.js';
import { createPost } from './post.js';
import { createTrees } from './trees.js';
import { createGrass } from './grass.js';
import { activeCampus, onCampusChange, setActiveCampus } from '../campuses/index.js';
import { buildCollision, computeSpawns, nearestOpenGround, spawnsNear, buildNav, pickHeliSpawns } from './collision.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** Active campus play area (updated in place when the campus changes). */
export const PLAY_BOUNDS = { minX: -222, maxX: 292, minZ: -212, maxZ: 214 };
onCampusChange((c) => Object.assign(PLAY_BOUNDS, c.playBounds));
const BASE_ATTRIBUTION = 'Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &middot; Imagery &copy; Esri, Maxar, Earthstar Geographics';
const tick = () => new Promise((r) => setTimeout(r, 0));

// Static merge helper: one geometry per material (default), or per material and 128 m cell when chunking is enabled.
const CHUNK = 128, CHUNK_MIN_TRIS = 16000;
function chunkBucket(bucket) {
  const nTri = bucket.pos.length / 9;
  // OFF by default: measured on both campuses it cut drawn triangles by 20-55% but the extra draw calls made frames slower
  // (see the Marin QA notes). Opt in with globalThis.__WORLD_CHUNK = true (dev viewer: ?chunk=1) to re-measure on other GPUs.
  if (nTri < CHUNK_MIN_TRIS || !globalThis.__WORLD_CHUNK) return [bucket.toGeometry()];
  const cells = new Map(); const P = bucket.pos;
  for (let t = 0; t < nTri; t++) {
    const o = t * 9; const cx = (P[o] + P[o + 3] + P[o + 6]) / 3, cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3;
    const k = Math.floor(cx / CHUNK) + ':' + Math.floor(cz / CHUNK); let list = cells.get(k); if (!list) { list = []; cells.set(k, list); } list.push(t);
  }
  const out = [];
  for (const list of cells.values()) {
    const n = list.length * 3; const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = bucket.col ? new Float32Array(n * 3) : null;
    list.forEach((t, i) => {
      for (let k = 0; k < 9; k++) { pos[i * 9 + k] = P[t * 9 + k]; nor[i * 9 + k] = bucket.nor[t * 9 + k]; if (col) col[i * 9 + k] = bucket.col[t * 9 + k]; }
      for (let k = 0; k < 6; k++) uv[i * 6 + k] = bucket.uv[t * 6 + k];
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere(); g.computeBoundingBox(); out.push(g);
  }
  return out;
}

export async function createWorld({ renderer, scene, camera, settings = {}, onProgress = () => {}, campus = activeCampus() }) {
  const F = campus.files;
  setActiveCampus(campus.id);   // shared constants (SAT, PLAY_BOUNDS, tile origin) follow the campus being built
  const quality = ['low', 'medium', 'high'].includes(settings.quality) ? settings.quality : 'high';
  const progress = (f, label) => { try { onProgress(Math.min(1, f), label); } catch (e) { /* ignore */ } };
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const customVisuals = new THREE.Group(); customVisuals.name = 'world-visuals'; root.add(customVisuals);

  progress(0.02, 'Loading campus data');
  const [data, gen, builder] = await Promise.all([
    fetch('./' + F.campus).then((r) => r.json()),
    fetch('./' + F.gen).then((r) => r.json()),
    campus.loadWorld(),
  ]);

  progress(0.05, 'Loading sky');
  const post = createPost({ renderer, scene, camera, quality });
  const sky = await createSky({ renderer, scene, quality, opts: campus.sky });

  progress(0.12, 'Loading textures');
  const T = await loadTextures(renderer, quality, (f) => progress(0.12 + f * 0.28, 'Loading textures'), { groundMacro: F.groundMacro, groundMask: F.groundMask, roofs: F.roofs });
  const M = createMaterials(T, quality);
  await tick();

  // surface class lookup for footsteps etc. (1 m grid baked from the surface mask)
  const classNames = ['grass', 'asphalt', 'concrete', 'rubber', 'dirt'];
  let classMap = null;
  try {
    const img = await new THREE.ImageLoader().loadAsync('./' + F.surfaceClasses);
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
  // optional real ground heights (descriptor `terrain`, src/world/terrain.js); null = flat at y = 0 (unchanged behaviour)
  const terrain = await createTerrain(campus, { sat: { ...SAT }, playBounds: campus.playBounds });
  const groundY = terrain ? terrain.heightAt : () => 0;
  const ground = createGround({ scene: customVisuals, textures: T, shadowUniforms: sky.shadowUniforms, quality, opts: campus.ground, roads: data.roads, terrain });
  const ctx = { campus, data, gen, T, M, quality, scene: customVisuals, B: new Builder(), sky, applyBakedShadow, playBounds: { ...campus.playBounds }, surfaceAt, blockers: [], instanced: [], updaters: [], shrubs: [], grapplePoles: [], ladders: [] };
  installBuilderHelpers(ctx, terrain);   // ctx.terrain / groundY / flatten / onGround / plinth / drape (CAMPUSES.md "Terrain")

  progress(0.48, 'Building campus'); await tick();
  await builder.build(ctx, progress);
  // the builder may have flattened pads: re-displace the ground mesh to the final heights
  if (terrain && ground.mesh.geometry.userData.terrainVersion !== terrain.version) terrain.refreshGeometry(ground.mesh.geometry);

  // merge the static geometry: one mesh per material
  progress(0.76, 'Merging geometry'); await tick();
  for (const [key, bucket] of ctx.B.visual) {
    if (!bucket.pos.length) continue;
    const mat = key.startsWith('house') ? M.houseWalls[parseInt(key.slice(5), 10)] : M[key];
    if (!mat) { console.warn('[world] missing material', key); continue; }
    // (optionally split into spatial chunks so the frustum can cull them: see chunkBucket)
    for (const geo of chunkBucket(bucket)) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'static:' + key; mesh.castShadow = key !== 'groundDecal' && key !== 'wallDecal'; if (key === 'groundDecal' || key === 'wallDecal') { mesh.receiveShadow = false; mesh.renderOrder = 2; } mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    customVisuals.add(mesh);
    }
  }

  progress(0.8, 'Planting trees'); await tick();
  const trees = createTrees(ctx);
  trees.prepare(renderer, camera);
  const grass = quality === 'high' ? createGrass(ctx, ground) : null;

  progress(0.88, 'Building collision'); await tick();
  const collisionGroup = new THREE.Group(); collisionGroup.name = 'world-collision'; collisionGroup.visible = false; root.add(collisionGroup);
  const collisionMeshes = buildCollision(ctx, collisionGroup);
  const spawnPoints = computeSpawns(ctx, collisionMeshes);
  // capture-the-flag bases from the campus descriptor (far apart, open ground); team spawns 25-70 m from their base
  const ctfBases = { red: nearestOpenGround(ctx, ...campus.ctf.red), blue: nearestOpenGround(ctx, ...campus.ctf.blue) };
  const ctfSpawns = { red: spawnsNear(ctx, ctfBases.red, 25, 70, 10, ctfBases.blue), blue: spawnsNear(ctx, ctfBases.blue, 25, 70, 10, ctfBases.red) };
  // bot navigation grid + helicopter parking spots (see CONTRACTS.md round 6)
  const nav = buildNav(ctx, collisionMeshes, [...spawnPoints, ctfBases.red, ctfBases.blue, ...ctfSpawns.red, ...ctfSpawns.blue]);
  const heliSpawns = pickHeliSpawns(ctx, nav.bvh);
  nav.bvh.dispose();

  progress(0.93, 'Baking shadows'); await tick();
  scene.updateMatrixWorld(true);
  trees.setForceFull(true, camera);
  sky.bakeShadowMask({ minX: SAT.minX, maxX: SAT.maxX, minZ: SAT.minZ, maxZ: SAT.maxZ }, terrain ? { layer: GROUND_BAKE_LAYER, minY: terrain.minY, maxY: terrain.maxY } : null);
  trees.setForceFull(false, camera);

  // (Google 3D Tiles are used only offline, as a reference for building the campuses: no runtime streaming.)
  const attributionHTML = BASE_ATTRIBUTION;
  const world = {
    collisionMeshes,
    groundY,
    // terrain campuses: { heightAt, normalAt, slopeAt, minIn, maxIn, standY, footprint, ... } (src/world/terrain.js); null when flat
    terrain,
    groundNormal: (x, z, out = new THREE.Vector3()) => (terrain ? terrain.normalAt(x, z, out) : out.set(0, 1, 0)),
    spawnPoints,
    ctfBases,
    navGrid: nav.grid,
    navSample: nav.sample,
    heliSpawns,
    ctfSpawns,
    grapplePoles: ctx.grapplePoles,   // [{ x, z, y0, y1, r }] thin vertical poles for grapple aim assist
    ladders: ctx.ladders,             // [{ x, z, nx, nz, y0, y1, exitY }] climbable ladders
    // dev-only build registry for the map check (dev/mapcheck.html): prop footprints, tree trunks, shrubs, ground walk grid
    registry: { props: ctx.props || [], trunks: ctx.trunks || [], shrubs: ctx.shrubs, keepClear: ctx.keepClear || [], walkGrid: ctx.walkGrid || null },
    playBounds: { ...campus.playBounds },
    campus,
    tour: campus.tour || [],
    practiceHeli: campus.practiceHeli || null,
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
      if (grass) grass.update(c, dt, groundY);
      for (const u of ctx.updaters) u(dt, c);
    },
    render(overlayScene, overlayCamera) { post.render(overlayScene, overlayCamera); },
    setSize(w, h) { post.setSize(w, h); },
    dispose() {
      post.dispose(); sky.dispose();
      root.traverse((o) => { if (o.geometry) { if (o.geometry.boundsTree) o.geometry.disposeBoundsTree(); o.geometry.dispose(); } });
      scene.remove(root);
    },
  };

  // warm up: compile shaders before the first visible frame
  progress(0.98, 'Compiling shaders'); await tick();
  try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
  post.setSize(renderer.domElement.clientWidth || window.innerWidth, renderer.domElement.clientHeight || window.innerHeight);
  progress(1, 'Ready');
  return world;
}
