#!/usr/bin/env python3
"""Reference-photo collector for a campus (campus-agnostic; see tools/textures/README.md).

  python tools/textures/scrape.py <campus-id> [source ...]

Reads tools/textures/campuses/<id>/config.json and collects every image it can find of the school's buildings:
  commons    Wikimedia Commons search + categories (licence recorded per file)
  wikipedia  images used on the school's Wikipedia article(s)
  openverse  Openverse search (openly licensed images incl. Flickr CC)
  site       the school's own site / district / athletics pages: crawl the seed pages one link deep on the same host
  pages      single pages (news articles, architect / contractor project pages): images on that page only
  search     Bing / DuckDuckGo image result pages, only when their robots.txt allows the fetch (normally it does not;
             the skip is recorded, never bypassed)

Polite by construction: robots.txt is honoured per URL, >= 1.2 s between requests to the same host, generic
User-Agent with no personal data, no logins, no paywalls. Images go ONLY to the gitignored folder
src/campuses/<id>/tools/data/refs/ together with index.json (url, source page, licence, title / alt text, size).
Nothing downloaded here may be committed or shipped: the photos are references for measuring materials only.
`annotate.py` turns index.json + the hand-written notes into the committed text manifest.
"""
import hashlib, io, json, os, re, sys, time, urllib.parse, urllib.request, urllib.robotparser
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
UA = 'CampusRefBot/1.0 (building reference photos; polite crawler)'
DELAY = 1.2
MIN_BYTES, MIN_SIDE = 25_000, 480
IMG_EXT = ('.jpg', '.jpeg', '.png', '.webp')
SKIP_WORDS = ('logo', 'icon', 'sprite', 'avatar', 'favicon', 'badge', 'headshot', 'portrait', 'staff', 'banner-ad', 'emoji', 'button', 'spinner', 'placeholder')

try:
    from PIL import Image
except Exception:  # dimensions are optional
    Image = None

_last, _robots, log = {}, {}, []


def say(*a):
    print(*a, flush=True)


def allowed(url):
    p = urllib.parse.urlsplit(url); host = p.scheme + '://' + p.netloc
    if host not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            wait(host); req = urllib.request.Request(host + '/robots.txt', headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=20) as r: rp.parse(r.read().decode('utf-8', 'replace').splitlines())
        except urllib.error.HTTPError as e:
            if e.code in (401, 403): rp.parse(['User-agent: *', 'Disallow: /'])   # robots.txt forbidden -> treat as closed
            else: rp.parse([])
        except Exception:
            rp.parse([])
        _robots[host] = rp
    return _robots[host].can_fetch(UA, url)


def wait(host):
    t = _last.get(host, 0); d = DELAY - (time.time() - t)
    if d > 0: time.sleep(d)
    _last[host] = time.time()


def get(url, binary=False, limit=30_000_000):
    if not url.startswith('http'): return None
    if not allowed(url): log.append({'skipped': url, 'why': 'robots.txt'}); return None
    wait(urllib.parse.urlsplit(url).netloc)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read(limit)
            return data if binary else data.decode('utf-8', 'replace')
    except Exception as e:
        log.append({'failed': url, 'why': str(e)[:120]}); return None


class Imgs(HTMLParser):
    def __init__(self, base):
        super().__init__(); self.base = base; self.imgs = []; self.links = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'img' or tag == 'source':
            cands = []
            for k in ('src', 'data-src', 'data-lazy-src', 'data-original', 'data-image'):
                if a.get(k): cands.append(a[k])
            for k in ('srcset', 'data-srcset'):
                if a.get(k):
                    best = sorted((s.strip().split(' ') for s in a[k].split(',') if s.strip()), key=lambda s: float(re.sub(r'[^0-9.]', '', s[1]) or 0) if len(s) > 1 else 0)
                    if best: cands.append(best[-1][0])
            if a.get('data-image-sizes'):
                try:
                    sizes = json.loads(urllib.parse.unquote(a['data-image-sizes'])); sizes.sort(key=lambda z: z.get('width', 0))
                    best = [z for z in sizes if z.get('width', 0) <= 2000] or sizes
                    cands.append(best[-1]['url'])
                except Exception: pass
            for c in cands[-1:] if cands else []:
                self.imgs.append((urllib.parse.urljoin(self.base, c), a.get('alt') or a.get('title') or ''))
        elif tag == 'meta' and a.get('property') in ('og:image', 'twitter:image') and a.get('content'):
            self.imgs.append((urllib.parse.urljoin(self.base, a['content']), 'og:image'))
        elif tag == 'a' and a.get('href'):
            h = urllib.parse.urljoin(self.base, a['href']).split('#')[0]
            if h.lower().split('?')[0].endswith(IMG_EXT): self.imgs.append((h, a.get('title') or ''))
            else: self.links.append(h)
        style = a.get('style') or ''
        for m in re.findall(r'url\(["\']?([^"\')]+)', style): self.imgs.append((urllib.parse.urljoin(self.base, m), 'background'))


