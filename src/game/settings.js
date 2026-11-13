// Persisted user settings (localStorage) and Google 3D Tiles key resolution.
const KEY = 'hcffa.settings.v1';

export const IS_MAC = (() => {
  try {
    const p = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
    return /mac/i.test(p);
  } catch { return false; }
})();

export const DEFAULT_SETTINGS = Object.freeze({
  name: '',
  sensitivity: 1.0,        // multiplier on base mouse speed
  fov: 90,                 // horizontal field of view in degrees (60-110)
  adsMultiplier: 1.0,      // extra sensitivity multiplier while aiming down sights
  quality: 'medium',       // 'low' | 'medium' | 'high'
  volume: 0.8,             // master volume 0..1
  googleTilesKey: '',
  mapStyle: 'built',       // 'scan' = Google photorealistic 3D tiles (if a key is available), 'built' = built-in campus model
  primary: 'ar',           // (legacy) last chosen primary weapon
  cls: 'rifleman',         // last chosen class
  sprintKey: 'shift',      // 'ctrl' | 'shift'
  controlsRev: 2,          // bump to migrate old saved control defaults
  mode: 'ffa',             // last chosen game mode for Host / Practice: 'ffa' | 'ctf'
});

function storage() {
  try { return window.localStorage; } catch { return null; }
}

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS };
  let stored = null;
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) { stored = JSON.parse(raw); Object.assign(s, stored); }
  } catch { /* corrupt or blocked storage: use defaults */ }
  s.sensitivity = clampNum(s.sensitivity, 0.1, 5, 1);
  s.fov = clampNum(s.fov, 60, 110, 90);
  s.adsMultiplier = clampNum(s.adsMultiplier, 0.2, 2, 1);
  s.volume = clampNum(s.volume, 0, 1, 0.8);
  if (!['low', 'medium', 'high'].includes(s.quality)) s.quality = 'medium';
  if (!['ar', 'smg', 'sniper', 'shotgun'].includes(s.primary)) s.primary = 'ar';
  if (!['rifleman', 'runner', 'brawler', 'recon', 'grappler'].includes(s.cls)) s.cls = 'rifleman';
  if (typeof s.name !== 'string') s.name = '';
  if (typeof s.googleTilesKey !== 'string') s.googleTilesKey = '';
  if (!['scan', 'built'].includes(s.mapStyle)) s.mapStyle = 'built';
  if (!['ctrl', 'shift'].includes(s.sprintKey)) s.sprintKey = DEFAULT_SETTINGS.sprintKey;
  // rev 2: Shift is the default sprint key again for everyone (Ctrl stays available in Settings)
  if (stored && !(stored.controlsRev >= 2)) { s.sprintKey = 'shift'; s.controlsRev = 2; saveSettings(s); }
  if (!['ffa', 'ctf'].includes(s.mode)) s.mode = 'ffa';
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
  if (settings.mapStyle === 'built') return null;
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
