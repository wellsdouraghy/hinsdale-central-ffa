// World-space waypoint markers (flags, bases): on-screen icons with distance, clamped to the screen edge with an
// arrow when the target is off-screen or behind the camera.
import * as THREE from 'three';

const _p = new THREE.Vector3();
const _c = new THREE.Vector3();

const ICONS = {
  nade: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="14" rx="6" ry="7"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M15 4h4v2h-4z"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 2h2v20H5z"/><path d="M8 3h11l-3 4 3 4H8z"/></svg>',
  base: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke-width="3"/><circle cx="12" cy="12" r="3"/></svg>',
};

export function createMarkers(container) {
  const els = new Map();

  function get(id) {
    let e = els.get(id);
    if (!e) {
      e = document.createElement('div');
      e.className = 'wp';
      e.innerHTML = '<div class="wp-arrow"></div><div class="wp-icon"></div><div class="wp-label"></div><div class="wp-dist"></div>';
      container.appendChild(e);
      e._parts = { icon: e.children[1], label: e.children[2], dist: e.children[3], arrow: e.children[0] };
      els.set(id, e);
    }
    return e;
  }

  /** list: [{ id, pos: Vector3, label, color (css), icon: 'flag'|'base', pulse }] */
  function update(list, camera) {
    const w = innerWidth, h = innerHeight;
    const seen = new Set();
    camera.updateMatrixWorld();
    for (const m of list) {
      seen.add(m.id);
      const e = get(m.id);
      const pp = e._parts;
      if (e._icon !== m.icon) { pp.icon.innerHTML = ICONS[m.icon] || ICONS.flag; e._icon = m.icon; }
      if (e._label !== m.label) { pp.label.textContent = m.label; e._label = m.label; }
      if (e._color !== m.color) { e.style.setProperty('--wc', m.color); e._color = m.color; }
      e.classList.toggle('pulse', !!m.pulse);
      const dist = Math.round(camera.position.distanceTo(m.pos));
      if (e._dist !== dist) { pp.dist.textContent = dist + ' m'; e._dist = dist; }

      _c.copy(m.pos).applyMatrix4(camera.matrixWorldInverse); // camera space (looking down -z)
      _p.copy(m.pos).project(camera);
      const onScreen = _c.z < 0 && Math.abs(_p.x) < 0.92 && Math.abs(_p.y) < 0.86;
      let x, y;
      if (onScreen) {
        x = (_p.x + 1) / 2 * w;
        y = (1 - _p.y) / 2 * h;
        e.classList.remove('off');
      } else {
        let ax = _c.x, ay = _c.y;
        if (_c.z > 0 && Math.hypot(ax, ay) < 1e-3) ay = -1;
        const a = Math.atan2(ay, ax);
        const rx = w / 2 - 70, ry = h / 2 - 70;
        x = w / 2 + Math.cos(a) * rx;
        y = h / 2 - Math.sin(a) * ry;
        e.classList.add('off');
        pp.arrow.style.transform = `rotate(${-a + Math.PI / 2}rad)`;
      }
      e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    for (const [id, e] of els) if (!seen.has(id)) { e.remove(); els.delete(id); }
  }

  function clear() { for (const e of els.values()) e.remove(); els.clear(); }

  return { update, clear };
}
