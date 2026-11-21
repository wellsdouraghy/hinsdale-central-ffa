// Beaverbrook beyond the fence: every real building in the satellite rectangle (OSM footprints) at its lidar height, as
// context seen through the fence and from the air. Kanata's houses and townhouse rows (1965-1999): one and two storeys,
// brick or siding in earth tones under mid-pitch asphalt-shingle gables and hips; the apartment slabs (The Atriums, 10
// storeys of red-brown brick with balcony bands; 2 The Parkway, 7 storeys of pale precast and glass) and the parking
// deck. Nothing is invented: no footprint, no building (rule A1). Roof kinds and heights are the lidar's (tools/gen.py).
import { pointInRing, mulberry32 } from '../../world/util.js';
import { minAreaOBB, hipRoof, polyRoof } from '../marin/kit.js';
import { eaveOverhang } from '../roofs.js';
import { offsetRing } from './lib.js';
import { MAT, mat, hasPack, glass, cutRects, wallRect, fbox, edgeFrame, ensureCCW, PLAY_EDGE, lineDist, SCHOOL_ID, MLACAK_ID, LIBRARY_ID, TOWER_ID } from './kit.js';

const ATRIUMS = 69097540, GARAGE = 68609335;
const OWN = new Set([SCHOOL_ID, MLACAK_ID, LIBRARY_ID]);
const WALLS = [[0.50, 0.26, 0.19], [0.56, 0.44, 0.34], [0.62, 0.58, 0.50], [0.42, 0.30, 0.24], [0.66, 0.62, 0.55], [0.47, 0.38, 0.30], [0.58, 0.33, 0.24], [0.52, 0.50, 0.46]];   // brick reds and browns, buff, grey and cream siding
const ROOFS = [[3.2, 2.9, 2.7], [2.4, 2.3, 2.3], [3.6, 3.0, 2.5], [2.9, 2.5, 2.2], [4.2, 4.0, 3.8], [3.0, 2.2, 1.9]];    // weathered asphalt shingle: charcoal, grey, brown
const list = (ctx) => ctx.data.buildings.filter((b) => !OWN.has(b.id) && b.tags.building !== 'portable_classroom' && ctx.gen.buildings[String(b.id)] && b.outer[0].length >= 3);
const outF = (ring, i) => { const a = ring[i], b = ring[(i + 1) % ring.length]; let F = edgeFrame(a[0], a[1], b[0], b[1]); if (pointInRing((a[0] + b[0]) / 2 + F.nx * 0.25, (a[1] + b[1]) / 2 + F.nz * 0.25, ring)) F = edgeFrame(b[0], b[1], a[0], a[1]); return F; };

export function townPads(ctx) {
  const T = ctx.terrain; if (!T) return;
  // the buildings next to the fence stand on a level floor cut at their HIGHEST ground (cut, never fill: rule F33); houses
  // further out keep the lidar ground (their walls run down into it)
  for (const b of list(ctx)) { const info = ctx.gen.buildings[String(b.id)]; if (!info.play) continue; const ring = b.outer[0]; ctx.flatten({ outline: offsetRing(ring, 1.0) }, { blend: 2.5, y: (x, z) => Math.min(T.heightAt(x, z), info.g[1] + 0.05) }); }
}
/** One wall of windows: `rows` storeys of punched windows between y0 and top, on a tinted wall bucket. */
function windowWall(ctx, F, bk, y0, top, storeys, uvS, o = {}) {
  const L = F.L, H = (top - y0) / storeys; const holes = []; const mod = o.mod || 3.6, ww = o.ww || 1.5, wh = Math.min(o.wh || 1.4, H - 1.2);
  const n = Math.floor((L - 0.8) / mod); if (n >= 1 && wh > 0.6 && !o.blank) for (let s = 0; s < storeys; s++) for (let i = 0; i < n; i++) { const c = (L - n * mod) / 2 + (i + 0.5) * mod; holes.push([c - ww / 2, c + ww / 2, y0 + s * H + (o.sill || 0.95), y0 + s * H + (o.sill || 0.95) + wh]); }
  cutRects(L, o.foot ?? y0 - 1.2, top, holes, (a, b, c, d) => wallRect(bk, F, a, b, c, d, 0, [a * uvS, c * uvS, b * uvS, d * uvS]));
  if (holes.length) { const fr = ctx.B.v(o.frame || 'frameAlu'); for (const h of holes) { wallRect(fr, F, h[0], h[1], h[2], h[3], -0.07); if (o.far) wallRect(ctx.B.v('eomSpandrel'), F, h[0] + 0.05, h[1] - 0.05, h[2] + 0.05, h[3] - 0.05, -0.05); else { glass(ctx, F, h[0] + 0.05, h[1] - 0.05, h[2] + 0.05, h[3] - 0.05, -0.05, 1); fbox(fr, F, (h[0] + h[1]) / 2 - 0.02, (h[0] + h[1]) / 2 + 0.02, h[2], h[3], -0.07, -0.02, 1, 0, 'fs'); } } }
}