class Store:
    def __init__(self, cid):
        self.dir = os.path.join(ROOT, 'src', 'campuses', cid, 'tools', 'data', 'refs'); os.makedirs(self.dir, exist_ok=True)
        self.path = os.path.join(self.dir, 'index.json')
        self.items = json.load(open(self.path)) if os.path.exists(self.path) else []
        self.seen = {i['url'] for i in self.items}
    def add(self, url, source, page, title='', licence='', author=''):
        if url in self.seen or len(url) > 600: return False
        low = url.lower()
        if any(w in low for w in SKIP_WORDS) or low.split('?')[0].endswith(('.svg', '.gif')): return False
        self.seen.add(url)
        data = get(url, binary=True)
        if not data or len(data) < MIN_BYTES: return False
        w = h = 0
        if Image:
            try:
                im = Image.open(io.BytesIO(data)); w, h = im.size
                if min(w, h) < MIN_SIDE: return False
                if max(w, h) > 2000:   # keep the cache small: references, not archives
                    im = im.convert('RGB'); im.thumbnail((2000, 2000)); buf = io.BytesIO(); im.save(buf, 'JPEG', quality=88); data = buf.getvalue(); w, h = im.size
            except Exception:
                return False
        name = source + '_' + hashlib.sha1(url.encode()).hexdigest()[:10] + '.jpg'
        open(os.path.join(self.dir, name), 'wb').write(data)
        self.items.append({'file': name, 'url': url, 'source': source, 'page': page, 'title': title[:200], 'licence': licence, 'author': author[:120], 'w': w, 'h': h})
        self.save(); return True
    def save(self):
        json.dump(self.items, open(self.path, 'w'), indent=1)


def strip(s): return re.sub(r'<[^>]+>', '', s or '').strip()


LIC = re.compile(r'(CC0|CC[ -]BY(?:-SA|-NC|-ND)*[ -]?\d(?:\.\d)?|Public domain|GFDL)', re.I)


def wiki_file(url, st, source):
    """One File: page (HTML; the API paths are closed to crawlers by robots.txt): a <= 1600 px rendition + licence."""
    html = get(url)
    if not html: return 0
    m = re.search(r'class="fullImageLink"[^>]*><a href="([^"]+)"', html)
    if not m: return 0
    full = urllib.parse.urljoin(url, m.group(1)); img = full
    for t in re.findall(r'href="([^"]+)"[^>]*class="mw-thumbnail-link"', html) + re.findall(r'class="mw-thumbnail-link"[^>]*href="([^"]+)"', html):
        w = re.search(r'/(\d+)px-', t)
        if w and 1000 <= int(w.group(1)) <= 2100: img = urllib.parse.urljoin(url, t)
    if not img.lower().split('?')[0].endswith(IMG_EXT): return 0
    lic = LIC.search(strip(html[html.find('licensetpl'):][:4000]) if 'licensetpl' in html else strip(html)); au = re.search(r'id="fileinfotpl_aut".*?<td[^>]*>(.*?)</td>', html, re.S)
    title = urllib.parse.unquote(url.rsplit('/', 1)[-1]).replace('_', ' ')
    return int(st.add(img, source, url, title, lic.group(1) if lic else '', strip(au.group(1)) if au else ''))


