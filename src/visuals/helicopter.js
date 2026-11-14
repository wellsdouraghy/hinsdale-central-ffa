// One-seat light attack helicopter + rocket projectile (original procedural design, no real-world markings).
// Heli: origin at the skid bottoms, nose toward -z, ~13.8 m long nose to fin, 11 m main rotor. Rocket: points along -z.
// Smoke / fire / rocket trails live in one shared, stateless GPU particle cloud (positions are a function of time in the
// vertex shader), so a trail keeps drifting and fading after the rocket that laid it has been removed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

const sat = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => { const t = sat((p - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (c, t, r, dt) => c + (t - c) * (1 - Math.exp(-r * dt));

// ---- shared particle cloud ------------------------------------------------------------------------------------------
let clock = () => performance.now() / 1000;
/** Dev/test hook: drive the particle clock from simulated time instead of the wall clock. */
export function setHeliFxClock(fn) { clock = fn; }

const FXN = 2048;
let fx = null;
function getFx() {
  if (fx) return fx;
  const p0 = new Float32Array(FXN * 3), v0 = new Float32Array(FXN * 3), tt = new Float32Array(FXN * 4), cc = new Float32Array(FXN * 4), mm = new Float32Array(FXN * 2);
  tt.fill(-1e6);
  const geo = new THREE.BufferGeometry();
  const attrs = [['position', p0, 3], ['aV', v0, 3], ['aT', tt, 4], ['aC', cc, 4], ['aM', mm, 2]].map(([n, a, s]) => { const at = new THREE.BufferAttribute(a, s); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, at); return at; });
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uTex: { value: T.puffTex() }, uLight: { value: 0.62 } },
    vertexShader: /* glsl */`
      attribute vec3 aV; attribute vec4 aT; attribute vec4 aC; attribute vec2 aM;   // aT: birth, life, size0, growth  aM: kind, drag
      uniform float uTime, uScale; varying vec4 vC; varying float vK;
      void main() {
        float t = uTime - aT.x, a = t / aT.y;
        vK = aM.x;
        float k = max(0.05, aM.y);
        vec3 p = position + aV * (1.0 - exp(-k * t)) / k + vec3(0.7, 0.0, 0.3) * t * min(1.0, t) * 0.6;
        p.y += (vK > 0.5 ? 1.6 : 0.9) * t * (1.0 - exp(-t * 1.5));                     // buoyancy
        float alpha = aC.a * smoothstep(0.0, 0.06, a) * pow(max(0.0, 1.0 - a), 1.4);
        vC = vec4(aC.rgb, alpha);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = aT.z + aT.w * sqrt(max(t, 0.0));
        gl_PointSize = (t < 0.0 || a >= 1.0) ? 0.0 : max(1.0, size * uScale / max(0.05, -mv.z));
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uLight; varying vec4 vC; varying float vK;
      void main() {
        float a = texture2D(uTex, gl_PointCoord).a * vC.a * (vK > 0.5 ? 1.5 : 1.0);
        if (a < 0.004) discard;
        float add = step(0.5, vK);
        gl_FragColor = vec4(vC.rgb * mix(uLight * 1.5, 1.0, add), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor = vec4(gl_FragColor.rgb * min(a, 1.0), min(a, 1.0) * (1.0 - add));
      }`,
    transparent: true, depthWrite: false, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'heliFx'; points.frustumCulled = false; points.renderOrder = 8;
  const _sz = new THREE.Vector2();
  points.onBeforeRender = (renderer, s, camera) => {
    const rt = renderer.getRenderTarget();
    mat.uniforms.uScale.value = (rt ? rt.height : renderer.getDrawingBufferSize(_sz).y) * 0.5 * camera.projectionMatrix.elements[5];
    mat.uniforms.uTime.value = clock();
  };
  let next = 0;
  fx = {
    points,
    // kind 0 = smoke (alpha), 1 = fire (additive)
    emit(kind, x, y, z, vx, vy, vz, life, size, growth, r, g, b, a, drag = 1.2) {
      const i = next; next = (next + 1) % FXN;
      p0[i * 3] = x; p0[i * 3 + 1] = y; p0[i * 3 + 2] = z; v0[i * 3] = vx; v0[i * 3 + 1] = vy; v0[i * 3 + 2] = vz;
      tt[i * 4] = clock(); tt[i * 4 + 1] = life; tt[i * 4 + 2] = size; tt[i * 4 + 3] = growth;
      cc[i * 4] = r; cc[i * 4 + 1] = g; cc[i * 4 + 2] = b; cc[i * 4 + 3] = a; mm[i * 2] = kind; mm[i * 2 + 1] = drag;
      for (const at of attrs) at.needsUpdate = true;
    },
    // make sure the cloud lives in the same scene as `obj` (world space)
    attach(obj) {
      let top = obj; while (top.parent) top = top.parent;
      if (top.isScene && points.parent !== top) top.add(points);
    },
  };
  return fx;
}

// ---- geometry helpers -----------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s1 = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  return g;
}
const box = (w, h, d, ...t) => place(new THREE.BoxGeometry(w, h, d), ...t);
const cylZ = (r1, r2, len, seg2, ...t) => { const g = new THREE.CylinderGeometry(r2, r1, len, seg2); g.rotateX(-Math.PI / 2); return place(g, ...t); }; // r1 rear (+z), r2 front (-z)
const cylY = (r1, r2, len, seg2, ...t) => place(new THREE.CylinderGeometry(r2, r1, len, seg2), ...t);
const cylX = (r, len, seg2, ...t) => { const g = new THREE.CylinderGeometry(r, r, len, seg2); g.rotateZ(Math.PI / 2); return place(g, ...t); };
const sph = (r, ...t) => place(new THREE.SphereGeometry(r, 16, 12), ...t);
// elliptical "airfoil" slab along x (span), chord along z
const wing = (span, chord, thick, ...t) => { const g = new THREE.CylinderGeometry(0.5, 0.5, span, 14); g.rotateZ(Math.PI / 2); g.scale(1, thick, chord); return place(g, ...t); };
function tube(pts, r, segs = 20) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), segs, r, 8, false); }
function plate(pts, thick, hole) {   // side profile [[z, y], ...] extruded across x, centred; hole = [z, y, radius]
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  if (hole) { const h = new THREE.Path(); h.absarc(hole[0], hole[1], hole[2], 0, Math.PI * 2, true); sh.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 20 });
  g.rotateY(-Math.PI / 2); g.translate(thick / 2, 0, 0);
  return g;
}
function merge(list) {
  return mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); return n; }), false);
}

