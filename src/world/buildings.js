// Hinsdale Central main building (per-wing heights from gen.json, brick + limestone band + bronze coping,
// ribbon windows, satellite-projected roofs) and the surrounding houses.
import * as THREE from 'three';
import { ensureCCW, signedArea, mulberry32, pointInRing, makeCanvas, canvasTexture } from './util.js';
import { edgeFrame, quadFacing, wallRect, fbox, facade, roofUnit, doorFromKit, BRICK_S } from './facade.js';

const STONE_S = 1 / 3.0;
const SCHOOL_ID = 7822857;
export { edgeFrame };

function orientRing(pts, base, ccw) {
  const isCCW = signedArea(pts) > 0;
  if (isCCW === ccw) return { pts, base };
  const n = pts.length; const rp = pts.slice().reverse(); const rb = [];
  for (let k = 0; k < n; k++) rb.push(base[(2 * n - 2 - k) % n]);
  return { pts: rp, base: rb };
}

// edges whose bays are replaced by hand-built entrances (world-space boxes: minX, minZ, maxX, maxZ)
const PLAIN_ZONES = [[-9, -21, -3, 28]];

function parapetTop(B, F, L, h, roofY, alu) {
  quadFacing(B.v(alu ? 'frameAlu' : 'frame'), F.P(-0.1, h + 0.03, 0.13), F.P(L + 0.1, h + 0.03, 0.13), F.P(L, h + 0.03, -0.32), F.P(0, h + 0.03, -0.32), [0, 1, 0]);
  quadFacing(B.v('concrete'), F.P(0, roofY, -0.32), F.P(L, roofY, -0.32), F.P(L, h + 0.03, -0.32), F.P(0, h + 0.03, -0.32), [-F.nx, 0, -F.nz]);
}

