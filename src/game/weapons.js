// Weapon stats and per-weapon runtime logic (ammo, fire timing, reload, spread, recoil).
// Pure gameplay: no three.js scene objects here. Visual viewmodels live in src/visuals/weapons.js.

const DEG = Math.PI / 180;

/**
 * damage: [near, far] per pellet, linear falloff between range[0] and range[1] meters.
 * spread: cone half-angle in degrees. recoil: degrees per shot.
 * mode: 'auto' | 'semi' | 'bolt' | 'pump'. adsZoom: FOV multiplier when fully aimed (sniper uses adsFov).
 */
export const WEAPON_STATS = {
  ar: {
    id: 'ar', label: 'Assault Rifle', short: 'AR', slot: 'primary', mode: 'auto', rpm: 720,
    damage: [27, 20], range: [28, 60], headMult: 1.5, pellets: 1, maxRange: 500,
    mag: 30, reserve: 150, reload: 2.1, reloadEmpty: 2.6,
    spread: { hip: 3.0, ads: 0.1, move: 2.0, air: 5, crouch: 0.75, perShot: 0.22, maxBloom: 2.2 },
    recoil: { pitch: 0.45, yaw: 0.2, recover: 10, adsMult: 0.6, pattern: 'rifle' },
    adsTime: 0.22, adsZoom: 0.74, moveMult: 0.96, equipTime: 0.45,
  },
  smg: {
    id: 'smg', label: 'Submachine Gun', short: 'SMG', slot: 'primary', mode: 'auto', rpm: 900,
    damage: [23, 13], range: [12, 35], headMult: 1.35, pellets: 1, maxRange: 300,
    mag: 32, reserve: 192, reload: 1.8, reloadEmpty: 2.2,
    spread: { hip: 2.1, ads: 0.35, move: 1.2, air: 4, crouch: 0.8, perShot: 0.15, maxBloom: 1.6 },
    recoil: { pitch: 0.4, yaw: 0.3, recover: 13, adsMult: 0.7, pattern: 'smg' },
    adsTime: 0.17, adsZoom: 0.84, moveMult: 1.06, equipTime: 0.35,
  },
  sniper: {
    id: 'sniper', label: 'Bolt Sniper', short: 'SNP', slot: 'primary', mode: 'bolt', rpm: 52,
    damage: [75, 65], range: [80, 200], headMult: 2.0, pellets: 1, maxRange: 800, // head or torso: instant kill (see _fire)
    mag: 5, reserve: 25, reload: 3.0, reloadEmpty: 3.4,
    spread: { hip: 7, ads: 0.0, move: 4, air: 10, crouch: 0.8, perShot: 0, maxBloom: 0 },
    recoil: { pitch: 4.5, yaw: 0.8, recover: 5, adsMult: 0.8, pattern: 'kick' },
    adsTime: 0.36, adsFov: 16, moveMult: 0.9, equipTime: 0.6, scope: true,
  },
  shotgun: {
    id: 'shotgun', label: 'Pump Shotgun', short: 'SG', slot: 'primary', mode: 'pump', rpm: 70,
    damage: [17, 4], range: [7, 22], headMult: 1.2, pellets: 9, maxRange: 60,
    mag: 6, reserve: 30, reload: 0.5, reloadEmpty: 0.5, perShell: true,
    spread: { hip: 5.5, ads: 4.0, move: 0.6, air: 1.5, crouch: 0.95, perShot: 0, maxBloom: 0 },
    recoil: { pitch: 3.5, yaw: 0.9, recover: 6, adsMult: 0.85, pattern: 'kick' },
    adsTime: 0.24, adsZoom: 0.88, moveMult: 1.0, equipTime: 0.5,
  },
  pistol: {
    id: 'pistol', label: 'Sidearm', short: 'PST', slot: 'secondary', mode: 'semi', rpm: 420,
    damage: [30, 18], range: [12, 35], headMult: 1.5, pellets: 1, maxRange: 250,
    mag: 12, reserve: 60, reload: 1.45, reloadEmpty: 1.7,
    spread: { hip: 1.8, ads: 0.25, move: 1.0, air: 3, crouch: 0.85, perShot: 0.5, maxBloom: 1.5 },
    recoil: { pitch: 1.4, yaw: 0.35, recover: 11, adsMult: 0.7, pattern: 'kick' },
    adsTime: 0.15, adsZoom: 0.86, moveMult: 1.1, equipTime: 0.3,
  },
};

export const PRIMARY_IDS = ['ar', 'smg', 'sniper', 'shotgun'];
export const MELEE = { damage: 999, range: 2.0, cooldown: 0.9, lungeRange: 4.4 }; // any melee hit kills