def wiki_listing(url, st, source):
    html = get(url)
    if not html: return 0
    n = 0
    for h in dict.fromkeys(re.findall(r'href="(/wiki/File:[^"#?]+)"', html)):
        if h.lower().endswith(IMG_EXT): n += wiki_file(urllib.parse.urljoin(url, h), st, source)
    return n


def commons(cfg, st):
    n = 0
    for q in cfg.get('commons', []): log.append({'skipped': 'commons search: ' + q, 'why': 'robots.txt closes Special:MediaSearch and the API; categories and File pages are used instead'})
    for c in cfg.get('commonsCategories', []): n += wiki_listing('https://commons.wikimedia.org/wiki/Category:' + urllib.parse.quote(c.replace(' ', '_')), st, 'commons')
    for f in cfg.get('commonsFiles', []): n += wiki_file('https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(f.replace(' ', '_')), st, 'commons')
    return n


def wikipedia(cfg, st):
    n = 0
    for title in cfg.get('wikipedia', []): n += wiki_listing('https://en.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_')), st, 'wikipedia')
    return n


def openverse(cfg, st):
    n = 0
    for q in cfg.get('openverse', []):
        t = get('https://api.openverse.org/v1/images/?page_size=20&q=' + urllib.parse.quote(q))
        if not t: continue
        try: res = json.loads(t).get('results', [])
        except Exception: continue
        for r in res:
            if r.get('url'): n += st.add(r['url'], 'openverse', r.get('foreign_landing_url', ''), r.get('title') or '', (r.get('license') or '') + ' ' + (r.get('license_version') or ''), r.get('creator') or '')
    return n


def page_images(url, st, source, follow=False, host_only=True, cap=60, match=None):
    html = get(url)
    if not html: return 0, []
    p = Imgs(url)
    try: p.feed(html)
    except Exception: pass
    n = 0
    for u, alt in p.imgs[:cap * 3]:
        if n >= cap: break
        n += st.add(u, source, url, alt)
    links = []
    if follow:
        host = urllib.parse.urlsplit(url).netloc
        for l in dict.fromkeys(p.links):
            if host_only and urllib.parse.urlsplit(l).netloc != host: continue
            if match and not re.search(match, l, re.I): continue
            links.append(l)
    return n, links


def site(cfg, st):
    n = 0
    for s in cfg.get('site', []):
        url = s if isinstance(s, str) else s['url']; opt = {} if isinstance(s, str) else s
        k, links = page_images(url, st, 'site', follow=True, match=opt.get('match') or cfg.get('siteMatch') or r'campus|facilit|about|athletic|tour|building|histor|galler|photo|visit|news|construction|renovat|project|arts|theat|gym|stadium|field|pool|library')
        n += k; say('  site', url, k, 'images,', len(links), 'links')
        for l in links[:opt.get('max', 14)]:
            k, _ = page_images(l, st, 'site'); n += k
    return n


def pages(cfg, st):
    n = 0
    for url in cfg.get('pages', []):
        k, _ = page_images(url, st, 'page'); n += k; say('  page', url, k)
    return n


def search(cfg, st):
    n = 0
    for q in cfg.get('search', []):
        for eng in ('https://www.bing.com/images/search?q=', 'https://duckduckgo.com/?iax=images&ia=images&q='):
            url = eng + urllib.parse.quote(q)
            if not allowed(url): log.append({'skipped': url, 'why': 'robots.txt disallows image-search result pages'}); continue
            html = get(url) or ''
            for u in dict.fromkeys(re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', html)):
                n += st.add(u, 'search', url, q)
    return n


SOURCES = {'commons': commons, 'wikipedia': wikipedia, 'openverse': openverse, 'site': site, 'pages': pages, 'search': search}

if __name__ == '__main__':
    cid = sys.argv[1]; which = sys.argv[2:] or list(SOURCES)
    cfg = json.load(open(os.path.join(HERE, 'campuses', cid, 'config.json')))
    st = Store(cid)
    for name in which:
        try: say(name, SOURCES[name](cfg, st))
        except Exception as e: say(name, 'error', str(e)[:200])
    json.dump(log, open(os.path.join(st.dir, 'log.json'), 'w'), indent=1)
    by = {}
    for i in st.items: by[i['source']] = by.get(i['source'], 0) + 1
    say('total', len(st.items), by, '| skipped/failed', len(log))
