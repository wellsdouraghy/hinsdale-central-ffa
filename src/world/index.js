// World module: builds the active campus (see CONTRACTS.md for the interface, CAMPUSES.md for campuses).
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { Builder } from './util.js';
import { loadTextures, createMaterials } from './assets.js';
import { fetchCampusPack, loadCampusTextures, applyCampusTextures } from './campusTextures.js';
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
  const texPre = await fetchCampusPack(campus);   // optional per-campus texture pack (campusTextures.js; null when the campus has none)
  const T = await loadTextures(renderer, quality, (f) => progress(0.12 + f * 0.28, 'Loading textures'), { groundMacro: F.groundMacro, groundMask: F.groundMask, roofs: F.roofs }, texPre ? texPre.replaces : []);
  const M = createMaterials(T, quality);
  const texPack = await loadCampusTextures(texPre, T, quality);
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
  // Builders that DESIGN ground (graded streets, src/world/streets.js) repaint the surface classes from the design:
  // classAt(x, z) -> 'asphalt' | 'concrete' | 'grass' | null (null = keep the satellite class). Rewrites the surface
  // mask (ground shader, grass), the class map (footsteps, props) and, where the class changed, the photo's tone.
  function paintSurface(classAt) {
    if (!classMap || !T.groundMask || !T.groundMask.image) return 0; const w = classMap.w, h = classMap.h; const mk = new Uint8ClampedArray(w * h * 4), mc = new Uint8ClampedArray(w * h * 4); let n = 0;
    const MASK = { asphalt: [255, 0, 0], concrete: [0, 255, 0], grass: [0, 0, 0] }, TONE = { asphalt: [72, 72, 76], concrete: [158, 156, 150], grass: [72, 96, 48] };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = classAt(SAT.minX + (i + 0.5) / w * (SAT.maxX - SAT.minX), SAT.minZ + (j + 0.5) / h * (SAT.maxZ - SAT.minZ)); if (!c || !MASK[c]) continue; const k = (j * w + i) * 4; n++;
      mk[k] = MASK[c][0]; mk[k + 1] = MASK[c][1]; mk[k + 2] = MASK[c][2]; mk[k + 3] = 255;
      if (classNames[classMap.d[k]] !== c) { mc[k] = TONE[c][0]; mc[k + 1] = TONE[c][1]; mc[k + 2] = TONE[c][2]; mc[k + 3] = 255; }
      classMap.d[k] = classNames.indexOf(c); }
    if (!n) return 0;
    const small = (arr) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(arr, w, h), 0, 0); return c; };
    for (const [tex, arr] of [[T.groundMask, mk], [T.groundMacro, mc]]) { const img = tex && tex.image; if (!img || !img.width) continue; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(small(arr), 0, 0, c.width, c.height); tex.image = c; tex.needsUpdate = true; }
    return n;
  }
  const ctx = { campus, data, gen, T, M, quality, scene: customVisuals, B: new Builder(), sky, applyBakedShadow, playBounds: { ...campus.playBounds }, surfaceAt, paintSurface, blockers: [], instanced: [], updaters: [], shrubs: [], grapplePoles: [], ladders: [] };
  installBuilderHelpers(ctx, terrain);   // ctx.terrain / groundY / flatten / onGround / plinth / drape (CAMPUSES.md "Terrain")

  progress(0.48, 'Building campus'); await tick();
  ctx.TX = texPack;   // sizes / course heights of the generated textures, for builders that align geometry to courses
  await builder.build(ctx, progress);
  applyCampusTextures(ctx, texPack);   // keyed materials + overrides (after the builder: campus kits add materials while building)
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
    groundY: terrain ? terrain.meshHeightAt : groundY,   // the ground as drawn and collided (terrain.js meshHeightAt); builders use the bilinear ctx.groundY
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
    registry: { props: ctx.props || [], trunks: ctx.trunks || [], shrubs: ctx.shrubs, keepClear: ctx.keepClear || [], walkGrid: ctx.walkGrid || null, houses: ctx.houses || [], retaining: ctx.retaining || [], walls: ctx.walls || [], footprints: ctx.footprints || [], streets: ctx.streets?.stations || null, inRoad: ctx.streets?.inRoad || null, streetDesign: ctx.streets?.design || null, notes: ctx.buildNotes || null },   // houses / retaining: optional, filled by hilly campus builders (map check: houses, retaining)
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