export function buildTown(ctx) {
  const { B, gen } = ctx; const all = list(ctx); const rings = all.map((b) => ensureCCW(b.outer[0])); const edge = [...PLAY_EDGE, PLAY_EDGE[0]];
  ctx.playRings = [...(ctx.buildingRings || []), ...rings];
  all.forEach((b, k) => {
    const ring = rings[k], info = gen.buildings[String(b.id)]; const rnd = mulberry32(b.id % 100000 + 7); const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
    const d = pointInRing(c[0], c[1], PLAY_EDGE) ? 0 : lineDist(c[0], c[1], edge); const near = d < 60; const solid = d < 45;
    const base = info.g[1], top = info.top; const tall = b.id === ATRIUMS || b.id === TOWER_ID;
    if (info.roof === 'flat' || tall || b.id === GARAGE) {
      const lv = b.tags['building:levels'] ? parseInt(b.tags['building:levels'], 10) : Math.max(1, Math.round((top - base) / 3.0));
      const key = b.id === TOWER_ID ? MAT.tower : b.id === ATRIUMS ? MAT.balcony : null; const wc = WALLS[Math.floor(rnd() * WALLS.length)];
      for (let i = 0; i < ring.length; i++) { const F = outF(ring, i); if (F.L < 0.3) continue; const bk = key ? mat(ctx, key) : (() => { const q = B.v('stucco', true); q.setColor(wc[0], wc[1], wc[2]); return q; })();
        if (b.id === GARAGE) { // open parking deck: concrete spandrels with dark gaps
          const m = mat(ctx, MAT.mlacakWall); const n = Math.max(1, Math.round((top - base) / 3.0)), H = (top - base) / n; for (let s = 0; s < n; s++) { wallRect(m, F, 0, F.L, base + s * H - (s ? 0 : 1.2), base + s * H + 1.1, 0, [0, 0, F.L, 1.1]); wallRect(B.v('eomSpandrel'), F, 0, F.L, base + s * H + 1.1, base + (s + 1) * H, -0.3); } wallRect(m, F, 0, F.L, top - 0.02, top + 1.0, 0, [0, 0, F.L, 1]); m.setColor(1, 1, 1); continue; }
        windowWall(ctx, F, bk, base, top, lv, key ? 1 : 0.45, { mod: tall ? 3.3 : 3.8, ww: tall ? 2.2 : 1.6, wh: 1.5, sill: tall ? 0.8 : 0.95, far: !near, blank: F.L < 3 });
        if (tall && F.L > 8) { const bb = mat(ctx, MAT.precast, 0.95); const H = (top - base) / lv; for (let s = 1; s < lv; s++) fbox(bb, F, 0.6, F.L - 0.6, base + s * H - 0.12, base + s * H + 1.0, 0, 1.3, 1, 0, 'fstb'); bb.setColor(1, 1, 1); }   // balcony bands
        bk.setColor(1, 1, 1); fbox(B.v('frame'), F, -0.05, F.L + 0.05, top - 0.02, top + 0.35, -0.02, 0.07, 1, 0, 'fstb'); }
      { const g = mat(ctx, MAT.gravel, 1, [1.25, 1.22, 1.18]); g.poly(ring, null, top + 0.005, (x, z) => [x / 3, z / 3]); g.setColor(1, 1, 1); }
      if (solid) { B.c('concrete').prism(ring, base - 1.5, top, 1, true); (ctx.footprints = ctx.footprints || []).push({ id: b.id, ring, roof: top, floor: base }); }
      (ctx.buildingRings = ctx.buildingRings || []).push(ring); return;
    }
    // ---- pitched: a house or a townhouse unit
    const eave = top, rise = Math.max(1.0, Math.min(info.rise || 2.2, 4.2)); const storeys = eave - base > 4.3 ? 2 : 1; const wc = WALLS[(b.id * 7 + Math.floor(rnd() * 3)) % WALLS.length], rc = ROOFS[(b.id * 3) % ROOFS.length];
    const bk = B.v('stucco', true); const terrace = b.tags.building === 'terrace';
    for (let i = 0; i < ring.length; i++) { const F = outF(ring, i); if (F.L < 0.3) continue; const party = rings.some((r, j) => j !== k && pointInRing(F.ax + F.tx * F.L / 2 + F.nx * 0.5, F.az + F.tz * F.L / 2 + F.nz * 0.5, r));
      bk.setColor(wc[0], wc[1], wc[2]); windowWall(ctx, F, bk, base, eave, storeys, 0.45, { mod: 3.4, ww: 1.3, wh: 1.25, far: !near, blank: party || F.L < 2.6 }); }
    bk.setColor(1, 1, 1);
    if (solid) { B.c('wood').prism(ring, base - 1.5, eave, 1, true); (ctx.footprints = ctx.footprints || []).push({ id: b.id, ring, roof: eave, floor: base }); }
    const ov = eaveOverhang(ring, ctx.playRings, 0.45);
    if (terrace) { const o = minAreaOBB(ring); if (o) hipRoof(ctx, o, eave, rise, { gable: true, overhang: Math.min(ov, 0.3), tint: rc, gableBucket: 'stucco', gableTint: wc, noCollision: !solid, fill: solid, caps: false }); }
    else polyRoof(ctx, ring, eave, rise, { tint: rc, overhang: ov, noCollision: !solid, fill: solid });
    (ctx.buildingRings = ctx.buildingRings || []).push(ring);
  });
  B.v('stucco', true).setColor(1, 1, 1); void hasPack;
}
