// Persisted user settings (localStorage) and Google 3D Tiles key resolution.
const KEY = 'hcffa.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  name: '',
  sensitivity: 1.0,        // multiplier on base mouse speed
  fov: 90,                 // horizontal field of view in degrees (60-110)
  adsMultiplier: 1.0,      // extra sensitivity multiplier while aiming down sights
  quality: 'medium',       // 'low' | 'medium' | 'high'
  volume: 0.8,             // master volume 0..1
  googleTilesKey: '',
  primary: 'ar',           // last chosen primary weapon
});

function storage() {
  try { return window.localStorage; } catch { return null; }
}

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
  } catch { /* corrupt or blocked storage: use defaults */ }
  s.sensitivity = clampNum(s.sensitivity, 0.1, 5, 1);
  s.fov = clampNum(s.fov, 60, 110, 90);
  s.adsMultiplier = clampNum(s.adsMultiplier, 0.2, 2, 1);
  s.volume = clampNum(s.volume, 0, 1, 0.8);
  if (!['low', 'medium', 'high'].includes(s.quality)) s.quality = 'medium';
  if (!['ar', 'smg', 'sniper', 'shotgun'].includes(s.primary)) s.primary = 'ar';
  if (typeof s.name !== 'string') s.name = '';
  if (typeof s.googleTilesKey !== 'string') s.googleTilesKey = '';
  return s;
}

export function saveSettings(s) {
  try { storage()?.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function clampNum(v, lo, hi, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}

/** `?gkey=` URL param > localStorage setting > VITE_GOOGLE_TILES_KEY > null */
export function resolveGoogleKey(settings) {
  const url = new URLSearchParams(location.search).get('gkey');
  if (url) return url;
  if (settings.googleTilesKey) return settings.googleTilesKey;
  const env = import.meta.env?.VITE_GOOGLE_TILES_KEY;
  return env ? String(env) : null;
}

export function sanitizeName(name) {
  const n = String(name || '').replace(/[^\w \-.']/g, '').trim().slice(0, 16);
  return n || 'Player' + Math.floor(100 + Math.random() * 900);
}
