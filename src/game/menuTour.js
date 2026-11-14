// Main-menu cinematic: a slow camera tour of the loaded campus on smooth splines, ~8 s per shot with a dip to black
// between shots. Runs only while no match is active (title + lobby); renders the world without the viewmodel layer.
// Coordinates: world metres, -z = north (55th St), +x = east.
import * as THREE from 'three';

const SHOT_LEN = 8.5;
const FADE = 0.75;

// Each shot: camera path + look-at path (Catmull-Rom through the points), field of view, caption.
const SHOTS = [
  { name: 'Dickinson Field', fov: 42,
    pos: [[-92, 16, -52], [-100, 19, -86], [-104, 21, -122], [-100, 22, -152]],
    tgt: [[-150, 3, -96], [-152, 3, -100], [-152, 3, -104], [-150, 4, -108]] },
  { name: '55th Street entrance', fov: 48,
    pos: [[28, 3.2, -196], [38, 3.4, -195], [48, 3.8, -194], [58, 4.2, -193]],
    tgt: [[54, 7, -150], [57, 7, -150], [60, 7, -150], [63, 7, -150]] },
  { name: 'Water tower', fov: 46,
    pos: [[-8.0, 24.0, 74.8], [7.4, 26.5, 87.7], [17.5, 29.0, 105.2], [21.0, 31.5, 125.0]],
    tgt: [[-37, 22, 125], [-37, 23, 125], [-37, 24, 125], [-37, 25, 125]] },
  { name: 'Rooftops', fov: 52,
    pos: [[150, 58, -28], [110, 52, -46], [70, 48, -62], [30, 46, -74]],
    tgt: [[80, 8, -110], [50, 8, -112], [20, 8, -110], [-10, 8, -106]] },
  { name: 'Tennis courts', fov: 44,
    pos: [[-8, 32, -186], [-12, 30, -160], [-14, 29, -132], [-14, 28, -104]],
    tgt: [[-66, 0, -150], [-66, 0, -134], [-66, 0, -118], [-66, 0, -100]] },
  { name: 'Track & field', fov: 40,
    pos: [[-206, 7, -150], [-204, 9, -118], [-202, 11, -86], [-198, 13, -54]],
    tgt: [[-150, 6, -128], [-150, 5, -104], [-150, 5, -82], [-150, 6, -64]] },
];

const ease = (u) => u * u * (3 - 2 * u);

export function createMenuTour({ camera }) {
  const curves = SHOTS.map((s) => ({
    ...s,
    p: new THREE.CatmullRomCurve3(s.pos.map((v) => new THREE.Vector3(...v)), false, 'centripetal'),
    t: new THREE.CatmullRomCurve3(s.tgt.map((v) => new THREE.Vector3(...v)), false, 'centripetal'),
  }));
  const fade = document.getElementById('cine-fade');
  const caption = document.getElementById('cine-shot');
  const _p = new THREE.Vector3(), _t = new THREE.Vector3();
  let world = null, active = false, t = 0, i = 0, clock = 0, frozen = false;

  function setShot(k) {
    i = k % curves.length;
    t = 0;
    if (caption) { caption.textContent = curves[i].name; caption.classList.remove('in'); void caption.offsetWidth; caption.classList.add('in'); }
  }

  return {
    get active() { return active; },
    /** Starts (or keeps running) the tour over `w` (the loaded world). */
    start(w) {
      world = w;
      if (active) return;
      active = true;
      document.body.classList.add('tour-on');
      setShot(Math.floor(Math.random() * curves.length));
    },
    /** Debug: jump to shot k at fraction u. */
    seek(k, u = 0.5, freeze = false) { setShot(k); t = u * SHOT_LEN; frozen = freeze; },
    get shots() { return SHOTS.map((s) => s.name); },
    stop() {
      if (!active) return;
      active = false;
      document.body.classList.remove('tour-on');
      if (fade) fade.style.opacity = '0';
    },
    update(dt) {
      if (!active || !world) return;
      clock += dt;
      if (!frozen) t += dt;
      if (t >= SHOT_LEN) setShot(i + 1);
      const s = curves[i];
      const u = ease(Math.min(1, t / SHOT_LEN));
      s.p.getPoint(u, _p);
      s.t.getPoint(u, _t);
      // A little handheld drift.
      _p.x += Math.sin(clock * 0.7) * 0.25; _p.y += Math.sin(clock * 0.9 + 1) * 0.15;
      camera.position.copy(_p);
      camera.up.set(0, 1, 0);
      camera.lookAt(_t);
      camera.rotateZ(Math.sin(clock * 0.35) * 0.008);
      if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld();
      // Dip to black at shot boundaries.
      const edge = Math.min(t, SHOT_LEN - t);
      if (fade) fade.style.opacity = edge < FADE ? (1 - edge / FADE).toFixed(3) : '0';
      world.update(dt, camera);
      world.render(null, null);
    },
  };
}
