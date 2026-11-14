// Airstrike visuals (original designs): first-person rugged targeting laptop, twin-engine strike jet, retarded bomb.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHand } from './hands.js';
import { getWorldFx } from './helicopter.js';
import * as T from './textures.js';

const sat = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => { const t = sat((p - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const backOut = (t) => { const c = 1.9; t = sat(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };   // overshoot ease
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _w = new THREE.Vector3(), _v = new THREE.Vector3();
function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))); return g; }
const box = (w, h, d, ...t) => place(new THREE.BoxGeometry(w, h, d), ...t);
const rbox = (w, h, d, r, ...t) => place(new RoundedBoxGeometry(w, h, d, 2, r), ...t);
const cylZ = (r1, r2, len, sg, ...t) => { const g = new THREE.CylinderGeometry(r2, r1, len, sg); g.rotateX(-Math.PI / 2); return place(g, ...t); };   // r1 rear (+z), r2 front (-z)
const cylX = (r, len, sg, ...t) => { const g = new THREE.CylinderGeometry(r, r, len, sg); g.rotateZ(Math.PI / 2); return place(g, ...t); };
const cylY = (r1, r2, len, sg, ...t) => place(new THREE.CylinderGeometry(r2, r1, len, sg), ...t);
function merge(list) { return mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); return n; }), false); }
const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };

// =====================================================================================================================
// Targeting laptop (overlay / camera space, sized for a 70 degree vertical-FOV overlay camera)
// =====================================================================================================================
const SW = 0.388, SH = 0.2425, DIST = 0.26;                 // visible screen size (16:10) and its distance from the eye
const LW = 0.424, LH = 0.288, LT = 0.02, BD = 0.29, BT = 0.03, SCREEN_Y = 0.03 + SH / 2;   // lid/base dims; screen centre above the hinge
const BASE_TILT = 0.62, EYE_DROP = -0.016;                  // base slopes down toward the player; screen sits slightly low

function defaultScreenTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#04100c'; g.fillRect(0, 0, 512, 320);
  g.strokeStyle = 'rgba(60,200,140,0.16)'; g.lineWidth = 1;
  for (let x = 0; x <= 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 320); g.stroke(); }
  for (let y = 0; y <= 320; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.strokeStyle = 'rgba(90,255,170,0.7)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(256, 168, 46, 0, 6.3); g.moveTo(256, 100); g.lineTo(256, 236); g.moveTo(188, 168); g.lineTo(324, 168); g.stroke();
  g.fillStyle = 'rgba(90,255,170,0.85)'; g.font = '600 15px ui-monospace, Menlo, monospace';
  g.fillText('STRIKE UPLINK  //  SELECT TARGET', 14, 24); g.fillText('LINK 98%   FLIGHT OF 3 READY', 14, 308);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function scanlineTexture() {   // pixel grid + scanlines + diagonal glare, laid over whatever the screen shows
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 256; y += 2) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, 256, 1); }
  for (let x = 0; x < 256; x += 2) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 1, 256); }
  const gl = g.createLinearGradient(0, 0, 256, 200); gl.addColorStop(0, 'rgba(255,255,255,0.09)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.015)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(0, 0, 256, 256);
  const vg = g.createRadialGradient(128, 128, 60, 128, 128, 190); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = vg; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let lap = null;
function laptopRes() {
  if (lap) return lap;
  const shell = [], rubber = [], metal = [], keys = [];
  // base (origin at the hinge line, extends +z toward the player, top surface at y = 0)
  shell.push(rbox(LW, BT, BD, 0.008, 0, -BT / 2, BD / 2 + 0.006));
  shell.push(rbox(0.16, 0.022, 0.03, 0.006, 0, -BT / 2, BD + 0.022));                                          // carry handle
  for (const sx of [-1, 1]) { metal.push(box(0.012, 0.012, 0.04, sx * 0.07, -BT / 2, BD + 0.012)); metal.push(cylX(0.011, 0.05, 10, sx * 0.14, 0.002, 0.004)); }
  rubber.push(rbox(0.3, 0.004, 0.09, 0.002, 0, 0.001, BD - 0.055));                                           // palm rest / touchpad strip
  for (const sx of [-1, 1]) for (const z of [0.02, BD - 0.008]) rubber.push(rbox(0.05, BT + 0.012, 0.05, 0.012, sx * (LW / 2 - 0.012), -BT / 2, z + 0.006));
  for (const sx of [-1, 1]) metal.push(box(0.03, 0.012, 0.01, sx * 0.13, -0.008, BD + 0.011));                   // latches
  for (let rr = 0; rr < 5; rr++) for (let k = 0; k < 13; k++) keys.push(rbox(0.021, 0.005, 0.021, 0.002, (k - 6) * 0.0262 + (rr % 2) * 0.006, 0.003, 0.04 + rr * 0.0265));
  keys.push(rbox(0.14, 0.005, 0.021, 0.002, 0, 0.003, 0.04 + 5 * 0.0265));
  // lid (origin at the hinge, extends +y, screen faces +z)
  const lid = [rbox(LW, LH, LT, 0.008, 0, LH / 2, -LT / 2)], lidRubber = [], lidMetal = [];
  for (const sx of [-1, 1]) for (const y of [0.016, LH - 0.016]) lidRubber.push(rbox(0.05, 0.05, LT + 0.012, 0.012, sx * (LW / 2 - 0.012), y, -LT / 2));
  lidRubber.push(box(SW + 0.018, SH + 0.018, 0.002, 0, SCREEN_Y, 0.0012));                                     // bezel
  lidMetal.push(cylY(0.006, 0.005, 0.07, 8, LW / 2 - 0.05, LH + 0.03, -LT / 2), cylY(0.009, 0.009, 0.014, 8, LW / 2 - 0.05, LH + 0.002, -LT / 2));   // antenna stub
  for (let i = 0; i < 4; i++) lidMetal.push(cylZ(0.004, 0.004, 0.003, 6, (i % 2 ? 1 : -1) * (LW / 2 - 0.04), i < 2 ? 0.05 : LH - 0.05, 0.001));
  const nrm = rep(T.polymerNormal(), 4, 4), wr = rep(T.wearRoughness(), 1, 1), wa = rep(T.wearAlbedo(), 1, 1);
  lap = {
    shell: merge(shell), rubber: merge(rubber), metal: merge(metal), keys: merge(keys), lid: merge(lid), lidRubber: merge(lidRubber), lidMetal: merge(lidMetal),
    screen: new THREE.PlaneGeometry(SW, SH),
    mShell: new THREE.MeshStandardMaterial({ color: 0x4d5440, map: wa, roughness: 0.7, roughnessMap: wr, normalMap: nrm, normalScale: new THREE.Vector2(0.6, 0.6) }),
    mRubber: new THREE.MeshStandardMaterial({ color: 0x101110, roughness: 0.92 }),
    mMetal: new THREE.MeshStandardMaterial({ color: 0x74777a, roughness: 0.4, metalness: 0.9 }),
    mKeys: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, emissive: 0x2a6a48, emissiveIntensity: 0.55 }),
    scan: scanlineTexture(), defTex: defaultScreenTexture(),
  };
  return lap;
}

