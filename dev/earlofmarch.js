// Free-fly viewer for the Earl of March campus (copy of dev/marin.js: ?campus=, default earlofmarch; shots go to the receiver on ?shotPort=, default 5187).
//   ?cam=x,y,z,yawDeg,pitchDeg  &q=low|medium|high  &gkey=GOOGLE_KEY or &tiles=1 (uses VITE_GOOGLE_TILES_KEY)  &col=1 (show collision)  &hud=0
// WASD + mouse (click to lock), Space/C up/down, Shift fast. Exposes window.__world, __camera, __scene, __renderer.
import * as THREE from 'three';
import { createWorld } from '../src/world/index.js';
import { getCampus } from '../src/campuses/index.js';
// the Browser pane may be hidden (no animation frames): drive rendering from timers so screenshots still work
if (new URLSearchParams(location.search).get('raf') !== '1') { window.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16); window.cancelAnimationFrame = (h) => clearTimeout(h); }

const qs = new URLSearchParams(location.search);
if (qs.get('chunk') === '1') globalThis.__WORLD_CHUNK = true;   // A/B the optional spatial chunking of static meshes
const quality = qs.get('q') || 'high';
const renderer = new THREE.WebGLRenderer({ antialias: quality === 'low', powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(parseFloat(qs.get('fov') || '75'), innerWidth / innerHeight, 0.1, 6000);
camera.rotation.order = 'YXZ';
let yaw = 0, pitch = 0;
function setCam(str) {
  const v = str.split(',').map(Number);
  camera.position.set(v[0] || 0, v[1] ?? 1.7, v[2] || 0);
  yaw = THREE.MathUtils.degToRad(v[3] || 0); pitch = THREE.MathUtils.degToRad(v[4] || 0);
  camera.rotation.set(pitch, yaw, 0);
  camera.updateMatrixWorld();
}
setCam(qs.get('cam') || '-30,1.7,20,0,0');
window.__setCam = setCam;

const loadEl = document.getElementById('load');
const world = await createWorld({
  renderer, scene, camera, campus: getCampus(qs.get('campus') || 'earlofmarch'),
  settings: { quality, googleTilesKey: qs.get('gkey') || (qs.get('tiles') === '1' ? import.meta.env.VITE_GOOGLE_TILES_KEY : null) || null },
  onProgress: (f, label) => { loadEl.textContent = `${Math.round(f * 100)}% ${label}`; },
});
loadEl.remove();
world.setSize(innerWidth, innerHeight);
Object.assign(window, { __world: world, __camera: camera, __scene: scene, __renderer: renderer, THREE });
const attr = document.getElementById('attr');

if (qs.get('col') === '1') {
  const m = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
  for (const c of world.collisionMeshes) { const mm = new THREE.Mesh(c.geometry, m); scene.add(mm); }
}
if (qs.get('spawns') === '1') {
  for (const p of world.spawnPoints) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30), new THREE.MeshBasicMaterial({ color: 0x00ffff })); s.position.copy(p).setY(15); scene.add(s); }
}

// CTF preview: flags + bases at world.ctfBases (always shown; cheap)
const ctfBits = [];
if (world.ctfBases) {
  const { createFlag, createFlagBase, flagBrand } = await import('../src/visuals/flag.js');
  for (const team of ['red', 'blue']) {
    const base = createFlagBase({ team }), flag = createFlag({ team, brand: flagBrand(world.campus, team) });
    base.object3D.position.copy(world.ctfBases[team]); flag.object3D.position.copy(world.ctfBases[team]);
    scene.add(base.object3D, flag.object3D); ctfBits.push(base, flag);
  }
  window.__ctf = ctfBits;
}
if (qs.get('show') === 'heli' && world.heliSpawns) {
  for (const h of world.heliSpawns) {
    const g = new THREE.Group(); g.position.copy(h.pos); g.rotation.y = h.yaw;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 6.5), new THREE.MeshStandardMaterial({ color: 0x3d4a3a })); body.position.y = 1.3;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffcc00 })); nose.position.set(0, 1.3, -4.0);
    const disc = new THREE.Mesh(new THREE.RingGeometry(7.9, 8.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide })); disc.position.y = 3.2;
    g.add(body, nose, disc); scene.add(g);
  }
}
if (qs.get('show') === 'nav' && world.navGrid) {
  const n = world.navGrid; const pos = [], col = [];
  for (let j = 0; j < n.nz; j += 1) for (let i = 0; i < n.nx; i += 1) { const k = j * n.nx + i; if (!n.walk[k]) continue; pos.push(n.x0 + (i + 0.5) * n.cell, 0.25, n.z0 + (j + 0.5) * n.cell); const c = (n.cost[k] - 1) / 1.5; col.push(c, 1 - c, 0.2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.5, vertexColors: true })));
}
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.0022; pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.0022));
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); world.setSize(innerWidth, innerHeight); });

