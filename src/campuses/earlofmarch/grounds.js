// Earl of March grounds: the track and its field, courts, car parks, paving, the fence line, streetscape.
import { hillFence } from '../marin/kit.js';
import { PLAY_EDGE } from './kit.js';

export function groundPads() {}
/** (x, z, tree) => true where no scanned tree may stand (open play space, paving, fields). */
export function KEEP_OPEN(ctx) { return (x, z) => ctx.surfaceAt(x, z) !== 'grass'; }
function boundary(ctx) { hillFence(ctx, [...PLAY_EDGE, PLAY_EDGE[0]], { h: 2.4, every: 3 }); }
export function buildGrounds(ctx) { boundary(ctx); }
