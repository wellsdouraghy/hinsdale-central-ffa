// Height of the Earl of March backdrop grid (gen.terrain: 20 m cells over +-1500 m, metres above the ground round the school), shared
// by the descriptor (terrain.outside: ground beyond the satellite rectangle) and the backdrop builder (terrain.js).
// The grid arrives with gen.json, so it is installed by the campus builder; until then the level is 0.
let grid = null;
const EDGE_Y = -6;    // the level the grid fades to at its outer edge (Kanata falls gently toward the Ottawa River to the north-east)
export function setBackdrop(t) { grid = t && t.h ? t : null; }
/** Fade weight: 1 inside, 0 on the outer edge of the grid (last 520 m). */
export function backdropEdge(x, z) { if (!grid) return 0; const hw = (grid.n - 1) * grid.step / 2, cx = grid.x0 + hw, cz = grid.z0 + hw; const k = Math.max(0, Math.min(1, (hw - Math.max(Math.abs(x - cx), Math.abs(z - cz))) / 520)); return k * k * (3 - 2 * k); }
export function backdropY(x, z) {
  const t = grid; if (!t) return 0;
  const fx = Math.min(Math.max((x - t.x0) / t.step, 0), t.n - 1.001), fz = Math.min(Math.max((z - t.z0) / t.step, 0), t.n - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j; const H = (ii, jj) => t.h[jj * t.n + ii] / 10;
  const h = H(i, j) * (1 - a) * (1 - b) + H(i + 1, j) * a * (1 - b) + H(i, j + 1) * (1 - a) * b + H(i + 1, j + 1) * a * b;
  const e = backdropEdge(x, z); return h * e + EDGE_Y * (1 - e);
}
export const BACKDROP_EDGE_Y = EDGE_Y;
