// World-space combat effects: bullet tracers, surface impacts (particles + bullet-hole decals), blood mist.
// Everything is pooled in fixed-size ring buffers: no allocations and no scene graph changes after creation.
import * as THREE from 'three';
import * as T from './textures.js';

const MAX_PARTICLES = 1536, MAX_DECALS = 192, MAX_TRACERS = 32;
const rand = (a, b) => a + Math.random() * (b - a);

// kind: 0 = soft puff, 1 = hard chip/droplet, 2 = spark (additive)
const SURFACES = {
  concrete: { dust: [0.62, 0.6, 0.56], nDust: 5, chip: [0.7, 0.69, 0.66], nChip: 7, sparks: 1, decal: [0.9, 0.9, 0.88], size: 0.1 },
  brick: { dust: [0.56, 0.36, 0.29], nDust: 5, chip: [0.5, 0.26, 0.2], nChip: 7, sparks: 0, decal: [0.95, 0.8, 0.75], size: 0.1 },
  asphalt: { dust: [0.3, 0.3, 0.3], nDust: 4, chip: [0.16, 0.16, 0.17], nChip: 6, sparks: 1, decal: [0.6, 0.6, 0.6], size: 0.09 },
  metal: { dust: [0.5, 0.5, 0.52], nDust: 1, chip: [0.3, 0.3, 0.32], nChip: 0, sparks: 14, decal: [1.2, 1.2, 1.25], size: 0.06, flash: true },
  grass: { dust: [0.36, 0.3, 0.2], nDust: 2, chip: [0.2, 0.3, 0.1], chip2: [0.25, 0.17, 0.1], nChip: 10, sparks: 0, decal: [0.3, 0.24, 0.16], size: 0.1 },
  dirt: { dust: [0.42, 0.33, 0.23], nDust: 6, chip: [0.28, 0.2, 0.13], nChip: 9, sparks: 0, decal: [0.4, 0.32, 0.22], size: 0.11 },
  wood: { dust: [0.6, 0.5, 0.36], nDust: 2, chip: [0.72, 0.56, 0.36], nChip: 9, sparks: 0, decal: [0.8, 0.65, 0.45], size: 0.075 },
  glass: { dust: [0.85, 0.9, 0.92], nDust: 2, chip: [1.3, 1.4, 1.45], nChip: 10, sparks: 0, decal: [1.5, 1.6, 1.6], size: 0.09 },
  rubber: { dust: [0.15, 0.15, 0.15], nDust: 2, chip: [0.05, 0.05, 0.05], nChip: 5, sparks: 0, decal: [0.3, 0.3, 0.3], size: 0.06 },
};

