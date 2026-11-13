// Google Photorealistic 3D Tiles mode (visual only; the custom campus stays as invisible collision).
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin, ReorientationPlugin, TileCompressionPlugin, TilesFadePlugin, UpdateOnChangePlugin, GLTFExtensionsPlugin, UnloadTilesPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const ORIGIN = { lat: 41.78725, lon: -87.93375 };
const ERROR_TARGET = { low: 22, medium: 12, high: 7 };
const GOOGLE_LOGO = '<img src="https://www.gstatic.com/images/branding/googlelogo/1x/googlelogo_light_color_68x28dp.png" alt="Google" style="height:16px;vertical-align:middle;margin-right:6px">';
// open, flat spots (x, z) used to register the tile ground to y = 0
const GROUND_PROBES = [[-150, 60], [-160, 90], [245, 30], [262, 48], [60, 150], [85, 140], [-60, 160], [240, -70], [-153, -100], [-59, 37], [150, 150], [-216, 0], [0, -203]];
const scrub = (s) => String(s).replace(/key=[^&\s"']+/gi, 'key=***').replace(/session=[^&\s"']+/gi, 'session=***');

export function createTiles({ renderer, scene, camera, key, quality, customVisuals, sky }) {
  return new Promise((resolve, reject) => {
    let settled = false, disposed = false;
    const holder = new THREE.Group(); holder.name = 'google-3d-tiles';
    // ReorientationPlugin leaves +X facing west and +Z facing north; our frame is +X east, +Z south
    holder.rotation.y = Math.PI;
    scene.add(holder);

    const tiles = new TilesRenderer();
    const draco = new DRACOLoader().setDecoderPath('./assets/world/draco/');
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true }));
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
    tiles.registerPlugin(new TileCompressionPlugin());
    tiles.registerPlugin(new UpdateOnChangePlugin());
    tiles.registerPlugin(new UnloadTilesPlugin());
    tiles.registerPlugin(new TilesFadePlugin({ fadeDuration: 250 }));
    // initial height guess (ellipsoid height of the campus ~ 188 m); refined by ground probes below
    tiles.registerPlugin(new ReorientationPlugin({ lat: ORIGIN.lat * THREE.MathUtils.DEG2RAD, lon: ORIGIN.lon * THREE.MathUtils.DEG2RAD, height: 187.9, recenter: true }));
    tiles.errorTarget = ERROR_TARGET[quality] || 10;
    tiles.lruCache.minBytesSize = (quality === 'low' ? 0.15 : 0.3) * 2 ** 30;
    tiles.lruCache.maxBytesSize = (quality === 'low' ? 0.22 : 0.45) * 2 ** 30;
    tiles.downloadQueue.maxJobs = 12; tiles.parseQueue.maxJobs = 4;
    holder.add(tiles.group);
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, renderer);

    const fail = (msg) => {
      if (settled) { console.warn('[world] Google 3D Tiles: ' + scrub(msg)); return; }
      settled = true; dispose(); reject(new Error(scrub(msg)));
    };
    const timer = setTimeout(() => fail('timed out waiting for the root tileset'), 15000);
    // the root tileset is only requested from update(); pump it until the game loop takes over
    const pump = setInterval(() => { if (settled || disposed) { clearInterval(pump); return; } try { camera.updateMatrixWorld(); tiles.update(); } catch (e) { fail(e && e.message ? e.message : 'update failed'); } }, 100);
    let rootFailures = 0;
    tiles.addEventListener('load-error', (e) => {
      // a failing root tileset (bad key, quota, referrer) means tiles mode cannot work at all
      if (!settled && (!e.tile || !tiles.root)) { rootFailures++; fail('root tileset failed to load (' + (e.error && e.error.message ? e.error.message : 'error') + ')'); }
    });
    tiles.addEventListener('load-root-tileset', () => {
      if (settled) return; settled = true; clearTimeout(timer);
      customVisuals.visible = false;
      resolve(api);
    });
    tiles.addEventListener('load-model', (e) => {
      e.scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; if (o.material) o.material.fog = true; } });
    });

    // ---- vertical registration. The real terrain is not perfectly flat (and coarse LODs sit a few metres off), while
    // gameplay collision is a flat y = 0 plane, so the tiles are continuously and smoothly shifted so that the scanned
    // ground around the camera stays at y = 0. Coarse campus-wide probes are only used until local data is available.
    const rc = new THREE.Raycaster(); rc.firstHitOnly = false;
    const down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
    const LOCAL = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [6, 6], [-6, 6], [6, -6], [-6, -6], [10, 0], [-10, 0], [0, 10], [0, -10]];
    let calibT = 1.0, calibN = 0, targetY = 0, lastErr = null, haveTarget = false;
    function probe(points, ox, oz, minHits) {
      const ys = [];
      for (const [x, z] of points) {
        from.set(ox + x, 300, oz + z); rc.set(from, down); rc.far = 700;
        const hits = rc.intersectObject(tiles.group, true);
        let low = Infinity; for (const h of hits) if (h.point.y < low) low = h.point.y;   // lowest hit = ground under canopies/cars
        if (low < Infinity) ys.push(low);
      }
      if (ys.length < minHits) return null;
      ys.sort((a, b) => a - b);
      return ys[Math.floor(ys.length * 0.35)];
    }
    function calibrate(cam) {
      let med = probe(LOCAL, cam.position.x, cam.position.z, 7);
      if (med === null && calibN < 3) med = probe(GROUND_PROBES, 0, 0, 4);
      if (med === null || Math.abs(med) > 60) return false;
      lastErr = med; targetY = holder.position.y - med; haveTarget = true;
      return true;
    }

    function dispose() {
      if (disposed) return; disposed = true; clearTimeout(timer); clearInterval(pump);
      try { tiles.dispose(); } catch (e) { /* ignore */ }
      try { draco.dispose(); } catch (e) { /* ignore */ }
      scene.remove(holder);
    }

    const attributions = [];
    const api = {
      tiles, holder,
      get groundOffset() { return holder.position.y; },
      get calibration() { return { n: calibN, lastErr, y: holder.position.y }; },
      update(cam, dt = 0.016) {
        if (disposed) return;
        tiles.setCamera(cam);
        tiles.setResolutionFromRenderer(cam, renderer);
        cam.updateMatrixWorld();
        tiles.update();
        calibT -= dt;
        if (calibT <= 0) { calibT = 0.6; if (calibrate(cam)) calibN++; }
        if (haveTarget) {
          const d = targetY - holder.position.y;
          // snap the first time, then drift gently (max 0.5 m/s) so the ground never visibly jumps
          const step = calibN <= 2 ? d : Math.sign(d) * Math.min(Math.abs(d), 0.5 * dt);
          if (Math.abs(step) > 1e-4) { holder.position.y += step; holder.updateMatrixWorld(true); }
        }
      },
      setSize() { tiles.setResolutionFromRenderer(camera, renderer); },
      attributionHTML(base) {
        attributions.length = 0;
        let text = '';
        try { tiles.getAttributions(attributions); for (const a of attributions) if (a.type === 'string' && a.value) text += (text ? '; ' : '') + a.value; } catch (e) { /* ignore */ }
        const esc = text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        return GOOGLE_LOGO + (esc ? esc + ' &middot; ' : '') + base;
      },
      dispose,
    };
  });
}
