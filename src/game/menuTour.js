// Main-menu cinematic: a slow camera tour of the loaded campus on smooth splines, ~8 s per shot with a dip to black
// between shots. Runs only while no match is active (title + lobby); renders the world without the viewmodel layer.
// Coordinates: world metres, -z = north, +x = east.
import * as THREE from 'three';

const SHOT_LEN = 8.5;
const FADE = 0.75;

// Shots come from the campus descriptor (world.tour): camera path + look-at path (Catmull-Rom), fov, caption.

const ease = (u) => u * u * (3 - 2 * u);

export function createMenuTour({ camera }) {
  const build = (shots) => shots.map((s) => ({
    ...s,
    p: new THREE.CatmullRomCurve3(s.pos.map((v) => new THREE.Vector3(...v)), false, 'centripetal'),
    t: new THREE.CatmullRomCurve3(s.tgt.map((v) => new THREE.Vector3(...v)), false, 'centripetal'),
  }));
  let curves = [];
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
      if (w !== world) { curves = build(w.tour || []); if (active) setShot(0); }
      world = w;
      if (active || !curves.length) return;
      active = true;
      document.body.classList.add('tour-on');
      setShot(Math.floor(Math.random() * curves.length));
    },
    /** Debug: jump to shot k at fraction u. */
    seek(k, u = 0.5, freeze = false) { setShot(k); t = u * SHOT_LEN; frozen = freeze; },
    get shots() { return curves.map((s) => s.name); },
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
