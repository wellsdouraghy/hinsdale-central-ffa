#!/usr/bin/env python3
"""Work with the reference photos collected by scrape.py (and the Street View cache). Campus-agnostic.

  refs.py count    <id>                       how many references per source
  refs.py sheet    <id> <out.jpg> [start] [n] [--sv]   numbered contact sheet (local review only: do not commit)
  refs.py prune    <id> <file> [...]          drop off-topic images (ads, portraits, logos) from the cache and index
  refs.py swatch   <id> <file> x0 y0 x1 y1 [--wb x0 y0 x1 y1 | --sun | --shade]
                                              median LINEAR RGB of a rectangle (fractions 0..1 of the image), optionally
                                              white-balanced on a neutral patch (white trim, concrete) in the same photo
  refs.py pitch    <id> <file> x0 y0 x1 y1    dominant vertical period (px) in a rectangle: brick courses / siding laps;
                                              scale it with a known height in the same photo (door 2.13 m, CMU 0.203 m)
  refs.py manifest <id>                       index.json + notes.json  ->  tools/textures/campuses/<id>/refs.json (committed,
                                              text only: url, source page, licence, building, facade, what it shows)

notes.json (tools/textures/campuses/<id>/notes.json, hand-written while looking at the sheets):
  { "<file>": { "building": "...", "facade": "...", "shows": "...", "use": "colour|coursing|roof|context" }, ... }
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))


def paths(cid, sv=False):
    d = os.path.join(ROOT, 'src', 'campuses', cid, 'tools', 'data', 'streetview' if sv else 'refs')
    return d, os.path.join(d, 'index.json')


def load(cid):
    d, idx = paths(cid); return d, (json.load(open(idx)) if os.path.exists(idx) else [])


def lin(a): a = a / 255.0; return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def rect(im, f):
    w, h = im.size; x0, y0, x1, y1 = f
    return np.asarray(im.convert('RGB').crop((int(x0 * w), int(y0 * h), max(int(x0 * w) + 2, int(x1 * w)), max(int(y0 * h) + 2, int(y1 * h)))), np.float64)


if __name__ == '__main__':
    cmd, cid = sys.argv[1], sys.argv[2]; a = sys.argv[3:]
    d, items = load(cid)
    if cmd == 'count':
        by = {}
        for i in items: by[i['source']] = by.get(i['source'], 0) + 1
        svd, _ = paths(cid, True); sv = len([f for f in os.listdir(svd) if f.lower().endswith(('.jpg', '.png'))]) if os.path.isdir(svd) else 0
        print(cid, len(items), by, 'streetview', sv)
    elif cmd == 'sheet':
        sv = '--sv' in a; a = [x for x in a if x != '--sv']
        out = a[0]; start = int(a[1]) if len(a) > 1 else 0; n = int(a[2]) if len(a) > 2 else 24
        if sv: d, _ = paths(cid, True); files = sorted(f for f in os.listdir(d) if f.lower().endswith(('.jpg', '.png')))
        else: files = [i['file'] for i in items]
        files = files[start:start + n]; cols = 6; tw, th = 300, 210; rows = (len(files) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * tw, rows * th), (20, 20, 20)); dr = ImageDraw.Draw(sheet)
        for k, f in enumerate(files):
            try: im = Image.open(os.path.join(d, f)).convert('RGB')
            except Exception: continue
            im.thumbnail((tw - 4, th - 4)); x, y = (k % cols) * tw, (k // cols) * th; sheet.paste(im, (x + 2, y + 2))
            dr.rectangle((x + 2, y + 2, x + 46, y + 16), fill=(0, 0, 0)); dr.text((x + 5, y + 3), str(start + k), fill=(255, 255, 0))
        sheet.save(out, quality=80); print(out, len(files), 'of', len(items) if not sv else '(street view)')
        for k, f in enumerate(files): print(start + k, f)
    elif cmd == 'prune':
        drop = set(a); keep = [i for i in items if i['file'] not in drop]
        for f in drop:
            p = os.path.join(d, f)
            if os.path.exists(p): os.remove(p)
        json.dump(keep, open(os.path.join(d, 'index.json'), 'w'), indent=1); print('kept', len(keep), 'dropped', len(items) - len(keep))
    elif cmd == 'swatch':
        sv = '--sv' in a; a = [x for x in a if x != '--sv']
        if sv: d, _ = paths(cid, True)
        im = Image.open(os.path.join(d, a[0])); px = lin(rect(im, [float(v) for v in a[1:5]])).reshape(-1, 3)
        med = np.median(px, 0); note = ''
        if '--wb' in a:
            k = a.index('--wb'); ref = np.median(lin(rect(im, [float(v) for v in a[k + 1:k + 5]])).reshape(-1, 3), 0)
            med = med / ref * ref.mean(); note = f' (white-balanced on a neutral patch, patch linear mean {ref.mean():.3f})'
        srgb = np.where(med <= 0.0031308, med * 12.92, 1.055 * med ** (1 / 2.4) - 0.055) * 255
        print('linear', [round(float(v), 4) for v in med], 'srgb', [int(v) for v in srgb], 'spread', [round(float(v), 4) for v in px.std(0)], note)
    elif cmd == 'pitch':
        sv = '--sv' in a; a = [x for x in a if x != '--sv']
        if sv: d, _ = paths(cid, True)
        im = Image.open(os.path.join(d, a[0])); g = rect(im, [float(v) for v in a[1:5]]).mean(-1)
        prof = g.mean(1); prof = prof - np.convolve(prof, np.ones(15) / 15, 'same'); ac = np.correlate(prof, prof, 'full')[len(prof) - 1:]; ac /= ac[0] + 1e-9
        peaks = [k for k in range(3, len(ac) - 1) if ac[k] > ac[k - 1] and ac[k] >= ac[k + 1] and ac[k] > 0.15]
        print('rows', len(prof), 'period candidates (px, strength):', [(k, round(float(ac[k]), 2)) for k in peaks[:5]])
    elif cmd == 'manifest':
        npath = os.path.join(HERE, 'campuses', cid, 'notes.json'); notes = json.load(open(npath)) if os.path.exists(npath) else {}
        out = []
        for i in items:
            n = notes.get(i['file'], {})
            out.append({'file': i['file'], 'url': i['url'], 'page': i['page'], 'source': i['source'], 'licence': i.get('licence') or 'not stated (all rights reserved assumed)', 'author': i.get('author', ''), 'caption': i.get('title', ''), 'px': [i.get('w', 0), i.get('h', 0)],
                        'building': n.get('building', ''), 'facade': n.get('facade', ''), 'shows': n.get('shows', ''), 'use': n.get('use', ''), 'reviewed': bool(n)})
        svd, svi = paths(cid, True); sv = []
        if os.path.exists(svi):
            try:
                raw = json.load(open(svi)); raw = raw if isinstance(raw, list) else [dict(v, id=k) for k, v in raw.items()] if isinstance(raw, dict) else []
                for v in raw:
                    f = v.get('file') or (str(v.get('id')) + '.jpg'); n = notes.get('sv:' + f, {})
                    sv.append({'file': f, 'source': 'Google Street View Static API (cached locally, not redistributable)', 'pano': v.get('pano') or v.get('pano_id'), 'date': v.get('date'), 'building': n.get('building', str(v.get('id', ''))), 'shows': n.get('shows', ''), 'reviewed': bool(n)})
            except Exception as e: print('street view index not read:', e)
        cfg = json.load(open(os.path.join(HERE, 'campuses', cid, 'config.json')))
        lp = os.path.join(d, 'log.json'); skipped = [e for e in (json.load(open(lp)) if os.path.exists(lp) else []) if 'skipped' in e]
        json.dump({'campus': cid, 'school': cfg.get('name'), 'note': 'Reference photos are NOT in the repo (third-party copyright). They live in the gitignored src/campuses/%s/tools/data/refs/ and are re-collected with tools/textures/scrape.py. Used only to measure materials; no texture contains reference pixels.' % cid,
                   'counts': {'web': len(out), 'streetview': len(sv), 'reviewed': sum(1 for o in out if o['reviewed']) + sum(1 for s in sv if s['reviewed'])},
                   'skippedByRobots': sorted({e['skipped'].split('?')[0][:120] for e in skipped})[:40], 'images': out, 'streetview': sv},
                  open(os.path.join(HERE, 'campuses', cid, 'refs.json'), 'w'), indent=1)
        print(cid, 'web', len(out), 'streetview', len(sv), 'reviewed', sum(1 for o in out if o['reviewed']))