export function buildSchool(ctx) {
  const { B, gen } = ctx; const rnd = mulberry32(42);
  B.v('brick', true);
  const rr = gen.roofs;
  const roofUV = (lean) => (x, z) => [(x + lean[0] - rr.minX) / (rr.maxX - rr.minX), 1 - (z + lean[1] - rr.minZ) / (rr.maxZ - rr.minZ)];
  ctx.schoolRings = [];
  for (const piece of gen.school) {
    const h = piece.h; const roofY = h - 0.4;
    const rings = [orientRing(piece.outer.pts, piece.outer.base, true), ...piece.holes.map((r) => orientRing(r.pts, r.base, false))];
    const alu = ['ss', 'c12', 'addition', 'low7b', 'fieldhouse'].includes(piece.name);
    let unitsLeft = Math.min(9, Math.floor(Math.abs(signedArea(rings[0].pts)) / 420));
    for (const ring of rings) {
      let uOff = 0; const n = ring.pts.length;
      for (let i = 0; i < n; i++) {
        const a = ring.pts[i], b = ring.pts[(i + 1) % n]; const base = ring.base[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (base >= h - 0.5 || L < 0.05) { uOff += L; continue; }
        const F = edgeFrame(a[0], a[1], b[0], b[1]);
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const plain = PLAIN_ZONES.some(([x0, z0, x1, z1]) => mx > x0 && mx < x1 && mz > z0 && mz < z1);
        facade(ctx, F, base > 0 ? Math.max(0, base - 0.4) : 0, h, plain ? 'link' : piece.name, uOff, rnd, { tintFrom: piece.name });
        parapetTop(B, F, L, h, roofY, alu);
        { const pc = F.P(L / 2, (roofY + h + 0.03) / 2, -0.16); B.c('concrete').box(pc[0], pc[1], pc[2], L, h + 0.03 - roofY, 0.32, F.rotY); }
        // mechanical units set back from long exterior edges: visible above the parapet from the ground
        if (base === 0 && L > 20 && unitsLeft > 0 && ring === rings[0]) {
          for (let u = 8 + rnd() * 8; u < L - 6 && unitsLeft > 0; u += 16 + rnd() * 14) {
            const p = F.P(u, 0, -(4.2 + rnd() * 2.5));
            let ok = pointInRing(p[0], p[2], rings[0].pts); for (const hr of rings.slice(1)) if (pointInRing(p[0], p[2], hr.pts)) ok = false;
            const q = F.P(u, 0, -9); if (!pointInRing(q[0], q[2], rings[0].pts)) ok = false;
            if (ok) { roofUnit(ctx, p[0], roofY, p[2], F.rotY, rnd); unitsLeft--; }
          }
        }
        uOff += L;
      }
    }
    B.v('roofSat').poly(rings[0].pts, rings.slice(1).map((r) => r.pts), roofY, roofUV(piece.lean));
    // collision: walls to the roof deck, a walkable roof (with the courtyards cut out) and courtyard walls
    const col = B.c('brick');
    col.prism(rings[0].pts, 0, roofY, 1, false);
    B.c('concrete').poly(rings[0].pts, rings.slice(1).map((r) => r.pts), roofY);
    for (const hr of rings.slice(1)) for (let i = 0; i < hr.pts.length; i++) { const a = hr.pts[i], b = hr.pts[(i + 1) % hr.pts.length]; col.wall(a[0], a[1], b[0], b[1], 0, roofY); }
    ctx.schoolRings.push(rings[0].pts);
    roofFurniture(ctx, rings, roofY, rnd);
  }
  B.v('brick', true).setColor(1, 1, 1);
  schoolFeatures(ctx);
  B.v('brick', true).setColor(1, 1, 1);
}

// Things a player meets when standing on a roof: drains, vent stacks, skylights, hatches, stair penthouses.
function roofFurniture(ctx, rings, roofY, rnd) {
  const { B } = ctx; const pts = rings[0].pts;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
  const area = Math.abs(signedArea(pts));
  const inside = (x, z, r) => {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (!pointInRing(x + dx, z + dz, pts)) return false;
      for (const hr of rings.slice(1)) if (pointInRing(x + dx, z + dz, hr.pts)) return false;
    }
    return true;
  };
  const place = (n, r, fn) => { for (let k = 0, tries = 0; k < n && tries < n * 40; tries++) { const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ); if (!inside(x, z, r)) continue; fn(x, z); k++; } };
  // roof drains with strainer domes
  place(Math.min(14, Math.floor(area / 160)), 2.0, (x, z) => { B.v('blackMetal').cyl(x, roofY, z, 0.2, 0.12, 0.1, 8, 1, true); B.v('groundDecal').quad([x - 0.9, roofY + 0.02, z + 0.9], [x + 0.9, roofY + 0.02, z + 0.9], [x + 0.9, roofY + 0.02, z - 0.9], [x - 0.9, roofY + 0.02, z - 0.9], [0, 0.35], [1, 0.35], [1, 0.9], [0, 0.9]); });
  // plumbing vents and gooseneck exhausts
  place(Math.min(16, Math.floor(area / 120)), 1.2, (x, z) => { if (rnd() < 0.6) B.v('galv').cyl(x, roofY, z, 0.06, 0.06, 0.55, 6, 1, true); else { B.v('galv').cyl(x, roofY, z, 0.16, 0.16, 0.6, 8, 1, false).cyl(x, roofY + 0.6, z, 0.3, 0.26, 0.22, 10, 1, true); B.c('metal').box(x, roofY + 0.4, z, 0.5, 0.8, 0.5); } });
  // skylights (translucent domes on curbs) and roof hatches
  place(Math.min(6, Math.floor(area / 500)), 2.5, (x, z) => { const w = 1.3, d = 2.4, r = rnd() < 0.5 ? 0 : Math.PI / 2; B.v('galv').box(x, roofY + 0.2, z, w + 0.2, 0.4, d + 0.2, r); B.v('frost').box(x, roofY + 0.5, z, w, 0.22, d, r, 1.5); B.c('glass').box(x, roofY + 0.3, z, w + 0.2, 0.62, d + 0.2, r); });
  // stair penthouse on the big wings: solid cover with a door
  if (area > 1500) place(area > 4000 ? 2 : 1, 5.5, (x, z) => {
    const r = rnd() < 0.5 ? 0 : Math.PI / 2; const w = 3.4, d = 5.2, hh = 2.9;
    const br = B.v('brick', true); br.setColor(0.95, 0.9, 0.85); br.box(x, roofY + hh / 2, z, w, hh, d, r, 1 / 2.2); br.setColor(1, 1, 1);
    B.v('frame').box(x, roofY + hh + 0.06, z, w + 0.3, 0.14, d + 0.3, r);
    const c = Math.cos(r), sn = Math.sin(r); B.v('frame').box(x + (d / 2 + 0.02) * sn, roofY + 1.05, z + (d / 2 + 0.02) * c, 1.0, 2.1, 0.05, r);
    B.c('brick').box(x, roofY + hh / 2, z, w, hh, d, r);
  });
}

