// Capture-the-flag visuals: a cloth flag on a pole (vertex-shader cloth wave, team emblem) and a base stand with a
// weighted foot, a team-coloured platform, a pulsing ground ring and a soft locator beam.
// Interface (CONTRACTS.md): createFlag({ team }) -> { object3D, setCarried(bool), update(dt), dispose() }
//                           createFlagBase({ team }) -> { object3D, update(dt), dispose() }
import * as THREE from 'three';

const TEAM = {
  red: { color: 0xe0242c, dark: '#8f1016', main: '#d8232b', light: '#ff6a5e', label: 'RED' },
  blue: { color: 0x2a6bff, dark: '#12318f', main: '#2a62ea', light: '#7fb0ff', label: 'BLUE' },
};
const team = (t) => TEAM[t === 'blue' ? 'blue' : 'red'];

function flagTexture(t) {
  const W = 512, H = 320, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, t.main); gr.addColorStop(1, t.dark);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // woven cloth grain
  for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + 0.04 * ((y / 2) % 2)})`; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 3) { g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(x, 0, 1, H); }
  // border + hoist band
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, H - 28);
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(0, 0, 26, H);
  // emblem: shield with a pitchfork (red) / star (blue)
  g.save(); g.translate(W * 0.54, H * 0.5);
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.moveTo(-70, -92); g.lineTo(70, -92); g.lineTo(70, 10); g.quadraticCurveTo(70, 70, 0, 100); g.quadraticCurveTo(-70, 70, -70, 10); g.closePath(); g.fill();
  g.fillStyle = t.dark; g.strokeStyle = t.dark; g.lineWidth = 11; g.lineCap = 'round';
  if (t.label === 'RED') {
    g.beginPath(); g.moveTo(0, 78); g.lineTo(0, -40); g.stroke();
    g.beginPath(); g.moveTo(-34, -70); g.lineTo(-34, -30); g.quadraticCurveTo(-34, -8, 0, -8); g.quadraticCurveTo(34, -8, 34, -30); g.lineTo(34, -70); g.stroke();
    g.beginPath(); g.moveTo(0, -40); g.lineTo(0, -76); g.stroke();
  } else {
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 26 : 62; g.lineTo(Math.cos(a) * r, Math.sin(a) * r - 4); } g.closePath(); g.fill();
  }
  g.restore();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export function createFlag({ team: tm = 'red' } = {}) {
  const t = team(tm);
  const root = new THREE.Group(); root.name = 'ctf-flag-' + t.label.toLowerCase();
  const inner = new THREE.Group(); root.add(inner);
  const disposables = [];
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.9, roughness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 1.0, roughness: 0.25 });
  const POLE_H = 2.75, FW = 1.25, FH = 0.78;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, POLE_H, 10), metal); pole.position.y = POLE_H / 2; pole.castShadow = true;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), gold); finial.position.y = POLE_H + 0.04;
  const spear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 10), gold); spear.position.y = POLE_H + 0.16;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10), gold); collar.position.y = POLE_H - FH - 0.08;
  inner.add(pole, finial, spear, collar);
  disposables.push(pole.geometry, finial.geometry, spear.geometry, collar.geometry, metal, gold);

  // cloth: plane hanging from the pole (local +x away from the pole); the wave is done in the vertex shader
  const geo = new THREE.PlaneGeometry(FW, FH, 26, 14); geo.translate(FW / 2, 0, 0);
  const tex = flagTexture(t);
  const uniforms = { uTime: { value: Math.random() * 10 }, uWind: { value: 1.0 }, uW: { value: FW } };
  const cloth = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.82, metalness: 0.0, emissive: new THREE.Color(t.color), emissiveIntensity: 0.12 });
  const wave = `
  float fx = position.x / uW;                               // 0 at the hoist, 1 at the fly end
  float amp = fx * (0.35 + 0.65 * fx);
  float ph = uTime * 5.2 * uWind;
  float w1 = sin(position.x * 7.5 - ph + position.y * 2.2), w2 = sin(position.x * 13.0 - ph * 1.7 + position.y * 5.0 + 1.3);
  float w3 = sin(position.x * 3.2 - ph * 0.6);
  vec3 fp = position;
  fp.z += (w1 * 0.085 + w2 * 0.03 + w3 * 0.06) * amp * (0.55 + 0.45 * uWind);
  fp.y += (-0.10 * fx * fx * (1.25 - 0.6 * uWind)) + cos(position.x * 7.5 - ph) * 0.018 * amp;
  fp.x -= 0.05 * fx * abs(w1) * amp;`;
  const patch = (sh, depthOnly) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; uniform float uW;')
      .replace('#include <begin_vertex>', wave + '\n  vec3 transformed = fp;');
    if (!depthOnly) {
      sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `
  float fxn = position.x / uW; float ampn = fxn * (0.35 + 0.65 * fxn); float phn = uTime * 5.2 * uWind;
  float dzdx = (cos(position.x * 7.5 - phn + position.y * 2.2) * 7.5 * 0.085 + cos(position.x * 13.0 - phn * 1.7 + position.y * 5.0 + 1.3) * 13.0 * 0.03 + cos(position.x * 3.2 - phn * 0.6) * 3.2 * 0.06) * ampn * (0.55 + 0.45 * uWind);
  float dzdy = (cos(position.x * 7.5 - phn + position.y * 2.2) * 2.2 * 0.085 + cos(position.x * 13.0 - phn * 1.7 + position.y * 5.0 + 1.3) * 5.0 * 0.03) * ampn;
  vec3 objectNormal = normalize(vec3(-dzdx, -dzdy, 1.0));`);
    }
  };
  cloth.onBeforeCompile = (sh) => patch(sh, false);
  const flag = new THREE.Mesh(geo, cloth); flag.position.set(0.02, POLE_H - FH / 2 - 0.05, 0); flag.castShadow = true; flag.frustumCulled = false;
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); depthMat.onBeforeCompile = (sh) => patch(sh, true);
  flag.customDepthMaterial = depthMat;
  inner.add(flag);
  disposables.push(geo, tex, cloth, depthMat);

  let carried = false;
  return {
    object3D: root,
    // When carried, gameplay parents object3D to the carrier's character object3D (origin at feet, facing -z) and calls
    // setCarried(true): the pole is slung diagonally across the back like a guidon, the flag streaming behind.
    setCarried(v) {
      carried = !!v;
      if (carried) { inner.position.set(0.16, 0.62, 0.2); inner.rotation.set(0.42, -Math.PI / 2, 0.0, 'YXZ'); inner.scale.setScalar(0.62); }
      else { inner.position.set(0, 0, 0); inner.rotation.set(0, 0, 0); inner.scale.setScalar(1); }
      uniforms.uWind.value = carried ? 1.5 : 1.0;
    },
    update(dt) { uniforms.uTime.value += dt; },
    dispose() { for (const d of disposables) d.dispose(); root.removeFromParent(); },
  };
}

// Base stand drawn where a team's flag lives: weighted foot + socket, team platform, ground ring, locator beam.
export function createFlagBase({ team: tm = 'red' } = {}) {
  const t = team(tm); const col = new THREE.Color(t.color);
  const root = new THREE.Group(); root.name = 'ctf-base-' + t.label.toLowerCase();
  const disposables = [];
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); root.add(m); disposables.push(geo); return m; };
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6, metalness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.4, metalness: 0.85 });
  const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.1, emissive: col, emissiveIntensity: 0.18 });
  disposables.push(dark, steel, paint);
  // octagonal platform with a coloured deck and chevrons
  const plat = add(new THREE.CylinderGeometry(1.25, 1.4, 0.14, 8), dark, 0, 0.07, 0); plat.castShadow = true; plat.receiveShadow = true;
  add(new THREE.CylinderGeometry(1.16, 1.16, 0.02, 8), paint, 0, 0.15, 0).receiveShadow = true;
  add(new THREE.CylinderGeometry(0.72, 0.72, 0.022, 24), dark, 0, 0.152, 0);
  // weighted foot + socket for the pole
  add(new THREE.CylinderGeometry(0.34, 0.42, 0.14, 20), steel, 0, 0.23, 0).castShadow = true;
  add(new THREE.CylinderGeometry(0.06, 0.09, 0.32, 12), steel, 0, 0.42, 0).castShadow = true;
  // four low corner posts with team caps (readable from a distance, small cover hint)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, x = Math.cos(a) * 1.12, z = Math.sin(a) * 1.12;
    add(new THREE.CylinderGeometry(0.045, 0.055, 0.85, 8), dark, x, 0.56, z).castShadow = true;
    add(new THREE.SphereGeometry(0.075, 10, 8), paint, x, 1.0, z);
  }
  // pulsing ground ring
  const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  const ring = add(new THREE.RingGeometry(2.05, 2.35, 64).rotateX(-Math.PI / 2), ringMat, 0, 0.05, 0);
  const ring2 = add(new THREE.RingGeometry(2.6, 2.68, 64).rotateX(-Math.PI / 2), ringMat, 0, 0.05, 0);
  // soft vertical beam (gradient alpha) so the base can be found from across the campus
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col }, uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.8) * (0.075 + 0.025 * sin(uTime * 2.0 + vUv.y * 9.0)); gl_FragColor = vec4(uColor * 1.4, a); }',
  });
  const beam = add(new THREE.CylinderGeometry(0.22, 0.5, 30, 20, 1, true), beamMat, 0, 15.2, 0); beam.renderOrder = 5;
  disposables.push(ringMat, beamMat);
  let time = 0;
  return {
    object3D: root,
    update(dt) {
      time += dt; beamMat.uniforms.uTime.value = time;
      const p = 0.5 + 0.5 * Math.sin(time * 2.4);
      ringMat.opacity = 0.45 + 0.4 * p; ring.scale.setScalar(1 + 0.04 * p); ring2.scale.setScalar(1 + 0.1 * ((time * 0.5) % 1));
    },
    dispose() { for (const d of disposables) d.dispose(); root.removeFromParent(); },
  };
}
