// Applies the active campus's branding to the static page: names, wordmark, legal lines, team names, emblem,
// accent color and the aerial backdrops. Everything dynamic reads the campus directly.
import { onCampusChange } from '../campuses/index.js';

export function initBranding() {
  onCampusChange((c) => {
    document.title = `Campus Combat · ${c.name}`;
    const fields = { name: c.name, word0: c.wordmark[0], word1: c.wordmark[1], legal: c.legal, short: c.short || c.name.slice(0, 2).toUpperCase() };
    document.querySelectorAll('[data-campus]').forEach((el) => {
      const k = el.dataset.campus;
      if (k === 'emblem') { if (c.emblem) el.innerHTML = c.emblem; }
      else if (k in fields) el.textContent = fields[k];
    });
    document.querySelectorAll('[data-team-name]').forEach((el) => { el.textContent = c.teams[el.dataset.teamName]; });
    // Palette: --red (logo / highlights), --accent / --accent-2 (buttons). Falls back to the stylesheet defaults.
    const root = document.documentElement.style;
    const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
    for (const [prop, val] of [['--red', c.brand?.red], ['--accent', c.brand?.accent || c.brand?.red], ['--accent-2', c.brand?.accent2]]) {
      if (val) { root.setProperty(prop, val); if (prop !== '--accent-2') root.setProperty(prop + '-rgb', rgb(val)); }
      else { root.removeProperty(prop); if (prop !== '--accent-2') root.removeProperty(prop + '-rgb'); }
    }
    const sat = `url(./${c.files.satellite})`;
    document.querySelectorAll('.title-bg').forEach((b) => { b.style.backgroundImage = sat; });
    const ld = document.getElementById('ld-map');
    if (ld) ld.style.backgroundImage = sat;
    const lt = document.getElementById('loading-title');
    if (lt) lt.textContent = c.name;
    document.body.dataset.campus = c.id;
  });
}