const hud = document.getElementById('hud');
if (qs.get('hud') === '0') hud.style.display = 'none';
const clock = new THREE.Clock();
let frames = 0, acc = 0, fps = 0;
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
window.__perf = { fps: 0, ms: [] };
renderer.info.autoReset = false;
renderer.setAnimationLoop(() => {
  renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.1);
  if (document.pointerLockElement === renderer.domElement || window.__auto !== true) camera.rotation.set(pitch, yaw, 0);
  const sp = (keys.ShiftLeft ? 60 : 8) * dt;
  camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize();
  if (keys.KeyW) camera.position.addScaledVector(fwd, sp);
  if (keys.KeyS) camera.position.addScaledVector(fwd, -sp);
  if (keys.KeyD) camera.position.addScaledVector(right, sp);
  if (keys.KeyA) camera.position.addScaledVector(right, -sp);
  if (keys.Space) camera.position.y += sp;
  if (keys.KeyC) camera.position.y -= sp;
  for (const b of ctfBits) b.update(dt);
  world.update(dt, camera);
  world.render(null, null);
  frames++; acc += dt;
  if (acc > 0.5) {
    fps = frames / acc; frames = 0; acc = 0; window.__perf.fps = fps;
    const i = renderer.info;
    hud.textContent = `${fps.toFixed(0)} fps  q=${quality}\ncalls ${i.render.calls}  tris ${(i.render.triangles / 1e6).toFixed(2)}M  tex ${i.memory.textures} geo ${i.memory.geometries}\ncam ${camera.position.x.toFixed(1)},${camera.position.y.toFixed(1)},${camera.position.z.toFixed(1)},${THREE.MathUtils.radToDeg(yaw).toFixed(0)},${THREE.MathUtils.radToDeg(pitch).toFixed(0)}`;
    if (attr.innerHTML !== world.attributionHTML) attr.innerHTML = world.attributionHTML;
  }
});

// Dev helper: save the current view to a local receiver (python script on :5199) -> dev/shots/<name>.jpg
window.__shot = async (name, cam, frames = 8) => {
  if (cam) setCam(cam);
  for (let i = 0; i < frames; i++) { for (const b of ctfBits) b.update(0.016); world.update(0.016, camera); world.render(null, null); await new Promise((r) => setTimeout(r, 30)); }
  world.update(0.016, camera); world.render(null, null);
  const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/jpeg', 0.9));
  await fetch('http://127.0.0.1:' + (qs.get('shotPort') || '5187') + '/' + name, { method: 'POST', body: blob });
  return name + ' ' + blob.size;
};

// Dev helper: average ms per frame (update + render, GPU flushed) at a list of camera strings.
window.__bench = (cams, n = 40) => {
  const gl = renderer.getContext(); const out = {}; const px = new Uint8Array(4);
  for (const c of cams) {
    setCam(c); world.update(0.016, camera); world.render(null, null); gl.finish();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { world.update(0.016, camera); renderer.info.reset(); world.render(null, null); }
    gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    out[c] = +((performance.now() - t0) / n).toFixed(2);
  }
  return out;
};

