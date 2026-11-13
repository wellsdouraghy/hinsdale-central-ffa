// Player classes: primary + pistol + equipment + one ability. Shared by client (loadout, movement) and host (validation).
export const CLASSES = {
  rifleman: {
    id: 'rifleman', name: 'Rifleman', tag: 'RIF', primary: 'ar', frags: 2,
    ability: 'Fast hands: reloads 25% faster, carries 2 frags',
    reloadMult: 0.75,
  },
  runner: {
    id: 'runner', name: 'Runner', tag: 'RUN', primary: 'smg', frags: 1,
    ability: '+12% move and sprint speed, half sprint-to-fire delay',
    speedMult: 1.12, sprintOutMult: 0.5,
  },
  brawler: {
    id: 'brawler', name: 'Brawler', tag: 'BRW', primary: 'shotgun', frags: 1,
    ability: 'One-hit melee kills with a short lunge',
    meleeDamage: 150, lunge: true,
  },
  recon: {
    id: 'recon', name: 'Recon', tag: 'REC', primary: 'sniper', frags: 1,
    ability: 'Triple jump: two boost jumps in the air',
    airJumps: 2,
  },
  grappler: {
    id: 'grappler', name: 'Grappler', tag: 'GRP', primary: 'ar', frags: 1,
    ability: 'Grapple cooldown halved, 50% longer grapple range',
    grappleCooldownMult: 0.5, grappleRangeMult: 1.5,
  },
};

export const CLASS_IDS = Object.keys(CLASSES);
export const DEFAULT_CLASS = 'rifleman';
export const BASE_MELEE_DAMAGE = 55;

export function classOf(id) { return CLASSES[id] || CLASSES[DEFAULT_CLASS]; }

/** Melee damage the host accepts from a player of class `id`. */
export function meleeDamageFor(id) { return classOf(id).meleeDamage ?? BASE_MELEE_DAMAGE; }
