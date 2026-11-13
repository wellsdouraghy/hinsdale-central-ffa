// Loadout selection cards (primary weapon; sidearm is always the pistol).
import { WEAPON_STATS, PRIMARY_IDS } from '../game/weapons.js';

// Simple original silhouettes (viewBox 0 0 120 36).
const ICONS = {
  ar: 'M4 14h62l4-4h18v4h26v5H92l-2 3H70l-6 12h-9l3-12H40l-4 9h-8l2-9H4z',
  smg: 'M14 12h52l3-3h10v3h16v6H78l-4 4h-8l-4 12h-8l3-12H40l-3 6h-7l2-6H14z',
  sniper: 'M2 15h40l4-6h16v6h52v4H66l-4 4H50l-8 10h-8l5-10H24l-6 6h-8l3-6H2z',
  shotgun: 'M2 14h70v4h44v4H72l-2 3H54l-6 9h-8l4-9H22l-6 6H8l3-6H2z',
};

const MAX = { dmg: 100, rof: 900, range: 120, mob: 1.1 };

function bars(id) {
  const s = WEAPON_STATS[id];
  const dmg = Math.min(1, (s.damage[0] * s.pellets) / MAX.dmg);
  const rof = Math.min(1, s.rpm / MAX.rof);
  const range = Math.min(1, s.range[1] / MAX.range);
  const mob = Math.min(1, s.moveMult / MAX.mob);
  return [['Damage', dmg], ['Fire rate', rof], ['Range', range], ['Mobility', mob]]
    .map(([n, v]) => `<div class="stat"><span>${n}</span><span class="sb"><i style="width:${Math.round(v * 100)}%"></i></span></div>`).join('');
}

export function renderLoadout(container, selected, onSelect) {
  container.innerHTML = PRIMARY_IDS.map((id, i) => {
    const s = WEAPON_STATS[id];
    return `<button class="card${id === selected ? ' on' : ''}" data-id="${id}">
      <span class="ck">${i + 1}</span>
      <div class="cn">${s.label}</div>
      <div class="ct">${s.mode === 'auto' ? 'Full auto' : s.mode === 'bolt' ? 'Bolt action' : s.mode === 'pump' ? 'Pump action' : 'Semi auto'} &middot; ${s.mag} rds</div>
      <svg class="gun" viewBox="0 0 120 36"><path d="${ICONS[id]}"/></svg>
      ${bars(id)}
    </button>`;
  }).join('');
  container.querySelectorAll('.card').forEach((c) => {
    c.addEventListener('click', () => onSelect(c.dataset.id));
  });
}

export function highlightLoadout(container, selected) {
  container.querySelectorAll('.card').forEach((c) => c.classList.toggle('on', c.dataset.id === selected));
}
