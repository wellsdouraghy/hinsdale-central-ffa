// The John G. Mlacak Centre (arena + community halls, 2500 Campeau Drive) and the Ottawa Public Library's Beaverbrook
// branch that stands against its north end: the two public buildings inside the fence south of the school.
import { ensureCCW, MAT, mat, MLACAK_ID, LIBRARY_ID } from './kit.js';
import { offsetRing } from './lib.js';

const ringOf = (ctx, id) => { const b = ctx.data.buildings.find((q) => q.id === id); return b ? ensureCCW(b.outer[0]) : null; };
export const CIVIC = { [MLACAK_ID]: { floor: 0.9, name: 'Mlacak Centre' }, [LIBRARY_ID]: { floor: 0.35, name: 'Beaverbrook Library' } };
export function civicPads(ctx) { for (const id of [MLACAK_ID, LIBRARY_ID]) { const r = ringOf(ctx, id); if (r) ctx.flatten({ outline: offsetRing(r, 2.5) }, { y: CIVIC[id].floor - 0.02, blend: 4 }); } }
export function buildCivic(ctx) {
  const { B, gen } = ctx;
  for (const id of [MLACAK_ID, LIBRARY_ID]) { const r = ringOf(ctx, id); if (!r) continue; const info = gen.buildings[String(id)]; const fl = CIVIC[id].floor, top = info.top;
    const m = mat(ctx, id === MLACAK_ID ? MAT.mlacakWall : MAT.blockWhite); m.prism(r, fl - 0.6, top, 1, false); m.setColor(1, 1, 1);
    const g = mat(ctx, MAT.gravel, 1, [1.4, 1.4, 1.35]); g.poly(r, null, top + 0.005, (x, z) => [x / 3, z / 3]); g.setColor(1, 1, 1);
    B.c('concrete').prism(r, fl - 0.8, top, 1, true);
    (ctx.buildingRings = ctx.buildingRings || []).push(r); (ctx.footprints = ctx.footprints || []).push({ id: CIVIC[id].name, ring: r, roof: top, floor: fl }); }
}
