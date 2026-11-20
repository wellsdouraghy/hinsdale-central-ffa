// Street grading for terrain campuses (MAP_NOTES "grade streets first"): streets and sidewalks are DESIGNED surfaces,
// never draped lidar. A builder calls gradeStreets(ctx, roads, opts) in its earthworks right after the campus pads and
// before any building pad, and streets.restore() after the last pad, so nothing a building does can warp a street:
//
//   campus pads -> gradeStreets -> building pads / yards -> streets.restore()
//
// Per road: the DEM is sampled along the centreline and low-passed on the road GRAPH (junction nodes are shared, so
// every arm of an intersection meets at one height); the cross-section is a ~2 % crown, a kerb step and a sidewalk
// running parallel at kerb height with a 2 % fall toward the road; the verge behind the sidewalk blends back to the
// terrain. Intersections lose the crown (one smooth surface blended from the arms). On the engine's 2 m lattice the
// kerb is the height difference between carriageway and sidewalk; its face is one lattice cell wide.
//
//   roads: [{ id, name, line: [[x, z], ...], width, left, right }]   (left / right: sidewalk width in m, 0 = none;
//                                                                     left / right of the line's direction, as OSM)
//   opts:  { sigma = 15 (m, low-pass), crown = 0.02, kerb = 0.15, walkFall = 0.02, shoulder = 2.5 (m, level strip behind
//            the sidewalk), blend = 5 (m, verge beyond it),
//            maxGrade = 0.3, protect = [(x, z) => bool]   designed pads the verge / shoulder must not touch,
//            hard = [(x, z) => bool]   designed pads that even narrow a sidewalk (never the carriageway),
//            solid = [(x, z) => bool] (later, via streets.solid)   building footprints: restore() leaves them alone }
// Returns ctx.streets = { design(x, z), apply(), restore(), stations, solid, inRoad(x, z, m), toVerge(x, z, m),
// surface(x, z) } (stations: map check `roads`). After restore(): ctx.paintSurface(streets.surface) so the ground texture
// follows the designed section, and move every tree / post off the carriageway with toVerge.
const DS = 2;

