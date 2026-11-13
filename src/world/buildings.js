// Hinsdale Central main building (per-wing heights from gen.json, brick + limestone band + bronze coping,
// ribbon windows, satellite-projected roofs) and the surrounding houses.
import * as THREE from 'three';
import { ensureCCW, signedArea, mulberry32, pointInRing, makeCanvas, canvasTexture } from './util.js';
import { HOUSE_KINDS } from './assets.js';

const BRICK_S = 1 / 2.01;          // brick texture covers 2.01 m
const STONE_S = 1 / 3.0;
const SCHOOL_ID = 7822857;

// local frame of a wall edge: u along the edge, y up, "out" along the outward normal
export function edgeFrame(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-6;
  const tx = dx / L, tz = dz / L, nx = tz, nz = -tx;
  return {
    L, tx, tz, nx, nz, rotY: Math.atan2(-tz, tx),
    P: (u, y, out = 0) => [ax + tx * u + nx * out, y, az + tz * u + nz * out],
  };
}
function quadFacing(b, p0, p1, p2, p3, n, uv) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) b.quad(p0, p1, p2, p3, uv && uv[0], uv && uv[1], uv && uv[2], uv && uv[3]);
  else b.quad(p0, p3, p2, p1, uv && uv[0], uv && uv[3], uv && uv[2], uv && uv[1]);
}
// rectangle on a wall plane: u0..u1, y0..y1 at offset out, facing outward. uv rect optional.
function wallRect(b, F, u0, u1, y0, y1, out, uvr) {
  const r = uvr || [u0, y0, u1, y1];
  b.quad(F.P(u0, y0, out), F.P(u0, y1, out), F.P(u1, y1, out), F.P(u1, y0, out), [r[0], r[1]], [r[0], r[3]], [r[2], r[3]], [r[2], r[1]]);
}
function brickRect(b, F, u0, u1, y0, y1, uOff, out = 0) {
  if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
  wallRect(b, F, u0, u1, y0, y1, out, [(uOff + u0) * BRICK_S, y0 * BRICK_S, (uOff + u1) * BRICK_S, y1 * BRICK_S]);
}

// a window (or door) opening: recessed glazing + bronze reveals + limestone sill
function opening(B, F, u0, u1, y0, y1, kind) {
  const D = 0.16;
  const n = [F.nx, 0, F.nz], t = [F.tx, 0, F.tz];
  if (kind === 'door') {
    wallRect(B.v('door'), F, u0, u1, y0, y1, -D, [0, 0, 1, 1]);
  } else {
    const reps = Math.max(1, Math.round((u1 - u0) / 1.15));
    wallRect(B.v('glass'), F, u0, u1, y0, y1, -D, [0, 0, reps, 1]);
  }
  const br = B.v('bronze');
  // jambs
  quadFacing(br, F.P(u0, y0, 0), F.P(u0, y1, 0), F.P(u0, y1, -D), F.P(u0, y0, -D), t);
  quadFacing(br, F.P(u1, y0, 0), F.P(u1, y1, 0), F.P(u1, y1, -D), F.P(u1, y0, -D), [-t[0], 0, -t[2]]);
  // head
  quadFacing(br, F.P(u0, y1, 0), F.P(u1, y1, 0), F.P(u1, y1, -D), F.P(u0, y1, -D), [0, -1, 0]);
  if (kind !== 'door') {
    // projecting limestone sill
    const st = B.v('limestone'); const sy = y0, so = 0.06, sh = 0.1;
    quadFacing(st, F.P(u0 - 0.05, sy, so), F.P(u1 + 0.05, sy, so), F.P(u1 + 0.05, sy, -D), F.P(u0 - 0.05, sy, -D), [0, 1, 0]);
    wallRect(st, F, u0 - 0.05, u1 + 0.05, sy - sh, sy, so, [0, 0, (u1 - u0) * STONE_S, sh * STONE_S]);
  } else {
    quadFacing(B.v('concrete'), F.P(u0, y0 + 0.02, 0.5), F.P(u1, y0 + 0.02, 0.5), F.P(u1, y0 + 0.02, -D), F.P(u0, y0 + 0.02, -D), [0, 1, 0]);
  }
}

