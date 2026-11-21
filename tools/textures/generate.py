#!/usr/bin/env python3
"""Procedural, tileable building textures from a campus material sheet (campus-agnostic; see README.md).

  python tools/textures/generate.py <campus-id> [texture-name ...] [--preview DIR]

Reads  tools/textures/campuses/<id>/materials.json  ("textures": { name: spec })
Writes public/campuses/<id>/tex/<name>_c.jpg (albedo, sRGB), <name>_n.jpg (tangent normal, OpenGL +Y) and
       public/campuses/<id>/tex/tex.json (the runtime manifest read by src/world/campusTextures.js).

Every texture is ORIGINAL: built from numbers in the sheet (unit sizes, course heights, joint widths, linear-RGB
swatches measured on the reference photos). No pixel of a reference photo is used. Sizes are in metres; a tile always
holds a whole number of courses / units, so it repeats without a seam and the game can line courses up with floor
lines and window heads (spec.size_m is a target, the real tile size is written to tex.json as sizeM).

Kinds: brick, block, pavers, panels (all "masonry": units + joints), stucco, concrete, siding (lap), shingle_siding,
board_batten, metal_seam, clay_tile, asphalt_shingle, court, planks.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))


# ---------------------------------------------------------------------------------------------- helpers
def to_srgb(lin):
    lin = np.clip(lin, 0, 1)
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)


def noise(shape, sigma, rng, aniso=None):
    """Tileable smooth noise, zero mean / unit std. sigma in px (scalar or (sy, sx))."""
    n = rng.standard_normal(shape).astype(np.float32)
    s = aniso if aniso is not None else sigma
    if np.max(s) > 0.3: n = ndi.gaussian_filter(n, s, mode='wrap')
    return (n - n.mean()) / (n.std() + 1e-9)


def fbm(shape, base_sigma, rng, octaves=4, gain=0.5):
    out = np.zeros(shape, np.float32); a = 1.0; s = base_sigma; tot = 0
    for _ in range(octaves):
        out += a * noise(shape, s, rng); tot += a * a; a *= gain; s /= 2.0
    return out / np.sqrt(tot)


def normal_map(height_m, px_m, strength=1.0):
    """height in metres, px_m = metres per pixel (x, y). Image row 0 is the TOP of the tile (v = 1)."""
    dx = (np.roll(height_m, -1, 1) - np.roll(height_m, 1, 1)) / (2 * px_m[0])
    dy = (np.roll(height_m, -1, 0) - np.roll(height_m, 1, 0)) / (2 * px_m[1])     # d/d(row) = -d/dv
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(dx)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5


def pick_palette(rng, n, colors, weights=None):
    colors = np.asarray(colors, np.float32)
    w = np.asarray(weights if weights else [1] * len(colors), np.float64); w = w / w.sum()
    return colors[rng.choice(len(colors), size=n, p=w)]


def layout(W, H, pw, ph, row_h, row_fn):
    """Units in rows. row_fn(r) -> (widths[] in m (periodic over W), offset m). Returns per-pixel:
    uid, ex / ey (distance to the unit's vertical / horizontal edge, m), ux / uy (0..1 inside the unit), uw (unit width)."""
    rows = int(round(H / row_h)); xs = (np.arange(pw) + 0.5) * W / pw; ys = (np.arange(ph) + 0.5) * H / ph
    uid = np.zeros((ph, pw), np.int32); ex = np.zeros((ph, pw), np.float32); ux = np.zeros_like(ex); uw = np.zeros_like(ex)
    ridx = np.minimum((ys / row_h).astype(int), rows - 1); yy = ys - ridx * row_h
    ey = np.minimum(yy, row_h - yy).astype(np.float32); uy = (yy / row_h).astype(np.float32)
    base = 0
    for r in range(rows):
        widths, off = row_fn(r); widths = np.asarray(widths, np.float64); per = widths.sum(); reps = int(round(W / per))
        assert abs(reps * per - W) < 1e-6 * max(1, W) + 1e-4, f'row {r}: period {per} does not divide the tile width {W}'
        edges = np.concatenate([[0], np.cumsum(np.tile(widths, reps))]); u = np.mod(xs - off, W)
        k = np.clip(np.searchsorted(edges, u, side='right') - 1, 0, len(edges) - 2); a = edges[k]; b = edges[k + 1]
        rows_mask = ridx == r
        uid[rows_mask] = base + k; ex[rows_mask] = np.minimum(u - a, b - u); ux[rows_mask] = (u - a) / (b - a); uw[rows_mask] = b - a
        base += len(edges) - 1
    return uid, ex, np.repeat(ey[:, None], pw, 1), ux, np.repeat(uy[:, None], pw, 1), uw, base


def fit(target, step, mult=1):
    return max(mult, int(round(target / step / mult)) * mult) * step


# ---------------------------------------------------------------------------------------------- masonry
def smooth01(x):
    x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)