function emblemTexture() {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#b9bcc0'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#26282b'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e9e9e6'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#26282b'; g.font = '900 210px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('H', S * 0.36, S * 0.40); g.fillText('C', S * 0.64, S * 0.60);
  g.strokeStyle = '#26282b'; g.lineWidth = 12; g.beginPath(); g.moveTo(S * 0.28, S * 0.8); g.lineTo(S * 0.74, S * 0.22); g.stroke();
  for (const d of [-0.07, 0, 0.07]) { g.beginPath(); g.moveTo(S * (0.70 + d), S * (0.27 + d * 0.8)); g.lineTo(S * (0.75 + d * 1.4), S * (0.15 + d * 1.2)); g.stroke(); }
  g.font = '700 30px Arial'; g.fillStyle = '#e9e9e6'; g.fillText('HINSDALE CENTRAL', S / 2, S * 0.955);
  return canvasTexture(c, { repeat: false });
}

function schoolFeatures(ctx) {
  const { B, M, scene } = ctx;
  const brick = B.v('brick', true);
  const decalMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, transparent: false, alphaTest: 0.4, roughness: 0.45, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const addDecal = (tex, F, uC, yC, w, h, out = 0.03) => {
    const g = new THREE.BufferGeometry();
    const p = [F.P(uC - w / 2, yC - h / 2, out), F.P(uC - w / 2, yC + h / 2, out), F.P(uC + w / 2, yC + h / 2, out), F.P(uC + w / 2, yC - h / 2, out)];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]], 3));
    // seen from outside, +u runs right-to-left, so mirror u
    g.setAttribute('uv', new THREE.Float32BufferAttribute([1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0], 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, decalMat(tex)); m.receiveShadow = true; m.name = 'decal'; scene.add(m);
  };
  const brickFront = (F, u0, u1, y0, y1, tint = 1) => { if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return; brick.setColor(tint, tint, tint); wallRect(brick, F, u0, u1, y0, y1, 0, [u0 * BRICK_S, y0 * BRICK_S, u1 * BRICK_S, y1 * BRICK_S]); };

  // --- school name on the north-west block facing 55th St (as on the real building)
  {
    const F = edgeFrame(-11.17, -152.39, -1.25, -152.66);
    const tex = M.textDecal(['HINSDALE', 'TOWNSHIP', 'HIGH SCHOOL', 'CENTRAL'], { w: 1024, h: 768, font: 150, color: '#e9ecee', spacing: '10px' });
    addDecal(tex, F, F.L * 0.5, 6.1, 5.2, 3.9, 0.16);
  }
  // --- 55th St (north) entrances: projecting brick pavilion with a limestone portal and deep storefront doors
  {
    const F = edgeFrame(145.93, -151.5, -1.1, -147.37);      // north wall, CCW order (east -> west)
    for (const uC of [F.L * 0.36, F.L * 0.74]) {
      const W2 = 3.4, dep = 0.85, top = 11.0;
      const pa = F.P(uC - W2, 0, dep), pb = F.P(uC + W2, 0, dep); const F2 = edgeFrame(pa[0], pa[2], pb[0], pb[2]);
      brick.setColor(0.97, 0.95, 0.92);
      fbox(brick, F, uC - W2, uC + W2, 0, top, 0, dep, BRICK_S, 0, 'st');
      // front with the door opening cut out
      brickFront(F2, 0, W2 - 1.1, 0.5, top, 0.97); brickFront(F2, W2 + 1.1, 2 * W2, 0.5, top, 0.97); brickFront(F2, W2 - 1.1, W2 + 1.1, 2.95, top, 0.97);
      fbox(B.v('concrete'), F2, -0.05, W2 - 1.1, 0, 0.5, 0, 0.06, STONE_S, 0, 'fst'); fbox(B.v('concrete'), F2, W2 + 1.1, 2 * W2 + 0.05, 0, 0.5, 0, 0.06, STONE_S, 0, 'fst');
      // limestone surround: jambs, lintel block with the name, coping
      const ls = B.v('limestone');
      fbox(ls, F2, W2 - 1.75, W2 - 1.1, 0, 4.3, 0, 0.14, STONE_S, 0, 'fst'); fbox(ls, F2, W2 + 1.1, W2 + 1.75, 0, 4.3, 0, 0.14, STONE_S, 0, 'fst');
      fbox(ls, F2, W2 - 1.75, W2 + 1.75, 2.95, 4.3, 0, 0.14, STONE_S, 0, 'fstb');
      fbox(ls, F2, -0.06, 2 * W2 + 0.06, top - 0.5, top, 0, 0.07, STONE_S, 0, 'fstb');
      fbox(B.v('frame'), F2, -0.12, 2 * W2 + 0.12, top, top + 0.2, -dep, 0.14, 1, 0, 'fstb');
      // fluted brick strips either side (vertical relief like the real entrance pier)
      brick.setColor(0.9, 0.88, 0.85);
      for (const du of [-2.55, -2.25, 2.25, 2.55]) fbox(brick, F2, W2 + du - 0.11, W2 + du + 0.11, 0.5, top - 0.5, 0, 0.07, BRICK_S, 0, 'fs');
      brick.setColor(1, 1, 1);
      // vertical window slot above the door, like the photo
      const fakeSt = { frame: 'frame', top: 'stone', tint: [1, 1, 1] };
      doorFromKit(ctx, F2, W2, fakeSt);
      const tex = M.textDecal(['HINSDALE CENTRAL'], { w: 1024, h: 128, font: 88, color: '#2a2622', align: 'center', weight: 700, spacing: '8px' });
      addDecal(tex, F2, W2, 3.62, 3.2, 0.42, 0.15);
      B.c('brick').box(...F.P(uC, top / 2, dep / 2), 2 * W2, top, dep, F.rotY);
      const l = F.P(uC, 0, 2.6); B.solidBox('limestone', 'concrete', l[0], 0.08, l[2], 5.4, 0.16, 3.4, F.rotY, STONE_S);
    }
    // limestone planters flanking the walks (cover)
    for (const uC of [F.L * 0.36 - 9, F.L * 0.36 + 9, F.L * 0.74 - 9, F.L * 0.74 + 9]) {
      const c = F.P(uC, 0, 5.5);
      B.solidBox('limestone', 'concrete', c[0], 0.5, c[2], 7.0, 1.0, 2.2, F.rotY, STONE_S);
      ctx.shrubs.push([c[0], 1.0, c[2], 5.6, 1.0, F.rotY]);
    }
  }
  // --- Grant St plaza entrance (west side of the gym block): white canopy on round columns, two-storey curtain wall
  {
    const wx = -6.1;                         // wall plane (x), faces west
    // curtain wall: interior-mapped glass behind an aluminium grid, set in a metal-framed recess
    const g = B.v('glassInt');
    g.quad([wx - 0.07, 0.45, 3], [wx - 0.07, 6.5, 3], [wx - 0.07, 6.5, -15], [wx - 0.07, 0.45, -15], [4 + 900, 0], [4 + 900, 1], [900, 1], [900, 0]);
    const br = B.v('frameAlu');
    for (let z = -15; z <= 3.01; z += 1.5) br.box(wx - 0.13, 3.47, z, 0.14, 6.1, 0.07);
    for (const y of [0.45, 1.5, 3.3, 3.75, 5.2, 6.5]) br.box(wx - 0.13, y, -6, 0.14, 0.08, 18.1);
    B.v('panelGray').box(wx - 0.1, 3.52, -6, 0.06, 0.4, 18);
    B.v('concrete').box(wx - 0.12, 0.22, -6, 0.3, 0.45, 18.3, 0, STONE_S);
    // main canopy: thick white metal-panel slab with a darker soffit edge and round columns
    B.v('whitePanel').box(-11.6, 7.35, -4.5, 11.0, 0.95, 25);
    B.v('panelGray').box(-11.6, 6.86, -4.5, 10.7, 0.04, 24.7);
    for (let z = -16.5; z <= 7.6; z += 2.4) B.v('panelGray').box(-17.11, 7.35, z, 0.012, 0.95, 0.02);
    B.c('metal').box(-11.6, 7.35, -4.5, 11.0, 0.95, 25);
    for (const z of [-15.5, -9.5, -3.5, 2.5]) { B.v('whitePanel').cyl(-16.0, 0.3, z, 0.2, 0.2, 6.6, 18, 1, false); B.v('concrete').cyl(-16.0, 0, z, 0.32, 0.3, 0.3, 14, 1, true); B.c('metal').box(-16.0, 3.45, z, 0.42, 6.9, 0.42); }
    // lower entry canopy + storefront vestibule with three sets of doors
    B.v('whitePanel').box(-9.3, 3.85, 12.0, 6.4, 0.7, 14.5);
    B.v('panelGray').box(-9.3, 3.49, 12.0, 6.1, 0.03, 14.2);
    B.c('metal').box(-9.3, 3.85, 12.0, 6.4, 0.7, 14.5);
    for (const z of [5.6, 18.4]) { B.v('whitePanel').cyl(-11.9, 0.3, z, 0.2, 0.2, 3.2, 18, 1, false); B.v('concrete').cyl(-11.9, 0, z, 0.32, 0.3, 0.3, 14, 1, true); B.c('metal').box(-11.9, 1.7, z, 0.42, 3.4, 0.42); }
    const dep = 0.5; const Fv = edgeFrame(wx - dep, 18.2, wx - dep, 5.6);     // vestibule front, outward = west
    const Fw = edgeFrame(wx, 18.2, wx, 5.6);
    fbox(B.v('frameAlu'), Fw, 0, Fv.L, 0, 3.3, 0, dep, 1, 0, 'st');
    const fakeSt = { frame: 'frameAlu', top: 'none', tint: [1, 1, 1] };
    for (const uc of [2.1, 6.3, 10.5]) doorFromKit(ctx, Fv, uc, fakeSt, true);
    for (const [a, b2] of [[0, 0.25], [3.95, 4.45], [8.15, 8.65], [12.35, 12.6]]) fbox(B.v('frameAlu'), Fv, a, b2, 0, 3.3, -0.05, 0, 1, 0, 'f');
    wallRect(B.v('frameAlu'), Fv, 0, Fv.L, 2.95, 3.3, 0);
    B.c('glass').box(wx - dep / 2, 1.65, 11.9, dep, 3.3, 12.6);
    addDecal(emblemTexture(), edgeFrame(wx, 4.9, wx, 1.3), 1.8, 4.9, 2.6, 2.6, 0.2);
    // lettering on the canopy fascia
    const tex = M.textDecal(['HINSDALE CENTRAL'], { w: 2048, h: 160, font: 120, color: '#34383c', align: 'center', weight: 700, spacing: '14px' });
    addDecal(tex, edgeFrame(-17.1, 4, -17.1, -13), 8.5, 7.35, 11, 0.62, 0.02);
    // plaza: low concrete seat walls / planters (cover)
    for (const [x, z, w, d] of [[-20.5, -12, 1.2, 9], [-20.5, 2, 1.2, 9], [-24.5, 14, 6, 1.2], [-15, 22.5, 7, 1.2]]) {
      B.solidBox('concrete', 'concrete', x, 0.45, z, w, 0.9, d, 0, 1 / 3);
      ctx.shrubs.push([x, 0.9, z, Math.max(w, d) * 0.8, 0.8, w > d ? 0 : Math.PI / 2]);
    }
  }
}