const STYLES = {
  main: { windows: true, doors: true },
  ss: { windows: true, doors: true }, c12: { windows: true, doors: true }, e11: { windows: true, doors: true },
  link: { windows: false, doors: false },
  addition: { windows: true, doors: true, single: true }, annex: { windows: true, doors: true, single: true },
  low7: { windows: true, doors: true, single: true }, low8: { windows: true, doors: true, single: true }, low7b: { windows: true, doors: false, single: true },
  lowN: { windows: false, doors: true }, lowE: { windows: false, doors: true },
  gymW: { windows: false, doors: true, clerestory: true }, gymE: { windows: false, doors: true },
  fieldhouse: { windows: false, doors: true, clerestory: true }, fieldhouseW: { windows: false, doors: true },
  southeast: { windows: false, doors: true },
};

function facade(B, ax, az, bx, bz, y0, h, styleName, uOff, rnd) {
  const F = edgeFrame(ax, az, bx, bz); const L = F.L;
  const style = STYLES[styleName] || STYLES.main;
  const brick = B.v('brick');
  const bandY = h - 1.0;               // limestone band
  // top band + coping (all walls)
  wallRect(B.v('limestone'), F, 0, L, bandY, h - 0.14, 0.03, [uOff * STONE_S, 0, (uOff + L) * STONE_S, 0.86 * STONE_S]);
  quadFacing(B.v('limestone'), F.P(0, bandY, 0), F.P(L, bandY, 0), F.P(L, bandY, 0.03), F.P(0, bandY, 0.03), [0, -1, 0]);
  wallRect(B.v('bronze'), F, -0.08, L + 0.08, h - 0.14, h + 0.02, 0.09);
  quadFacing(B.v('bronze'), F.P(-0.08, h - 0.14, 0), F.P(L + 0.08, h - 0.14, 0), F.P(L + 0.08, h - 0.14, 0.09), F.P(-0.08, h - 0.14, 0.09), [0, -1, 0]);
  if (y0 > 0.01 || L < 4.2 || (!style.windows && !style.doors && !style.clerestory)) { brickRect(brick, F, 0, L, y0, bandY, uOff); return; }

  // rows of openings: [yBottom, yTop, list of [u0,u1,kind]]
  const rows = [];
  const m = 1.4, usable = L - 2 * m;
  const nb = Math.floor(usable / 4.6);
  if (style.windows && nb >= 1) {
    const bay = usable / nb;
    const doorBay = (style.doors && L > 30) ? (nb >> 1) : -1;
    const r1 = [], r2 = [];
    for (let i = 0; i < nb; i++) {
      const c = m + (i + 0.5) * bay;
      if (i === doorBay) r1.push([c - 1.0, c + 1.0, 'door', 0.0, 2.5]);
      else if (rnd() > 0.06) r1.push([c - (bay - 1.5) / 2, c + (bay - 1.5) / 2, 'win']);
      r2.push([c - (bay - 0.45) / 2, c + (bay - 0.45) / 2, 'win']);
    }
    rows.push([1.0, 3.15, r1]);
    if (!style.single && bandY >= 7.6) rows.push([h * 0.5 + 0.3, h * 0.5 + 2.75, r2]);
  } else if (style.doors && L > 16) {
    const c = L * (0.3 + 0.4 * rnd());
    rows.push([0.0, 2.5, [[c - 1.0, c + 1.0, 'door', 0.0, 2.5]]]);
  }
  if (style.clerestory && L > 18) {
    const n2 = Math.floor((L - 4) / 6); const bay = (L - 4) / n2; const r = [];
    for (let i = 0; i < n2; i++) { const c = 2 + (i + 0.5) * bay; r.push([c - 1.6, c + 1.6, 'win']); }
    rows.push([bandY - 2.6, bandY - 0.7, r]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  // brick with holes, row by row
  let y = y0;
  for (const [ry0, ry1, list] of rows) {
    // doors in a window row start at the ground: split so each opening is cut exactly
    const lo = Math.min(ry0, ...list.map((o) => (o[3] !== undefined ? o[3] : ry0)));
    if (lo > y) brickRect(brick, F, 0, L, y, lo, uOff);
    let u = 0;
    for (const o of list) {
      const oy0 = o[3] !== undefined ? o[3] : ry0, oy1 = o[4] !== undefined ? o[4] : ry1;
      brickRect(brick, F, u, o[0], lo, ry1, uOff);
      if (oy0 > lo) brickRect(brick, F, o[0], o[1], lo, oy0, uOff);
      if (oy1 < ry1) brickRect(brick, F, o[0], o[1], oy1, ry1, uOff);
      opening(B, F, o[0], o[1], oy0, oy1, o[2]);
      u = o[1];
    }
    brickRect(brick, F, u, L, lo, ry1, uOff);
    y = ry1;
  }
  brickRect(brick, F, 0, L, y, bandY, uOff);
}

function orientRing(pts, base, ccw) {
  const isCCW = signedArea(pts) > 0;
  if (isCCW === ccw) return { pts, base };
  const n = pts.length; const rp = pts.slice().reverse(); const rb = [];
  for (let k = 0; k < n; k++) rb.push(base[(2 * n - 2 - k) % n]);
  return { pts: rp, base: rb };
}

export function buildSchool(ctx) {
  const { B, gen, M } = ctx; const rnd = mulberry32(42);
  const rr = gen.roofs;
  const roofUV = (lean) => (x, z) => [(x + lean[0] - rr.minX) / (rr.maxX - rr.minX), 1 - (z + lean[1] - rr.minZ) / (rr.maxZ - rr.minZ)];
  ctx.schoolRings = [];
  for (const piece of gen.school) {
    const h = piece.h; const roofY = h - 0.4;
    const rings = [orientRing(piece.outer.pts, piece.outer.base, true), ...piece.holes.map((r) => orientRing(r.pts, r.base, false))];
    for (const ring of rings) {
      let uOff = 0; const n = ring.pts.length;
      for (let i = 0; i < n; i++) {
        const a = ring.pts[i], b = ring.pts[(i + 1) % n]; const base = ring.base[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (base < h - 0.5) facade(B, a[0], a[1], b[0], b[1], base > 0 ? Math.max(0, base - 0.4) : 0, h, piece.name, uOff, rnd);
        // parapet cap + inner face (not between two wings of equal height)
        if (base >= h - 0.5) { uOff += L; continue; }
        const F = edgeFrame(a[0], a[1], b[0], b[1]);
        quadFacing(B.v('bronze'), F.P(-0.08, h + 0.02, 0.09), F.P(L + 0.08, h + 0.02, 0.09), F.P(L, h + 0.02, -0.3), F.P(0, h + 0.02, -0.3), [0, 1, 0]);
        quadFacing(B.v('concrete'), F.P(0, roofY, -0.3), F.P(L, roofY, -0.3), F.P(L, h + 0.02, -0.3), F.P(0, h + 0.02, -0.3), [-F.nx, 0, -F.nz]);
        uOff += L;
      }
    }
    B.v('roofSat').poly(rings[0].pts, rings.slice(1).map((r) => r.pts), roofY, roofUV(piece.lean));
    B.c('brick').prism(rings[0].pts, 0, h, 1, true);
    ctx.schoolRings.push(rings[0].pts);
    // rooftop mechanical units
    const pts = rings[0].pts; let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
    const area = Math.abs(signedArea(pts)); const units = Math.min(10, Math.floor(area / 900));
    for (let k = 0, tries = 0; k < units && tries < 200; tries++) {
      const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
      let ok = pointInRing(x, z, pts) && pointInRing(x + 4, z + 4, pts) && pointInRing(x - 4, z - 4, pts) && pointInRing(x + 4, z - 4, pts) && pointInRing(x - 4, z + 4, pts);
      for (const hr of rings.slice(1)) if (pointInRing(x, z, hr.pts) || pointInRing(x + 4, z + 4, hr.pts) || pointInRing(x - 4, z - 4, hr.pts)) ok = false;
      if (!ok) continue;
      const w = 1.6 + rnd() * 2.2, d = 1.4 + rnd() * 1.6, hh = 1.0 + rnd() * 0.9;
      B.v('galv').box(x, roofY + hh / 2, z, w, hh, d, 0.02, 1);
      k++;
    }
  }
  schoolFeatures(ctx);
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
  const decalMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, transparent: false, alphaTest: 0.4, roughness: 0.6, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const addDecal = (tex, F, uC, yC, w, h, out = 0.03) => {
    const g = new THREE.BufferGeometry();
    const p = [F.P(uC - w / 2, yC - h / 2, out), F.P(uC - w / 2, yC + h / 2, out), F.P(uC + w / 2, yC + h / 2, out), F.P(uC + w / 2, yC - h / 2, out)];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]], 3));
    // seen from outside, +u runs right-to-left, so mirror u
    g.setAttribute('uv', new THREE.Float32BufferAttribute([1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0], 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, decalMat(tex)); m.receiveShadow = true; m.name = 'decal'; scene.add(m);
  };

  // --- school name on the north-west block facing 55th St (as on the real building)
  {
    const F = edgeFrame(-11.17, -152.39, -1.25, -152.66);   // CCW order of the outer ring: west->east along the north face
    const tex = M.textDecal(['HINSDALE', 'TOWNSHIP', 'HIGH SCHOOL', 'CENTRAL'], { w: 1024, h: 768, font: 150, color: '#eef0f1', spacing: '10px' });
    addDecal(tex, F, F.L * 0.42, 6.2, 5.2, 3.9, 0.04);
  }
  // --- 55th St (north) entrance: brick pier with limestone portal, like the Wikimedia photos
  {
    const ax = 145.93, az = -151.5, bx = -1.1, bz = -147.37;      // north wall, runs east->west in CCW order
    const F = edgeFrame(ax, az, bx, bz);
    for (const uC of [F.L * 0.36, F.L * 0.74]) {
      const c = F.P(uC, 0, 0.35);
      B.v('brick').box(c[0], 5.35, c[2], 6.4, 10.7, 0.7, F.rotY, BRICK_S);
      B.c('brick').box(c[0], 5.35, c[2], 6.4, 10.7, 0.7, F.rotY);
      const s = F.P(uC, 0, 0.75);
      B.v('limestone').box(s[0], 2.6, s[2], 3.9, 5.2, 0.16, F.rotY, STONE_S);
      const F2 = edgeFrame(...F.P(uC - 1.2, 0, 0.84).filter((_, i) => i !== 1), ...F.P(uC + 1.2, 0, 0.84).filter((_, i) => i !== 1));
      wallRect(B.v('door'), F2, 0, 2.4, 0, 3.4, 0, [0, 0, 1, 1]);
      // limestone steps/landing
      const l = F.P(uC, 0, 2.2);
      B.solidBox('limestone', 'concrete', l[0], 0.09, l[2], 5.0, 0.18, 2.8, F.rotY, STONE_S);
    }
    // limestone planters with lamp posts flanking the walk (cover)
    for (const uC of [F.L * 0.36 - 9, F.L * 0.36 + 9, F.L * 0.74 - 9, F.L * 0.74 + 9]) {
      const c = F.P(uC, 0, 5.5);
      B.solidBox('limestone', 'concrete', c[0], 0.5, c[2], 7.0, 1.0, 2.2, F.rotY, STONE_S);
      ctx.shrubs.push([c[0], 1.0, c[2], 2.6, 1.0, F.rotY]);
    }
  }
  // --- Grant St plaza entrance (west side of the gym block): white canopy on round columns + curtain wall
  {
    const wx = -6.1;                         // wall plane (x), faces west
    B.v('curtainGlass').quad([wx - 0.06, 0.5, 3], [wx - 0.06, 6.4, 3], [wx - 0.06, 6.4, -15], [wx - 0.06, 0.5, -15]);
    const br = B.v('bronze');
    for (let z = -15; z <= 3.01; z += 2.25) br.box(wx - 0.1, 3.45, z, 0.1, 5.9, 0.09);
    for (let y = 0.5; y <= 6.41; y += 1.475) br.box(wx - 0.1, y, -6, 0.1, 0.09, 18);
    B.v('whitePanel').box(-11.6, 7.35, -4.5, 11.0, 0.95, 25);
    B.c('metal').box(-11.6, 7.35, -4.5, 11.0, 0.95, 25);
    for (const z of [-15.5, -9.5, -3.5, 2.5]) { B.v('whitePanel').cyl(-16.0, 0, z, 0.2, 0.2, 6.9, 14, 1, false); B.c('metal').box(-16.0, 3.45, z, 0.42, 6.9, 0.42); }
    B.v('whitePanel').box(-9.3, 3.75, 12.0, 6.4, 0.75, 14.5);
    B.c('metal').box(-9.3, 3.75, 12.0, 6.4, 0.75, 14.5);
    for (const z of [5.6, 18.4]) { B.v('whitePanel').cyl(-11.9, 0, z, 0.2, 0.2, 3.4, 14, 1, false); B.c('metal').box(-11.9, 1.7, z, 0.42, 3.4, 0.42); }
    const Fw = edgeFrame(wx, 19, wx, 5);     // walking north along the wall, outward = west
    for (const u of [1.2, 4.6, 8.0]) wallRect(B.v('door'), Fw, u, u + 2.6, 0, 2.7, 0.05, [0, 0, 1, 1]);
    wallRect(B.v('curtainGlass'), Fw, 0.6, 11.4, 2.75, 3.3, 0.05);
    addDecal(emblemTexture(), edgeFrame(wx, 4.6, wx, 1.6), 1.5, 3.4, 2.6, 2.6, 0.06);
    // plaza: low concrete seat walls / planters (cover) and paving
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

export function buildHouses(ctx) {
  const { B, data, gen } = ctx; const pb = ctx.playBounds;
  const rr = gen.roofs;
  const roofUV = (lean) => (x, z) => [(x + lean[0] - rr.minX) / (rr.maxX - rr.minX), 1 - (z + lean[1] - rr.minZ) / (rr.maxZ - rr.minZ)];
  ctx.buildingRings = ctx.buildingRings || [];
  for (const b of data.buildings) {
    if (b.id === SCHOOL_ID) continue;
    const ring = ensureCCW(b.outer[0]); if (ring.length < 3) continue;
    const rnd = mulberry32(b.id);
    let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length;
    const near = cx > pb.minX - 90 && cx < pb.maxX + 90 && cz > pb.minZ - 90 && cz < pb.maxZ + 90;
    const sp = SPECIAL[b.id];
    ctx.buildingRings.push(ring);
    if (sp && (sp.type === 'flat' || sp.type === 'pump')) {
      const h = sp.h;
      let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const F = edgeFrame(a[0], a[1], c[0], c[1]);
        brickRect(B.v('brick'), F, 0, L, 0, h - 0.3, u);
        wallRect(B.v('bronze'), F, -0.05, L + 0.05, h - 0.3, h, 0.06);
        if (L > 9) { const uc = L * 0.5; wallRect(B.v('door'), F, uc - 1.1, uc + 1.1, 0, 2.5, 0.03, [0, 0, 1, 1]); }
        u += L;
      }
      B.v('roofSat').poly(ring, null, h - 0.02, roofUV([gen.lean[0] * h, gen.lean[1] * h]));
      B.c('brick').prism(ring, 0, h, 1, true);
      continue;
    }
    if (sp && sp.type === 'concession') {
      // brick concession/ticket building south of the track with a red hipped roof
      const h = 3.3; let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const F = edgeFrame(a[0], a[1], c[0], c[1]);
        wallRect(B.v('house0'), F, 0, L, 0, h, 0, [0.02, 0.04, 0.2, 0.9]);
        if (L > 9) for (let k = 0; k < Math.floor(L / 5); k++) { const uc = 2.5 + k * 5; wallRect(B.v('bronze'), F, uc - 1.4, uc + 1.4, 1.0, 2.4, 0.03); }
        u += L;
      }
      B.v('shingles', true).setColor(3.4, 0.5, 0.36); hipRoof(B.v('shingles', true), ring, h, 0.55, 0.8, 1 / 3);
      B.c('brick').prism(ring, 0, h + 1.2, 1, true);
      continue;
    }
    // ---- generic house / garage
    const garage = b.tags.building === 'garage' || Math.abs(signedArea(ring)) < 45;
    const stories = garage ? 1 : (rnd() < 0.72 ? 2 : 1);
    const h = garage ? 2.7 : stories * 2.9 + 0.2;
    const kind = Math.floor(rnd() * HOUSE_KINDS.length);
    const wb = B.v('house' + kind);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.05) continue;
      const reps = Math.max(1, Math.round(L / 4));
      // short jogs get a windowless slice of the texture
      const u0 = L < 2.4 ? 0.02 : 0, u1 = L < 2.4 ? 0.2 : reps;
      wb.quad([a[0], 0, a[1]], [a[0], h, a[1]], [c[0], h, c[1]], [c[0], 0, c[1]], [u0, 0.04], [u0, garage ? 0.2 : stories], [u1, garage ? 0.2 : stories], [u1, 0.04]);
    }
    const sc = gen.houses[String(b.id)] || [80, 80, 80];
    const lum = (sc[0] + sc[1] + sc[2]) / 3;
    const k = THREE.MathUtils.clamp(lum / 78, 0.65, 2.3);
    const sh = B.v('shingles', true);
    sh.setColor(k * (0.9 + sc[0] / (lum + 1) * 0.12), k, k * (0.9 + sc[2] / (lum + 1) * 0.1));
    const rise = hipRoof(sh, ring, h, 0.5 + rnd() * 0.25, 0.45, 1 / 3);
    if (!garage && rnd() < 0.45) {
      const o = ring[Math.floor(rnd() * ring.length)];
      const px = cx + (o[0] - cx) * 0.4, pz = cz + (o[1] - cz) * 0.4;
      B.v('brickRed').box(px, h + rise * 0.5 + 0.6, pz, 0.8, rise + 1.6, 0.8, 0, BRICK_S);
    }
    if (near) B.c('wood').prism(ring, 0, h + rise * 0.5, 1, true);
  }
}