// Fuselage: faceted (chamfered-box) cross-sections lofted along z, flat shaded for an armoured, low-observable look.
// uv = (along length, around: 0 belly, .25 right, .5 top, .75 left).
const Z0 = -5.2, ZL = 12.7;
const STATIONS = [ // z, half width, y bottom, y top
  [-5.2, 0.05, 1.2, 1.3], [-4.6, 0.27, 1.02, 1.56], [-3.9, 0.47, 0.9, 1.74], [-3.3, 0.57, 0.84, 1.82], [-1.75, 0.65, 0.8, 1.9],
  [-1.45, 0.67, 0.8, 2.46], [-1.0, 0.69, 0.8, 2.6], [0.0, 0.7, 0.84, 2.66], [1.0, 0.64, 0.92, 2.58], [1.9, 0.48, 1.15, 2.38], [2.7, 0.32, 1.42, 2.22],
  [3.4, 0.24, 1.6, 2.14], [5.2, 0.19, 1.82, 2.2], [6.9, 0.15, 1.98, 2.3], [7.4, 0.1, 2.06, 2.28],
];
const RING = [[0, -1, 0], [0.55, -1, 0.06], [1, -0.42, 0.16], [1, 0.38, 0.34], [0.5, 1, 0.44], [-0.5, 1, 0.56], [-1, 0.38, 0.66], [-1, -0.42, 0.84], [-0.55, -1, 0.94], [0, -1, 1]];
function fuselage() {
  const pos = [], uv = [], idx = [], R = RING.length;
  STATIONS.forEach(([z, hw, yb, yt]) => {
    const cy = (yb + yt) / 2, hh = (yt - yb) / 2;
    for (const [x, y, u] of RING) { pos.push(hw * x, cy + hh * y, z); uv.push((z - Z0) / ZL, u); }
  });
  for (let i = 0; i < STATIONS.length - 1; i++) for (let j = 0; j < R - 1; j++) {
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g = g.toNonIndexed(); g.computeVertexNormals();                       // hard facets
  return g;
}

// Hull paint: gunmetal digital camouflage, panel lines, rivets, chipped facet edges, red unit markings and nose art.
// level 0 pristine, 1 scorched, 2 burnt out.
function hullTexture(level) {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = T.rng(4242);
  const vx = (z) => ((z - Z0) / ZL) * W;
  const RED = 'rgba(178,30,24,0.95)';
  g.fillStyle = '#4b4f55'; g.fillRect(0, 0, W, H);
  // digital camouflage: clusters of square pixels in two neighbouring tones
  const tones = ['#33363b', '#62676e', '#3d4146', '#565b61', '#2b2e32'];
  for (let i = 0; i < 380; i++) {
    g.fillStyle = tones[(r() * tones.length) | 0];
    let x = Math.floor(r() * W / 9) * 9, y = Math.floor(r() * H / 9) * 9;
    for (let k = 0, n = 4 + r() * 14; k < n; k++) { g.fillRect(x, y, 9, 9); if (r() < 0.5) x += r() < 0.5 ? 9 : -9; else y += r() < 0.5 ? 9 : -9; }
  }
  for (let i = 0; i < 2200; i++) { const v = r(); g.fillStyle = v > 0.5 ? `rgba(150,155,160,${r() * 0.05})` : `rgba(8,9,10,${r() * 0.1})`; g.fillRect(r() * W, r() * H, 2 + r() * 10, 1 + r() * 4); }
  // panel lines + rivets
  const lines = [];
  for (const z of [-4.5, -3.9, -3.3, -2.5, -1.75, -1.0, -0.2, 0.6, 1.3, 2.0, 2.7, 3.4, 4.2, 5.0, 5.8, 6.6]) lines.push([vx(z), 0, vx(z), H]);
  for (const u of [0.11, 0.25, 0.39, 0.5, 0.61, 0.75, 0.89]) lines.push([0, u * H, W, u * H]);
  for (const [x1, y1, x2, y2] of lines) {
    g.strokeStyle = 'rgba(6,7,8,0.8)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = 'rgba(150,156,160,0.14)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x1 + 1.3, y1 + 1.3); g.lineTo(x2 + 1.3, y2 + 1.3); g.stroke();
    const len = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / len, dy = (y2 - y1) / len;
    for (let d = 4; d < len; d += 7) for (const o of [-4, 4]) { g.fillStyle = 'rgba(8,9,10,0.6)'; g.fillRect(x1 + dx * d - dy * o - 0.8, y1 + dy * d + dx * o - 0.8, 1.6, 1.6); g.fillStyle = 'rgba(170,176,180,0.22)'; g.fillRect(x1 + dx * d - dy * o - 0.2, y1 + dy * d + dx * o - 0.2, 0.9, 0.9); }
  }
  // access hatches both sides
  for (const side of [0.25, 0.75]) for (const [z, du, w, h] of [[-0.5, -0.02, 46, 30], [0.75, 0.04, 40, 26], [2.25, 0.0, 30, 18], [-3.0, -0.05, 34, 20]]) {
    const x = vx(z), y = (side + du) * H;
    g.strokeStyle = 'rgba(6,7,8,0.85)'; g.lineWidth = 1.4; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, 5); g.stroke();
    g.fillStyle = 'rgba(10,11,12,0.7)'; for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(x + ax * (w / 2 - 5) - 1.2, y + ay * (h / 2 - 5) - 1.2, 2.4, 2.4);
  }
  // chipped paint along the hard facet edges (bare metal showing through)
  for (const [, , u] of RING.slice(1, -1)) {
    for (let x = 0; x < W;) {
      const l = 3 + r() * 26; x += r() * 34;
      g.strokeStyle = `rgba(${150 + r() * 50 | 0},${155 + r() * 50 | 0},${160 + r() * 50 | 0},${0.2 + r() * 0.45})`; g.lineWidth = 0.8 + r() * 2.2;
      g.beginPath(); g.moveTo(x, u * H + (r() - 0.5) * 2); g.lineTo(x + l, u * H + (r() - 0.5) * 2); g.stroke(); x += l;
    }
  }
  // grime streaks running aft, heavy exhaust soot along the upper sides behind the engines
  for (let i = 0; i < 120; i++) { const x = r() * W, y = r() * H, l = 20 + r() * 110; const sg = g.createLinearGradient(x, 0, x + l, 0); sg.addColorStop(0, `rgba(6,6,5,${0.12 + r() * 0.2})`); sg.addColorStop(1, 'rgba(6,6,5,0)'); g.fillStyle = sg; g.fillRect(x, y, l, 1 + r() * 3); }
  for (const u of [0.4, 0.6]) { const sg = g.createLinearGradient(vx(1.8), 0, vx(6.2), 0); sg.addColorStop(0, 'rgba(4,4,4,0.85)'); sg.addColorStop(1, 'rgba(4,4,4,0)'); g.fillStyle = sg; g.beginPath(); g.ellipse(vx(3.8), u * H, vx(6.2) - vx(3.8), 30, 0, 0, 6.3); g.fill(); }
  // red tail band + thin warning stripe behind the cockpit
  g.fillStyle = RED; g.fillRect(vx(5.95), 0, vx(6.25) - vx(5.95), H);
  g.fillStyle = 'rgba(178,30,24,0.8)'; g.fillRect(vx(-1.2), 0, 3, H);
  // stencils: text reads correctly on the left side as drawn; the right side is drawn rotated 180 degrees
  const stencil = (side, z, du, text, size, color, outline) => {
    g.save(); g.translate(vx(z), (side + du) * H); if (side < 0.5) g.rotate(Math.PI);
    g.font = `800 ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (outline) { g.lineWidth = size * 0.14; g.strokeStyle = outline; g.strokeText(text, 0, 0); }
    g.fillStyle = color; g.fillText(text, 0, 0); g.restore();
  };
  for (const side of [0.25, 0.75]) {
    stencil(side, 4.55, 0, '13', 40, RED, 'rgba(228,224,214,0.9)');
    stencil(side, 1.55, 0.09, 'RED DEVILS', 14, 'rgba(200,36,28,0.9)');
    stencil(side, -2.6, 0.085, 'RESCUE', 9, 'rgba(214,190,60,0.8)');
    stencil(side, -0.5, 0.05, 'NO STEP', 8, 'rgba(180,184,188,0.6)');
    stencil(side, 6.75, 0, 'DANGER', 9, 'rgba(214,190,60,0.85)');
    // nose art (original): a snarling devil - slit eye, horn, fanged red grin - mirrored so it faces forward on both sides
    g.save(); g.translate(vx(-4.05), (side + (side < 0.5 ? 0.02 : -0.02)) * H); if (side < 0.5) g.scale(1, -1);
    g.fillStyle = RED; g.beginPath(); g.moveTo(-58, 8); g.quadraticCurveTo(-10, -6, 46, -10); g.lineTo(52, 2); g.quadraticCurveTo(-6, 30, -58, 8); g.fill();          // mouth
    g.fillStyle = 'rgba(10,10,10,0.9)'; g.beginPath(); g.moveTo(-50, 8); g.quadraticCurveTo(-8, 2, 40, -3); g.quadraticCurveTo(-6, 18, -50, 8); g.fill();
    g.fillStyle = 'rgba(236,232,220,0.95)';
    for (let i = 0; i < 7; i++) { const x = -44 + i * 12, top = 7 - i * 1.6; g.beginPath(); g.moveTo(x, top - 1); g.lineTo(x + 5, top + 9); g.lineTo(x + 10, top - 2.4); g.fill(); }
    g.fillStyle = 'rgba(236,206,60,0.95)'; g.beginPath(); g.moveTo(-34, -20); g.lineTo(-8, -26); g.lineTo(-16, -15); g.fill();                                           // eye
    g.fillStyle = 'rgba(10,10,10,0.95)'; g.beginPath(); g.ellipse(-19, -20.5, 2.2, 4.2, 0.3, 0, 6.3); g.fill();
    g.strokeStyle = RED; g.lineWidth = 3; g.beginPath(); g.moveTo(-38, -24); g.lineTo(-4, -32); g.stroke();                                                          // brow
    g.fillStyle = RED; g.beginPath(); g.moveTo(2, -30); g.quadraticCurveTo(26, -34, 34, -52); g.quadraticCurveTo(14, -46, -2, -38); g.fill();                         // horn
    g.restore();
    // pitchfork emblem ahead of the unit number
    g.save(); g.translate(vx(3.55), side * H); if (side < 0.5) g.rotate(Math.PI);
    g.strokeStyle = RED; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 14); g.lineTo(0, -6); g.moveTo(-8, -14); g.lineTo(-8, -5); g.quadraticCurveTo(0, 0, 8, -5); g.lineTo(8, -14); g.moveTo(0, -6); g.lineTo(0, -15); g.stroke(); g.restore();
  }
  // damage: soot blotches, burnt-through paint, bare scorched metal
  if (level > 0) {
    const n = level === 1 ? 55 : 190;
    for (let i = 0; i < n; i++) {
      const x = level === 1 ? vx(rand2(r, -1.5, 3.5)) : r() * W, y = level === 1 ? (0.25 + r() * 0.5) * H : r() * H, rad = 14 + r() * (level === 1 ? 40 : 70);
      const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, `rgba(3,3,3,${level === 1 ? 0.8 : 0.92})`); rg.addColorStop(0.6, 'rgba(6,5,5,0.45)'); rg.addColorStop(1, 'rgba(6,5,5,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill();
    }
    if (level === 2) {
      g.fillStyle = 'rgba(5,5,5,0.6)'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${90 + r() * 50 | 0},${60 + r() * 30 | 0},${40 + r() * 20 | 0},${0.15 + r() * 0.25})`; g.beginPath(); g.ellipse(r() * W, r() * H, 6 + r() * 26, 3 + r() * 12, r() * 3, 0, 6.3); g.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const rand2 = (r, a, b) => a + r() * (b - a);

// Tail-fin emblem (original): red disc, black pitchfork between two horns.
function emblemTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.translate(64, 64);
  g.fillStyle = 'rgba(184,30,24,1)'; g.beginPath(); g.arc(0, 0, 58, 0, 6.3); g.fill();
  g.strokeStyle = 'rgba(230,226,216,0.95)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 56, 0, 6.3); g.stroke();
  g.strokeStyle = '#0a0a0a'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(0, 42); g.lineTo(0, -8); g.moveTo(-20, -40); g.lineTo(-20, -14); g.quadraticCurveTo(0, 0, 20, -14); g.lineTo(20, -40); g.moveTo(0, -8); g.lineTo(0, -44); g.stroke();
  g.fillStyle = '#0a0a0a';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 30, 6); g.quadraticCurveTo(s * 52, -4, s * 44, -34); g.quadraticCurveTo(s * 40, -10, s * 26, -2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function beamTexture() {   // searchlight cone: bright at the lamp (v = 1), gone by the far end
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function discTexture(tail) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.translate(S / 2, S / 2);
  const ring = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  ring.addColorStop(0, 'rgba(20,20,20,0)'); ring.addColorStop(0.12, 'rgba(20,20,20,0.34)'); ring.addColorStop(0.9, 'rgba(22,22,22,0.2)'); ring.addColorStop(0.95, 'rgba(200,36,28,0.42)'); ring.addColorStop(0.985, 'rgba(20,20,20,0.16)'); ring.addColorStop(1, 'rgba(20,20,20,0)');
  g.fillStyle = ring; g.beginPath(); g.arc(0, 0, S / 2, 0, 6.3); g.fill();
  const nb = tail ? 8 : 4;
  for (let i = 0; i < nb * 2; i++) {
    g.save(); g.rotate((i / (nb * 2)) * Math.PI * 2);
    const w = g.createLinearGradient(0, -22, 0, 22); w.addColorStop(0, 'rgba(15,15,15,0)'); w.addColorStop(0.5, `rgba(15,15,15,${i % 2 ? 0.1 : 0.26})`); w.addColorStop(1, 'rgba(15,15,15,0)');
    g.fillStyle = w; g.beginPath(); g.moveTo(8, -3); g.lineTo(S / 2 - 3, -20); g.lineTo(S / 2 - 3, 20); g.lineTo(8, 3); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let res = null;
function resources() {
  if (res) return res;
  const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const paint = [], dark = [], metal = [], glass = [], frame = [], red = [];
  const HX = Math.PI / 6;
  // --- angular engine nacelles, intakes, upturned exhaust shrouds
  for (const s of [-1, 1]) {
    paint.push(cylZ(0.36, 0.31, 2.6, 6, s * 0.66, 2.22, 0.7, 0, 0, HX, 1, 0.82, 1));
    dark.push(cylZ(0.25, 0.25, 0.06, 6, s * 0.66, 2.22, -0.62, 0, 0, HX, 1, 0.82, 1));
    paint.push(box(0.46, 0.38, 0.95, s * 0.78, 2.36, 2.3, -0.24, s * 0.3, 0));
    dark.push(box(0.37, 0.29, 0.06, s * 0.915, 2.47, 2.75, -0.24, s * 0.3, 0));
    red.push(box(0.02, 0.2, 0.5, s * 0.985, 2.22, 0.2));                                     // nacelle flash
  }
  // --- rotor mast, swashplate, hub
  metal.push(cylY(0.09, 0.08, 0.62, 12, 0, 2.93, 0), cylY(0.2, 0.2, 0.05, 16, 0, 2.89, 0), cylY(0.16, 0.13, 0.14, 12, 0, 3.2, 0));
  paint.push(cylY(0.46, 0.32, 0.24, 6, 0, 2.74, 0));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.4; metal.push(cylY(0.012, 0.012, 0.36, 6, Math.cos(a) * 0.16, 3.04, Math.sin(a) * 0.16, 0.12, 0, 0)); }
  // --- big stub wings: two rocket pods and a wingtip missile rail per side
  const pod = (x, y, z) => {
    paint.push(box(0.07, 0.26, 0.62, x, y + 0.26, z + 0.05));
    paint.push(cylZ(0.21, 0.21, 1.3, 14, x, y, z), cylZ(0.07, 0.21, 0.34, 14, x, y, z + 0.82));
    metal.push(cylZ(0.215, 0.215, 0.05, 14, x, y, z - 0.63));
    for (let i = 0; i < 7; i++) { const a = (i / 6) * 6.283, rr = i === 6 ? 0 : 0.125; dark.push(cylZ(0.048, 0.048, 0.02, 8, x + Math.cos(a) * rr, y + Math.sin(a) * rr, z - 0.662)); }
  };
  for (const s of [-1, 1]) {
    paint.push(wing(1.95, 1.3, 0.12, s * 1.58, 1.42, 0.2, 0, 0, s * -0.07));
    pod(s * 1.25, 1.03, 0.05); pod(s * 1.88, 0.99, 0.12);
    paint.push(box(0.07, 0.1, 1.35, s * 2.55, 1.33, 0.2));
    metal.push(cylZ(0.062, 0.062, 1.5, 10, s * 2.55, 1.21, 0.15), cylZ(0.05, 0.062, 0.1, 10, s * 2.55, 1.21, 0.95));
    dark.push(cylZ(0.062, 0.012, 0.24, 10, s * 2.55, 1.21, -0.72));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.785; metal.push(place(box(0.16, 0.008, 0.2, 0.1, 0, 0), s * 2.55, 1.21, 0.72, 0, 0, a), place(box(0.1, 0.008, 0.12, 0.08, 0, 0), s * 2.55, 1.21, -0.35, 0, 0, a)); }
  }
  // --- chin turret base, ammunition bay with a flexible feed chute, sensor ball, searchlight housing, probes
  dark.push(cylY(0.22, 0.27, 0.18, 16, 0, 0.86, -3.3), box(0.22, 0.22, 0.46, 0, 0.7, -3.28));
  paint.push(box(0.54, 0.22, 0.95, 0, 0.74, -2.2));
  metal.push(place(tube([[0.22, 0.7, -2.62], [0.3, 0.58, -2.95], [0.2, 0.56, -3.2], [0.1, 0.64, -3.3]], 0.055, 16), 0, 0, 0, 0, 0, 0, 1.5, 0.75, 1));
  dark.push(sph(0.21, 0, 0.96, -4.3), cylY(0.12, 0.14, 0.16, 12, 0, 1.12, -4.3)); glass.push(cylZ(0.085, 0.085, 0.02, 12, 0, 0.98, -4.515), cylZ(0.04, 0.04, 0.02, 10, 0.11, 0.9, -4.47));
  metal.push(cylZ(0.1, 0.085, 0.2, 12, -0.3, 0.86, -3.75, 0.42, 0, 0));
  metal.push(cylZ(0.012, 0.008, 0.5, 6, 0.32, 1.42, -4.9), cylY(0.008, 0.004, 0.9, 5, 0, 2.7, 4.6, -0.5, 0, 0), cylY(0.008, 0.004, 0.7, 5, 0.1, 3.05, 0.9, -0.25, 0, 0));
  dark.push(plate([[3.9, 1.6], [4.2, 1.6], [4.12, 1.38], [3.98, 1.38]], 0.02), plate([[-0.4, 0.82], [0.1, 0.82], [0.0, 0.62], [-0.3, 0.62]], 0.02));
  // --- tail: shrouded fan in a fairing, tall swept fin with a red cap, ventral fin, stabiliser with end plates
  paint.push(plate([[6.3, 2.26], [6.95, 3.0], [8.12, 3.0], [8.18, 1.72], [6.9, 1.72]], 0.24, [7.5, 2.36, 0.56]));
  { const lip = new THREE.TorusGeometry(0.575, 0.075, 8, 26); lip.rotateY(Math.PI / 2); paint.push(place(lip, 0, 2.36, 7.5)); }
  metal.push(cylX(0.11, 0.26, 10, 0, 2.36, 7.5));
  for (let i = 0; i < 3; i++) dark.push(place(box(0.03, 1.12, 0.05, 0, 0, 0), 0.08, 2.36, 7.5, (i / 3) * Math.PI + 0.3, 0, 0));
  paint.push(plate([[6.95, 2.95], [8.02, 4.5], [8.6, 4.5], [8.12, 2.95]], 0.13), plate([[7.0, 1.75], [7.55, 1.18], [7.9, 1.18], [8.05, 1.75]], 0.09));
  red.push(plate([[7.88, 4.3], [8.02, 4.5], [8.6, 4.5], [8.54, 4.3]], 0.135));
  paint.push(wing(2.8, 0.62, 0.09, 0, 2.15, 5.9));
  for (const s of [-1, 1]) paint.push(place(plate([[5.55, 1.85], [6.05, 1.85], [6.2, 2.55], [5.75, 2.55]], 0.04), s * 1.4, 0, 0, 0, 0, s * -0.18));
  metal.push(cylY(0.012, 0.012, 0.5, 6, 0, 1.0, 7.75, 0.5, 0, 0));
  // --- skids and struts
  for (const s of [-1, 1]) {
    metal.push(tube([[s * 0.98, 0.36, -2.75], [s * 0.98, 0.12, -2.45], [s * 0.98, 0.05, -2.0], [s * 0.98, 0.05, 1.5], [s * 0.98, 0.07, 1.75]], 0.045, 24));
    for (const z of [-1.7, 0.85]) metal.push(tube([[s * 0.3, 0.98, z], [s * 0.66, 0.82, z], [s * 0.9, 0.42, z], [s * 0.98, 0.07, z]], 0.035, 12));
    dark.push(box(0.12, 0.03, 0.3, s * 0.98, 0.1, -1.0));
  }
  // --- canopy: flat armoured panes in a dark frame, faceted and steeply raked
  const P = { sf: [0.5, 1.5, -3.85], tf: [0.3, 2.52, -2.8], tr: [0.36, 2.64, -1.5], sr: [0.66, 1.58, -1.45], sm: [0.6, 1.54, -2.6] };
  const tri = (a, b, c2) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c2], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2)); g.computeVertexNormals(); return g; };
  const mir = (p) => [-p[0], p[1], p[2]];
  for (const [a, b, c2] of [[P.sf, mir(P.sf), mir(P.tf)], [P.sf, mir(P.tf), P.tf], [P.tf, mir(P.tf), mir(P.tr)], [P.tf, mir(P.tr), P.tr]]) glass.push(tri(a, b, c2));
  for (const f of [(p) => p, mir]) glass.push(tri(f(P.sf), f(P.tf), f(P.sm)), tri(f(P.sm), f(P.tf), f(P.tr)), tri(f(P.sm), f(P.tr), f(P.sr)));
  const bar = (a, b, r = 0.03) => tube([a, b], r, 1);
  for (const f of [(p) => p, mir]) frame.push(bar(f(P.sf), f(P.tf), 0.035), bar(f(P.tf), f(P.tr)), bar(f(P.sf), f(P.sm)), bar(f(P.sm), f(P.sr)), bar(f(P.tr), f(P.sr), 0.045), bar(f(P.sm), f(P.tf), 0.022), bar(f(P.sm), f(P.tr), 0.022));
  frame.push(bar(P.sf, mir(P.sf), 0.035), bar(P.tf, mir(P.tf)), bar(P.tr, mir(P.tr), 0.045), bar([0, 2.52, -2.8], [0, 2.64, -1.5], 0.02));
  // cockpit tub: seat, panel, glare shield (seen through the glass)
  dark.push(box(0.5, 0.75, 0.12, 0, 1.75, -1.72, -0.12), box(0.46, 0.1, 0.5, 0, 1.42, -2.0), box(0.7, 0.3, 0.3, 0, 1.72, -3.15, 0.5));
  // --- blades
  const blade = merge([box(4.95, 0.035, 0.34, 3.0, 0, 0), box(0.5, 0.06, 0.18, 0.3, 0, 0)]);
  const tip = box(0.36, 0.037, 0.342, 5.3, 0, 0);
  const tblade = merge([0, 1, 2, 3].map((i) => place(box(0.03, 1.08, 0.13, 0, 0, 0), 0, 0, 0, (i / 4) * Math.PI, 0, 0)));
  // rotary cannon: three long barrels, clamps, flash hider
  const gunParts = [];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283; gunParts.push(cylZ(0.022, 0.022, 1.65, 8, Math.cos(a) * 0.046, Math.sin(a) * 0.046, -0.86)); }
  gunParts.push(cylZ(0.08, 0.08, 0.05, 12, 0, 0, -0.3), cylZ(0.075, 0.075, 0.04, 12, 0, 0, -0.95), cylZ(0.075, 0.075, 0.04, 12, 0, 0, -1.45), cylZ(0.085, 0.075, 0.1, 12, 0, 0, -1.68), cylZ(0.1, 0.1, 0.42, 12, 0, 0, 0.03));
  // rocket
  const rk = [cylZ(0.045, 0.045, 1.1, 10, 0, 0, 0), cylZ(0.045, 0.004, 0.22, 10, 0, 0, -0.66), cylZ(0.03, 0.04, 0.06, 10, 0, 0, 0.57)];
  for (let i = 0; i < 4; i++) rk.push(place(box(0.16, 0.006, 0.16, 0.09, 0, 0.45), 0, 0, 0, 0, 0, (i / 4) * 6.283 + 0.785));
  const flame = new THREE.PlaneGeometry(1.6, 0.42); flame.rotateX(Math.PI / 2); flame.rotateY(-Math.PI / 2); flame.translate(0, 0, 0.6 + 0.8 - 0.14);   // hot end at the nozzle
  res = {
    hull: fuselage(), paint: merge(paint), dark: merge([...dark, ...frame]), metal: merge(metal), glass: merge(glass), red: merge(red), blade, tip, tblade, gun: merge(gunParts),
    emblem: merge([place(new THREE.PlaneGeometry(0.72, 0.72), 0.07, 3.75, 7.9, 0, Math.PI / 2, 0), place(new THREE.PlaneGeometry(0.72, 0.72), -0.07, 3.75, 7.9, 0, -Math.PI / 2, 0)]),
    beam: (() => { const g = new THREE.ConeGeometry(1.5, 11, 20, 1, true); g.translate(0, -5.5, 0); return g; })(),
    emblemTex: emblemTexture(), beamTex: beamTexture(),
    disc: new THREE.CircleGeometry(5.5, 48).rotateX(-Math.PI / 2), tdisc: new THREE.CircleGeometry(0.56, 28).rotateY(Math.PI / 2),
    pilot: merge([sph(0.15, 0, 2.2, -2.05), box(0.46, 0.42, 0.26, 0, 1.82, -1.98), cylZ(0.1, 0.1, 0.12, 10, 0, 2.17, -2.2)]),
    visor: sph(0.118, 0, 2.2, -2.13),
    rocket: merge(rk), flame, flash: new THREE.PlaneGeometry(1, 1),
    wearR: rep(T.wearRoughness(), 3, 3), wearA: rep(T.wearAlbedo(), 2, 2), discTex: discTexture(false), tdiscTex: discTexture(true),
    mRocket: new THREE.MeshStandardMaterial({ color: 0x565a50, roughness: 0.5, metalness: 0.6 }),
    mFlame: new THREE.MeshBasicMaterial({ map: T.flashSide(1), color: new THREE.Color(3, 2.2, 1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    mGlow: new THREE.SpriteMaterial({ map: T.puffTex(), color: new THREE.Color(4, 2.4, 1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
  };
  return res;
}

export function createHelicopter() {
  const r = resources(), F = getFx();
  const root = new THREE.Group(); root.name = 'helicopter';
  const body = new THREE.Group(); root.add(body);                    // wreck pose tilts this, never the root (gameplay owns root)
  const tex = [hullTexture(0), hullTexture(1), hullTexture(2)];
  const mHull = new THREE.MeshStandardMaterial({ map: tex[0], roughness: 0.55, metalness: 0.45, roughnessMap: r.wearR });
  const mPaint = new THREE.MeshStandardMaterial({ color: 0x4b4f55, map: r.wearA, roughness: 0.62, metalness: 0.25, roughnessMap: r.wearR });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x121311, roughness: 0.7, metalness: 0.3 });
  const mMetal = new THREE.MeshStandardMaterial({ color: 0x5c5f5e, roughness: 0.42, metalness: 0.9, roughnessMap: r.wearR });
  const mGlass = new THREE.MeshPhysicalMaterial({ color: 0x0c1418, roughness: 0.04, metalness: 0.85, transparent: true, opacity: 0.62, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  const mBlade = new THREE.MeshStandardMaterial({ color: 0x1a1b1a, roughness: 0.7, metalness: 0.2, transparent: true });
  const mTip = new THREE.MeshStandardMaterial({ color: 0xb0221c, roughness: 0.7, transparent: true });
  const mDisc = new THREE.MeshBasicMaterial({ map: r.discTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const mTDisc = new THREE.MeshBasicMaterial({ map: r.tdiscTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const mPilot = new THREE.MeshStandardMaterial({ color: 0x3a4032, roughness: 0.8 });
  const mVisor = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.08, metalness: 0.9 });
  const mk = (g, m, parent = body, shadow = true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = shadow; parent.add(o); return o; };
  const mRed = new THREE.MeshStandardMaterial({ color: 0xa81f1a, roughness: 0.6, metalness: 0.2 });
  const mEmblem = new THREE.MeshStandardMaterial({ map: r.emblemTex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  const hull = mk(r.hull, mHull); mk(r.paint, mPaint); mk(r.dark, mDark); mk(r.metal, mMetal); mk(r.red, mRed);
  const emblem = mk(r.emblem, mEmblem, body, false);
  // lights: red (port) / green (starboard) nav lights, white anti-collision strobes, cockpit glow, searchlight
  const glowSprite = (hex, k, x, y, z, size) => {
    const m = new THREE.SpriteMaterial({ map: T.puffTex(), color: new THREE.Color(hex).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.setScalar(size); body.add(sp); return sp;
  };
  const navL = glowSprite(0xff1408, 5, -2.6, 1.36, 0.2, 0.55), navR = glowSprite(0x10ff38, 4, 2.6, 1.36, 0.2, 0.55);
  const strobeT = glowSprite(0xffffff, 8, 0, 4.58, 8.35, 1.5), strobeB = glowSprite(0xffffff, 8, 0, 0.6, 0.4, 1.3);
  const lamp = glowSprite(0xcfe4ff, 6, -0.3, 0.8, -3.9, 0.7);
  const mBeam = new THREE.MeshBasicMaterial({ map: r.beamTex, color: 0xcfe4ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const beam = new THREE.Mesh(r.beam, mBeam); beam.position.set(-0.3, 0.8, -3.9); beam.rotation.x = 1.12; beam.renderOrder = 5; body.add(beam);
  const mPanel = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.2, 0.9), toneMapped: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), mPanel); panel.position.set(0, 1.8, -2.99); panel.rotation.x = -0.5; body.add(panel);
  const cabinGlow = glowSprite(0x38ffc0, 0.9, 0, 2.05, -2.6, 1.3);
  const exhausts = [-1, 1].map((s) => { const o = new THREE.Object3D(); o.position.set(s * 0.93, 2.5, 2.85); body.add(o); return o; });
  let searchlight = true, groundH = null, washAcc = 0, hazeAcc = 0;
  const glass = mk(r.glass, mGlass, body, false); glass.renderOrder = 3;
  const pilot = new THREE.Group(); pilot.visible = false; body.add(pilot);
  mk(r.pilot, mPilot, pilot, false); mk(r.visor, mVisor, pilot, false);

  // rotors
  const rotor = new THREE.Group(); rotor.position.set(0, 3.25, 0); body.add(rotor);
  const blades = [];
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.y = (i / 4) * Math.PI * 2; rotor.add(arm);
    const b = new THREE.Group(); arm.add(b);
    mk(r.blade, mBlade, b); mk(r.tip, mTip, b);
    blades.push(b);
  }
  const disc = new THREE.Mesh(r.disc, mDisc); disc.position.set(0, 3.27, 0); disc.renderOrder = 6; body.add(disc);
  const trotor = new THREE.Group(); trotor.position.set(0, 2.36, 7.5); body.add(trotor);
  const tb = [mk(r.tblade, mBlade, trotor)];
  const tdisc = new THREE.Mesh(r.tdisc, mTDisc); tdisc.position.copy(trotor.position); tdisc.renderOrder = 6; body.add(tdisc);

  // chin turret + cannon
  const turret = new THREE.Group(); turret.position.set(0, 0.66, -3.3); body.add(turret);
  const barrels = mk(r.gun, mMetal, turret);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -1.76); turret.add(muzzle);
  const mFlash = new THREE.MeshBasicMaterial({ map: T.flashFront(0), color: new THREE.Color(3, 2.5, 1.7), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const gFlash = new THREE.Group(); gFlash.position.copy(muzzle.position); gFlash.visible = false; turret.add(gFlash);
  for (const ry of [0, Math.PI / 2]) { const f = new THREE.Mesh(r.flash, mFlash); f.rotation.y = ry; if (ry) { f.scale.set(1.8, 0.7, 1); f.position.z = -0.4; } gFlash.add(f); }
  const pods = [-1, 1].map((s) => { const o = new THREE.Object3D(); o.position.set(s * 1.56, 1.01, -0.6); body.add(o); return o; });
  const mPodFlash = mFlash.clone();
  const podFlash = pods.map((p) => { const f = new THREE.Mesh(r.flash, mPodFlash); f.scale.setScalar(1.1); f.visible = false; p.add(f); return f; });
  const engine = new THREE.Object3D(); engine.position.set(0, 2.55, 1.5); body.add(engine);

  let rpm = 0, rpmTarget = 0, damage = 0, destroyed = false, wreckT = 0, spin = 0, gunSpin = 0, gunFlash = 0, time = 0, smokeAcc = 0, fireAcc = 0, texLevel = 0, occupied = false;
  const podT = [0, 0], _w = new THREE.Vector3(), _v = new THREE.Vector3();
  const wreckRoll = (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 0.3);

  function applyLook() {
    const lvl = destroyed ? 2 : damage > 0.4 ? 1 : 0;
    if (lvl !== texLevel) { texLevel = lvl; mHull.map = tex[lvl]; mHull.needsUpdate = true; }
    const k = destroyed ? 0.2 : 1 - seg(damage, 0.4, 1) * 0.45;
    mPaint.color.setHex(0x4b4f55).multiplyScalar(k); mRed.color.setHex(0xa81f1a).multiplyScalar(destroyed ? 0.15 : 1); emblem.visible = !destroyed;
    const lit = !destroyed; navL.visible = navR.visible = lit; strobeT.visible = strobeB.visible = lit;
    panel.visible = cabinGlow.visible = lit && occupied; lamp.visible = beam.visible = lit && occupied && searchlight; mHull.color.setScalar(destroyed ? 0.42 : 1 - seg(damage, 0.75, 1) * 0.3);
    mHull.metalness = mPaint.metalness = destroyed ? 0.05 : 0.25; mHull.roughness = mPaint.roughness = destroyed ? 0.9 : 0.62;
    mMetal.color.setHex(0x5c5f5e).multiplyScalar(destroyed ? 0.35 : 1);
    mGlass.opacity = destroyed ? 0.92 : 0.62; mGlass.color.setHex(destroyed ? 0x050505 : 0x0c1418); mGlass.roughness = destroyed ? 0.6 : 0.04;
    pilot.visible = occupied && !destroyed;
  }

  applyLook();

  const api = {
    object3D: root,
    gunMuzzle: muzzle, rocketPods: pods,
    seatEye: new THREE.Vector3(0, 2.2, -2.15),
    setRotorSpeed(v) { rpmTarget = sat(v); },
    setDamage(f) { damage = sat(f); applyLook(); },
    setOccupied(on) { occupied = !!on; applyLook(); },                     // shows the pilot behind the glass
    // optional: slew the chin turret (radians, relative to the airframe; yaw + = left, pitch + = up)
    aimGun(yaw = 0, pitch = 0) { turret.rotation.set(THREE.MathUtils.clamp(pitch, -0.9, 0.25), THREE.MathUtils.clamp(yaw, -1.6, 1.6), 0, 'YXZ'); },
    fireGun() {
      if (destroyed) return;
      gunFlash = 0.05; gunSpin = Math.min(60, gunSpin + 18);
      gFlash.visible = true; gFlash.rotation.z = Math.random() * 6.28; gFlash.scale.setScalar(rand(0.55, 0.85));
      mFlash.map = T.flashFront((Math.random() * 4) | 0); mFlash.opacity = 1;
    },
    fireRocket(side = 0) {
      if (destroyed) return;
      const i = side ? 1 : 0, p = pods[i];
      podT[i] = 0.09; podFlash[i].visible = true; podFlash[i].rotation.z = Math.random() * 6.28; mPodFlash.opacity = 1;
      F.attach(root); p.getWorldPosition(_w); _v.set(0, 0, 1).transformDirection(root.matrixWorld);
      for (let k = 0; k < 9; k++) {
        const back = k < 6 ? 1 : -1, sp = rand(3, 9) * back;
        F.emit(0, _w.x + _v.x * 0.6 * (back > 0 ? 1 : 0), _w.y, _w.z + _v.z * 0.6 * (back > 0 ? 1 : 0), _v.x * sp + rand(-1, 1), _v.y * sp + rand(-0.3, 1), _v.z * sp + rand(-1, 1), rand(1.0, 1.9), rand(0.3, 0.5), rand(0.9, 1.5), 0.8, 0.8, 0.78, rand(0.35, 0.55), 2.5);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; wreckT = 0; damage = 1; rpmTarget = 0; rpm = 0; applyLook();
      gFlash.visible = false; podFlash.forEach((f) => { f.visible = false; });
      // rotor wrecked: blades stopped, two snapped short, all drooping
      blades.forEach((b, i) => { b.rotation.z = -rand(0.12, 0.3); b.scale.x = i % 2 ? rand(0.3, 0.55) : 1; b.rotation.y = rand(-0.15, 0.15); });
      body.rotation.set(rand(-0.06, 0.02), 0, wreckRoll); body.position.set(wreckRoll * -1.2, -0.42, 0);
    },
    reset() {
      destroyed = false; damage = 0; rpm = rpmTarget = 0; wreckT = 0; applyLook();
      blades.forEach((b) => { b.rotation.set(0, 0, 0); b.scale.x = 1; });
      body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
    },
    get destroyed() { return destroyed; },
    // Optional. Height of the skids above the ground (m) for rotor wash; null = assume the ground is at world y = 0.
    setGroundEffect(height) { groundH = height == null ? null : Math.max(0, height); },
    setSearchlight(on) { searchlight = !!on; applyLook(); },
    update(dt) {
      dt = Math.min(dt, 0.1); time += dt;
      F.attach(root);
      rpm = damp(rpm, destroyed ? 0 : rpmTarget, rpmTarget > rpm ? 0.9 : 0.6, dt);
      // rotors: real blades at low rpm cross-fading to a blurred disc
      const blur = seg(rpm, 0.22, 0.62);
      if (!destroyed) {
        spin += rpm * 34 * dt; rotor.rotation.y = spin; trotor.rotation.x = spin * 4.3;
        const droop = (1 - sat(rpm * 1.6)) * -0.055 + sat(rpm) * 0.03;                          // sag at rest, cone under load
        for (const b of blades) b.rotation.z = droop;
      }
      mBlade.opacity = mTip.opacity = 1 - blur * 0.94; mBlade.depthWrite = blur < 0.5;
      mDisc.opacity = blur * 0.9; mTDisc.opacity = blur * 0.9;
      disc.visible = tdisc.visible = blur > 0.01;
      disc.rotation.y = -time * 2.2; tdisc.rotation.x = time * 3.1;
      // cannon
      gunSpin = Math.max(0, gunSpin - dt * 45); barrels.rotation.z += gunSpin * dt;
      if (gunFlash > 0) { gunFlash -= dt; mFlash.opacity = sat(gunFlash / 0.05); if (gunFlash <= 0) gFlash.visible = false; }
      for (let i = 0; i < 2; i++) if (podT[i] > 0) { podT[i] -= dt; mPodFlash.opacity = sat(podT[i] / 0.09); if (podT[i] <= 0) podFlash[i].visible = false; }
      // anti-collision strobes: double flash every 1.3 s
      const ph = time % 1.3, st = ph < 0.06 || (ph > 0.17 && ph < 0.23) ? 1 : 0;
      strobeT.material.opacity = st; strobeB.material.opacity = ph > 0.65 && ph < 0.71 ? 1 : 0;
      mBeam.opacity = 0.05 + Math.sin(time * 31) * 0.004;
      if (!destroyed && rpm > 0.3) {
        // exhaust haze streaming aft from the shrouds
        hazeAcc += rpm * 16 * dt;
        while (hazeAcc >= 1) {
          hazeAcc -= 1;
          const ex = exhausts[(Math.random() * 2) | 0]; ex.getWorldPosition(_w);
          _v.set(rand(-0.25, 0.25) + ex.position.x * 0.5, rand(0.3, 0.8), 1).transformDirection(root.matrixWorld).multiplyScalar(rand(3, 6));
          F.emit(0, _w.x, _w.y, _w.z, _v.x, _v.y, _v.z, rand(0.35, 0.7), 0.35, rand(0.9, 1.5), 0.1, 0.095, 0.09, rand(0.1, 0.18), 2.2);
        }
        // rotor wash: dust thrown outward in a ring on the ground when hovering low
        root.getWorldPosition(_w);
        const h = groundH ?? _w.y;
        if (rpm > 0.45 && h < 14) {
          washAcc += rpm * (1 - h / 14) * 55 * dt;
          const gy = _w.y - h + 0.2;
          while (washAcc >= 1) {
            washAcc -= 1;
            const a = rand(0, 6.283), rr = rand(3.2, 6.8), sp = rand(5, 11), k = rand(0.85, 1.15);
            F.emit(0, _w.x + Math.cos(a) * rr, gy, _w.z + Math.sin(a) * rr, Math.cos(a) * sp, rand(0.2, 1.5), Math.sin(a) * sp, rand(0.9, 1.7), rand(0.7, 1.2), rand(1.8, 2.8), 0.46 * k, 0.43 * k, 0.34 * k, rand(0.1, 0.2), 2.6);
          }
        }
      }
      // damage smoke / fire from the engine deck; a wreck smoulders and dies down over ~40 s
      let smoke = 0, fire = 0;
      if (destroyed) { wreckT += dt; smoke = 16 * Math.max(0.12, 1 - wreckT / 40) * (wreckT < 90 ? 1 : 0); fire = wreckT < 14 ? 9 * (1 - wreckT / 14) : 0; }
      else { smoke = damage > 0.4 ? 6 + seg(damage, 0.4, 1) * 22 : 0; fire = damage > 0.75 ? 8 + (damage - 0.75) * 40 : 0; }
      if (smoke > 0 || fire > 0) {
        engine.getWorldPosition(_w);
        smokeAcc += smoke * dt; fireAcc += fire * dt;
        const heavy = destroyed || damage > 0.75;
        while (smokeAcc >= 1) {
          smokeAcc -= 1;
          const k = heavy ? rand(0.03, 0.09) : rand(0.1, 0.22);
          F.emit(0, _w.x + rand(-0.4, 0.4), _w.y + rand(-0.1, 0.2), _w.z + rand(-0.5, 0.5), rand(-0.6, 0.6), rand(1.2, 2.8), rand(-0.6, 0.6), rand(2.6, 4.6), rand(0.5, 0.9), rand(1.1, 1.9) * (heavy ? 1.3 : 1), k, k * 0.95, k * 0.9, rand(0.45, 0.7), 0.9);
        }
        while (fireAcc >= 1) {
          fireAcc -= 1;
          F.emit(1, _w.x + rand(-0.45, 0.45), _w.y + rand(-0.25, 0.1), _w.z + rand(-0.7, 0.6), rand(-0.4, 0.4), rand(1.2, 2.6), rand(-0.4, 0.4), rand(0.3, 0.6), rand(0.5, 0.9), rand(0.2, 0.6), 2.6, rand(0.7, 1.2), 0.12, 0.7, 1.5);
        }
      }
    },
    dispose() {
      root.removeFromParent();
      for (const t of tex) t.dispose();
      for (const m of [mHull, mPaint, mDark, mMetal, mGlass, mBlade, mTip, mDisc, mTDisc, mPilot, mVisor, mFlash, mPodFlash, mRed, mEmblem, mBeam, mPanel, navL.material, navR.material, strobeT.material, strobeB.material, lamp.material, cabinGlow.material]) m.dispose();
    },
  };
  return api;
}

// Rocket projectile visual (gameplay moves object3D along its path). Points along -z. The exhaust trail is laid into the
// shared particle cloud, so it lingers ~2 s after the rocket is disposed.
export function createRocket() {
  const r = resources(), F = getFx();
  const root = new THREE.Group(); root.name = 'rocket';
  const m = new THREE.Mesh(r.rocket, r.mRocket); m.castShadow = true; root.add(m);
  const f1 = new THREE.Mesh(r.flame, r.mFlame), f2 = new THREE.Mesh(r.flame, r.mFlame); f2.rotation.z = Math.PI / 2;
  const glow = new THREE.Sprite(r.mGlow); glow.position.z = 0.75; glow.scale.setScalar(1.3);
  root.add(f1, f2, glow);
  const last = new THREE.Vector3(), cur = new THREE.Vector3(), d = new THREE.Vector3();
  let has = false, carry = 0, t = 0;
  return {
    object3D: root,
    update(dt) {
      t += dt;
      F.attach(root);
      const fl = 0.8 + Math.sin(t * 90) * 0.12 + Math.random() * 0.15;
      f1.scale.set(fl, 1, fl); f2.scale.set(fl, 1, fl); glow.scale.setScalar(1.1 + fl * 0.35);
      root.updateWorldMatrix(true, false);
      cur.set(0, 0, 0.65).applyMatrix4(root.matrixWorld);
      if (!has) { last.copy(cur); has = true; return; }
      d.subVectors(cur, last);
      const dist = d.length();
      if (dist > 30) { last.copy(cur); carry = 0; return; }                       // teleported (pooled reuse)
      const STEP = 0.4;
      let s = STEP - carry;
      while (s <= dist) {
        const k = s / dist, hot = Math.random() < 0.3;
        F.emit(0, last.x + d.x * k, last.y + d.y * k, last.z + d.z * k, rand(-0.5, 0.5), rand(-0.2, 0.6), rand(-0.5, 0.5), rand(1.5, 2.4), rand(0.26, 0.4), rand(0.7, 1.15), 0.86, 0.85, 0.82, rand(0.3, 0.45), 2.0);
        if (hot) F.emit(1, last.x + d.x * k, last.y + d.y * k, last.z + d.z * k, 0, 0, 0, 0.14, 0.4, 0.3, 2.4, 1.1, 0.25, 0.6, 2.0);
        s += STEP;
      }
      carry = dist - (s - STEP);
      last.copy(cur);
    },
    dispose() { root.removeFromParent(); },
  };
}