// ---------------------------------------------------------------------------------------------- houses
function minAreaOBB(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of pts) { const u = p[0] * tx + p[1] * tz, v = -p[0] * tz + p[1] * tx; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, tx, tz, u0, u1, v0, v1 };
  }
  return best;
}

function hipRoof(bucket, ring, eaveY, pitch, overhang, uvS) {
  const o = minAreaOBB(ring); if (!o) return 0;
  let { tx, tz, u0, u1, v0, v1 } = o;
  // make u the long axis
  if (v1 - v0 > u1 - u0) { const ntx = -tz, ntz = tx; const nu0 = v0, nu1 = v1, nv0 = -u1, nv1 = -u0; tx = ntx; tz = ntz; u0 = nu0; u1 = nu1; v0 = nv0; v1 = nv1; }
  u0 -= overhang; u1 += overhang; v0 -= overhang; v1 += overhang;
  const hw = (v1 - v0) / 2, vc = (v0 + v1) / 2; const rise = Math.min(hw * pitch, 4.2);
  const W = (u, v, y) => [u * tx - v * tz, y, u * tz + v * tx];
  const ridgeA = Math.min(u0 + hw, (u0 + u1) / 2), ridgeB = Math.max(u1 - hw, (u0 + u1) / 2);
  const A = W(u0, v0, eaveY), Bp = W(u1, v0, eaveY), C = W(u1, v1, eaveY), D = W(u0, v1, eaveY);
  const R0 = W(ridgeA, vc, eaveY + rise), R1 = W(ridgeB, vc, eaveY + rise);
  const sl = Math.hypot(hw, rise);
  const up = [0, 1, 0];
  const q = (p0, p1, p2, p3, uv) => quadFacing(bucket, p0, p1, p2, p3, up, uv);
  q(A, Bp, R1, R0, [[u0 * uvS, 0], [u1 * uvS, 0], [ridgeB * uvS, sl * uvS], [ridgeA * uvS, sl * uvS]]);
  q(C, D, R0, R1, [[u1 * uvS, 0], [u0 * uvS, 0], [ridgeA * uvS, sl * uvS], [ridgeB * uvS, sl * uvS]]);
  const t = (p0, p1, p2, w) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const cy = uz * vx - ux * vz;
    if (cy >= 0) bucket.tri(p0, p1, p2, [0, 0], [w * uvS, 0], [w * uvS / 2, sl * uvS]); else bucket.tri(p0, p2, p1, [0, 0], [w * uvS / 2, sl * uvS], [w * uvS, 0]);
  };
  t(D, A, R0, 2 * hw); t(Bp, C, R1, 2 * hw);
  // soffit (underside of the overhang) so eaves do not look paper thin from below
  quadFacing(bucket, A, Bp, C, D, [0, -1, 0]);
  return rise;
}