export function gradeStreets(ctx, roads, opts = {}) {
  const T = ctx.terrain; if (!T || !roads || !roads.length) return null;
  const sigma = opts.sigma ?? 15, CROWN = opts.crown ?? 0.02, KERB = opts.kerb ?? 0.15, FALL = opts.walkFall ?? 0.02, BLEND = opts.blend ?? 5, SHOULDER = opts.shoulder ?? 2.5, maxGrade = opts.maxGrade ?? 0.3;
  const protect = opts.protect || [], hard = opts.hard || [];
  // A road benched across a steep hillside (mean natural cross-slope over opts.hillside.cross) is a narrow drive without
  // sidewalks: a full street section there would be a terrace many metres high.
  const HS = opts.hillside === false ? null : { cross: 0.14, width: 7, shoulder: 1, ...(opts.hillside || {}) };
  roads = roads.map((r) => { const o = { ...r, shoulder: r.shoulder ?? SHOULDER }; if (!HS || r.hillside === false) return o; let n = 0, sum = 0; const hw = r.width / 2;
    for (let i = 0; i < r.line.length - 1; i++) { const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (let u = 0; u <= L; u += 6) { const x = a[0] + tx * u, z = a[1] + tz * u; n++; sum += Math.abs(T.heightAt(x - tz * hw, z + tx * hw) - T.heightAt(x + tz * hw, z - tx * hw)) / (2 * hw); } }
    if (n && sum / n > HS.cross) { o.width = Math.min(o.width, HS.width); o.left = o.right = 0; o.shoulder = HS.shoulder; o.hill = true; } return o; });
  // ---- graph: every OSM vertex plus points every <= 2 m; vertices shared between roads are one node
  const V = []; const byKey = new Map(); const key = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10);
  const node = (p, shared) => { if (shared) { const k = key(p); let i = byKey.get(k); if (i === undefined) { i = V.length; V.push({ x: p[0], z: p[1], nb: [], y: 0 }); byKey.set(k, i); } return i; } V.push({ x: p[0], z: p[1], nb: [], y: 0 }); return V.length - 1; };
  const chains = [];
  for (const r of roads) {
    const ch = [];
    for (let i = 0; i < r.line.length; i++) {
      const a = r.line[i]; ch.push(node(a, true)); if (i === r.line.length - 1) break;
      const b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / DS));
      for (let k = 1; k < n; k++) ch.push(node([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], false));
    }
    const c2 = ch.filter((v, i) => i === 0 || v !== ch[i - 1]); if (c2.length < 2) continue;
    for (let i = 0; i < c2.length - 1; i++) { V[c2[i]].nb.push(c2[i + 1]); V[c2[i + 1]].nb.push(c2[i]); }
    chains.push({ r, ch: c2 });
  }
  for (const v of V) v.y = T.heightAt(v.x, v.z);
  // At a junction the profile of the THROUGH street carries on smoothly and the side streets attach to it (averaging all
  // arms pulls the main street up or down toward a steep side street: a hump at every corner). Through pair: the two
  // widest arms, most nearly opposite.
  { const wOf = new Map(); for (const { r, ch } of chains) for (let i = 0; i < ch.length - 1; i++) { wOf.set(ch[i] + '>' + ch[i + 1], r.width); wOf.set(ch[i + 1] + '>' + ch[i], r.width); }
    for (let i = 0; i < V.length; i++) { const v = V[i]; v.sm = v.nb; if (v.nb.length < 3) continue; let best = null, bs = -Infinity;
      for (let a = 0; a < v.nb.length; a++) for (let b = a + 1; b < v.nb.length; b++) { const A = V[v.nb[a]], Bn = V[v.nb[b]]; const ax = A.x - v.x, az = A.z - v.z, bx = Bn.x - v.x, bz = Bn.z - v.z; const cos = (ax * bx + az * bz) / ((Math.hypot(ax, az) || 1) * (Math.hypot(bx, bz) || 1));
        const sc = Math.min(wOf.get(i + '>' + v.nb[a]) || 0, wOf.get(i + '>' + v.nb[b]) || 0) * 10 - cos; if (sc > bs) { bs = sc; best = [v.nb[a], v.nb[b]]; } }
      v.sm = best; } }
  // ---- low-pass on the graph (diffusion: each pass adds a * h^2 of variance), then limit the grade
  { const a = 0.5; const N = Math.ceil(sigma * sigma / (a * DS * DS)); let cur = Float64Array.from(V, (v) => v.y), nxt = new Float64Array(V.length);
    for (let it = 0; it < N; it++) { for (let i = 0; i < V.length; i++) { const nb = V[i].sm; let s = 0; for (const j of nb) s += cur[j]; nxt[i] = nb.length ? cur[i] * (1 - a) + a * s / nb.length : cur[i]; } const t = cur; cur = nxt; nxt = t; }
    for (let it = 0; it < 40; it++) { let moved = false; for (let i = 0; i < V.length; i++) for (const j of V[i].nb) { if (j < i) continue; const d = Math.hypot(V[i].x - V[j].x, V[i].z - V[j].z) || 1e-3; const ex = Math.abs(cur[i] - cur[j]) - maxGrade * d; if (ex > 1e-4) { const s = Math.sign(cur[i] - cur[j]) * ex / 2; cur[i] -= s; cur[j] += s; moved = true; } } if (!moved) break; }
    // no bump: the 2nd difference over 4 m (two nodes each way along a street) is eased where it exceeds 6 cm (a crest or sag gets a longer vertical curve), relaxed locally
    for (let round = 0; round < 8; round++) { const mark = new Uint8Array(V.length); let any = false;
      for (const { ch } of chains) for (let k = 2; k < ch.length - 2; k++) if (Math.abs(cur[ch[k - 2]] - 2 * cur[ch[k]] + cur[ch[k + 2]]) > 0.06) { any = true; for (let m = Math.max(1, k - 8); m <= Math.min(ch.length - 2, k + 8); m++) mark[ch[m]] = 1; }
      if (!any) break;
      for (let it = 0; it < 25; it++) { for (let i = 0; i < V.length; i++) { if (!mark[i]) { nxt[i] = cur[i]; continue; } const nb = V[i].sm; let sm = 0; for (const q of nb) sm += cur[q]; nxt[i] = nb.length > 1 ? cur[i] * 0.5 + 0.5 * sm / nb.length : cur[i]; } const t = cur; cur = nxt; nxt = t; } }
    for (let it = 0; it < 15; it++) { for (let i = 0; i < V.length; i++) { const nb = V[i].sm; let sm = 0; for (const q of nb) sm += cur[q]; nxt[i] = nb.length > 1 ? cur[i] * 0.5 + 0.5 * sm / nb.length : cur[i]; } const t = cur; cur = nxt; nxt = t; }   // a last light pass: no kink left where the passes above met
    for (let i = 0; i < V.length; i++) V[i].y = cur[i]; }
  // ---- distance along the graph to the nearest junction (3+ arms): the crown fades out there
  { const q = []; for (const v of V) { v.jd = v.nb.length >= 3 ? 0 : Infinity; if (!v.jd) q.push(v); }
    for (let h = 0; h < q.length; h++) { const v = q[h]; for (const j of v.nb) { const w = V[j]; const d = v.jd + Math.hypot(v.x - w.x, v.z - w.z); if (d < w.jd - 1e-6) { w.jd = d; q.push(w); } } } }
  // ---- segments in a spatial hash
  const segs = []; let reach = 0;
  for (const { r, ch } of chains) { const hw = r.width / 2; reach = Math.max(reach, hw + Math.max(r.left || 0, r.right || 0) + r.shoulder + BLEND);
    for (let i = 0; i < ch.length - 1; i++) { const a = V[ch[i]], b = V[ch[i + 1]]; const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 1e-3) continue; segs.push({ r, a, b, L, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L, hw, first: i === 0, last: i === ch.length - 2 }); } }
  const CELL = 16; const hash = new Map(); const hk = (i, j) => i * 100003 + j;
  for (const s of segs) { const i0 = Math.floor((Math.min(s.a.x, s.b.x) - reach) / CELL), i1 = Math.floor((Math.max(s.a.x, s.b.x) + reach) / CELL), j0 = Math.floor((Math.min(s.a.z, s.b.z) - reach) / CELL), j1 = Math.floor((Math.max(s.a.z, s.b.z) + reach) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = hk(i, j); let l = hash.get(k); if (!l) hash.set(k, l = []); l.push(s); } }
  /** The designed surface at (x, z): { y, zone: 'road' | 'walk' | 'verge', t (verge: 0 at the sidewalk .. 1 terrain) } or null. */
  function design(x, z) {
    const l = hash.get(hk(Math.floor(x / CELL), Math.floor(z / CELL))); if (!l) return null;
    const best = new Map();   // nearest segment per road
    for (const s of l) { let u = (x - s.a.x) * s.tx + (z - s.a.z) * s.tz; const uc = Math.max(0, Math.min(s.L, u)); const px = s.a.x + s.tx * uc, pz = s.a.z + s.tz * uc; const d = Math.hypot(x - px, z - pz);
      const side = (x - px) * -s.tz + (z - pz) * s.tx >= 0 ? 1 : -1;   // +1: right of the direction of travel (+x east, +z south)
      const sw = side > 0 ? (s.r.right || 0) : (s.r.left || 0); if (d > s.hw + sw + s.r.shoulder + BLEND) continue;
      const o = best.get(s.r); if (o && o.d <= d) continue; const f = uc / s.L;
      best.set(s.r, { d, s, sw, yc: s.a.y + (s.b.y - s.a.y) * f, jd: s.a.jd + (s.b.jd - s.a.jd) * f, end: (u < 0 && s.first && s.a.nb.length === 1) || (u > s.L && s.last && s.b.nb.length === 1), weak: (u < 0 && s.first && s.a.nb.length === 2) || (u > s.L && s.last && s.b.nb.length === 2) }); }
    if (!best.size) return null;
    // Past the end of a way that simply carries on as another way (one street in several pieces): the piece that runs alongside
    // the point defines the section. The round cap of the piece that ended has less crown there, and blending it in dipped the
    // centre line by up to the crown height (8 cm) for a few metres at every joint.
    if (best.size > 1) { const base = (r) => String(r.id).split(':')[0]; for (const [r, b] of best) if (b.weak) { let on = false; for (const [r2, b2] of best) if (r2 !== r && !b2.weak && (base(r2) === base(r) || (r.name && r2.name === r.name))) { on = true; break; } if (on) best.delete(r); } }   // (only when a piece of the SAME street covers the point: another street's sidewalk must not take over the roadway)
    let zone = 'verge'; const c = [];
    for (const b of best.values()) { const hw = b.s.hw; const cf = Math.max(0, Math.min(1, (b.jd - hw) / (hw + 4)));   // crown: none inside an intersection, full one road width out
      const edge = b.yc - CROWN * hw * cf; const k = b.sw ? KERB : 0;
      if (b.d <= hw && !b.end) { b.zone = 'road'; b.y = b.yc - CROWN * b.d * b.d / hw * cf; }   // parabolic crown (a tent's ridge ripples on the lattice)
      else if (b.d <= hw + b.sw && !b.end) { b.zone = 'walk'; b.y = edge + k + FALL * (b.d - hw); }
      else { b.zone = 'verge'; b.y = edge + k + FALL * b.sw; b.t = Math.max(0, Math.min(1, (b.d - hw - b.sw - b.s.r.shoulder) / BLEND)); if (b.end) b.t = Math.max(b.t, Math.min(1, b.d / BLEND)); }   // (a level shoulder behind the sidewalk, then the blend)
      c.push(b); if (b.zone === 'road') zone = 'road'; else if (b.zone === 'walk' && zone !== 'road') zone = 'walk'; }
    // the carriageway wins over a crossing road's sidewalk, a sidewalk over a verge; within a class the arms blend
    let ws = 0, y = 0, t = 1;
    for (const b of c) { if (b.zone !== zone) continue; const w = 1 / (Math.pow(zone === 'verge' ? b.t * BLEND : b.d, 4) + 0.05); ws += w; y += b.y * w; if (zone === 'verge') t = Math.min(t, b.t); }
    // two roads at different heights side by side (a fork on a hill, a hairpin): no class wins, the ground between them is
    // one bank blended by distance
    if (c.length > 1) { let lo = Infinity, hi = -Infinity; for (const b of c) { lo = Math.min(lo, b.yc); hi = Math.max(hi, b.yc); }
      if (hi - lo > 0.3) { let w2 = 0, y2 = 0; for (const b of c) { const w = 1 / (Math.pow(b.d, 4) + 0.05); w2 += w; y2 += b.y * w; } const m = Math.min(1, (hi - lo - 0.3) / 0.7); return { y: (y / ws) * (1 - m) + (y2 / w2) * m, zone, t: zone === 'verge' ? t : 0 }; } }
    return { y: y / ws, zone, t: zone === 'verge' ? t : 0 };
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  // ---- everything else must respect the designed section (trees, lamps, props, surface classes)
  const nearRoad = (x, z, m) => { const l = hash.get(hk(Math.floor(x / CELL), Math.floor(z / CELL))); let best = null; if (!l) return null;
    for (const s of l) { const u = (x - s.a.x) * s.tx + (z - s.a.z) * s.tz; if ((u < 0 && s.first && s.a.nb.length === 1) || (u > s.L && s.last && s.b.nb.length === 1)) continue; const uc = Math.max(0, Math.min(s.L, u)); const px = s.a.x + s.tx * uc, pz = s.a.z + s.tz * uc; const d = Math.hypot(x - px, z - pz);
      if (d < s.hw + m && (!best || d - s.hw < best.d - best.s.hw)) best = { d, s, px, pz }; }
    return best; };
  const st = { design, solid: [], keep: [], kerb: KERB };
  const box = () => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const v of V) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); } return { rect: { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0 + 2 * reach, d: z1 - z0 + 2 * reach, angle: 0 } }; };
  /** Lay the streets, sidewalks and verges into the terrain (once, before the building pads). */
  st.apply = () => { const B = box(); ctx.flatten(B, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z); const d = design(x, z); if (!d) return h; if (d.zone === 'road' || (d.zone === 'walk' && !hard.some((p) => p(x, z)))) return d.y; if (d.zone === 'walk' || d.t >= 1 || protect.some((p) => p(x, z))) return h; return d.y + (h - d.y) * smooth(d.t); } }); };
  /** After the last pad: the carriageways and sidewalks back to their design (pads resolve their difference inside the lot). */
  /** The level a lattice node beside a sidewalk takes: the design of the nearest walk point within a cell (2.1 m), or null. */
  st.skirtAt = (x, z) => { let best = null, bd = Infinity; for (const r of [0.7, 1.4, 2.1]) for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4 + (r > 1 ? 0.39 : 0), q = design(x + Math.cos(an) * r, z + Math.sin(an) * r); if (q && q.zone === 'walk' && r < bd) { bd = r; best = q.y; } } return best; };
  st.restore = () => { const B = box(); ctx.flatten(B, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z); const d = design(x, z); if (!d) return h; if (d.zone === 'road' || (d.zone === 'walk' && !hard.some((p) => p(x, z)))) return d.y; /* (even inside a footprint that overlaps the street: the node shapes the walk outside the wall) */ if (d.zone === 'walk' || st.solid.some((p) => p(x, z))) return h; return d.t > 0 || protect.some((p) => p(x, z)) || st.keep.some((p) => p(x, z)) ? h : d.y; } });
    // The skirt: every lattice node within a cell of a sidewalk takes the walk's level (the nearest walk point's design), whatever
    // stands there (a wall pad, a footprint's interior). On the 2 m lattice a walk is only as level as the nodes round it: one
    // node of a pad just behind the back edge pulled the walk up half a metre every time the walk line crossed a lattice row
    // (sawtooth humps every 16 m on a street 7 deg off the grid). Designed pads (`protect`) are left to the builder.
    ctx.flatten(B, { blend: 0, y: (x, z) => { const h = T.heightAt(x, z); const d = design(x, z); if (d && (d.zone === 'road' || d.zone === 'walk')) return h; if (protect.some((p) => p(x, z))) return h; const y = st.skirtAt(x, z); return y !== null && Math.abs(h - y) > 0.1 ? y : h; } });
    st.stations = stations(); };   // (shoulder: level with the sidewalk unless a wall pad stands there, st.keep)
  // ---- stations for the map check: every 1 m of every centreline, with the designed heights across the section
  function stations() {
    const out = [];
    for (const { r, ch } of chains) { const pts = []; const hw = r.width / 2; let carry = 0;   // exactly 1 m of arc length apart (the map check takes 2nd differences)
      for (let i = 0; i < ch.length - 1; i++) { const a = V[ch[i]], b = V[ch[i + 1]]; const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 1e-3) continue; const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
        let u = carry; for (; u < L; u += 1) { const x = a.x + tx * u, z = a.z + tz * u; if ((V[ch[0]].nb.length === 1 && Math.hypot(x - V[ch[0]].x, z - V[ch[0]].z) < hw + 3) || (V[ch[ch.length - 1]].nb.length === 1 && Math.hypot(x - V[ch[ch.length - 1]].x, z - V[ch[ch.length - 1]].z) < hw + 3)) continue;   /* (a dead end has no cross-section) */ const P = (o) => { const px = x - tz * o, pz = z + tx * o; const i = Math.floor((px - T.x0) / T.cell), j = Math.floor((pz - T.z0) / T.cell); for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const qx = T.x0 + (i + di) * T.cell, qz = T.z0 + (j + dj) * T.cell; if (st.solid.some((p) => p(qx, qz)) || hard.some((p) => p(qx, qz))) return null; }   /* a building stands in the corridor here */
            const d = design(px, pz); return d && d.zone !== 'verge' ? [px, pz, T.heightAt(px, pz), d.zone] : null; };   // [x, z, height as laid (nothing may move it afterwards), zone]
          pts.push({ x, z, jd: a.jd + (b.jd - a.jd) * u / L, c: P(0), eL: P(hw * 0.5), eR: P(-hw * 0.5), wL: r.left ? P(-(hw + r.left * 0.5)) : null, wR: r.right ? P(hw + r.right * 0.5) : null }); } carry = u - L; }
      out.push({ id: r.id, name: r.name || null, hw, pts }); }
    return out;
  }
  /** Is (x, z) on a carriageway (or within m of one)? */
  st.inRoad = (x, z, m = 0) => !!nearRoad(x, z, m);
  /** Where a tree / post standing on (or within m of) a carriageway belongs: just behind the sidewalk on its own side. null = it is clear already. */
  st.toVerge = (x, z, m = 0.6) => { const b = nearRoad(x, z, m); if (!b) return null; const s = b.s; const side = (x - b.px) * -s.tz + (z - b.pz) * s.tx >= 0 ? 1 : -1; const out = s.hw + (side > 0 ? (s.r.right || 0) : (s.r.left || 0)) + 0.9; return [b.px - s.tz * side * out, b.pz + s.tx * side * out]; };
  /** Surface class the design calls for: 'asphalt' on a carriageway, 'concrete' on a sidewalk, null elsewhere (ctx.paintSurface). */
  st.surface = (x, z) => { const d = design(x, z); if (!d || d.zone === 'verge' || hard.some((p) => p(x, z))) return null; return d.zone === 'road' ? 'asphalt' : 'concrete'; };
  ctx.streets = st; return st;
}
