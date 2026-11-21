// Reference viewer: Google Photorealistic 3D Tiles around Earl of March Secondary School in the campus local frame (x east, z south).
//   ?cam=x,y,z,yawDeg,pitchDeg&fov=60   window.__heights(x0,x1,z0,z1,step) samples roof/ground heights.
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin, ReorientationPlugin, TileCompressionPlugin, UpdateOnChangePlugin, GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// the Browser pane may be hidden (no animation frames): drive everything from timers instead
window.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 8); window.cancelAnimationFrame = (h) => clearTimeout(h);
const ORIGIN = { lat: 45.32305, lon: -75.89570 };
const qs = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb6d0);
const camera = new THREE.PerspectiveCamera(parseFloat(qs.get('fov') || '60'), innerWidth / innerHeight, 0.5, 8000);
camera.rotation.order = 'YXZ';
function setCam(str) { const v = str.split(',').map(Number); camera.position.set(v[0] || 0, v[1] ?? 100, v[2] || 0); camera.rotation.set(THREE.MathUtils.degToRad(v[4] || 0), THREE.MathUtils.degToRad(v[3] || 0), 0); camera.updateMatrixWorld(); }
setCam(qs.get('cam') || '0,300,200,0,-55');
const holder = new THREE.Group(); holder.rotation.y = Math.PI; scene.add(holder);
const tiles = new TilesRenderer();
tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: import.meta.env.VITE_GOOGLE_TILES_KEY, autoRefreshToken: true }));
tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: new DRACOLoader().setDecoderPath('./assets/world/draco/') }));
tiles.registerPlugin(new TileCompressionPlugin()); tiles.registerPlugin(new UpdateOnChangePlugin());
tiles.registerPlugin(new ReorientationPlugin({ lat: ORIGIN.lat * THREE.MathUtils.DEG2RAD, lon: ORIGIN.lon * THREE.MathUtils.DEG2RAD, height: parseFloat(qs.get('h') || '0'), recenter: true }));
tiles.errorTarget = parseFloat(qs.get('err') || '4');
tiles.parseQueue.maxJobs = 8; tiles.downloadQueue.maxJobs = 16; tiles.lruCache.minBytesSize = 0.6 * 2 ** 30; tiles.lruCache.maxBytesSize = 0.9 * 2 ** 30;
holder.add(tiles.group); tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera, renderer);
let err = '';
tiles.addEventListener('load-error', (e) => { err = 'load-error ' + String(e.error && e.error.message || '').replace(/key=[^&\s"']+/gi, 'key=***').replace(/session=[^&\s"']+/gi, 'session=***'); });
const hud = document.getElementById('hud');
renderer.setAnimationLoop(() => {
  camera.updateMatrixWorld(); tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera, renderer); tiles.update(); renderer.render(scene, camera);
  hud.textContent = `dl ${tiles.stats.downloading} parse ${tiles.stats.parsing} visible ${tiles.stats.visible} ${err}`;
});
const rc = new THREE.Raycaster(); const down = new THREE.Vector3(0, -1, 0);
Object.assign(window, { __setCam: setCam, __tiles: tiles, __holder: holder, __camera: camera,
  __idle: () => tiles.stats.downloading === 0 && tiles.stats.parsing === 0,
  __heights(x0, x1, z0, z1, step) { const rows = []; for (let z = z0; z <= z1; z += step) { const r = []; for (let x = x0; x <= x1; x += step) { rc.set(new THREE.Vector3(x, 900, z), down); rc.far = 2000; const h = rc.intersectObject(tiles.group, true).filter((q) => q.point.y < 250 && q.object.visible !== false) /* (stale coarse tiles hang 600 m up) */; r.push(h.length ? Math.round(h[0].point.y * 10) / 10 : null); } rows.push(r); } return rows; },
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(max = 25000) { const t0 = performance.now(); let calm = 0; while (performance.now() - t0 < max) { await wait(120); if (renderer.domElement.width !== innerWidth) { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } camera.updateMatrixWorld(); tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera, renderer); tiles.update(); renderer.render(scene, camera); if (tiles.stats.downloading === 0 && tiles.stats.parsing === 0 && tiles.stats.visible > 3) { if (++calm > 8) return true; } else calm = 0; } return false; }
window.__settle = settle;
// save the current view (after tiles settle) to the local receiver on :5199
window.__shot = async (name, cam) => { if (cam) setCam(cam); const ok = await settle(); renderer.render(scene, camera); const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/jpeg', 0.88)); await fetch('http://127.0.0.1:5187/' + name, { method: 'POST', body: blob }); return name + ' ' + blob.size + ' ' + ok; };
window.__dumpHeights = async (name, x0, x1, z0, z1, step) => { const rows = window.__heights(x0, x1, z0, z1, step); await fetch('http://127.0.0.1:5187/' + name, { method: 'POST', body: JSON.stringify({ x0, x1, z0, z1, step, rows }) }); return rows.length; };
// same, to a receiver on another port (?recv=port) with an optional fov
window.__r = async (name, cam, fov) => { if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); } if (cam) setCam(cam); const ok = await settle(9000); renderer.render(scene, camera); const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/jpeg', 0.88)); await fetch('http://127.0.0.1:' + (qs.get('recv') || '5187') + '/' + name, { method: 'POST', body: blob }); return name + ' ' + blob.size + ' ' + ok; };