const SPECIAL = {
  587068096: { type: 'concession' },
  227528871: { type: 'flat', h: 4.0 },
  227528875: { type: 'flat', h: 4.0 },
  1443736359: { type: 'pump', h: 5.5 },
};

// Only school-owned outbuildings remain; the surrounding houses are intentionally not built (see gen.py: the
// neighbourhood is repainted as wooded lawn).
export function buildHouses(ctx) {
  const { B, data, gen } = ctx; const rnd = mulberry32(7);
  const rr = gen.roofs;
  const roofUV = (lean) => (x, z) => [(x + lean[0] - rr.minX) / (rr.maxX - rr.minX), 1 - (z + lean[1] - rr.minZ) / (rr.maxZ - rr.minZ)];
  ctx.buildingRings = ctx.buildingRings || [];
  for (const b of data.buildings) {
    const sp = SPECIAL[b.id]; if (!sp) continue;
    const ring = ensureCCW(b.outer[0]); if (ring.length < 3) continue;
    ctx.buildingRings.push(ring);
    if (sp.type === 'flat' || sp.type === 'pump') {
      const h = sp.h; let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.05) continue;
        const F = edgeFrame(a[0], a[1], c[0], c[1]);
        facade(ctx, F, 0, h, 'service', u, rnd);
        parapetTop(B, F, L, h, h - 0.4, false);
        { const pc = F.P(L / 2, h - 0.185, -0.16); B.c('concrete').box(pc[0], pc[1], pc[2], L, 0.43, 0.32, F.rotY); }
        u += L;
      }
      B.v('roofSat').poly(ring, null, h - 0.4, roofUV([gen.lean[0] * h, gen.lean[1] * h]));
      B.c('brick').prism(ring, 0, h - 0.4, 1, true);
      continue;
    }
    // concession / ticket building south of the track: white siding, red hipped roof, service counters
    const h = 3.3; let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const F = edgeFrame(a[0], a[1], c[0], c[1]);
      wallRect(B.v('house0'), F, 0, L, 0.5, h, 0, [0.02, 0.04, 0.2, 0.9]);
      fbox(B.v('brickRed'), F, 0, L, 0, 0.5, 0, 0.05, 0.5, u, 'fst');
      if (L > 9) for (let k = 0; k < Math.floor(L / 5); k++) {
        const uc = 2.5 + k * 5;
        fbox(B.v('frame'), F, uc - 1.45, uc + 1.45, 0.98, 2.42, 0, 0.05, 1, 0, 'fstb'); wallRect(B.v('louver'), F, uc - 1.38, uc + 1.38, 1.05, 2.35, 0.055, [0, 0, 1, 6]);
        fbox(B.v('aluminum'), F, uc - 1.5, uc + 1.5, 0.93, 0.98, 0, 0.35, 1, 0, 'fstb');
      }
      B.v('groundDecal').quad(F.P(0, 0.025, 0.02), F.P(L, 0.025, 0.02), F.P(L, 0.025, 1.3), F.P(0, 0.025, 1.3), [0, 0], [1, 0], [1, 1], [0, 1]);
      u += L;
    }
    B.v('shingles', true).setColor(3.4, 0.5, 0.36); hipRoof(B.v('shingles', true), ring, h, 0.55, 0.8, 1 / 3);
    B.c('brick').prism(ring, 0, h + 1.2, 1, true);
  }
}
