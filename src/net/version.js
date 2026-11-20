// Network protocol + build identity. PROTOCOL must change whenever host/client messages change incompatibly; BUILD
// must match public/assets/ui/version.json for each deploy (a stale cached page then offers a reload).
export const PROTOCOL = 14;
export const BUILD = '12.0';
export const MISMATCH_TEXT = 'Version mismatch with the host: both players should reload the page (Cmd+Shift+R / Ctrl+Shift+R).';

/** Compares the running build with the deployed version.json (never cached). Resolves the newer build id or null. */
export async function checkForUpdate() {
  try {
    const r = await fetch('./assets/ui/version.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const v = await r.json();
    return v && v.build && v.build !== BUILD ? String(v.build) : null;
  } catch { return null; }
}