def masonry(sp, rng, kind):
    """Units + joints. Everything a real wall has that a flat 'brick pattern' lacks: units that differ from each other
    (palette, tone, hue, kiln flashing, dark hearts, scum), arrises that are not ruler-straight, chipped edges, a sanded
    mortar that sits back from the face, a face texture (wire-cut / sand / split / smooth) and a little baked top-light
    so the joints read at distances where the normal map has mipped away."""
    L, Hh = sp['unit']; j = sp.get('joint', 0.010); P = L + j; ch = Hh + j; bond = sp.get('bond', 'running')
    head = (L - j) / 2 + j
    mult_r = {'running': 2, 'third': 3, 'stack': 1, 'flemish': 2, 'common': 6, 'english': 2}[bond]
    mult_c = {'flemish': 3, 'third': 1}.get(bond, 1)
    W = fit(sp['size_m'][0], P, mult_c); H = fit(sp['size_m'][1], ch, mult_r); pw, ph = sp.get('px', [1024, 1024])
    def row(r):
        if bond == 'running': return [P], (P / 2 if r % 2 else 0)
        if bond == 'third': return [P], (r % 3) * P / 3
        if bond == 'stack': return [P], 0
        if bond == 'flemish': return [P, head], (0 if r % 2 == 0 else (P + head) / 2)
        if bond == 'common': return ([head], head / 2) if r % 6 == 5 else ([P], (P / 2 if r % 2 else 0))
        if bond == 'english': return ([head], head / 2) if r % 2 else ([P], 0)
    uid, ex, ey, ux, uy, uw, n = layout(W, H, pw, ph, ch, row)
    px = (W / pw, H / ph); shape = (ph, pw); pm = float(np.sqrt(px[0] * px[1]))
    if sp.get('no_h_joint'): ey = np.full_like(ey, 1.0)      # one continuous course (coping / band stones): vertical joints only
    U = lambda lo, hi: rng.uniform(lo, hi, n).astype(np.float32)
    N = lambda s: (rng.standard_normal(n) * s).astype(np.float32)
    # ---- shape: wobbly arrises, units a hair different in size, chipped edges
    wob = sp.get('wobble', 0.0011) * fbm(shape, 0.018 / pm, rng, 3)
    inset = np.abs(N(sp.get('size_var', 0.0007)))[uid]
    d = np.minimum(ex, ey) - j / 2 + wob - inset
    chipn = fbm(shape, 0.005 / pm, rng, 2) + 0.6 * N(1.0)[uid]
    chipm = np.clip((chipn - sp.get('chip_thresh', 1.75)) / 0.7, 0, 1) * sp.get('chips', 1.0)
    bev = max(sp.get('bevel', 0.0022), 1.15 * pm)
    face = smooth01(d / bev)                                   # 0 in the joint, 1 on the unit face
    chip = np.clip(1 - d / (0.009 * chipm + 1e-6), 0, 1) * (chipm > 0) * face   # spalled arris: the body shows, set back
    # ---- colour of each unit
    cols = np.asarray(sp['colors'], np.float32); w = np.asarray(sp.get('weights') or [1] * len(cols), np.float64); w = w / w.sum()
    if sp.get('target'):       # the swatch is the mean of the unit FACES (mortar is measured separately)
        cols = cols * (np.asarray(sp['target'], np.float32) / (cols * w[:, None]).sum(0))[None, :]
    base = cols[rng.choice(len(cols), size=n, p=w)]
    unit_w = np.zeros(n, np.float32); unit_w[uid.ravel()] = uw.ravel()
    if sp.get('header_colors'):   # Flemish / English / common bond: headers (short units) burnt darker than the stretchers
        hb = pick_palette(rng, n, sp['header_colors'], sp.get('header_weights')); pick = (unit_w < P * 0.75) & (rng.random(n) < sp.get('header_frac', 1.0))
        base = np.where(pick[:, None], hb, base)
    tone = np.exp(N(sp.get('unit_var', 0.08)))
    hue = 1 + rng.standard_normal((n, 3)).astype(np.float32) * sp.get('hue_var', 0.025 if kind == 'brick' else 0.006)
    col = (base * tone[:, None] * hue)[uid]
    # kiln effects inside a unit: one end darker than the other, flashed (darker / lighter) arrises, a dark heart on the
    # units that sat inside the stack, blotches whose strength differs from unit to unit, a pale scum on a few
    grad = (ux - 0.5) * N(sp.get('grad', 0.07))[uid] + (uy - 0.5) * N(sp.get('grad', 0.07) * 0.5)[uid]
    edge_d = np.clip(np.minimum(ex, ey) / (0.4 * Hh), 0, 1)
    flash = (1 - edge_d) ** 1.5 * U(-1, 0.6)[uid] * sp.get('flash', 0.08)
    heart_u = (rng.random(n) < sp.get('heart_frac', 0.12)).astype(np.float32) * U(0.4, 1.0)
    heart = np.exp(-((uy - 0.5) / 0.3) ** 2 - ((ux - 0.5) / 0.42) ** 4) * heart_u[uid] * sp.get('heart', 0.22)
    blot = fbm(shape, 0.028 / pm, rng, 3); blot_u = U(0.2, 1.6)[uid]
    grain = fbm(shape, sp.get('grain_px', 1.3), rng, 3)
    col = col * (1 + grad + flash - heart + sp.get('blot', 0.05) * blot * blot_u + sp.get('grain', 0.045) * grain)[..., None]
    scum_u = (rng.random(n) < sp.get('scum_frac', 0.06)).astype(np.float32) * U(0.3, 1.0)
    scum = np.clip(scum_u[uid] * (0.55 + 0.45 * fbm(shape, 0.02 / pm, rng, 2)), 0, 1) * sp.get('scum', 0.22)
    col = col * (1 - scum[..., None]) + np.asarray(sp.get('scum_color', [0.55, 0.52, 0.46]), np.float32) * scum[..., None]
    if sp.get('spots', 0) > 0:     # iron spots / aggregate
        s = noise(shape, 0.8, rng); spots = np.clip((s - 2.35) * 2, 0, 1) * sp['spots']
        col = col * (1 - spots[..., None]) + np.asarray(sp.get('spot_color', [0.05, 0.035, 0.03]), np.float32) * spots[..., None]
    # ---- face texture (height, with a trace in the colour)
    tex = sp.get('texture', 'wirecut' if kind == 'brick' else 'sand'); fr = sp.get('face_rough', 0.00035)
    if tex == 'wirecut': rough = 0.6 * noise(shape, 0, rng, aniso=(7, 0.55)) + 0.5 * fbm(shape, 1.6, rng, 3)     # vertical drag lines of the cutting wire
    elif tex == 'split': rough = 1.5 * fbm(shape, 0.012 / pm, rng, 5, 0.6) + 0.4 * noise(shape, 0.8, rng)          # split-face block / rock face
    elif tex == 'smooth': rough = 0.35 * fbm(shape, 3.0, rng, 3)
    else: rough = fbm(shape, 1.4, rng, 4, 0.6)                                                                    # sand-faced / moulded
    pits = np.clip((noise(shape, 0.75, rng) - 2.1) * 1.4, 0, 1) * sp.get('pits', 0.6)
    col = col * (1 + 0.035 * rough - 0.3 * pits - 0.22 * chip)[..., None]
    # ---- mortar: sanded, a touch darker deep in the joint, smeared a hair onto the arrises
    mgrain = noise(shape, 0.7, rng); mblot = fbm(shape, 0.05 / pm, rng, 3)
    mortar = np.asarray(sp['mortar'], np.float32) * (1 + sp.get('mortar_grain', 0.09) * mgrain + 0.07 * mblot)[..., None]
    sand = np.clip((noise(shape, 0.6, rng) - 1.9) * 1.2, 0, 1)[..., None]
    mortar = mortar * (1 - 0.35 * sand) + 0.35 * sand * np.asarray(sp.get('sand_color', [0.2, 0.17, 0.14]), np.float32)
    smear = np.clip(1 - d / 0.0035, 0, 1) * face * sp.get('smear', 0.18) * np.clip(0.5 + 0.5 * mblot, 0, 1)
    col = col * (1 - smear[..., None]) + mortar * smear[..., None]
    deep = np.clip(-d / (j / 2), 0, 1)
    rgb = col * face[..., None] + mortar * (1 - face[..., None]) * (1 - sp.get('ao', 0.22) * (0.35 + 0.65 * deep))[..., None]
    # ---- height: the face stands proud of a tooled, concave joint
    depth = sp.get('joint_depth', 0.004)
    tilt = rng.standard_normal((n, 2)).astype(np.float32) * sp.get('tilt', 0.0006); lift = N(sp.get('lift', 0.0005))
    h = face * (depth + lift[uid] + (ux - 0.5) * uw * tilt[uid, 0] + (uy - 0.5) * ch * tilt[uid, 1] + fr * rough - 0.0012 * pits - 0.0035 * chip) \
        + (1 - face) * (0.0005 * mgrain - 0.0012 * deep)
    # ---- baked top-light: the underside of every bed joint is in the shade of the unit above it, the top arris catches light
    k = max(1, int(round(0.004 / px[1]))); up = np.roll(h, k, 0); dn = np.roll(h, -k, 0)
    shade = np.clip((up - h) / depth, 0, 1); lit = np.clip((h - up) / depth, 0, 1) * face
    rgb = rgb * (1 - sp.get('bake_shadow', 0.28) * shade + sp.get('bake_light', 0.07) * lit)[..., None]
    alt = {'running': (7 * P, 6 * ch), 'third': (5 * P, 6 * ch), 'stack': (3 * P, 5 * ch), 'flemish': (2 * (P + head), 6 * ch), 'common': (7 * P, 6 * ch), 'english': (5 * P, 6 * ch)}[bond]
    return rgb, h, (W, H), {'altM': [round(alt[0], 5), round(alt[1], 5)], 'face_target': bool(sp.get('target'))}