// First-person rugged laptop held in both hands. Add object3D to the overlay scene (camera space, like the viewmodel).
// The weapon is not this object's business: hide or lower the viewmodel while the laptop is up, then viewmodel.equip().
export function createTargetingLaptop() {
  const r = laptopRes();
  const root = new THREE.Group(); root.name = 'targetingLaptop'; root.visible = false;
  const rig = new THREE.Group(); root.add(rig);
  const baseG = new THREE.Group(); baseG.rotation.x = BASE_TILT; rig.add(baseG);
  const lidG = new THREE.Group(); baseG.add(lidG);
  const mk = (g, m, parent) => { const o = new THREE.Mesh(g, m); o.frustumCulled = false; parent.add(o); return o; };
  mk(r.shell, r.mShell, baseG); mk(r.rubber, r.mRubber, baseG); mk(r.metal, r.mMetal, baseG); mk(r.keys, r.mKeys, baseG);
  mk(r.lid, r.mShell, lidG); mk(r.lidRubber, r.mRubber, lidG); mk(r.lidMetal, r.mMetal, lidG);
  const mScreen = new THREE.MeshBasicMaterial({ map: r.defTex, color: 0x000000, toneMapped: false });
  const screen = mk(r.screen, mScreen, lidG); screen.position.set(0, SCREEN_Y, 0.0026);
  const mScan = new THREE.MeshBasicMaterial({ map: r.scan, transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
  const scan = mk(r.screen, mScan, lidG); scan.position.set(0, SCREEN_Y, 0.0032); scan.renderOrder = 2;
  // small self-contained fill light so the case reads even if the overlay scene is dim
  const light = new THREE.PointLight(0x9fffd0, 0, 0.9, 2); light.position.set(0, SCREEN_Y, 0.12); lidG.add(light);
  // self-contained light rig (tagged like the viewmodel's so neither counts the other as "external"); it switches
  // itself off when the overlay scene has lights of its own
  const hemi = new THREE.HemisphereLight(0xd6e4ff, 0x6b6456, 1.3), sun = new THREE.DirectionalLight(0xfff0dc, 3.2);
  sun.position.set(-0.5, 0.9, 0.8); sun.target.position.set(0, -0.1, -0.3);
  hemi.userData.viewmodelRig = sun.userData.viewmodelRig = light.userData.viewmodelRig = true;
  root.add(hemi, sun, sun.target);
  let sceneRef = null, lightCheck = 0;
  screen.onBeforeRender = (rr, sc) => { sceneRef = sc; };
  // gloved hands on the sides of the base, thumbs over the top edge
  const hands = [];
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const h = createHand(side);
    h.setPose({ curl: [0.35, 0.85, 0.9, 0.9, 0.85], forearm: [0.5, sx * -0.25, 0] });
    h.group.position.set(sx * (LW / 2 + 0.012), -0.03, 0.1);
    h.group.rotation.set(0.25, sx * -1.25, sx * -2.2, 'YXZ');
    baseG.add(h.group); hands.push(h);
  }
  let t = 0, target = 0, flick = 0, time = 0;
  const hingeY = EYE_DROP - SCREEN_Y;                                   // rig position that centres the screen
  function pose() {
    const a = target ? backOut(seg(t, 0, 0.85)) : seg(t, 0, 1), lidA = target ? backOut(seg(t, 0.25, 1)) : seg(t, 0.2, 1);
    rig.position.set(0.05 * (1 - a), hingeY - 0.42 * (1 - a), -DIST + 0.05 * (1 - a));
    rig.rotation.set(-0.85 * (1 - a), 0.25 * (1 - a), 0.12 * (1 - a));
    lidG.rotation.x = Math.PI / 2 - lidA * (Math.PI / 2 + BASE_TILT);   // closed on the keys -> upright, square to the eye
    const on = seg(t, 0.75, 1);
    mScreen.color.setScalar(on * (0.92 + flick)); mScan.opacity = on; light.intensity = on * 0.5;
  }
  pose();
  const _c = new THREE.Vector3();
  return {
    object3D: root,
    open() { root.visible = true; target = 1; flick = 0.5; },
    close() { target = 0; },
    isOpen() { return target === 1 && t > 0.98; },
    get progress() { return t; },
    // NDC rect {x0,y0,x1,y1} (-1..1, y up) of the visible screen when fully open. Pass the overlay camera for an exact
    // answer; without it a 70 degree vertical-FOV camera at the window's aspect ratio is assumed.
    screenRect(camera) {
      const f = camera ? camera.projectionMatrix.elements[5] : 1 / Math.tan((35 * Math.PI) / 180);
      const fx = camera ? camera.projectionMatrix.elements[0] : f / (window.innerWidth / Math.max(1, window.innerHeight));
      const z = DIST - 0.0026, cx = 0, cy = EYE_DROP;
      return { x0: ((cx - SW / 2) / z) * fx, x1: ((cx + SW / 2) / z) * fx, y0: ((cy - SH / 2) / z) * f, y1: ((cy + SH / 2) / z) * f };
    },
    // Optional: show a live texture (e.g. a CanvasTexture of the targeting map) on the screen; null restores the default.
    setScreenTexture(tex) { mScreen.map = tex || r.defTex; mScreen.needsUpdate = true; },
    update(dt) {
      time += dt;
      const dur = target ? 0.35 : 0.25;
      t += Math.sign(target - t) * Math.min(Math.abs(target - t), dt / dur);
      flick = Math.max(0, flick - dt * 2.5) * (0.6 + 0.4 * Math.sin(time * 90));
      lightCheck -= dt;
      if (sceneRef && lightCheck <= 0) {
        lightCheck = 1; let external = false;
        sceneRef.traverse((o) => { if (o.isLight && !o.userData.viewmodelRig) external = true; });
        hemi.visible = sun.visible = !external;
      }
      if (root.visible) pose();
      if (t <= 0.001 && target === 0) root.visible = false;
    },
    dispose() { root.removeFromParent(); for (const h of hands) h.dispose(); mScreen.dispose(); mScan.dispose(); light.dispose?.(); },
  };
}

// =====================================================================================================================
// Strike jet (world space, origin at the centre, nose toward -z, ~15 m long, 10.8 m span)
// =====================================================================================================================
function loft(stations, SEG = 20, n = 2.6) {   // [z, half width, y bottom, y top]
  const pos = [], uv = [], idx = [];
  stations.forEach(([z, hw, yb, yt], i) => {
    const cy = (yb + yt) / 2, hh = (yt - yb) / 2;
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2 - Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cy + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / n), z);
      uv.push(i / (stations.length - 1), j / SEG);
    }
  });
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + 1, c = a + SEG + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function slab(pts, thick, y = 0) {   // planform [[x, z], ...] with thickness, top surface at y
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))), { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: 0.06, bevelOffset: -0.06, bevelSegments: 1 });
  g.rotateX(Math.PI / 2); g.translate(0, y, 0);
  return g;
}
function fin(pts, thick) {           // side profile [[z, y], ...] across x
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y))), { depth: thick, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); g.translate(thick / 2, 0, 0);
  return g;
}
function flameTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);     // v = 1 (top row) at the nozzle
  gr.addColorStop(0, 'rgba(255,245,225,1)'); gr.addColorStop(0.12, 'rgba(255,190,90,0.95)'); gr.addColorStop(0.4, 'rgba(255,110,40,0.55)'); gr.addColorStop(0.75, 'rgba(120,90,255,0.2)'); gr.addColorStop(1, 'rgba(80,80,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;   // canvas top row = nozzle end (v = 0)
  return t;
}
const bombBody = () => { const g = new THREE.LatheGeometry([[0, -1.1], [0.07, -1.0], [0.15, -0.75], [0.18, -0.4], [0.18, 0.35], [0.13, 0.75], [0.09, 0.95], [0, 0.95]].map(([rr, z]) => new THREE.Vector2(rr, z)), 14); g.rotateX(Math.PI / 2); return g; };   // nose -z

