// Care package: air-dropped military hard case (stencilled, strapped, blinking beacon) under a round cargo parachute.
// Origin at the bottom centre of the crate (~1.2 x 0.9 x 0.9 m). Gameplay moves object3D while it descends.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

const W = 1.2, D = 0.9, HB = 0.6, HL = 0.3;           // width (x), depth (z), body height, lid height
const TEAM = { red: 0xd23a2e, blue: 0x2f6fd6, a: 0xd23a2e, b: 0x2f6fd6, 0: 0xd23a2e, 1: 0x2f6fd6 };
const _v = new THREE.Vector3();
const sat = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => { const t = sat((p - a) / (b - a)); return t * t * (3 - 2 * t); };

function stencilTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(232,226,200,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 74px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  g.fillText('SUPPLY DROP', 256, 78, 470);
  g.font = '700 38px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  g.fillText('HC-55 · LOT 0417 · 180 KG', 256, 150, 470);
  g.fillText('▲ THIS SIDE UP ▲', 256, 206, 470);
  // break the paint up like a sprayed stencil
  g.globalCompositeOperation = 'destination-out';
  const r = T.rng(88);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.6})`; g.fillRect(r() * 512, r() * 256, 1 + r() * 5, 1 + r() * 2); }
  for (const x of [118, 200, 290, 372]) { g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x, 38, 4, 82); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

let res = null;
function resources() {
  if (res) return res;
  const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const box = (w, h, d, x, y, z, r = 0) => { const g = r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const merge = (list) => mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k); return n; }), false);
  // --- body shell with moulded ribs
  const shell = [box(W, HB, D, 0, HB / 2, 0, 0.035)];
  for (const x of [-0.42, -0.14, 0.14, 0.42]) shell.push(box(0.07, HB - 0.08, D + 0.03, x, HB / 2, 0, 0.012));
  shell.push(box(W + 0.03, 0.05, D + 0.03, 0, HB - 0.03, 0, 0.012));          // rim
  const lid = [box(W, HL, D, 0, HL / 2, D / 2, 0.035)];                        // lid geometry is hinge-relative (hinge at back edge)
  for (const x of [-0.42, -0.14, 0.14, 0.42]) lid.push(box(0.07, HL - 0.04, D + 0.03, x, HL / 2, D / 2, 0.012));
  lid.push(box(W + 0.03, 0.05, D + 0.03, 0, 0.03, D / 2, 0.012));
  // --- dark rubber corner bumpers + skids
  const dark = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) dark.push(box(0.15, 0.15, 0.15, sx * (W / 2 - 0.06), 0.07, sz * (D / 2 - 0.06), 0.03));
  for (const sx of [-1, 1]) dark.push(box(0.1, 0.05, D * 0.92, sx * 0.36, 0.0, 0, 0.012));
  const lidDark = [];
  for (const sx of [-1, 1]) for (const sz of [0, 1]) lidDark.push(box(0.15, 0.15, 0.15, sx * (W / 2 - 0.06), HL - 0.07, sz * (D - 0.12) + 0.06, 0.03));
  // --- steel latches (front), hinges (back), handles (ends), lashing rings
  const metal = [];
  for (const x of [-0.36, 0.36]) { metal.push(box(0.09, 0.13, 0.016, x, HB - 0.07, D / 2 + 0.018, 0.004)); metal.push(box(0.06, 0.02, 0.03, x, HB - 0.02, D / 2 + 0.022, 0.004)); }
  for (const x of [-0.4, 0, 0.4]) { const h = new THREE.CylinderGeometry(0.014, 0.014, 0.12, 10); h.rotateZ(Math.PI / 2); h.translate(x, HB + 0.003, -D / 2 - 0.012); metal.push(h); }
  for (const sx of [-1, 1]) {
    metal.push(box(0.016, 0.03, 0.24, sx * (W / 2 + 0.03), HB * 0.62, 0, 0.006));
    for (const z of [-0.11, 0.11]) metal.push(box(0.04, 0.03, 0.02, sx * (W / 2 + 0.015), HB * 0.62, z, 0.004));
  }
  // --- cargo straps (two around the short way) with ratchet buckles
  const strap = [], buckles = [];
  for (const x of [-0.27, 0.27]) {
    strap.push(box(0.065, 0.006, D + 0.07, x, 0.012, 0), box(0.065, HB + HL + 0.012, 0.006, x, (HB + HL) / 2, D / 2 + 0.033), box(0.065, HB + HL + 0.012, 0.006, x, (HB + HL) / 2, -D / 2 - 0.033));
    buckles.push(box(0.085, 0.07, 0.03, x, HB * 0.5, D / 2 + 0.045, 0.006));
  }
  const lidStrap = [];
  for (const x of [-0.27, 0.27]) lidStrap.push(box(0.065, 0.006, D + 0.07, x, HL + 0.012, D / 2));
  // --- interior tray + contents (visible when the lid opens)
  const inner = [box(W - 0.09, 0.02, D - 0.09, 0, HB - 0.06, 0)];
  const loot = [box(0.3, 0.16, 0.2, -0.33, HB - 0.02, 0.12, 0.012), box(0.3, 0.16, 0.2, -0.33, HB - 0.02, -0.14, 0.012), box(0.26, 0.12, 0.5, 0.36, HB - 0.03, 0, 0.012)];
  const brass = [];
  for (let i = 0; i < 9; i++) { const c = new THREE.CylinderGeometry(0.011, 0.011, 0.11, 8); c.rotateZ(Math.PI / 2); c.translate(0.02 + (i % 3) * 0.004, HB - 0.03 + Math.floor(i / 3) * 0.024, -0.2 + (i % 3) * 0.2 + Math.floor(i / 3) * 0.01); brass.push(c); }
  // --- parachute canopy: scalloped dome with a vent, alternating gore colours
  const GORES = 16, RC = 2.7, rings = 9, cp = [], cc = [], ci = [], rim = [];
  for (let j = 0; j <= rings; j++) {
    const t = 0.1 + (j / rings) * 0.9, ang = t * 1.32;                       // polar angle from the apex
    for (let i = 0; i <= GORES * 2; i++) {
      const a = (i / (GORES * 2)) * Math.PI * 2, seam = i % 2 === 0;
      const puff = 1 + (seam ? -0.045 : 0.03) * Math.sin(t * Math.PI * 0.5 + 0.2) * (0.3 + t);
      const rr = Math.sin(ang) * RC * puff, yy = Math.cos(ang) * RC * 0.72 * puff - (seam && j === rings ? -0.06 : 0.0);
      cp.push(Math.cos(a) * rr, yy - Math.cos(1.32) * RC * 0.72, Math.sin(a) * rr);
      const gore = Math.floor(((i + 1) % (GORES * 2)) / 2) % 2;
      const col = gore ? [0.62, 0.64, 0.5] : [0.3, 0.33, 0.2];
      cc.push(col[0], col[1], col[2]);
      if (j === rings && seam && i < GORES * 2) rim.push(new THREE.Vector3(Math.cos(a) * rr, yy - Math.cos(1.32) * RC * 0.72, Math.sin(a) * rr));
    }
  }
  const cols = GORES * 2 + 1;
  for (let j = 0; j < rings; j++) for (let i = 0; i < GORES * 2; i++) { const a = j * cols + i, b = a + 1, c2 = a + cols, d = c2 + 1; ci.push(a, c2, b, b, c2, d); }
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); canopy.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); canopy.setIndex(ci);
  canopy.computeVertexNormals();
  const fab = rep(T.fabricNormal(), 40, 40), wearR = rep(T.wearRoughness(), 1.5, 1.5), wearA = rep(T.wearAlbedo(), 1.2, 1.2), pn = rep(T.polymerNormal(), 6, 6);
  res = {
    shell: merge(shell), lid: merge(lid), dark: merge(dark), lidDark: merge(lidDark), metal: merge(metal), strap: merge(strap), lidStrap: merge(lidStrap),
    buckles: merge(buckles), inner: merge(inner), loot: merge(loot), brass: merge(brass), canopy, rim,
    stencilGeo: new THREE.PlaneGeometry(0.62, 0.31), beaconGeo: new THREE.CylinderGeometry(0.035, 0.045, 0.05, 14), lensGeo: new THREE.SphereGeometry(0.034, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    glowGeo: new THREE.PlaneGeometry(1, 1), panelGeo: new THREE.PlaneGeometry(0.2, 0.2),
    mCase: new THREE.MeshStandardMaterial({ color: 0x55603a, roughness: 0.66, metalness: 0, map: wearA, roughnessMap: wearR, normalMap: pn, normalScale: new THREE.Vector2(0.5, 0.5) }),
    mDark: new THREE.MeshStandardMaterial({ color: 0x141513, roughness: 0.9 }),
    mMetal: new THREE.MeshStandardMaterial({ color: 0x8a8d8f, roughness: 0.38, metalness: 0.95, roughnessMap: wearR }),
    mStrap: new THREE.MeshStandardMaterial({ color: 0xa8873a, roughness: 0.9, normalMap: rep(T.fabricNormal(), 3, 30), normalScale: new THREE.Vector2(1, 1) }),
    mInner: new THREE.MeshStandardMaterial({ color: 0x1b1c18, roughness: 0.95 }),
    mLoot: new THREE.MeshStandardMaterial({ color: 0x3a4226, roughness: 0.6, metalness: 0.4, roughnessMap: wearR }),
    mBrass: new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.9 }),
    mStencil: new THREE.MeshStandardMaterial({ map: stencilTexture(), transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    mCanopy: new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, normalMap: fab, normalScale: new THREE.Vector2(0.4, 0.4) }),
    mLine: new THREE.LineBasicMaterial({ color: 0xcfc9b4, transparent: true, opacity: 0.9 }),
    glowTex: T.puffTex(),
  };
  return res;
}

export function createCarePackage({ team = null } = {}) {
  const r = resources();
  const root = new THREE.Group(); root.name = 'carePackage';
  const teamColor = typeof team === 'number' && team > 1 ? team : TEAM[team] ?? 0xe0b030;
  const mk = (g, m, parent) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const crate = new THREE.Group(); root.add(crate);
  mk(r.shell, r.mCase, crate); mk(r.dark, r.mDark, crate); mk(r.metal, r.mMetal, crate); mk(r.strap, r.mStrap, crate); mk(r.buckles, r.mMetal, crate);
  const inner = new THREE.Group(); inner.visible = false; crate.add(inner);
  mk(r.inner, r.mInner, inner); mk(r.loot, r.mLoot, inner); mk(r.brass, r.mBrass, inner);
  // lid on a hinge along the back top edge
  const lid = new THREE.Group(); lid.position.set(0, HB, -D / 2); crate.add(lid);
  mk(r.lid, r.mCase, lid); mk(r.lidDark, r.mDark, lid);
  const lidStrap = mk(r.lidStrap, r.mStrap, lid);
  // stencils (front, back) + team panels (ends, lid)
  for (const s of [1, -1]) { const st = new THREE.Mesh(r.stencilGeo, r.mStencil); st.position.set(0, HB * 0.47, s * (D / 2 + 0.0165)); st.rotation.y = s > 0 ? 0 : Math.PI; crate.add(st); }
  const mTeam = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.6, emissive: teamColor, emissiveIntensity: 0.25 });
  for (const s of [1, -1]) { const pnl = new THREE.Mesh(r.panelGeo, mTeam); pnl.position.set(s * (W / 2 + 0.004), HB * 0.3, 0); pnl.rotation.y = s * Math.PI / 2; crate.add(pnl); }
  const top = new THREE.Mesh(r.panelGeo, mTeam); top.scale.set(1.6, 1.6, 1); top.rotation.x = -Math.PI / 2; top.position.set(0, HL + 0.004, D / 2); lid.add(top);
  // beacon
  const beacon = new THREE.Group(); beacon.position.set(W / 2 - 0.16, HL, D - 0.14); lid.add(beacon);
  mk(r.beaconGeo, r.mDark, beacon).position.y = 0.025;
  const mLens = new THREE.MeshStandardMaterial({ color: 0x551008, emissive: teamColor, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.92 });
  const lens = new THREE.Mesh(r.lensGeo, mLens); lens.position.y = 0.05; beacon.add(lens);
  const mGlow = new THREE.SpriteMaterial({ map: r.glowTex, color: new THREE.Color(teamColor).multiplyScalar(3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const glow = new THREE.Sprite(mGlow); glow.position.y = 0.07; glow.scale.setScalar(0.5); beacon.add(glow);
  // opening glow
  const mOpen = new THREE.SpriteMaterial({ map: r.glowTex, color: new THREE.Color(3, 2.4, 1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const openGlow = new THREE.Sprite(mOpen); openGlow.position.set(0, HB + 0.1, 0); openGlow.scale.setScalar(1.6); crate.add(openGlow);

  // --- parachute: canopy, 16 suspension lines to a confluence point, 4 risers to the crate corners
  const chute = new THREE.Group(); root.add(chute);
  const CH = 5.2;                                                             // canopy skirt height above the crate bottom
  const canopy = new THREE.Mesh(r.canopy, r.mCanopy); canopy.position.y = CH; canopy.castShadow = true; chute.add(canopy);
  const conf = new THREE.Vector3(0, HB + HL + 1.25, 0), lp = [];
  for (const p of r.rim) lp.push(p.x, p.y + CH, p.z, conf.x, conf.y, conf.z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lp.push(conf.x, conf.y, conf.z, sx * (W / 2 - 0.05), HB + HL, sz * (D / 2 - 0.05));
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lineGeo, r.mLine); lines.frustumCulled = false; chute.add(lines);
  const linePos = lineGeo.attributes.position, rimBase = r.rim.map((p) => p.clone());

  let time = Math.random() * 10, chuteOn = true, collapse = 0, opened = false, openT = 0, lidAngle = 0, lidVel = 0;
  const driftDir = Math.random() * Math.PI * 2;

  return {
    object3D: root,
    setParachute(on) { on = !!on; if (on === chuteOn) return; chuteOn = on; if (on) { collapse = 0; chute.visible = true; } },
    open() { if (opened) return; opened = true; openT = 0; inner.visible = true; lidVel = 9; },
    get isOpen() { return opened; },
    update(dt) {
      dt = Math.min(dt, 0.1); time += dt;
      // beacon: double blink every 1.2 s
      const ph = time % 1.2, on = ph < 0.08 || (ph > 0.2 && ph < 0.28) ? 1 : 0;
      mLens.emissiveIntensity = on * 4 + 0.15; mGlow.opacity = on * 0.9;
      // parachute
      if (chute.visible) {
        if (!chuteOn) collapse = Math.min(1.5, collapse + dt / 1.6);
        const c = Math.min(1, collapse), gone = sat((collapse - 1) / 0.5), keep = 1 - gone * gone, e = c * c * (3 - 2 * c);
        const breathe = 1 + Math.sin(time * 2.1) * 0.018 * (1 - e);
        // deflate: the skirt folds in, the canopy sinks, tips over and drapes off to one side
        canopy.scale.set(breathe * (1 - e * 0.45) * keep, (1 - e * 0.86) / breathe * keep, breathe * (1 - e * 0.45) * keep);
        canopy.position.set(Math.cos(driftDir) * e * 2.2, CH * (1 - e) + e * 0.25, Math.sin(driftDir) * e * 2.2);
        canopy.rotation.set(Math.sin(time * 0.9) * 0.05 * (1 - e) + Math.sin(driftDir) * e * 0.5, time * 0.12, Math.cos(time * 0.7) * 0.05 * (1 - e) - Math.cos(driftDir) * e * 0.5);
        canopy.updateMatrix();
        for (let i = 0; i < rimBase.length; i++) { _v.copy(rimBase[i]).applyMatrix4(canopy.matrix); linePos.setXYZ(i * 2, _v.x, _v.y, _v.z); }
        linePos.needsUpdate = true;
        r.mLine.opacity = 0.9;
        lines.visible = c < 0.75;
        if (collapse >= 1.5) chute.visible = false;                            // drapes beside the crate, then is gone
      }
      // lid: sprung open with a damped bounce, straps fall away, warm glow from inside
      if (opened) {
        openT += dt;
        const target = 1.95;
        lidVel += ((target - lidAngle) * 60 - lidVel * 7) * dt; lidAngle += lidVel * dt;
        if (lidAngle > 2.25) { lidAngle = 2.25; lidVel *= -0.3; }
        lid.rotation.x = -Math.max(0, lidAngle);
        lidStrap.visible = false;
        mOpen.opacity = seg(openT, 0, 0.15) * (1 - seg(openT, 0.3, 1.4)) * 0.8 + 0.12 * seg(openT, 0, 0.3);
      }
    },
    dispose() { root.removeFromParent(); lineGeo.dispose(); mTeam.dispose(); mLens.dispose(); mGlow.dispose(); mOpen.dispose(); },
  };
}