// Dev helper: a collision-checked eye-level pose (MAP_NOTES: "a QA camera inside a wall manufactures defects").
// Stands the camera h metres above the mesh ground at (x, z), looking at (tx, tz) with the given pitch (deg). Rejects
// the pose (returns { ok: false, why }) when anything solid is within 0.6 m of the lens or there is collision right
// overhead (inside a building). __lookShot(name, ...) saves the view through __shot when the pose is accepted.
const _p = new THREE.Vector3(), _t = { point: new THREE.Vector3(), distance: 0 }, _ray = new THREE.Ray();
window.__solidDist = (x, y, z) => { let d = Infinity; _p.set(x, y, z); for (const c of world.collisionMeshes) { const bt = c.geometry.boundsTree; if (!bt) continue; const r = bt.closestPointToPoint(_p, _t, 0, d); if (r && r.distance < d) d = r.distance; } return d; };
window.__castDown = (x, y, z, far = 50) => { let best = null; _ray.origin.set(x, y, z); _ray.direction.set(0, -1, 0); for (const c of world.collisionMeshes) { const bt = c.geometry.boundsTree; if (!bt) continue; const h = bt.raycastFirst(_ray, THREE.DoubleSide); if (h && h.distance <= far && (!best || h.distance < best.distance)) best = h; } return best ? y - best.distance : null; };
window.__look = (x, z, tx, tz, h = 1.7, pitch = 0, yAbs = null) => {
  const y = yAbs ?? world.groundY(x, z) + h; const d = window.__solidDist(x, y, z); const yaw = THREE.MathUtils.radToDeg(Math.atan2(-(tx - x), -(tz - z)));
  const cam = [x, y, z, yaw, pitch].map((v) => +v.toFixed(2)).join(',');
  if (d < 0.6) return { ok: false, why: 'solid within ' + d.toFixed(2) + ' m', cam };
  _ray.origin.set(x, y, z); _ray.direction.set(0, 1, 0); for (const c of world.collisionMeshes) { const bt = c.geometry.boundsTree; const hit = bt && bt.raycastFirst(_ray, THREE.DoubleSide); if (hit && hit.distance < 6) return { ok: false, why: 'collision ' + hit.distance.toFixed(1) + ' m overhead', cam }; }
  setCam(cam); return { ok: true, cam, clear: +d.toFixed(2) };
};
window.__lookShot = async (name, ...a) => { const r = window.__look(...a); if (!r.ok) return r; r.saved = await window.__shot(name); return r; };
// Contact sheet of collision-checked poses: __sheet(name, [[label, x, z, tx, tz, h, pitch, yAbs], ...], cols) -> one jpg of 640 x 400 tiles
// (rejected poses are drawn as a red tile with the reason). Returns the pose results.
window.__sheet = async (name, poses, cols = 3) => {
  const W = 640, H = 400, rows = Math.ceil(poses.length / cols); const c = document.createElement('canvas'); c.width = W * cols; c.height = H * rows; const g = c.getContext('2d'); const out = [];
  for (let i = 0; i < poses.length; i++) { const [label, ...a] = poses[i]; const r = window.__look(...a); out.push([label, r.ok ? r.cam : r.why]); const x = (i % cols) * W, y = Math.floor(i / cols) * H;
    if (r.ok) { for (let k = 0; k < 6; k++) { world.update(0.016, camera); world.render(null, null); await new Promise((q) => setTimeout(q, 30)); } g.drawImage(renderer.domElement, x, y, W, H); } else { g.fillStyle = '#600'; g.fillRect(x, y, W, H); }
    g.fillStyle = '#000b'; g.fillRect(x, y, 300, 16); g.fillStyle = '#ff0'; g.font = '12px monospace'; g.fillText(label + (r.ok ? '' : ' ' + r.why), x + 4, y + 12); }
  const blob = await new Promise((q) => c.toBlob(q, 'image/jpeg', 0.85)); await fetch('http://127.0.0.1:' + (qs.get('shotPort') || '5187') + '/' + name, { method: 'POST', body: blob }); return out;
};
// Walk test with the real player controller (stuck safety net off): forward held from (x0, z0) toward (x1, z1), no
// jump. Returns { reached, seconds, end, maxRise (largest climb in one 60 fps tick), airTicks, minY, maxY }.
window.__walk = async (x0, z0, x1, z1, opts = {}) => {
  const { PlayerController } = await import('../src/game/player.js'); const pc = new PlayerController(world); pc._stuckWatch = () => {};
  const y0 = opts.y ?? (window.__castDown(x0, world.groundY(x0, z0) + 3, z0) ?? world.groundY(x0, z0)); pc.teleport(new THREE.Vector3(x0, y0 + 0.05, z0)); pc.yaw = Math.atan2(-(x1 - x0), -(z1 - z0));
  let t = 0, maxRise = 0, air = 0, minY = Infinity, maxY = -Infinity, prev = pc.position.y; const trace = [];
  for (; t < (opts.seconds || 12); t += 1 / 60) { pc.update(1 / 60, { forward: 1, strafe: 0, jump: false, crouchToggle: false, sprint: !!opts.sprint }); if (pc.events) pc.events.length = 0;
    const y = pc.position.y; if (t > 0.3) maxRise = Math.max(maxRise, y - prev); prev = y; if (!pc.grounded && t > 0.3) air++; minY = Math.min(minY, y); maxY = Math.max(maxY, y); if (Math.round(t * 60) % 30 === 0) trace.push([+pc.position.x.toFixed(2), +y.toFixed(2), +pc.position.z.toFixed(2)]);
    if (Math.hypot(pc.position.x - x1, pc.position.z - z1) < 0.5) break; }
  return { reached: Math.hypot(pc.position.x - x1, pc.position.z - z1) < 0.5, seconds: +t.toFixed(2), end: [+pc.position.x.toFixed(2), +pc.position.y.toFixed(2), +pc.position.z.toFixed(2)], maxRise: +maxRise.toFixed(3), airTicks: air, minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), trace };
};
// Hidden panes (innerWidth can be 0 there): size the renderer; __s(name, cam, fov) = a shot with a field of view (pairs with dev/earlofmarch-tiles.html __r).
window.__fit = (w = innerWidth || 1280, h = innerHeight || 800) => { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); world.setSize(w, h); return [w, h]; };
window.__s = async (name, cam, fov) => { if (!renderer.domElement.width) window.__fit(); if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); } return window.__shot(name, cam, 6); };
// post any JSON to the receiver (height grids, walk logs)
window.__post = async (name, obj) => { await fetch('http://127.0.0.1:' + (qs.get('shotPort') || '5187') + '/' + name, { method: 'POST', body: typeof obj === 'string' ? obj : JSON.stringify(obj) }); return name; };
// Builder's walk-through (definition of done): the real controller, forward only, both ways, along (a) every registered outside wall of the
// buildings whose id starts with one of `ids`, 1.3 m out; (b) every door's walk; (c) every OSM footway / path / service way inside the fence.
// Returns { walked, failed: [{ kind, id, from, to, end, short }] } (short = metres left to the target when the walker stopped).
window.__walkAll = async (ids = ['school', 'civic', 'portable']) => {
  const E = world.playEdge; const inE = (x, z) => { let c = false; for (let i = 0, j = E.length - 1; i < E.length; j = i++) { const a = E[i], b = E[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const out = { walked: 0, failed: [] }; const r1 = (v) => +v.toFixed(1);
  const go = async (kind, id, p, q) => { for (const [a, b] of [[p, q], [q, p]]) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2 || !inE(a[0], a[1]) || !inE(b[0], b[1])) continue; if (window.__solidDist(a[0], world.groundY(a[0], a[1]) + 1, a[1]) < 0.45 || window.__solidDist(b[0], world.groundY(b[0], b[1]) + 1, b[1]) < 0.45) continue;
    const r = await window.__walk(a[0], a[1], b[0], b[1], { seconds: Math.max(6, L / 3.2 + 4) }); out.walked++; if (!r.reached) out.failed.push({ kind, id, from: a.map(r1), to: b.map(r1), end: r.end.map(r1), short: r1(Math.hypot(r.end[0] - b[0], r.end[2] - b[1])) }); } };
  for (const w of world.registry.walls) { if (!ids.some((k) => String(w.id).startsWith(k))) continue; const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < 4) continue; const tx = (w.b[0] - w.a[0]) / L, tz = (w.b[1] - w.a[1]) / L, nx = tz, nz = -tx;
    await go('wall', w.id, [w.a[0] + tx * 0.8 + nx * 1.3, w.a[1] + tz * 0.8 + nz * 1.3], [w.b[0] - tx * 0.8 + nx * 1.3, w.b[1] - tz * 0.8 + nz * 1.3]); }
  for (const d of (world.registry.notes && world.registry.notes.doors) || []) await go('door', d.id, [d.x + d.nx * 0.75, d.z + d.nz * 0.75], [d.x + d.nx * 5.5, d.z + d.nz * 5.5]);
  const data = await (await fetch('./' + world.campus.files.campus)).json();
  for (const r of data.roads) { const hw = r.tags.highway; if (!['footway', 'path', 'service', 'tertiary'].includes(hw)) continue; for (let i = 0; i < r.line.length - 1; i++) await go(hw, r.id, r.line[i], r.line[i + 1]); }
  return out;
};