let jet = null;
function jetRes() {
  if (jet) return jet;
  const paint = [], dark = [], glass = [];
  paint.push(loft([[-7.5, 0.03, -0.12, -0.04], [-6.7, 0.24, -0.36, 0.16], [-5.4, 0.46, -0.55, 0.38], [-3.8, 0.6, -0.64, 0.58], [-1.6, 0.92, -0.68, 0.6], [1.5, 1.12, -0.62, 0.56], [4.6, 1.08, -0.52, 0.5], [6.3, 0.98, -0.44, 0.42], [6.7, 0.9, -0.4, 0.38]]));
  dark.push(cylZ(0.2, 0.02, 1.0, 12, 0, -0.1, -7.0));                                                          // radome
  glass.push(place(new THREE.SphereGeometry(1, 16, 10), 0, 0.42, -4.3, 0, 0, 0, 0.4, 0.46, 1.55));
  for (const s of [-1, 1]) {
    paint.push(box(0.6, 0.72, 2.0, s * 0.92, -0.2, -2.3)); dark.push(box(0.5, 0.6, 0.06, s * 0.92, -0.2, -3.31));       // intakes
    paint.push(slab([[s * 0.95, -1.9], [s * 5.4, 1.7], [s * 5.4, 3.0], [s * 0.95, 3.4]], 0.14, 0.02));                   // wing
    paint.push(slab([[s * 0.9, 4.9], [s * 3.1, 6.4], [s * 3.1, 7.3], [s * 0.9, 7.1]], 0.1, -0.02));                      // stabilator
    paint.push(place(fin([[3.9, 0], [5.7, 2.2], [6.6, 2.2], [6.5, 0]], 0.09), s * 0.78, 0.42, 0, 0, 0, s * -0.32));       // canted tail
    dark.push(cylZ(0.44, 0.4, 1.1, 14, s * 0.55, -0.02, 7.1)); dark.push(cylZ(0.34, 0.34, 0.04, 12, s * 0.55, -0.02, 7.66));
    paint.push(box(0.05, 0.1, 1.9, s * 5.42, -0.03, 2.3)); paint.push(cylZ(0.06, 0.02, 2.3, 8, s * 5.42, -0.14, 2.2));   // wingtip rail + missile
    for (const x of [2.2, 3.7]) { paint.push(box(0.07, 0.26, 1.1, s * x, -0.2, 1.4 + (x - 2.2) * 0.5)); dark.push(place(bombBody(), s * x, -0.5, 1.4 + (x - 2.2) * 0.5, 0, 0, 0, 0.95, 0.95, 0.95)); }
  }
  paint.push(box(0.5, 0.2, 2.6, 0, 0.6, -1.6, 0.06));                                                          // spine fairing
  const cone = (rr, len) => { const g = new THREE.ConeGeometry(rr, len, 14, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2); return g; };   // apex at +z, base (v=0)... flipped below
  const mkFlame = (rr, len) => { const g = new THREE.CylinderGeometry(rr * 0.12, rr, len, 14, 1, true); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); g.translate(0, 0, len / 2); return g; };
  jet = {
    paint: merge(paint), dark: merge(dark), glass: merge(glass),
    flame: merge([place(mkFlame(0.33, 5.2), 0.55, -0.02, 7.6), place(mkFlame(0.33, 5.2), -0.55, -0.02, 7.6), place(mkFlame(0.2, 3.0), 0.55, -0.02, 7.6), place(mkFlame(0.2, 3.0), -0.55, -0.02, 7.6)]),
    mPaint: new THREE.MeshStandardMaterial({ color: 0x8f969d, roughness: 0.55, metalness: 0.15, roughnessMap: rep(T.wearRoughness(), 3, 3) }),
    mDark: new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.6 }),
    mGlass: new THREE.MeshPhysicalMaterial({ color: 0x1a1608, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6 }),
    flameTex: flameTexture(),
  };
  void cone;
  return jet;
}

