// Explosion renderer used by effects.explosion(): one pooled instanced-billboard system with a procedural shader.
//   kind 0  volumetric puff: noise-eroded billboard whose colour follows a temperature ramp
//           (white core -> yellow -> orange -> deep red -> black soot) and which cools into drifting smoke
//   kind 1  spark streak (stretched along its velocity)        kind 2  chunky debris clod
//   kind 3  shockwave ring (camera facing)                     kind 4  flash glow
//   kind 5  ground-hugging dust ring (horizontal quad)
// Puffs fade out as they approach the ground plane of the blast (no hard clipping against the terrain).
import * as THREE from 'three';

const N = 1024, MAX_COLUMNS = 8;
const rand = (a, b) => a + Math.random() * (b - a);

const VERT = /* glsl */`
  attribute vec3 iPos; attribute vec4 iA; attribute vec4 iCol; attribute vec4 iB;
  varying vec2 vUv; varying vec4 vA; varying vec4 vCol; varying vec4 vB; varying float vY;
  void main() {
    vUv = position.xy * 2.0; vA = iA; vCol = iCol; vB = iB;
    float size = iA.x, kind = iA.y;
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    vec2 off = vec2(0.0);
    vY = iPos.y;
    if (kind > 4.5) {                                   // flat on the ground
      mv = viewMatrix * vec4(iPos + vec3(position.x, 0.0, position.y) * size, 1.0);
    } else if (kind > 0.5 && kind < 1.5) {              // streak along the projected velocity
      vec3 vv = (viewMatrix * vec4(iB.xyz, 0.0)).xyz;
      vec2 dir = normalize(vv.xy + vec2(1e-4, 0.0));
      float len = clamp(length(vv) * 0.045, size, 1.6);
      off = dir * position.x * len + vec2(-dir.y, dir.x) * position.y * size;
    } else {
      float c = cos(iB.y), s = sin(iB.y);
      off = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * size;
      vY = iPos.y + off.y * viewMatrix[1][1];
    }
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */`
  uniform float uLight;
  varying vec2 vUv; varying vec4 vA; varying vec4 vCol; varying vec4 vB; varying float vY;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03 + 7.1) * 0.3 + vnoise(p * 4.1 + 3.7) * 0.2; }
  vec3 ramp(float T) {
    vec3 c = mix(vec3(0.0), vec3(0.55, 0.035, 0.0), smoothstep(0.1, 0.32, T));
    c = mix(c, vec3(1.0, 0.3, 0.02), smoothstep(0.28, 0.62, T));
    c = mix(c, vec3(1.0, 0.68, 0.14), smoothstep(0.6, 1.1, T));
    return mix(c, vec3(1.0, 0.96, 0.82), smoothstep(1.25, 1.9, T));
  }
  void main() {
    float size = vA.x, kind = vA.y, age = vA.z, seed = vA.w;
    float r = length(vUv);
    vec3 col = vec3(0.0); float alpha = 0.0, add = 0.0;
    if (kind < 0.5) {
      // billowing puff: two noise layers scrolling outward/upward, eroding with age
      vec2 p = vUv * 1.35 + seed * vec2(37.0, 17.0);
      float n = fbm(p + vec2(0.0, -age * 0.9));
      float n2 = fbm(p * 2.3 + vec2(age * 0.5, seed * 9.0));
      float shape = 1.0 - r;
      float dens = smoothstep(0.02, 0.5, shape + (n - 0.5) * 0.95 + (n2 - 0.5) * 0.3 - age * 0.22);
      float heat = vB.x;
      float T = heat * (shape * 1.45 + (n - 0.42) * 1.1);          // hot core, cooler ragged edges -> sooty rim
      float hot = smoothstep(0.1, 0.4, T);
      vec3 fire = ramp(T) * (1.0 + 2.2 * smoothstep(0.55, 1.7, T));
      float shade = (0.62 + 0.55 * n) * (0.8 + 0.3 * vUv.y) * (0.55 + 0.45 * smoothstep(0.0, 0.6, shape));
      vec3 soot = vCol.rgb * shade * uLight * 1.6;
      col = mix(soot, fire, hot);
      float ground = smoothstep(0.0, size * 0.3, vY - vB.w);        // soft fade at the ground plane
      alpha = dens * ground * max(vCol.a, hot * min(1.0, heat * 2.0) * 0.95);
    } else if (kind < 1.5) {
      float w = 1.0 - abs(vUv.y), l = vUv.x * 0.5 + 0.5;            // l = 0 tail .. 1 head
      float a = pow(w, 2.0) * smoothstep(0.0, 0.75, l) * (1.0 - smoothstep(0.9, 1.0, l));
      col = mix(vec3(1.0, 0.3, 0.03), vec3(1.0, 0.8, 0.4), pow(w, 4.0) * l) * 2.4;
      alpha = a * vCol.a; add = 1.0;
    } else if (kind < 2.5) {
      float c = cos(vB.y), s = sin(vB.y);
      vec2 q = vec2(vUv.x * c - vUv.y * s, vUv.x * s + vUv.y * c);
      float n = fbm(q * 1.7 + seed * 53.0);
      float d = (1.0 - length(q * vec2(1.0, 1.35))) + (n - 0.5) * 0.8;
      alpha = smoothstep(0.3, 0.38, d) * vCol.a;
      col = vCol.rgb * (0.45 + 0.9 * n) * (0.75 + 0.35 * vUv.y) * uLight * 1.5;
    } else if (kind < 3.5) {
      float band = exp(-pow((r - 0.9) / 0.035, 2.0));
      float inner = smoothstep(0.3, 0.9, r) * step(r, 0.9) * 0.12;
      alpha = (band + inner) * vCol.a;
      col = vec3(1.0, 0.97, 0.9) * 1.2; add = 0.6;
    } else if (kind < 4.5) {
      float g = pow(max(0.0, 1.0 - r), 2.2);
      col = vec3(1.0, 0.86, 0.6) * 7.0; alpha = g * vCol.a; add = 1.0;
    } else {
      float n = fbm(vUv * 3.0 + seed * 21.0 + vec2(age, 0.0));
      float band = smoothstep(0.35, 0.78, r) * (1.0 - smoothstep(0.8, 1.0, r));
      alpha = band * smoothstep(0.25, 0.7, n + 0.25) * vCol.a;
      col = vCol.rgb * (0.7 + 0.5 * n) * uLight * 1.5;
    }
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha * (1.0 - add));
  }`;

export function createBlast(parent) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
  const iPos = new Float32Array(N * 3), iA = new Float32Array(N * 4), iCol = new Float32Array(N * 4), iB = new Float32Array(N * 4);
  const attrs = [['iPos', iPos, 3], ['iA', iA, 4], ['iCol', iCol, 4], ['iB', iB, 4]].map(([n, a, s]) => {
    const at = new THREE.InstancedBufferAttribute(a, s); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, at); return at;
  });
  geo.instanceCount = N;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLight: { value: 0.62 } }, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.visible = false;
  parent.add(mesh);

  // simulation state
  const vel = new Float32Array(N * 3), life = new Float32Array(N), maxLife = new Float32Array(N), drag = new Float32Array(N), grav = new Float32Array(N);
  const growth = new Float32Array(N), heat0 = new Float32Array(N), tau = new Float32Array(N), alpha0 = new Float32Array(N), rotVel = new Float32Array(N);
  const c0 = new Float32Array(N * 3), c1 = new Float32Array(N * 3), wind = new Float32Array(N);
  let next = 0, live = 0;
  const WX = 0.75, WZ = 0.3;                                         // gentle prevailing wind (m/s)

  function spawn(kind, x, y, z, vx, vy, vz, size, grow, ttl, a, ground) {
    const i = next; next = (next + 1) % N;
    iPos[i * 3] = x; iPos[i * 3 + 1] = y; iPos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    iA[i * 4] = size; iA[i * 4 + 1] = kind; iA[i * 4 + 2] = 0; iA[i * 4 + 3] = Math.random();
    iB[i * 4] = 0; iB[i * 4 + 1] = rand(0, 6.283); iB[i * 4 + 2] = 0; iB[i * 4 + 3] = ground;
    iCol[i * 4] = iCol[i * 4 + 1] = iCol[i * 4 + 2] = 1; iCol[i * 4 + 3] = a;
    c0[i * 3] = c0[i * 3 + 1] = c0[i * 3 + 2] = 1; c1[i * 3] = c1[i * 3 + 1] = c1[i * 3 + 2] = 1;
    life[i] = maxLife[i] = ttl; growth[i] = grow; alpha0[i] = a; drag[i] = 0; grav[i] = 0; heat0[i] = 0; tau[i] = 0.14; rotVel[i] = 0; wind[i] = 0;
    live = 1; mesh.visible = true;
    return i;
  }
  const setCol = (i, a, b) => { c0[i * 3] = a[0]; c0[i * 3 + 1] = a[1]; c0[i * 3 + 2] = a[2]; c1[i * 3] = b[0]; c1[i * 3 + 1] = b[1]; c1[i * 3 + 2] = b[2]; iCol[i * 4] = a[0]; iCol[i * 4 + 1] = a[1]; iCol[i * 4 + 2] = a[2]; };
  const SOOT = [0.035, 0.03, 0.026], SMOKE = [0.2, 0.18, 0.16];

  // smoke columns fed for a short while after each blast
  const cols = [];
  for (let i = 0; i < MAX_COLUMNS; i++) cols.push({ on: false, t: 0, dur: 0, acc: 0, x: 0, y: 0, z: 0, R: 1 });
  let cNext = 0;
  function columnPuff(c) {
    const R = c.R, k = c.t / c.dur, a = rand(0, 6.283), d = rand(0, R * 0.14);
    const i = spawn(0, c.x + Math.cos(a) * d, c.y + R * rand(0.08, 0.2), c.z + Math.sin(a) * d, Math.cos(a) * rand(0.2, 1.4), rand(2.6, 5.2) * (1 - k * 0.45), Math.sin(a) * rand(0.2, 1.4),
      R * rand(0.14, 0.22), R * rand(0.22, 0.36), rand(3.4, 5.4), rand(0.7, 0.9), c.y);
    drag[i] = 1.0; grav[i] = -0.5; heat0[i] = Math.max(0, 0.75 - k * 1.4); tau[i] = 0.2; rotVel[i] = rand(-0.5, 0.5); wind[i] = 1;
    setCol(i, SOOT, SMOKE);
  }

  return {
    mesh,
    setLightLevel(v) { mat.uniforms.uLight.value = v; },

    // cfg: { dust: [r,g,b], chip: [r,g,b], chip2?, sparks }
    explode(x, y, z, R, cfg) {
      const g = y;
      // 1-2 frame white flash, shockwave ring, ground dust ring
      spawn(4, x, y + R * 0.1, z, 0, 0, 0, R * 1.9, 0, 0.06, 1, g);
      spawn(3, x, y + R * 0.08, z, 0, 0, 0, R * 0.45, R * 16, 0.17, 0.6, g);
      let i = spawn(5, x, y + 0.06, z, 0, 0, 0, R * 0.6, R * 7.5, 1.1, 0.6, g); setCol(i, cfg.dust, cfg.dust);
      // fireball: hot puffs thrown out and up; each cools through the ramp and becomes rolling soot
      for (let k = 0; k < 13; k++) {
        const a = rand(0, 6.283), el = rand(0.15, 1.5), sp = R * rand(0.9, 2.3);
        i = spawn(0, x + rand(-0.15, 0.15), y + R * rand(0.04, 0.12), z + rand(-0.15, 0.15), Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + R * 0.5, Math.sin(a) * Math.cos(el) * sp,
          R * rand(0.14, 0.22), R * rand(0.6, 1.0), rand(2.4, 4.6), rand(0.78, 0.92), g);
        drag[i] = 4.2; grav[i] = -1.6; heat0[i] = rand(2.1, 3.0); tau[i] = rand(0.1, 0.15); rotVel[i] = rand(-1.4, 1.4); wind[i] = 1;
        setCol(i, SOOT, SMOKE);
      }
      // low skirt of surface-coloured dust pushed outward
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * 6.283 + rand(-0.2, 0.2), sp = R * rand(1.0, 1.9);
        i = spawn(0, x + Math.cos(a) * 0.3, y + R * 0.07, z + Math.sin(a) * 0.3, Math.cos(a) * sp, rand(0.3, 1.4), Math.sin(a) * sp, R * rand(0.12, 0.2), R * rand(0.3, 0.5), rand(1.5, 2.6), rand(0.45, 0.62), g);
        drag[i] = 3.2; grav[i] = -0.1; rotVel[i] = rand(-0.6, 0.6); wind[i] = 0.6;
        setCol(i, cfg.dust, cfg.dust);
      }
      // chunky clods that arc out and land with a puff
      for (let k = 0; k < 16; k++) {
        const a = rand(0, 6.283), el = rand(0.5, 1.4), sp = rand(6, 13) * (0.5 + R / 12), c = cfg.chip2 && Math.random() < 0.4 ? cfg.chip2 : cfg.chip;
        i = spawn(2, x, y + 0.2, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp, rand(0.1, 0.3), 0, rand(1.6, 2.6), 1, g);
        drag[i] = 0.25; grav[i] = 9.8; rotVel[i] = rand(-9, 9);
        setCol(i, c, c);
      }
      // sparks / hot fragments as streaks
      const ns = 18 + (cfg.sparks > 0 ? 10 : 0);
      for (let k = 0; k < ns; k++) {
        const a = rand(0, 6.283), el = rand(0.05, 1.45), sp = rand(12, 30);
        i = spawn(1, x, y + 0.25, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp, rand(0.022, 0.04), 0, rand(0.3, 0.8), 1, g);
        drag[i] = 1.5; grav[i] = 9;
      }
      const c = cols[cNext]; cNext = (cNext + 1) % MAX_COLUMNS;
      c.on = true; c.t = 0; c.dur = 0.7; c.acc = 0; c.x = x; c.y = y; c.z = z; c.R = R;
    },

    update(dt) {
      for (const c of cols) {
        if (!c.on) continue;
        c.t += dt; if (c.t >= c.dur) { c.on = false; continue; }
        c.acc += dt * 20; while (c.acc >= 1) { c.acc -= 1; columnPuff(c); }
      }
      if (!live) return;
      let any = 0;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        const i3 = i * 3, i4 = i * 4;
        if (life[i] <= 0) { iA[i4] = 0; iCol[i4 + 3] = 0; continue; }
        any = 1;
        const t = maxLife[i] - life[i], a = t / maxLife[i], kind = iA[i4 + 1], k = Math.max(0, 1 - drag[i] * dt);
        vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k - grav[i] * dt; vel[i3 + 2] *= k;
        const w = wind[i] * Math.min(1, t * 1.2);
        iPos[i3] += (vel[i3] + WX * w) * dt; iPos[i3 + 1] += vel[i3 + 1] * dt; iPos[i3 + 2] += (vel[i3 + 2] + WZ * w) * dt;
        iA[i4 + 2] = a;
        if (kind < 0.5) {
          iA[i4] += (growth[i] * Math.exp(-t * 2.4) + 0.22) * dt;
          iB[i4] = heat0[i] * Math.exp(-t / tau[i]);
          iB[i4 + 1] += rotVel[i] * dt * Math.exp(-t * 0.8);
          const m = Math.min(1, a * 2.2), th = 1 - a;
          iCol[i4] = c0[i3] + (c1[i3] - c0[i3]) * m; iCol[i4 + 1] = c0[i3 + 1] + (c1[i3 + 1] - c0[i3 + 1]) * m; iCol[i4 + 2] = c0[i3 + 2] + (c1[i3 + 2] - c0[i3 + 2]) * m;
          iCol[i4 + 3] = alpha0[i] * Math.min(1, t * 40) * th * Math.sqrt(th);          // thins steadily over its life
        } else if (kind < 1.5) {
          iB[i4] = vel[i3]; iB[i4 + 1] = vel[i3 + 1]; iB[i4 + 2] = vel[i3 + 2];
          iCol[i4 + 3] = Math.min(1, (1 - a) * 2.5);
          if (iPos[i3 + 1] < iB[i4 + 3]) life[i] = 0.0001;
        } else if (kind < 2.5) {
          iB[i4 + 1] += rotVel[i] * dt;
          if (vel[i3 + 1] < 0 && iPos[i3 + 1] < iB[i4 + 3] + 0.05) {
            // landed: small dust puff in the clod's colour
            const j = spawn(0, iPos[i3], iB[i4 + 3] + 0.12, iPos[i3 + 2], vel[i3] * 0.12, 0.5, vel[i3 + 2] * 0.12, 0.25, 0.9, rand(0.6, 1.0), 0.45, iB[i4 + 3]);
            drag[j] = 2.5; setCol(j, [c0[i3] * 1.6, c0[i3 + 1] * 1.6, c0[i3 + 2] * 1.6], [c0[i3] * 1.6, c0[i3 + 1] * 1.6, c0[i3 + 2] * 1.6]);
            life[i] = 0.0001;
          }
        } else if (kind < 3.5) {
          iA[i4] += growth[i] * dt; iCol[i4 + 3] = alpha0[i] * (1 - a) * (1 - a);
        } else if (kind < 4.5) {
          iCol[i4 + 3] = alpha0[i] * (1 - a);
        } else {
          iA[i4] += growth[i] * Math.exp(-t * 3.2) * dt; iCol[i4 + 3] = alpha0[i] * (1 - a) * (1 - a);
        }
      }
      live = any; mesh.visible = !!any;
      for (const at of attrs) at.needsUpdate = true;
    },

    dispose() { mesh.removeFromParent(); geo.dispose(); quad.dispose(); mat.dispose(); },
  };
}