export function createEffects(scene) {
  const group = new THREE.Group(); group.name = 'effects';
  scene.add(group);

  // ---- particles ----------------------------------------------------------------------------------------------------
  const pos = new Float32Array(MAX_PARTICLES * 3), col = new Float32Array(MAX_PARTICLES * 4), par = new Float32Array(MAX_PARTICLES * 2);
  const vel = new Float32Array(MAX_PARTICLES * 3), life = new Float32Array(MAX_PARTICLES), maxLife = new Float32Array(MAX_PARTICLES);
  const size0 = new Float32Array(MAX_PARTICLES), grow = new Float32Array(MAX_PARTICLES), grav = new Float32Array(MAX_PARTICLES);
  const drag = new Float32Array(MAX_PARTICLES), alpha0 = new Float32Array(MAX_PARTICLES);
  const pGeo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aCol = new THREE.BufferAttribute(col, 4), aPar = new THREE.BufferAttribute(par, 2);
  for (const a of [aPos, aCol, aPar]) a.setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', aPos); pGeo.setAttribute('aColor', aCol); pGeo.setAttribute('aParams', aPar);
  pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 }, uTex: { value: T.puffTex() }, uLight: { value: 0.62 } },
    vertexShader: /* glsl */`
      attribute vec4 aColor; attribute vec2 aParams;   // aParams: size (m), kind
      uniform float uScale; varying vec4 vColor; varying float vKind;
      void main() {
        vColor = aColor; vKind = aParams.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aParams.x > 0.0 ? max(1.0, aParams.x * uScale / max(0.05, -mv.z)) : 0.0;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uLight; varying vec4 vColor; varying float vKind;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
        float a;
        if (vKind < 0.5) a = texture2D(uTex, gl_PointCoord).a;
        else if (vKind < 1.5) a = 1.0 - smoothstep(0.75, 1.0, r);
        else a = pow(max(0.0, 1.0 - r), 1.5);
        a *= vColor.a;
        if (a < 0.004) discard;
        float additive = step(1.5, vKind);
        gl_FragColor = vec4(vColor.rgb * mix(uLight, 1.0, additive), 1.0);   // unlit: approximate scene light level
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - additive));   // premultiply after output encoding
      }`,
    transparent: true, depthWrite: false, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false; points.renderOrder = 8;
  const _size = new THREE.Vector2();
  points.onBeforeRender = (renderer, s, camera) => {
    const rt = renderer.getRenderTarget();
    const h = rt ? rt.height : renderer.getDrawingBufferSize(_size).y;
    pMat.uniforms.uScale.value = h * 0.5 * camera.projectionMatrix.elements[5];
  };
  group.add(points);
  let pNext = 0, pLive = 0;

  function emit(kind, x, y, z, vx, vy, vz, r, g, b, a, size, growth, ttl, gravity, dragK) {
    const i = pNext; pNext = (pNext + 1) % MAX_PARTICLES;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = a;
    par[i * 2] = size; par[i * 2 + 1] = kind;
    size0[i] = size; grow[i] = growth; life[i] = maxLife[i] = ttl; grav[i] = gravity; drag[i] = dragK; alpha0[i] = a;
    pLive = Math.max(pLive, 1);
  }

  // ---- decals -------------------------------------------------------------------------------------------------------
  const dMat = new THREE.MeshStandardMaterial({ map: T.bulletHoleTex(), transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dMat, MAX_DECALS);
  decals.frustumCulled = false; decals.renderOrder = 2; decals.receiveShadow = true;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
  const Z = new THREE.Vector3(0, 0, 1);
  _m.makeScale(0, 0, 0);
  for (let i = 0; i < MAX_DECALS; i++) { decals.setMatrixAt(i, _m); decals.setColorAt(i, _c.setRGB(1, 1, 1)); }
  decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(decals);
  let dNext = 0;

  // ---- tracers ------------------------------------------------------------------------------------------------------
  const tPos = new Float32Array(MAX_TRACERS * 4 * 3), tUv = new Float32Array(MAX_TRACERS * 4 * 2), tIdx = new Uint16Array(MAX_TRACERS * 6);
  for (let i = 0; i < MAX_TRACERS; i++) {
    tUv.set([0, 0, 0, 1, 1, 0, 1, 1], i * 8);
    tIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  const tGeo = new THREE.BufferGeometry();
  const tPosAttr = new THREE.BufferAttribute(tPos, 3); tPosAttr.setUsage(THREE.DynamicDrawUsage);
  tGeo.setAttribute('position', tPosAttr); tGeo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2)); tGeo.setIndex(new THREE.BufferAttribute(tIdx, 1));
  tGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const tMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(4.0, 2.7, 1.1) } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float along = smoothstep(0.0, 0.85, vUv.x) * (1.0 - smoothstep(0.97, 1.0, vUv.x));
        float a = pow(across, 1.6) * along;
        vec3 c = mix(uColor, vec3(5.0, 4.6, 3.8), pow(across, 6.0) * vUv.x);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb *= a;
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const tracers = new THREE.Mesh(tGeo, tMat);
  tracers.frustumCulled = false; tracers.renderOrder = 9;
  group.add(tracers);
  const tr = [];
  for (let i = 0; i < MAX_TRACERS; i++) tr.push({ live: false, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, head: 0, len: 0 });
  let tNext = 0, tLive = 0;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _side = new THREE.Vector3(), _cam = new THREE.Vector3(), _n = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();

  function basis(n) {
    // two tangents orthogonal to n
    _t1.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0).cross(n).normalize();
    _t2.crossVectors(n, _t1);
  }

  return {
    object3D: group,
    // Optional: brightness of dust/debris (they are unlit); ~0.6 for daylight, lower at dusk.
    setLightLevel(v) { pMat.uniforms.uLight.value = v; },

    impact(point, normal, surface) {
      const cfg = SURFACES[surface] || SURFACES.concrete;
      _n.copy(normal).normalize();
      basis(_n);
      const px = point.x + _n.x * 0.02, py = point.y + _n.y * 0.02, pz = point.z + _n.z * 0.02;
      for (let i = 0; i < cfg.nDust; i++) {
        const out = rand(0.5, 2.6), s1 = rand(-0.8, 0.8), s2 = rand(-0.8, 0.8), k = rand(0.85, 1.12);
        emit(0, px, py, pz, _n.x * out + _t1.x * s1 + _t2.x * s2, _n.y * out + _t1.y * s1 + _t2.y * s2 + 0.25, _n.z * out + _t1.z * s1 + _t2.z * s2,
          cfg.dust[0] * k, cfg.dust[1] * k, cfg.dust[2] * k, rand(0.4, 0.68), rand(0.1, 0.2), rand(0.6, 1.3), rand(0.55, 1.25), 0.6, 4.5);
      }
      for (let i = 0; i < cfg.nChip; i++) {
        const out = rand(1.2, 5), s1 = rand(-2, 2), s2 = rand(-2, 2), c = cfg.chip2 && Math.random() < 0.45 ? cfg.chip2 : cfg.chip, k = rand(0.7, 1.15);
        emit(1, px, py, pz, _n.x * out + _t1.x * s1 + _t2.x * s2, _n.y * out + _t1.y * s1 + _t2.y * s2 + 0.8, _n.z * out + _t1.z * s1 + _t2.z * s2,
          c[0] * k, c[1] * k, c[2] * k, 1, rand(0.012, 0.034), 0, rand(0.4, 0.9), 9.8, 0.6);
      }
      for (let i = 0; i < cfg.sparks; i++) {
        const out = rand(2.5, 9), s1 = rand(-4, 4), s2 = rand(-4, 4);
        emit(2, px, py, pz, _n.x * out + _t1.x * s1 + _t2.x * s2, _n.y * out + _t1.y * s1 + _t2.y * s2, _n.z * out + _t1.z * s1 + _t2.z * s2,
          6, rand(2.2, 3.6), rand(0.6, 1.2), 1, rand(0.025, 0.05), -0.06, rand(0.12, 0.38), 7, 1.5);
      }
      if (cfg.flash) emit(2, px, py, pz, 0, 0, 0, 5, 3.6, 2, 1, 0.3, -3, 0.06, 0, 0);
      // bullet hole
      const i = dNext; dNext = (dNext + 1) % MAX_DECALS;
      _q.setFromUnitVectors(Z, _n).multiply(_q2.setFromAxisAngle(Z, Math.random() * Math.PI * 2));
      const sz = cfg.size * rand(0.85, 1.25);
      _m.compose(_p.copy(point).addScaledVector(_n, 0.006), _q, _s.set(sz, sz, 1));
      decals.setMatrixAt(i, _m);
      decals.setColorAt(i, _c.setRGB(cfg.decal[0], cfg.decal[1], cfg.decal[2]));
      decals.instanceMatrix.needsUpdate = true; decals.instanceColor.needsUpdate = true;
    },

    blood(point, dir) {
      _n.copy(dir); if (_n.lengthSq() < 1e-6) _n.set(0, 1, 0); _n.normalize();
      basis(_n);
      for (let i = 0; i < 7; i++) {
        const out = rand(0.3, 2.4) * (i < 2 ? -0.5 : 1), s1 = rand(-0.7, 0.7), s2 = rand(-0.7, 0.7), k = rand(0.7, 1.1);
        emit(0, point.x, point.y, point.z, _n.x * out + _t1.x * s1 + _t2.x * s2, _n.y * out + _t1.y * s1 + _t2.y * s2 + 0.2, _n.z * out + _t1.z * s1 + _t2.z * s2,
          0.36 * k, 0.015, 0.012, rand(0.4, 0.62), rand(0.07, 0.14), rand(0.5, 1.0), rand(0.28, 0.55), 2.5, 5);
      }
      for (let i = 0; i < 8; i++) {
        const out = rand(0.8, 4), s1 = rand(-1.3, 1.3), s2 = rand(-1.3, 1.3);
        emit(1, point.x, point.y, point.z, _n.x * out + _t1.x * s1 + _t2.x * s2, _n.y * out + _t1.y * s1 + _t2.y * s2 + 0.6, _n.z * out + _t1.z * s1 + _t2.z * s2,
          0.3, 0.01, 0.01, 0.9, rand(0.01, 0.022), 0, rand(0.3, 0.6), 9.8, 0.8);
      }
    },

    tracer(from, to) {
      const t = tr[tNext]; tNext = (tNext + 1) % MAX_TRACERS;
      t.from.copy(from); t.dir.subVectors(to, from);
      t.dist = t.dir.length();
      if (t.dist < 1.5) { t.live = false; return; }
      t.dir.multiplyScalar(1 / t.dist);
      t.len = Math.min(9, t.dist * 0.45);
      t.head = Math.min(t.dist, 1.5 + Math.random() * 3);
      t.live = true; tLive = 1;
    },

    update(dt, camera) {
      // particles
      if (pLive) {
        let any = 0;
        for (let i = 0; i < MAX_PARTICLES; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt;
          if (life[i] <= 0) { par[i * 2] = 0; col[i * 4 + 3] = 0; continue; }
          any = 1;
          const k = Math.max(0, 1 - drag[i] * dt), i3 = i * 3;
          vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k - grav[i] * dt; vel[i3 + 2] *= k;
          pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
          const f = life[i] / maxLife[i];
          par[i * 2] = Math.max(0.001, size0[i] + grow[i] * (1 - f) * maxLife[i]);
          col[i * 4 + 3] = alpha0[i] * (par[i * 2 + 1] < 0.5 ? Math.min(1, f * 1.6) * Math.min(1, (1 - f) * 12) : Math.min(1, f * 4));
        }
        pLive = any;
        aPos.needsUpdate = aCol.needsUpdate = aPar.needsUpdate = true;
      }
      // tracers
      if (tLive) {
        let any = 0;
        if (camera) _cam.setFromMatrixPosition(camera.matrixWorld);
        for (let i = 0; i < MAX_TRACERS; i++) {
          const t = tr[i], o = i * 12;
          if (!t.live) { for (let j = 0; j < 12; j++) tPos[o + j] = 0; continue; }
          const tail = Math.max(0, t.head - t.len);
          if (tail >= t.dist) { t.live = false; for (let j = 0; j < 12; j++) tPos[o + j] = 0; continue; }
          any = 1;
          const head = Math.min(t.head, t.dist);
          _a.copy(t.from).addScaledVector(t.dir, tail); _b.copy(t.from).addScaledVector(t.dir, head);
          _side.subVectors(_cam, _b).cross(t.dir);
          if (_side.lengthSq() < 1e-8) _side.set(0, 1, 0);
          const wA = Math.max(0.014, _a.distanceTo(_cam) * 0.0022), wB = Math.max(0.014, _b.distanceTo(_cam) * 0.0022);
          _side.normalize();
          tPos[o] = _a.x - _side.x * wA; tPos[o + 1] = _a.y - _side.y * wA; tPos[o + 2] = _a.z - _side.z * wA;
          tPos[o + 3] = _a.x + _side.x * wA; tPos[o + 4] = _a.y + _side.y * wA; tPos[o + 5] = _a.z + _side.z * wA;
          tPos[o + 6] = _b.x - _side.x * wB; tPos[o + 7] = _b.y - _side.y * wB; tPos[o + 8] = _b.z - _side.z * wB;
          tPos[o + 9] = _b.x + _side.x * wB; tPos[o + 10] = _b.y + _side.y * wB; tPos[o + 11] = _b.z + _side.z * wB;
          t.head += 280 * dt;
        }
        tLive = any;
        tPosAttr.needsUpdate = true;
      }
    },

    dispose() {
      group.removeFromParent();
      pGeo.dispose(); pMat.dispose(); tGeo.dispose(); tMat.dispose(); decals.geometry.dispose(); dMat.dispose(); decals.dispose();
    },
  };
}