export function createStrikeJet() {
  const r = jetRes(), F = getWorldFx();
  const root = new THREE.Group(); root.name = 'strikeJet';
  for (const [g, m] of [[r.paint, r.mPaint], [r.dark, r.mDark], [r.glass, r.mGlass]]) { const o = new THREE.Mesh(g, m); o.castShadow = true; root.add(o); }
  const mFlame = new THREE.MeshBasicMaterial({ map: r.flameTex, color: new THREE.Color(2.2, 2.0, 1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const flame = new THREE.Mesh(r.flame, mFlame); flame.frustumCulled = false; root.add(flame);
  const sprite = (hex, k, x, y, z, size) => { const m = new THREE.SpriteMaterial({ map: T.puffTex(), color: new THREE.Color(hex).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }); const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.setScalar(size); root.add(s); return s; };
  const navL = sprite(0xff1408, 6, -5.45, 0, 2.6, 1.3), navR = sprite(0x10ff38, 5, 5.45, 0, 2.6, 1.3), strobe = sprite(0xffffff, 9, 0, 0.7, 6.4, 2.6);
  const glowL = sprite(0xffa040, 3, -0.55, 0, 7.9, 2.4), glowR = sprite(0xffa040, 3, 0.55, 0, 7.9, 2.4);
  let ab = true, abT = 1, time = Math.random() * 5, has = false, acc = 0;
  const last = new THREE.Vector3(), cur = new THREE.Vector3(), tips = [new THREE.Vector3(-5.42, 0, 3.1), new THREE.Vector3(5.42, 0, 3.1)], noz = [new THREE.Vector3(-0.55, 0, 8.6), new THREE.Vector3(0.55, 0, 8.6)];
  return {
    object3D: root,
    setAfterburner(on) { ab = !!on; },
    update(dt) {
      time += dt; F.attach(root);
      abT += Math.sign((ab ? 1 : 0) - abT) * Math.min(Math.abs((ab ? 1 : 0) - abT), dt * 4);
      const fl = 0.85 + Math.sin(time * 70) * 0.08 + Math.random() * 0.1;
      mFlame.opacity = abT * fl; flame.scale.set(1, 1, 0.25 + abT * (0.75 + (fl - 0.9) * 0.6));
      glowL.material.opacity = glowR.material.opacity = 0.25 + abT * 0.75 * fl;
      strobe.material.opacity = (time % 1.1) < 0.07 ? 1 : 0;
      // wingtip vapour + exhaust haze laid into the shared world cloud, spaced by distance travelled
      root.updateWorldMatrix(true, false);
      cur.setFromMatrixPosition(root.matrixWorld);
      if (!has) { last.copy(cur); has = true; return; }
      const dist = cur.distanceTo(last);
      if (dist > 60) { last.copy(cur); acc = 0; return; }
      acc += dist; last.copy(cur);
      while (acc >= 3) {
        acc -= 3;
        for (const tip of tips) { _w.copy(tip).applyMatrix4(root.matrixWorld); F.emit(0, _w.x, _w.y, _w.z, rand(-0.3, 0.3), rand(-0.3, 0.1), rand(-0.3, 0.3), rand(0.9, 1.5), 0.35, 0.5, 1.05, 1.05, 1.08, 0.3, 3); }
        const nz = noz[(Math.random() * 2) | 0]; _w.copy(nz).applyMatrix4(root.matrixWorld);
        F.emit(0, _w.x, _w.y, _w.z, rand(-1, 1), rand(-0.5, 1), rand(-1, 1), rand(1.0, 1.8), 1.0, 2.2, 0.16, 0.15, 0.14, 0.1 + abT * 0.1, 2);
      }
    },
    dispose() { root.removeFromParent(); mFlame.dispose(); for (const s of [navL, navR, strobe, glowL, glowR]) s.material.dispose(); },
  };
}

// =====================================================================================================================
// Bomb (world space, nose toward -z; gameplay orients it along its velocity). Retard fins pop ~0.25 s after release.
// =====================================================================================================================
let bomb = null;
function bombRes() {
  if (bomb) return bomb;
  const body = [bombBody()], band = [], tail = [];
  band.push(cylZ(0.183, 0.183, 0.07, 14, 0, 0, -0.42), cylZ(0.165, 0.152, 0.05, 14, 0, 0, -0.72));
  tail.push(cylZ(0.1, 0.1, 0.5, 12, 0, 0, 1.15));
  for (let i = 0; i < 4; i++) tail.push(place(box(0.004, 0.3, 0.42, 0, 0.16, 1.1), 0, 0, 0, 0, 0, (i / 4) * 6.283 + 0.785));
  bomb = {
    body: merge(body), band: merge(band), tail: merge(tail),
    petal: (() => { const g = box(0.26, 0.012, 0.62, 0, 0, 0.31); return g; })(),                               // hinged at its front edge
    mBody: new THREE.MeshStandardMaterial({ color: 0x4a5138, roughness: 0.6, metalness: 0.3, map: rep(T.wearAlbedo(), 1, 1) }),
    mBand: new THREE.MeshStandardMaterial({ color: 0xc9a520, roughness: 0.7 }),
    mTail: new THREE.MeshStandardMaterial({ color: 0x3a3d3a, roughness: 0.5, metalness: 0.6 }),
  };
  return bomb;
}
export function createBomb() {
  const r = bombRes(), F = getWorldFx();
  const root = new THREE.Group(); root.name = 'bomb';
  for (const [g, m] of [[r.body, r.mBody], [r.band, r.mBand], [r.tail, r.mTail]]) { const o = new THREE.Mesh(g, m); o.castShadow = true; root.add(o); }
  const petals = [];
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = (i / 4) * Math.PI * 2; root.add(arm);
    const p = new THREE.Mesh(r.petal, r.mTail); p.position.set(0, 0.105, 0.92); p.castShadow = true; arm.add(p);
    petals.push(p);
  }
  let t = 0, acc = 0;
  return {
    object3D: root,
    update(dt) {
      t += dt; F.attach(root);
      const open = backOut(sat((t - 0.25) / 0.22));
      for (const p of petals) p.rotation.x = -open * 1.15;                 // swing out into the airflow
      acc += dt * 9;
      if (acc >= 1) { acc -= 1; root.getWorldPosition(_w); _v.set(0, 0, 1).transformDirection(root.matrixWorld); F.emit(0, _w.x + _v.x * 1.5, _w.y + _v.y * 1.5, _w.z + _v.z * 1.5, rand(-0.4, 0.4), rand(-0.2, 0.5), rand(-0.4, 0.4), rand(0.5, 0.9), 0.25, 0.7, 0.8, 0.8, 0.8, 0.16, 3); }
    },
    dispose() { root.removeFromParent(); },
  };
}