/** Damage of one pellet at distance d (meters), before headshot multiplier. */
export function damageAt(stats, d) {
  const [near, far] = stats.damage;
  const [r0, r1] = stats.range;
  if (d <= r0) return near;
  if (d >= r1) return far;
  return near + (far - near) * ((d - r0) / (r1 - r0));
}

/** Max damage one shot (all pellets) can do; used by the host for claim validation. */
export function maxShotDamage(id) {
  if (id === 'melee') return MELEE.damage;
  const s = WEAPON_STATS[id];
  return s ? s.damage[0] * s.headMult * s.pellets : 0;
}

/** Recoil pattern: deterministic-ish yaw drift per shot index, so sprays are learnable. */
function patternYaw(pattern, i) {
  switch (pattern) {
    case 'rifle': return i < 4 ? 0.15 : Math.sin(i * 0.55) * 1.0 + 0.25;
    case 'smg': return Math.sin(i * 0.9) * 1.1;
    default: return (Math.random() - 0.5) * 1.6;
  }
}

/** Runtime state for one carried gun. */
export class Gun {
  constructor(id) {
    this.id = id;
    this.stats = WEAPON_STATS[id];
    this.ammo = this.stats.mag;
    this.reserve = this.stats.reserve;
    this.nextFire = 0;
    this.reloading = false;
    this.reloadEnd = 0;
    this.reloadStart = 0;
    this.shotIndex = 0;   // consecutive shots in current spray
    this.bloom = 0;       // extra spread from sustained fire (degrees)
    this.reloadMult = 1;  // class modifier
  }
  refill() {
    this.ammo = this.stats.mag;
    this.reserve = this.stats.reserve;
    this.reloading = false;
    this.bloom = 0;
    this.shotIndex = 0;
  }
  canReload() {
    return !this.reloading && this.ammo < this.stats.mag && this.reserve > 0;
  }
  /** Starts a reload; returns its duration in seconds, or 0 if not possible. */
  startReload(now) {
    if (!this.canReload()) return 0;
    const s = this.stats;
    let dur = this.ammo === 0 ? s.reloadEmpty : s.reload;
    if (s.perShell) dur = 0.35 + s.reload * Math.min(s.mag - this.ammo, this.reserve);
    dur *= this.reloadMult;
    this.reloading = true;
    this.reloadStart = now;
    this.reloadEnd = now + dur;
    this.nextShell = now + (0.35 + s.reload) * this.reloadMult;
    return dur;
  }
  cancelReload() { this.reloading = false; }
  /** Call every frame; returns true when a reload just completed. */
  update(now, dt, firing) {
    this.bloom = Math.max(0, this.bloom - dt * (firing ? 1.5 : 6));
    if (!firing && now > this.nextFire + 0.12) this.shotIndex = 0;
    if (this.reloading && this.stats.perShell) {
      // Shell-by-shell: each shell loads individually so firing can interrupt the reload.
      while (this.reloading && now >= this.nextShell) {
        if (this.ammo < this.stats.mag && this.reserve > 0) { this.ammo++; this.reserve--; }
        this.nextShell += this.stats.reload * this.reloadMult;
        if (this.ammo >= this.stats.mag || this.reserve <= 0) this.reloading = false;
      }
      return !this.reloading;
    }
    if (this.reloading && now >= this.reloadEnd) {
      const take = Math.min(this.stats.mag - this.ammo, this.reserve);
      this.ammo += take;
      this.reserve -= take;
      this.reloading = false;
      return true;
    }
    return false;
  }
  ready(now) { return !this.reloading && now >= this.nextFire; }
  /** Shotguns may interrupt a shell-by-shell reload to fire loaded shells. */
  canInterruptReload() { return this.reloading && this.stats.perShell && this.ammo > 0; }
  /** Consumes one round. Returns {pitch, yaw} recoil kick in radians. */
  consume(now) {
    const s = this.stats;
    this.ammo--;
    this.nextFire = now + 60 / s.rpm;
    const i = this.shotIndex++;
    this.bloom = Math.min(s.spread.maxBloom, this.bloom + s.spread.perShot);
    const ramp = s.recoil.pattern === 'rifle' ? Math.min(1.35, 0.8 + i * 0.06) : 1;
    return {
      pitch: s.recoil.pitch * ramp * (0.9 + Math.random() * 0.2) * DEG,
      yaw: s.recoil.yaw * patternYaw(s.recoil.pattern, i) * DEG,
    };
  }
  /** Current cone half-angle in radians. */
  spread({ ads, moving, airborne, crouching }) {
    const sp = this.stats.spread;
    let deg = sp.hip + (sp.ads - sp.hip) * ads;
    deg += sp.move * moving * (1 - ads * 0.6);
    if (airborne) deg += sp.air;
    if (crouching) deg *= sp.crouch;
    deg += this.bloom * (1 - ads * 0.5);
    return Math.max(0, deg) * DEG;
  }
}