# ---------------------------------------------------------------------------------------------- coatings
def stucco(sp, rng, kind):
    W, H = sp['size_m']; pw, ph = sp.get('px', [1024, 1024]); px = (W / pw, H / ph)
    finish = sp.get('finish', 'sand')
    g_mm = {'smooth': 1.5, 'sand': 2.5, 'dash': 6.0, 'lace': 14.0}[finish]; amp = {'smooth': 0.00025, 'sand': 0.0007, 'dash': 0.0018, 'lace': 0.0022}[finish]
    h = amp * fbm((ph, pw), max(0.6, g_mm / 1000 / px[0]), rng, 4)
    if finish == 'lace':   # skip-trowel: flattened plateaus
        h = np.clip(h, -amp, amp * 0.35)
    mott = fbm((ph, pw), 0.22 / px[0], rng, 3)
    # trowel sweeps: long shallow ridges in changing directions (two anisotropic layers), strongest on hand finishes
    sweep = 0.6 * noise((ph, pw), 0, rng, aniso=(0.012 / px[1], 0.16 / px[0])) + 0.4 * noise((ph, pw), 0, rng, aniso=(0.11 / px[1], 0.02 / px[0]))
    h = h + amp * sp.get('trowel', {'smooth': 0.5, 'sand': 0.35, 'dash': 0.2, 'lace': 0.6}[finish]) * sweep
    pin = np.clip((noise((ph, pw), 0.8, rng) - 2.3) * 1.5, 0, 1) * sp.get('pinholes', 0.5)
    h = h - 0.0008 * pin
    col = np.asarray(sp['color'], np.float32)[None, None, :] * (1 + sp.get('mottle', 0.035) * mott[..., None] + sp.get('grain', 0.03) * (h / amp)[..., None] * 0.5 - 0.25 * pin[..., None])
    if sp.get('boards'):     # board-formed concrete: plank lines, each plank its own tone and grain, a row of tie holes
        bw = sp['boards']; nb = max(1, int(round(H / bw))); yy = (np.arange(ph) + 0.5) * px[1]; bi = np.minimum((yy / (H / nb)).astype(int), nb - 1)
        ed = np.minimum(yy - bi * (H / nb), (bi + 1) * (H / nb) - yy); line = np.clip(1 - ed / max(0.003, 1.2 * px[1]), 0, 1)[:, None]
        bt = (1 + 0.05 * rng.standard_normal(nb))[bi][:, None]; bg = noise((ph, pw), 0, rng, aniso=(0.7, 0.12 / px[0]))
        col = col * (bt * (1 - 0.3 * line) * (1 + 0.035 * bg))[..., None]; h = h - 0.0025 * line + 0.0004 * bg + 0.0008 * (bt - 1) / 0.05
    if kind == 'concrete':
        pits = np.clip((noise((ph, pw), 1.1, rng) - 2.4) * 1.5, 0, 1)
        col *= (1 - 0.35 * pits[..., None]); h -= 0.0012 * pits
        if sp.get('broom'):   # broom finish: fine parallel ridges
            br = noise((ph, pw), 0, rng, aniso=(0.6, 14) if sp['broom'] == 'x' else (14, 0.6)); h += 0.0004 * br; col *= (1 + 0.025 * br[..., None])
    jw = sp.get('joint', 0.012)
    for axis, size in ((1, sp.get('panel', [0, 0])[0]), (0, sp.get('panel', [0, 0])[1])):   # control joints / panel reveals
        if not size: continue
        n = max(1, int(round((W if axis == 1 else H) / size))); t = (np.arange(pw if axis == 1 else ph) + 0.5) * ((W if axis == 1 else H) / (pw if axis == 1 else ph))
        per = (W if axis == 1 else H) / n; dd = np.abs(np.mod(t + per / 2, per) - per / 2); m = np.clip(1 - (dd - jw / 2) / max(jw * 0.5, 1.2 * px[0]), 0, 1)
        m = m[None, :] if axis == 1 else m[:, None]
        h = h - sp.get('joint_depth', 0.006) * m; col = col * (1 - 0.45 * m[..., None])
    if sp.get('panel_var') and sp.get('panel', [0, 0])[0] and sp['panel'][1]:   # each scored panel / slab its own tone, a touch warmer or cooler (pours differ)
        nx = max(1, int(round(W / sp['panel'][0]))); ny = max(1, int(round(H / sp['panel'][1])))
        ix = np.minimum((np.arange(pw) * nx) // pw, nx - 1); iy = np.minimum((np.arange(ph) * ny) // ph, ny - 1)
        tone = np.exp(rng.standard_normal((ny, nx)) * sp['panel_var']).astype(np.float32); warm = (rng.standard_normal((ny, nx)) * sp['panel_var'] * 0.25).astype(np.float32)
        tn = tone[iy][:, ix]; wm = warm[iy][:, ix]
        col = col * tn[..., None] * np.stack([1 + wm, np.ones_like(wm), 1 - wm], -1)
    pn = sp.get('panel', [0, 0])   # the second sample is shifted by whole panels, so scored joints stay registered in the cross-fade
    alt = [round(pn[0] * max(1, round(W * 0.37 / pn[0])), 4) if pn[0] else round(W * 0.37, 4), round(pn[1] * max(1, round(H * 0.6 / pn[1])), 4) if pn[1] else round(H * 0.43, 4)]
    return col, h, (W, H), {'altM': alt}


def siding(sp, rng, kind):
    W = sp['size_m'][0]; e = sp.get('exposure', sp['size_m'][1]); H = fit(sp['size_m'][1], e); pw, ph = sp.get('px', [1024, 1024]); px = (W / pw, H / ph)
    base = np.asarray(sp.get('color', sp.get('colors', [[0.5, 0.5, 0.5]])[0]), np.float32)
    if kind == 'siding':        # horizontal lap boards: each board leans out toward its bottom edge
        uid, ex, ey, ux, uy, uw, n = layout(W, H, pw, ph, e, lambda r: ([W / max(1, round(W / sp.get('board_len', 3.6)))], rng.uniform(0, W)))
        h = sp.get('lap', 0.012) * uy + 0.0003 * noise((ph, pw), 0, rng, aniso=(0.7, 30))
        shadow = np.clip(1 - (1 - uy) * e / 0.012, 0, 1)                    # under the board above
        butt = np.clip(1 - ex / max(0.0015, px[0]), 0, 1) * 0.5
        tone = 1 + sp.get('unit_var', 0.03) * rng.standard_normal(n).astype(np.float32)[uid]
        col = base * (tone * (1 - 0.5 * shadow) * (1 - butt))[..., None] * (1 + 0.03 * noise((ph, pw), 0, rng, aniso=(0.8, 40))[..., None])
        col = col * (1 + sp.get('chalk', 0.03) * fbm((ph, pw), 0.08 / px[0], rng, 3)[..., None] - 0.05 * (uy ** 3)[..., None])   # chalking, dirt on the drip edge
        alt = (W * 0.5, e * max(1, round(H / e / 2)))
    elif kind == 'shingle_siding':   # sawn cedar shingles, random widths, staggered butts, weathered
        lo, hi = sp.get('widths', [0.09, 0.22])
        def row(r):
            ws = [];
            while sum(ws) < W - hi: ws.append(rng.uniform(lo, hi))
            ws.append(W - sum(ws)); return ws, rng.uniform(0, W)
        uid, ex, ey, ux, uy, uw, n = layout(W, H, pw, ph, e, row)
        drop = rng.uniform(0, sp.get('stagger', 0.012), n).astype(np.float32)[uid]
        h = sp.get('lap', 0.010) * np.clip(uy + drop / e, 0, 1) + 0.0005 * noise((ph, pw), 0, rng, aniso=(26, 0.7))
        shadow = np.clip(1 - ((1 - uy) * e - drop) / 0.010, 0, 1); gap = np.clip(1 - ex / max(0.002, px[0]), 0, 1)
        pal = pick_palette(rng, n, sp.get('colors') or [sp['color']], sp.get('weights')) * (1 + sp.get('unit_var', 0.1) * rng.standard_normal(n).astype(np.float32))[:, None]
        grainv = noise((ph, pw), 0, rng, aniso=(34, 0.8))
        col = pal[uid] * ((1 - 0.55 * shadow) * (1 - 0.6 * gap))[..., None] * (1 + sp.get('grain', 0.07) * grainv[..., None])
        # each shingle: its own grain direction strength, a cupped face, a butt that has weathered darker than the top
        cup = (np.abs(ux - 0.5) * 2) ** 2 * rng.uniform(-0.6, 1.0, n).astype(np.float32)[uid]
        wx = np.clip(uy, 0, 1) ** 2 * rng.uniform(0.3, 1.0, n).astype(np.float32)[uid]
        col = col * (1 - sp.get('butt_weather', 0.16) * wx - 0.05 * cup)[..., None] * (1 + 0.05 * fbm((ph, pw), 0.03 / px[0], rng, 2)[..., None])
        split = np.clip((noise((ph, pw), 0, rng, aniso=(0.05 / px[1], 0.6)) - 2.2) * 1.5, 0, 1) * np.clip(uy * 1.5, 0, 1)     # checks running up from the butt
        col = col * (1 - 0.4 * split[..., None]); h = h - 0.004 * gap + 0.0015 * cup - 0.002 * split
        alt = (W * 0.43, e * max(1, round(H / e / 2)))
    else:                         # board and batten (vertical)
        sp_b = sp.get('spacing', 0.3); n = max(1, int(round(W / sp_b))); per = W / n; t = (np.arange(pw) + 0.5) * px[0]
        dd = np.abs(np.mod(t + per / 2, per) - per / 2); bat = np.clip(1 - (dd - sp.get('batten', 0.045) / 2) / max(0.003, px[0]), 0, 1)[None, :].repeat(ph, 0)
        g = noise((ph, pw), 0, rng, aniso=(40, 0.8)); h = 0.018 * bat + 0.0004 * g
        edge = np.clip(np.roll(bat, 3, 1) - bat, 0, 1) + 0.5 * np.clip(np.roll(bat, -3, 1) - bat, 0, 1)      # shadow line beside each batten
        col = base[None, None, :] * (1 + 0.05 * g[..., None]) * (1 + 0.05 * bat[..., None]) * (1 - 0.45 * edge[..., None])
        streak = noise((ph, pw), 0, rng, aniso=(0.5 / px[1], 0.012 / px[0]))                              # run-off down the boards
        col = col * (1 + sp.get('streak', 0.04) * streak[..., None]); alt = (per * max(1, n // 2), H * 0.41)
    return col, h, (W, H), {'altM': [round(alt[0], 4), round(alt[1], 4)]}


def metal_seam(sp, rng, kind):
    # ribs / seams run along V (the tile's height): give the texture `rot: 90` when they are horizontal on the building.
    # `rib_color` + `sharp` draw the rib as its own flat-topped strip (louvre blades in front of dark glass, the pale
    # highlight line of a ribbed panel); `posts` = [spacing, width] adds members across the ribs (louvre carriers).
    s = sp['seam']; W = fit(sp['size_m'][0], s); H = sp['size_m'][1]; pw, ph = sp.get('px', [512, 512]); px = (W / pw, H / ph)
    t = (np.arange(pw) + 0.5) * px[0]; dd = np.abs(np.mod(t + s / 2, s) - s / 2)
    rib = np.clip((1 - dd / max(sp.get('rib', 0.012), 1.5 * px[0])) * sp.get('sharp', 1.0), 0, 1)[None, :].repeat(ph, 0)
    oil = noise((ph, pw), 0.25 / px[0], rng); streak = noise((ph, pw), 0, rng, aniso=(60, 1.2))
    h = sp.get('rib_h', 0.03) * rib + 0.0006 * oil
    shade = np.clip(np.roll(rib, 3, 1) - rib, 0, 1)                    # the rib's shadow on the pan beside it
    base = np.asarray(sp['color'], np.float32)[None, None, :] * (1 + 0.03 * oil[..., None] + sp.get('streak', 0.03) * streak[..., None])
    if sp.get('rib_color'): col = base * (1 - rib[..., None]) + np.asarray(sp['rib_color'], np.float32)[None, None, :] * rib[..., None] * (1 + 0.04 * oil[..., None])
    else: col = base * (1 + 0.12 * rib[..., None])
    col = col * (1 - sp.get('shade', 0.4) * shade[..., None])
    if sp.get('posts'):
        ps, pwid = sp['posts']; n = max(1, int(round(H / ps))); y = (np.arange(ph) + 0.5) * px[1]; per = H / n
        pm = np.clip(1 - (np.abs(np.mod(y + per / 2, per) - per / 2) - pwid / 2) / max(1.2 * px[1], 0.004), 0, 1)[:, None].repeat(pw, 1)
        col = col * (1 - pm[..., None]) + np.asarray(sp.get('post_color', sp.get('rib_color', sp['color'])), np.float32)[None, None, :] * pm[..., None] * (0.8 + 0.2 * rib[..., None])
        h = np.maximum(h, sp.get('rib_h', 0.03) * 0.8 * pm)
    return col, h, (W, H), {'altM': [round(s * max(1, round(W / s / 2)), 4), round(H * (0.5 if sp.get('posts') else 0.41), 4)]}


def clay_tile(sp, rng, kind):
    p = sp.get('pitch', 0.21); e = sp.get('exposure', 0.36); W = fit(sp['size_m'][0], p); H = fit(sp['size_m'][1], e); pw, ph = sp.get('px', [1024, 1024]); px = (W / pw, H / ph)
    uid, ex, ey, ux, uy, uw, n = layout(W, H, pw, ph, e, lambda r: ([p], 0))
    # mission barrel tile: caps (convex) over pans (concave); each course steps down toward the eave (bottom of the tile)
    prof = np.cos((ux - 0.5) * 2 * np.pi)                        # +1 on the cap crest, -1 in the pan
    cap = prof > -0.25
    h = 0.045 * np.where(cap, prof, -0.25 - 0.3 * (prof + 0.25)) + 0.016 * uy      # each course is highest at its butt (eave side = bottom of the row)
    shadow = np.clip(1 - uy * e / 0.035, 0, 1)                   # cast by the butt of the course above
    butt = np.clip(1 - (1 - uy) * e / 0.012, 0, 1)                # lit edge of the tile's own butt
    pal = pick_palette(rng, n * 2, sp['colors'], sp.get('weights')) * (1 + sp.get('unit_var', 0.1) * rng.standard_normal(n * 2).astype(np.float32))[:, None]
    round_ = 0.42 + 0.62 * np.clip(prof * 0.5 + 0.5, 0, 1) ** 0.8  # barrel shading baked in: crests light, pans deep in shade
    col = pal[uid * 2 + cap.astype(np.int32)] * (1 + 0.05 * fbm((ph, pw), 3, rng, 3)[..., None]) * (round_ * (1 - 0.55 * shadow) * (1 + 0.12 * butt * cap))[..., None]
    lich = np.clip((fbm((ph, pw), 0.04 / px[0], rng, 3) - 1.5) * 1.2, 0, 1) * sp.get('lichen', 0.25) * cap             # soot / lichen patches on the crests
    col = col * (1 - 0.45 * lich[..., None])
    return col, h, (W, H), {'altM': [round(p * max(1, round(W / p / 2)), 4), round(e * max(1, round(H / e / 2)), 4)]}


def asphalt_shingle(sp, rng, kind):
    e = sp.get('exposure', 0.143); tab = sp.get('tab', 0.305); W = fit(sp['size_m'][0], tab); H = fit(sp['size_m'][1], e, 2); pw, ph = sp.get('px', [1024, 1024]); px = (W / pw, H / ph)
    arch = sp.get('style', 'architectural') == 'architectural'
    def row(r):
        if not arch: return [tab], (tab / 2 if r % 2 else 0)
        ws = []
        while sum(ws) < W - 0.4: ws.append(rng.uniform(0.12, 0.38))
        ws.append(W - sum(ws)); return ws, rng.uniform(0, W)
    uid, ex, ey, ux, uy, uw, n = layout(W, H, pw, ph, e, row)
    thick = (rng.random(n) < 0.5).astype(np.float32)[uid] if arch else np.zeros((ph, pw), np.float32)
    gran = noise((ph, pw), 0.7, rng); lip = np.clip(1 - (1 - uy) * e / 0.008, 0, 1); gap = np.clip(1 - ex / max(0.003, px[0]), 0, 1)
    pal = pick_palette(rng, n, sp['colors'], sp.get('weights')) * (1 + sp.get('unit_var', 0.08) * rng.standard_normal(n).astype(np.float32))[:, None]
    col = pal[uid] * (1 + 0.16 * gran[..., None]) * ((1 - 0.45 * lip) * (1 - 0.35 * gap * (0 if arch else 1)) * (1 + 0.08 * thick))[..., None]
    h = 0.004 * uy + 0.003 * thick + 0.0005 * gran - 0.002 * gap * (0 if arch else 1)
    return col, h, (W, H), {'altM': [round(W * 0.41, 4), round(e * 2 * max(1, round(H / e / 4)), 4)]}


def court(sp, rng, kind):
    W, H = sp['size_m']; pw, ph = sp.get('px', [512, 512]); g = noise((ph, pw), 0.8, rng); m = fbm((ph, pw), 40, rng, 3)
    col = np.asarray(sp['color'], np.float32)[None, None, :] * (1 + sp.get('grain', 0.06) * g[..., None] + sp.get('mottle', 0.05) * m[..., None])
    return col, sp.get('relief', 0.0004) * g, (W, H), {'altM': [round(W * 0.37, 4), round(H * 0.43, 4)]}


def planks(sp, rng, kind):
    bw = sp.get('board', 0.14); W = sp['size_m'][0]; H = fit(sp['size_m'][1], bw); pw, ph = sp.get('px', [512, 512]); px = (W / pw, H / ph)
    uid, ex, ey, ux, uy, uw, n = layout(W, H, pw, ph, bw, lambda r: ([W / max(1, round(W / sp.get('board_len', 2.4)))], rng.uniform(0, W)))
    gap = np.clip(1 - np.minimum(ey, ex * 2) / max(0.003, px[1]), 0, 1); g = noise((ph, pw), 0, rng, aniso=(1.0, 36))
    pal = pick_palette(rng, n, sp.get('colors') or [sp['color']], sp.get('weights')) * (1 + sp.get('unit_var', 0.08) * rng.standard_normal(n).astype(np.float32))[:, None]
    col = pal[uid] * (1 + 0.08 * g[..., None]) * (1 - 0.7 * gap[..., None])
    return col, 0.0006 * g - 0.006 * gap, (W, H), {'altM': [round(W * 0.5, 4), round(bw * max(1, round(H / bw / 2)), 4)]}


KINDS = {'brick': masonry, 'block': masonry, 'pavers': masonry, 'panels': masonry, 'stucco': stucco, 'concrete': stucco, 'siding': siding,
         'shingle_siding': siding, 'board_batten': siding, 'metal_seam': metal_seam, 'clay_tile': clay_tile, 'asphalt_shingle': asphalt_shingle,
         'court': court, 'planks': planks}
RUNTIME_KEYS = ('key', 'uvM', 'roughness', 'metalness', 'normalScale', 'tint', 'vertexColors', 'doubleSide', 'weather', 'like', 'offsetM', 'polygonOffset', 'envMapIntensity', 'notes',
                'alt', 'macro', 'micro', 'roughVar', 'streaks', 'rot')


def build(name, sp, out_dir, preview=None):
    rng = np.random.default_rng(sp.get('seed', abs(hash(name)) % 9973))
    rgb, h, size, extra = KINDS[sp['kind']](sp, rng, sp['kind'])
    ph, pw = h.shape; px = (size[0] / pw, size[1] / ph)
    # a tile must not carry its own large-scale pattern (it would show as repetition): remove the lowest frequencies
    lum = rgb.mean(-1); low = ndi.gaussian_filter(lum, min(pw, ph) / 5, mode='wrap'); rgb = rgb * (lum.mean() / np.maximum(low, 1e-4))[..., None] ** sp.get('flatten', 0.8)
    tt = sp.get('target_tile') or (None if extra.get('face_target') else sp.get('target'))
    if tt:     # match the measured mean colour of the whole surface exactly (masonry: `target` = unit faces only, `target_tile` = faces + joints)
        rgb = rgb * (np.asarray(tt, np.float32) / rgb.reshape(-1, 3).mean(0))[None, None, :]
    img = Image.fromarray((to_srgb(rgb) * 255 + 0.5).astype(np.uint8))
    img.save(os.path.join(out_dir, name + '_c.jpg'), quality=sp.get('q', 86), optimize=True)
    nm = normal_map(h.astype(np.float32), px, sp.get('normal_gain', 1.0))
    Image.fromarray((np.clip(nm, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out_dir, name + '_n.jpg'), quality=sp.get('qn', 84), subsampling=0, optimize=True)
    if preview:   # 3 x 2 tiles (seams, repetition) and a 1:1 crop (what the wall looks like from ~2 m)
        os.makedirs(preview, exist_ok=True); t = np.asarray(img); Image.fromarray(np.tile(t, (2, 3, 1))).resize((pw * 3 // 2, ph)).save(os.path.join(preview, name + '.jpg'), quality=85)
        Image.fromarray(t[:512, :768]).save(os.path.join(preview, name + '_1to1.jpg'), quality=92)
    mean = rgb.reshape(-1, 3).mean(0)
    ent = {'name': name, 'kind': sp['kind'], 'map': name + '_c.jpg', 'normal': name + '_n.jpg', 'sizeM': [round(size[0], 5), round(size[1], 5)], 'px': [pw, ph], 'meanLinear': [round(float(v), 4) for v in mean]}
    if sp['kind'] in ('brick', 'block', 'pavers', 'panels'): ent['courseM'] = round(sp['unit'][1] + sp.get('joint', 0.010), 5); ent['unitM'] = round(sp['unit'][0] + sp.get('joint', 0.010), 5)
    if 'exposure' in sp: ent['courseM'] = sp['exposure']
    if extra.get('altM'): ent['altM'] = extra['altM']
    for k in RUNTIME_KEYS:
        if k in sp: ent[k] = sp[k]
    return ent


if __name__ == '__main__':
    args = sys.argv[1:]; preview = None
    if '--preview' in args: i = args.index('--preview'); preview = args[i + 1]; del args[i:i + 2]
    cid = args[0]; only = set(args[1:])
    sheet = json.load(open(os.path.join(HERE, 'campuses', cid, 'materials.json')))
    out_dir = os.path.join(ROOT, 'public', 'campuses', cid, 'tex'); os.makedirs(out_dir, exist_ok=True)
    man_path = os.path.join(out_dir, 'tex.json')
    old = {e['name']: e for e in json.load(open(man_path)).get('textures', [])} if os.path.exists(man_path) else {}
    ents = []; total = 0
    for name, sp in sheet['textures'].items():
        if only and name not in only and name in old: ents.append(old[name]); continue
        ent = build(name, sp, out_dir, preview); ents.append(ent)
        sz = sum(os.path.getsize(os.path.join(out_dir, ent[k])) for k in ('map', 'normal')); total += sz
        print(f"{name:22s} {sp['kind']:15s} {ent['sizeM'][0]:.3f} x {ent['sizeM'][1]:.3f} m  {ent['px'][0]}x{ent['px'][1]}  {sz / 1024:.0f} kB  mean {ent['meanLinear']}")
    json.dump({'campus': cid, 'version': 2, 'textures': ents, 'overrides': sheet.get('overrides', {}), 'replaces': sheet.get('replaces', [])}, open(man_path, 'w'), indent=1)
    print('wrote', man_path, f'{total / 1e6:.2f} MB generated this run')
