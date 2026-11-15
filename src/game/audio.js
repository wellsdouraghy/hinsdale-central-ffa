// Procedural WebAudio sound: gunshots, reloads, footsteps, hit feedback. No external samples.
// The AudioContext is created lazily on the first user gesture (avoids autoplay warnings).

const SHOT_PARAMS = {
  ar:      { len: 0.9, crack: 0.9, body: 1.0, bodyCut: 2600, bodyDecay: 0.045, thump: 0.95, f0: 165, f1: 52, thumpDecay: 0.07, tail: 0.38, tailCut: 900, tailDecay: 0.3, drive: 2.4 },
  smg:     { len: 0.6, crack: 0.85, body: 0.8, bodyCut: 3400, bodyDecay: 0.03, thump: 0.6, f0: 210, f1: 70, thumpDecay: 0.045, tail: 0.26, tailCut: 1200, tailDecay: 0.2, drive: 2.2 },
  sniper:  { len: 1.7, crack: 1.0, body: 1.25, bodyCut: 2000, bodyDecay: 0.09, thump: 1.25, f0: 120, f1: 38, thumpDecay: 0.13, tail: 0.62, tailCut: 650, tailDecay: 0.75, drive: 2.8 },
  shotgun: { len: 1.3, crack: 0.75, body: 1.35, bodyCut: 1500, bodyDecay: 0.1, thump: 1.35, f0: 105, f1: 40, thumpDecay: 0.12, tail: 0.5, tailCut: 600, tailDecay: 0.55, drive: 2.8 },
  pistol:  { len: 0.7, crack: 0.95, body: 0.8, bodyCut: 3000, bodyDecay: 0.035, thump: 0.6, f0: 230, f1: 85, thumpDecay: 0.05, tail: 0.3, tailCut: 1300, tailDecay: 0.24, drive: 2.2 },
};

// ---------- mix ----------
// Every buffer is synthesized and normalized, so these numbers ARE the mix (linear gain at play time).
// Measured at default sliders with an OfflineAudioContext (momentary loudness): your AR shot ~-24 LUFS, an enemy
// AR at 10 m ~-28, a grenade at 6 m ~-19, enemy footsteps at 4 m ~-35 (12 m ~-44), UI clicks ~-44 and below.
const MIX = {
  shot: { ar: 0.61, smg: 0.69, pistol: 0.63, sniper: 0.53, shotgun: 0.53 },   // your own gun (2D)
  shotRemote: 0.6,     // x the weapon's level, at <= 10 m; falls off ~6 dB per doubling beyond
  shotMech: 0.35,      // bolt / pump after the shot
  reload: 0.55,
  explosion: 0.85,
  ring: 0.05,          // ear-ringing tone after a close blast
  rotor: 1.8,          // helicopter rotor loop (x the game's own 0..0.5 gain)
  cannon: 0.85,
  rocket: 1.05,
  crash: 1.05,
  jetFlyby: 0.8,
  jet: 0.67,
  plane: 0.49,
  crate: 0.45,
  ui: 1.2,             // menu clicks
  hit: 1.0,            // hitmarkers
  kill: 0.35,
  hurt: 0.55,
  jingle: 0.35,
  kit: 0.75,            // dash / double jump / mantle / melee swing
  grapple: 0.8,
  foot: 1.85,           // other players' footsteps (positional)
  footLocal: 0.35,     // 2D steps (heli cockpit thuds, mantle)
};

// Distance models (exponential: 6 dB per doubling at roll 1). `air`: metres at which the air-absorption
// low-pass is down to 10 kHz (distant sounds get duller). `sos`: delay by the speed of sound.
const DIST = {
  gun:     { ref: 10, roll: 1.0, max: 450, air: 22, sos: true },
  boom:    { ref: 6, roll: 1.15, max: 600, air: 30, sos: true },
  impact:  { ref: 6, roll: 1.1, max: 140, air: 18 },
  foot:    { ref: 3, roll: 1.0, max: 44, air: 9 },
  near:    { ref: 4, roll: 1.15, max: 70, air: 14 },
  vehicle: { ref: 40, roll: 0.9, max: 2000, air: 120 },
};

/** opts.mute (debug ?mute=1): everything is processed but nothing ever reaches the speakers. */
// Mix: every effect goes SFX bus (taper(Effects slider)) -> ear-ringing muffle -> taper(Master slider)
// -> gentle glue compressor -> peak limiter (~-8 dBFS ceiling). Voice has its own bus (VoiceAudio) and slider.
const SFX_TRIM = 1.0;
export const VOICE_FLOOR = 0.25;   // voice can't be turned fully off (proximity chat is always on)
// Sliders are perceptual: gain = v^2 (0.8 -> -3.9 dB, 0.6 -> -8.9 dB, 0.3 -> -21 dB).
const taper = (v) => v * v;
// DynamicsCompressorNode applies automatic makeup gain ((1 / fullRangeGain)^0.6, per the Web Audio spec),
// which boosted every quiet sound by ~7 dB in the old chain. These trims cancel it for the settings below
// (measured with an OfflineAudioContext), so the compressors only ever turn things down.
const GLUE = { threshold: -20, knee: 12, ratio: 2.5, attack: 0.008, release: 0.25, makeupDb: 4.99 };
const LIMIT = { threshold: -9, knee: 0, ratio: 20, attack: 0.001, release: 0.15, makeupDb: 5.13 };

export function createAudio({ mute = false } = {}) {
  let ctx = null, master = null, sfx = null, muffle = null;
  let volume = 0.8, sfxVolume = 0.6, voiceVolume = 0.85;
  const buffers = {};
  const listenerPos = { x: 0, y: 0, z: 0 };

  function compressor(p) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = p.threshold; c.knee.value = p.knee; c.ratio.value = p.ratio;
    c.attack.value = p.attack; c.release.value = p.release;
    const trim = ctx.createGain();
    trim.gain.value = Math.pow(10, -p.makeupDb / 20);
    c.connect(trim);
    return [c, trim];
  }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    // Gentle glue (slow release, low ratio: no pumping) + a fast limiter that only touches real peaks.
    const [glue, glueOut] = compressor(GLUE);
    const [limiter, limOut] = compressor(LIMIT);
    glueOut.connect(limiter);
    limOut.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = mute ? 0 : taper(volume);
    master.connect(glue);
    sfx = ctx.createGain();
    sfx.gain.value = SFX_TRIM * taper(sfxVolume);
    // Ear-ringing muffle after close explosions: low-pass between the SFX bus and master.
    muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 20000;
    sfx.connect(muffle);
    muffle.connect(master);
    build();
    return true;
  }

  // ---------- buffer synthesis ----------
  function build() {
    const sr = ctx.sampleRate;
    for (const [id, p] of Object.entries(SHOT_PARAMS)) {
      buffers['shot_' + id] = [0, 1, 2].map(() => synthShot(sr, p));
    }
    buffers.click = synthClick(sr, 2600, 0.012, 0.6);
    buffers.clickLow = synthClick(sr, 900, 0.03, 0.9);
    buffers.magOut = synthClick(sr, 700, 0.05, 1.0, 0.012);
    buffers.magIn = synthClick(sr, 1100, 0.04, 1.0, 0.006);
    buffers.bolt = synthClick(sr, 1600, 0.06, 1.0, 0.02);
    buffers.dry = synthClick(sr, 2200, 0.008, 0.5);
    for (const surf of Object.keys(FOOT_SURF)) {
      buffers['foot_' + surf] = Array.from({ length: 8 }, () => synthFoot(sr, surf, false));
      buffers['land_' + surf] = Array.from({ length: 3 }, () => synthFoot(sr, surf, true));
    }
    buffers.tick = synthTone(sr, [[2900, 0.55], [4400, 0.18]], 0.02, 0.5);
    buffers.headTick = synthTone(sr, [[2450, 0.6], [3720, 0.4]], 0.06, 0.6);
    buffers.killDing = synthTone(sr, [[1318, 0.55], [1976, 0.3], [2637, 0.08]], 0.22, 0.6);
    buffers.hurt = synthHurt(sr);
    buffers.swoosh = synthSwoosh(sr);
    buffers.equip = synthClick(sr, 1300, 0.05, 0.7, 0.03);
    // Props / crashes (crate landing, heli crunch).
    buffers.clank = synthTone(sr, [[880, 0.5], [1390, 0.35], [2310, 0.2], [3650, 0.06]], 0.06, 0.8);
    buildGrapple(sr);
    buffers.boom = makeBuffer(sr, 2.6, (d, n) => {
      let l1 = 0, l2 = 0, ph = 0, c1 = 0, c2 = 0;
      const a = onePole(900, sr), a2 = onePole(260, sr), ac = onePole(5000, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        l1 += a * (w - l1);
        l2 += a2 * (w - l2);
        c1 += ac * (w - c1); c2 += ac * (c1 - c2);   // the initial crack, without the fizz
        ph += (2 * Math.PI * (30 + 60 * Math.exp(-t / 0.08))) / sr;
        const x = (c2 * 2.2 * Math.exp(-t / 0.02) + l1 * 3 * Math.exp(-t / 0.25) + l2 * 6 * Math.exp(-t / 0.9) + Math.sin(ph) * 1.4 * Math.exp(-t / 0.35)) * Math.min(1, t / 0.002);
        d[i] = Math.tanh(x * 2.2);
      }
    });
    buffers.ring = synthTone(sr, [[3150, 0.5], [3230, 0.4]], 0.7, 0.5);
    // Rotor wash loop: 1.0 s = exactly 5 blade slaps (seamless), plus a faint turbine whine.
    buffers.rotor = makeBuffer(sr, 1.0, (d, n) => {
      let l = 0;
      const a = onePole(420, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        l += a * ((Math.random() * 2 - 1) - l);
        const ph = (t * 5) % 1;
        const slap = Math.exp(-ph / 0.07);
        d[i] = l * 3 * (0.35 + slap) + Math.sin(2 * Math.PI * 880 * t) * 0.02 + Math.sin(2 * Math.PI * 40 * t) * slap * 0.5;
      }
    });
    buffers.jet = makeBuffer(sr, 3.5, (d, n) => {
      let l = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const fc = 300 + 2500 * Math.exp(-Math.pow((t - 1.6) / 0.7, 2));
        const a = onePole(fc, sr);
        l += a * ((Math.random() * 2 - 1) - l);
        d[i] = l * 3 * Math.sin(Math.PI * Math.min(1, t / 3.5));
      }
    });
    // Strike-jet roar loop: low turbine rumble + broadband jet noise + a thin whine (seamless: ends cross-faded).
    buffers.jetLoop = makeBuffer(sr, 2.0, (d, n) => {
      const fade = Math.floor(sr * 0.25), m = n + fade;
      const tmp = new Float32Array(m);
      let l1 = 0, l2 = 0, h1 = 0, h2 = 0;
      const aLow = onePole(160, sr), aMid = onePole(1400, sr), aHi = onePole(5200, sr);
      for (let i = 0; i < m; i++) {
        const w = Math.random() * 2 - 1;
        l1 += aLow * (w - l1);
        l2 += aMid * (w - l2);
        h1 += aHi * (w - h1);
        h2 += aHi * (h1 - h2);
        const t = i / sr;
        tmp[i] = l1 * 5 + l2 * 1.4 + (h1 - h2) * 0.8 + Math.sin(2 * Math.PI * 2350 * t) * 0.006;
      }
      for (let i = 0; i < n; i++) d[i] = tmp[i];
      for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = tmp[i] * k + tmp[n + i] * (1 - k); }
    });
    buffers.thrust = makeBuffer(sr, 0.4, (d, n) => {
      let l = 0, l2 = 0;
      const a = onePole(1100, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        l += a * ((Math.random() * 2 - 1) - l);
        l2 += a * (l - l2);
        d[i] = (l2 * 3 + (Math.random() * 2 - 1) * 0.03) * Math.min(1, t / 0.006) * Math.exp(-t / 0.11);
      }
    });
    // CTF announcement stingers (original note sequences: [semitones from A4, start s, length s]).
    buffers.j_good = synthSeq(sr, [[3, 0, 0.18], [7, 0.1, 0.18], [10, 0.2, 0.35]]);
    buffers.j_bad = synthSeq(sr, [[5, 0, 0.22], [1, 0.14, 0.22], [-4, 0.28, 0.45]], true);
    buffers.j_neutral = synthSeq(sr, [[0, 0, 0.18], [0, 0.16, 0.25]]);
    buffers.j_capture = synthSeq(sr, [[-2, 0, 0.16], [3, 0.12, 0.16], [7, 0.24, 0.16], [12, 0.36, 0.6], [15, 0.36, 0.6]]);
    buffers.j_enemyCapture = synthSeq(sr, [[7, 0, 0.25], [3, 0.18, 0.25], [-2, 0.36, 0.25], [-5, 0.54, 0.7]], true);
  }

  function synthSeq(sr, notes, dark = false) {
    const len = Math.max(...notes.map(([, s, l]) => s + l)) + 0.3;
    return makeBuffer(sr, len, (d, n) => {
      for (const [semi, start, l] of notes) {
        const f = 440 * Math.pow(2, semi / 12);
        const i0 = Math.floor(start * sr), i1 = Math.min(n, Math.floor((start + l + 0.25) * sr));
        for (let i = i0; i < i1; i++) {
          const t = i / sr - start;
          const env = Math.min(1, t / 0.012) * (t < l ? 1 : Math.exp(-(t - l) / 0.06)) * Math.exp(-t * (dark ? 2.5 : 1.5));
          // rounded lead + octave sub for a radio-chirp feel (mild drive: fewer buzzy upper harmonics)
          const s = Math.tanh(Math.sin(2 * Math.PI * f * t) * 1.4) * 0.6 + Math.sin(Math.PI * f * t) * (dark ? 0.5 : 0.35);
          d[i] += s * env;
        }
      }
    });
  }

  /** norm: peak to normalize to (null = leave as synthesized). */
  function makeBuffer(sr, len, fn, norm = 0.9) {
    const n = Math.floor(sr * len);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    fn(d, n, sr);
    if (norm) {
      let peak = 0;
      for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
      if (peak > 0) for (let i = 0; i < n; i++) d[i] *= norm / peak;
    }
    return buf;
  }

  function onePole(fc, sr) { return 1 - Math.exp((-2 * Math.PI * fc) / sr); }

  function synthShot(sr, p) {
    return makeBuffer(sr, p.len, (d, n) => {
      const aBody = onePole(p.bodyCut * (0.9 + Math.random() * 0.2), sr);
      const aTail = onePole(p.tailCut, sr);
      const aCrack = onePole(7000, sr);
      let lb = 0, lt1 = 0, lt2 = 0, phase = 0, prevN = 0, c1 = 0, c2 = 0;
      const drive = p.drive;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        // muzzle crack: differentiated noise, but rolled off above ~7 kHz so it snaps instead of hissing
        c1 += aCrack * ((w - prevN) - c1); c2 += aCrack * (c1 - c2);
        const crack = c2 * 0.9 * Math.exp(-t / 0.005) * p.crack;
        prevN = w;
        lb += aBody * (w - lb);
        const body = lb * 3 * Math.exp(-t / p.bodyDecay) * p.body;
        const f = p.f1 + (p.f0 - p.f1) * Math.exp(-t / 0.03);
        phase += (2 * Math.PI * f) / sr;
        const thump = Math.sin(phase) * Math.exp(-t / p.thumpDecay) * p.thump;
        lt1 += aTail * (w - lt1);
        lt2 += aTail * (lt1 - lt2);
        // slightly modulated tail (crude reflections)
        const refl = 1 + 0.35 * Math.sin(t * 37) * Math.exp(-t * 3);
        const tail = lt2 * 6 * Math.exp(-t / p.tailDecay) * (1 - Math.exp(-t / 0.012)) * p.tail * refl;
        const attack = Math.min(1, t / 0.0006);
        const x = (crack + body + thump + tail) * attack;
        d[i] = Math.tanh(x * drive) / Math.tanh(drive);
      }
    });
  }

  // Mechanical click: a short damped tone + a low-passed noise tick (no raw white-noise spike).
  function synthClick(sr, freq, decay, gain, second = 0) {
    return makeBuffer(sr, decay * 4 + second + 0.02, (d, n) => {
      const a = onePole(Math.min(6000, freq * 2.5), sr);
      const hit = (t0, g) => {
        let l1 = 0, l2 = 0;
        for (let i = Math.floor(t0 * sr); i < n; i++) {
          const t = i / sr - t0;
          const w = Math.random() * 2 - 1;
          l1 += a * (w - l1); l2 += a * (l1 - l2);
          d[i] += g * Math.min(1, t / 0.0004) * (Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / decay) * 0.6 +
            l2 * 2.5 * Math.exp(-t / (decay * 0.3)));
        }
      };
      hit(0, gain);
      if (second) hit(second, gain * 0.8);
    });
  }

  // ---------- grapple ----------
  // Short, soft and low-mid: a mechanical thunk + a light cable zip on fire, a dull "tok" when the hook
  // bites, a few faint ratchet ticks as the reel engages, a soft unclip on release. Nothing loops or rings.
  function buildGrapple(sr) {
    buffers.gThunk = makeBuffer(sr, 0.14, (d, n) => {
      let a1 = 0, a2 = 0, ph = 0;
      const a = onePole(1300, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1;
        a1 += a * (w - a1); a2 += a * (a1 - a2);
        ph += (2 * Math.PI * (70 + 100 * Math.exp(-t / 0.014))) / sr;
        d[i] = Math.min(1, t / 0.0012) * (Math.sin(ph) * 0.8 * Math.exp(-t / 0.026) + a2 * 5 * Math.exp(-t / 0.009));
      }
    });
    buffers.gZip = makeBuffer(sr, 0.2, (d, n) => {
      let h = 0, h2 = 0, l = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1;
        const fc = 650 + 1250 * Math.exp(-t / 0.05);   // ~1.9 kHz falling to 650 Hz as the line pays out
        const aH = onePole(fc * 1.5, sr);
        h += aH * (w - h); h2 += aH * (h - h2);
        l += onePole(fc * 0.5, sr) * (w - l);
        const flutter = 0.75 + 0.25 * Math.sin(2 * Math.PI * (130 - 220 * t) * t);
        d[i] = (h2 - l) * flutter * Math.min(1, t / 0.006) * Math.exp(-t / 0.042);
      }
    });
    buffers.gAttach = makeBuffer(sr, 0.12, (d, n) => {
      const modes = [[235, 0.028, 1], [560, 0.016, 0.4], [1090, 0.009, 0.16]];   // inharmonic, very damped: "tok"
      let a1 = 0, a2 = 0;
      const a = onePole(1700, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1;
        a1 += a * (w - a1); a2 += a * (a1 - a2);
        let v = a2 * 4 * Math.exp(-t / 0.006);
        for (const [f, dec, g] of modes) v += Math.sin(2 * Math.PI * f * t) * g * 0.5 * Math.exp(-t / dec);
        d[i] = v * Math.min(1, t / 0.0008);
      }
    });
    buffers.gReel = makeBuffer(sr, 0.17, (d, n) => {
      const ticks = [0, 0.038, 0.07, 0.097, 0.12];
      let a1 = 0, a2 = 0;
      const a = onePole(1500, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1;
        a1 += a * (w - a1); a2 += a * (a1 - a2);
        let v = 0;
        for (let k = 0; k < ticks.length; k++) {
          const dt = t - ticks[k];
          if (dt >= 0 && dt < 0.02) v += (a2 * 4 + Math.sin(2 * Math.PI * 180 * dt) * 0.25) * Math.min(1, dt / 0.0005) * Math.exp(-dt / 0.004) * Math.pow(0.68, k);
        }
        d[i] = v;
      }
    });
    buffers.gRelease = makeBuffer(sr, 0.1, (d, n) => {
      let a1 = 0, a2 = 0, ph = 0;
      const a = onePole(1100, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1;
        a1 += a * (w - a1); a2 += a * (a1 - a2);
        ph += (2 * Math.PI * (110 + 50 * Math.exp(-t / 0.01))) / sr;
        const t2 = t - 0.028;
        const e = Math.exp(-t / 0.005) + (t2 > 0 ? 0.4 * Math.exp(-t2 / 0.004) : 0);
        d[i] = Math.min(1, t / 0.0006) * (a2 * 4 * e + Math.sin(ph) * 0.35 * Math.exp(-t / 0.018));
      }
    });
    buffers.gDeny = makeBuffer(sr, 0.13, (d, n) => {
      let a1 = 0, a2 = 0;
      const a = onePole(900, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1;
        a1 += a * (w - a1); a2 += a * (a1 - a2);
        let v = 0;
        for (const [t0, g] of [[0, 1], [0.07, 0.75]]) {
          const dt = t - t0;
          if (dt >= 0) v += g * Math.min(1, dt / 0.0006) * (a2 * 4 * Math.exp(-dt / 0.006) + Math.sin(2 * Math.PI * 210 * dt) * 0.3 * Math.exp(-dt / 0.012));
        }
        d[i] = v;
      }
    });
  }

  // ---------- footsteps ----------
  // A step = heel strike + toe roll of a soft sole: low-passed noise "contact" (no tones, no white-noise clicks),
  // a short low body thump, a faint heel-to-toe scuff, and a surface layer (grass rustle, dirt crunch, grit,
  // or a few heavily damped resonances for hollow wood / sheet-metal roofs). Layers are mixed by RMS so the
  // surface colour stays subtle, and every buffer is normalized by loudness (not peak) so surfaces match.
  const FOOT_SURF = {
    //          contact LP Hz, body thump, scuff, texture kind, texture amt, damped modes [Hz, decay s, amt], level trim
    grass:    { lp: 1000, thump: 0.62, scuff: 0.12, tex: 'rustle', texAmt: 0.42, modes: [], level: 1.0 },
    dirt:     { lp: 1200, thump: 0.6, scuff: 0.22, tex: 'crunch', texAmt: 0.5, modes: [], level: 1.0 },
    rubber:   { lp: 900, thump: 0.62, scuff: 0.06, tex: null, texAmt: 0, modes: [], level: 0.92 },
    asphalt:  { lp: 1800, thump: 0.52, scuff: 0.22, tex: 'grit', texAmt: 0.3, modes: [], level: 1.0 },
    concrete: { lp: 2150, thump: 0.52, scuff: 0.15, tex: 'grit', texAmt: 0.16, modes: [], level: 1.0 },
    brick:    { lp: 2000, thump: 0.52, scuff: 0.18, tex: 'grit', texAmt: 0.24, modes: [], level: 1.0 },
    wood:     { lp: 1500, thump: 0.6, scuff: 0.08, tex: null, texAmt: 0, modes: [[150, 0.05, 0.55], [320, 0.034, 0.3], [640, 0.02, 0.12]], level: 1.0 },
    metal:    { lp: 2100, thump: 0.5, scuff: 0.08, tex: null, texAmt: 0, modes: [[190, 0.085, 0.42], [430, 0.065, 0.3], [790, 0.045, 0.2], [1270, 0.03, 0.1]], level: 1.05 },
    glass:    { lp: 2400, thump: 0.55, scuff: 0.1, tex: 'grit', texAmt: 0.08, modes: [[1700, 0.018, 0.08]], level: 1.0 },
  };
  function rms(a, i0, i1) { let s = 0; for (let i = i0; i < i1; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, i1 - i0)) || 1e-9; }
  function synthFoot(sr, surf, heavy) {
    const S = FOOT_SURF[surf] || FOOT_SURF.concrete;
    const R = Math.random;
    const len = heavy ? 0.3 : 0.24, n = Math.floor(sr * len);
    const toe = heavy ? 0.012 + R() * 0.02 : 0.045 + R() * 0.035;   // landing: both feet nearly together
    const toeAmt = heavy ? 0.7 + R() * 0.2 : 0.35 + R() * 0.25;
    const bright = (0.85 + R() * 0.3) * (heavy ? 0.8 : 1);
    const heelDec = heavy ? 0.011 : 0.007;
    const contact = new Float32Array(n), body = new Float32Array(n), scuff = new Float32Array(n), tex = new Float32Array(n);
    // contact: noise -> 2x low-pass at the surface brightness, minus a 150 Hz tracker (no sub rumble)
    const aC = onePole(S.lp * bright, sr), aHp = onePole(150, sr);
    let c1 = 0, c2 = 0, hp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, w = R() * 2 - 1;
      c1 += aC * (w - c1); c2 += aC * (c1 - c2); hp += aHp * (c2 - hp);
      const eHeel = (t < 0.0008 ? t / 0.0008 : Math.exp(-(t - 0.0008) / heelDec)) + 0.2 * Math.exp(-t / 0.035);
      const tt = t - toe;
      const eToe = tt <= 0 ? 0 : ((tt < 0.001 ? tt / 0.001 : Math.exp(-(tt - 0.001) / 0.006)) + 0.12 * Math.exp(-tt / 0.025)) * toeAmt;
      contact[i] = (c2 - hp) * (eHeel + eToe);
    }
    // body: soft pitch-dropping low thump + low-passed noise (a "whump", not a tone), mostly on the heel
    const thF = (heavy ? 58 : 72) + R() * 16, aB = onePole(220, sr);
    let ph = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, w = R() * 2 - 1;
      ph += (2 * Math.PI * thF * (1 + 0.7 * Math.exp(-t / 0.012))) / sr;
      b1 += aB * (w - b1); b2 += aB * (b1 - b2);
      const tt = t - toe;
      const e = (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / (heavy ? 0.04 : 0.024))) + (tt > 0 ? 0.3 * toeAmt * Math.exp(-tt / 0.02) : 0);
      body[i] = (Math.sin(ph) * 0.6 + b2 * 6) * e;
    }
    // scuff: quiet band noise dragging between heel and toe
    if (S.scuff > 0) {
      const aH = onePole(2600, sr), aL = onePole(800, sr), end = toe + 0.025;
      let h = 0, l = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = R() * 2 - 1;
        h += aH * (w - h); l += aL * (w - l);
        scuff[i] = t > 0.004 && t < end ? (h - l) * Math.sin((Math.PI * (t - 0.004)) / (end - 0.004)) : 0;
      }
    }
    // surface texture
    if (S.tex === 'rustle') {
      const aH = onePole(3600, sr), aL = onePole(1100, sr);
      let h = 0, l = 0, m = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = R() * 2 - 1;
        h += aH * (w - h); l += aL * (w - l);
        m += 0.004 * ((R() < 0.02 ? 1 : 0.2) - m);   // uneven blades
        const tt = t - toe;
        const e = Math.min(1, t / 0.006) * Math.exp(-t / 0.05) + (tt > 0 ? 0.6 * Math.min(1, tt / 0.006) * Math.exp(-tt / 0.045) : 0);
        tex[i] = (h - l) * e * (0.6 + m * 2);
      }
    } else if (S.tex) {
      const crunch = S.tex === 'crunch';
      const count = crunch ? 14 + Math.floor(R() * 10) : 6 + Math.floor(R() * 6);
      const grains = Array.from({ length: count }, () => [(R() < 0.6 ? 0 : toe) + R() * (crunch ? 0.06 : 0.035), 0.3 + R() * 0.7, crunch ? 0.0016 : 0.0009]);
      const aH = onePole(crunch ? 2800 : 3600, sr), aL = onePole(crunch ? 600 : 900, sr);
      let h = 0, l = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = R() * 2 - 1;
        h += aH * (w - h); l += aL * (w - l);
        let g = 0;
        for (const [g0, ga, gd] of grains) { const dt = t - g0; if (dt > 0 && dt < gd * 8) g += ga * Math.min(1, dt / 0.0003) * Math.exp(-dt / gd); }
        tex[i] = (h - l) * g;
      }
    }
    // damped resonances (hollow surfaces), excited by the contact layer
    const modal = new Float32Array(n);
    for (const [f, dec, amt] of S.modes) {
      const w = (2 * Math.PI * f * (0.95 + R() * 0.1)) / sr, r = Math.exp(-1 / (dec * sr));
      const k1 = 2 * r * Math.cos(w), k2 = -r * r;
      const out = new Float32Array(n);
      let y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) { const y = contact[i] + k1 * y1 + k2 * y2; out[i] = y; y2 = y1; y1 = y; }
      const g = (amt * rms(contact, 0, n)) / rms(out, 0, n);
      for (let i = 0; i < n; i++) modal[i] += out[i] * g;
    }
    // mix by RMS relative to the contact layer
    const rc = rms(contact, 0, n);
    const gBody = (S.thump * (heavy ? 1.5 : 1) * rc) / rms(body, 0, n);
    const gScuff = S.scuff > 0 ? (S.scuff * rc) / rms(scuff, 0, n) : 0;
    const gTex = S.tex ? (S.texAmt * rc) / rms(tex, 0, n) : 0;
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = contact[i] + body[i] * gBody + scuff[i] * gScuff + tex[i] * gTex + modal[i];
    for (let i = Math.floor(n * 0.8); i < n; i++) d[i] *= (n - i) / (n * 0.2);   // fade the tail
    // loudness-normalize (RMS over the step), then keep peaks soft
    const k = 0.12 / rms(d, 0, Math.floor(sr * 0.15));
    let pk = 0;
    for (let i = 0; i < n; i++) { d[i] *= k; pk = Math.max(pk, Math.abs(d[i])); }
    if (pk > 0.9) for (let i = 0; i < n; i++) d[i] *= 0.9 / pk;
    return buf;
  }

  function synthTone(sr, partials, decay, gain) {
    return makeBuffer(sr, decay * 5, (d, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let s = 0;
        for (const [f, g] of partials) s += Math.sin(2 * Math.PI * f * t) * g;
        d[i] = s * Math.exp(-t / decay) * Math.min(1, t / 0.001) * gain;
      }
    });
  }

  function synthHurt(sr) {
    return makeBuffer(sr, 0.35, (d, n) => {
      let l = 0, phase = 0;
      const a = onePole(500, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        l += a * ((Math.random() * 2 - 1) - l);
        phase += (2 * Math.PI * (90 - 40 * t)) / sr;
        d[i] = (Math.sin(phase) * 1.2 + l * 2) * Math.exp(-t / 0.08);
      }
    });
  }

  function synthSwoosh(sr) {
    return makeBuffer(sr, 0.3, (d, n) => {
      let l = 0, b = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const fc = 500 + 2200 * Math.sin(Math.PI * Math.min(1, t / 0.25));
        const a = onePole(fc, sr);
        l += a * ((Math.random() * 2 - 1) - l);
        b += a * (l - b);
        d[i] = (l - b) * Math.sin(Math.PI * Math.min(1, t / 0.28));
      }
    });
  }

  // ---------- playback ----------
  function pick(name) {
    const b = buffers[name];
    return Array.isArray(b) ? b[Math.floor(Math.random() * b.length)] : b;
  }

  /** Distance gain for model m: exponential roll-off beyond ref, smooth fade to silence over the last 25% to max. */
  function distGain(dist, m) {
    let g = Math.pow(Math.max(dist, m.ref) / m.ref, -m.roll);
    const f0 = m.max * 0.75;
    if (dist > f0) { const k = Math.min(1, (dist - f0) / (m.max - f0)); g *= 1 - k * k * (3 - 2 * k); }
    return g;
  }

  function panner(p) {
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'linear';   // distance gain is applied by hand (distGain); the panner only places it
    pan.rolloffFactor = 0;
    pan.refDistance = 1;
    pan.maxDistance = 10000;
    setPos(pan, p);
    return pan;
  }
  function setPos(pan, p, tc = 0) {
    if (pan.positionX) {
      if (tc) { const t = ctx.currentTime; pan.positionX.setTargetAtTime(p.x, t, tc); pan.positionY.setTargetAtTime(p.y, t, tc); pan.positionZ.setTargetAtTime(p.z, t, tc); }
      else { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; }
    } else pan.setPosition(p.x, p.y, p.z);
  }
  function distTo(p) {
    const dx = p.x - listenerPos.x, dy = p.y - listenerPos.y, dz = p.z - listenerPos.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** Plays buffer `name`. pos: {x,y,z} for 3D, else 2D. opts: { gain, rate, delay, dist (DIST key), lp (extra low-pass Hz) } */
  function play(name, pos = null, opts = {}) {
    if (!ctx || ctx.state !== 'running') return;
    const buf = pick(name);
    if (!buf) return;
    let gain = opts.gain ?? 1;
    let when = ctx.currentTime + (opts.delay || 0);
    let lp = opts.lp || 20000;
    if (pos) {
      const m = DIST[opts.dist] || DIST.near;
      const dist = distTo(pos);
      if (dist >= m.max) return;
      gain *= distGain(dist, m);
      lp = Math.min(lp, 20000 / (1 + dist / (m.air / 1)));   // ~10 kHz at `air` metres
      if (m.sos) when += Math.min(0.5, dist / 343);
    }
    if (gain < 1e-4) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = src.connect(g);
    if (lp < 16000) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(400, lp);
      f.Q.value = 0.5;
      node = node.connect(f);
    }
    if (pos) node = node.connect(panner(pos));
    node.connect(sfx);
    src.start(when);
  }

  const RELOAD_SEQ = {
    default: [[0.15, 'magOut'], [0.62, 'magIn'], [0.85, 'bolt']],
    pistol: [[0.15, 'magOut'], [0.65, 'magIn'], [0.88, 'click']],
    sniper: [[0.1, 'bolt'], [0.3, 'magOut'], [0.65, 'magIn'], [0.9, 'bolt']],
  };
  const surfOf = (s) => (FOOT_SURF[s] ? s : 'concrete');
  const jitter = (a, b) => a + Math.random() * (b - a);

  return {
    ensure,
    get ready() { return !!ctx && ctx.state === 'running'; },
    setVolume(v) { volume = v; if (master) master.gain.value = mute ? 0 : taper(v); },
    setSfxVolume(v) { sfxVolume = v; if (sfx) sfx.gain.value = SFX_TRIM * taper(v); },
    setVoiceVolume(v) { voiceVolume = Math.max(VOICE_FLOOR, v); },
    get voiceVolume() { return voiceVolume; },
    get muted() { return mute; },
    setListener(camera) {
      if (!ctx) return;
      const l = ctx.listener;
      const e = camera.matrixWorld.elements;
      const px = e[12], py = e[13], pz = e[14];
      const fx = -e[8], fy = -e[9], fz = -e[10];
      const ux = e[4], uy = e[5], uz = e[6];
      if (!Number.isFinite(px + py + pz + fx + fy + fz + ux + uy + uz)) return;   // degenerate camera (0-size viewport)
      listenerPos.x = px; listenerPos.y = py; listenerPos.z = pz;
      if (l.positionX) {
        l.positionX.value = px; l.positionY.value = py; l.positionZ.value = pz;
        l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
        l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
      } else {
        l.setPosition(px, py, pz);
        l.setOrientation(fx, fy, fz, ux, uy, uz);
      }
    },
    /** Gunshot. pos null = local player (2D, full punch). */
    shot(weaponId, pos = null) {
      const id = SHOT_PARAMS[weaponId] ? weaponId : 'ar';
      const lvl = MIX.shot[id] * jitter(0.92, 1.05);
      const rate = jitter(0.95, 1.05);
      if (!pos) play('shot_' + id, null, { gain: lvl, rate });
      else play('shot_' + id, pos, { gain: lvl * MIX.shotRemote, rate, dist: 'gun' });
      const mech = id === 'sniper' ? 'bolt' : id === 'shotgun' ? 'magOut' : null;
      if (mech) play(mech, pos, { gain: MIX.shotMech * (pos ? 0.6 : 1), delay: id === 'sniper' ? 0.45 : 0.3, dist: 'near' });
    },
    reload(weaponId, dur) {
      const g = MIX.reload;
      if (weaponId === 'shotgun') {
        const n = Math.max(1, Math.round((dur - 0.35) / 0.5));
        for (let i = 0; i < n; i++) play('magIn', null, { gain: g, delay: 0.3 + i * 0.5, rate: 1.2 });
        play('magOut', null, { gain: g, delay: dur - 0.15 });
        return;
      }
      const seq = RELOAD_SEQ[weaponId] || RELOAD_SEQ.default;
      for (const [f, n] of seq) play(n, null, { gain: g, delay: f * dur });
    },
    /** Footstep. gain: the game's stride weight (crouch ~0.3, walk 0.8, sprint ~1.2); crouched steps are also duller. */
    footstep(surface, pos = null, gain = 1) {
      const s = surfOf(surface);
      const soft = gain < 0.5;
      const lvl = MIX.foot * gain * FOOT_SURF[s].level * jitter(0.84, 1.12);
      play('foot_' + s, pos, {
        gain: pos ? lvl : lvl * MIX.footLocal,
        rate: (soft ? 0.9 : gain > 1 ? 1.0 : 0.96) + Math.random() * 0.08,
        dist: 'foot',
        lp: soft ? 1500 : 0,
      });
    },
    /** Landing thump (both feet, heavier and lower). intensity ~1 for a normal jump, up to ~1.6 for a big drop. */
    land(surface, pos = null, intensity = 1) {
      const s = surfOf(surface);
      const lvl = MIX.foot * 1.05 * Math.min(1.6, intensity) * FOOT_SURF[s].level;
      // your own landing (2D) is a dull body thump under everything else; others' landings are positional cues
      play('land_' + s, pos, { gain: pos ? lvl : lvl * MIX.footLocal * 0.8, rate: jitter(0.9, 1.0), dist: 'foot', lp: pos ? 0 : 900 });
    },
    hitmarker(kind) {
      if (kind === 'head') play('headTick', null, { gain: MIX.hit * 0.53 });
      else play('tick', null, { gain: MIX.hit * 0.57 });
    },
    kill(headshot) {
      play('killDing', null, { gain: MIX.kill });
      if (headshot) play('headTick', null, { gain: MIX.hit * 0.3, delay: 0.05, rate: 1.2 });
    },
    hurt() { play('hurt', null, { gain: MIX.hurt, rate: jitter(0.9, 1.1) }); },
    dryFire() { play('dry', null, { gain: 0.65 }); },
    equip() { play('equip', null, { gain: 0.4 }); },
    melee(pos = null) { play('swoosh', pos, { gain: MIX.kit * 0.65 }); },
    ui() { play('click', null, { gain: MIX.ui * 0.3 }); },
    /** Front-end menu sounds (quiet; silent with ?mute=1 like everything else). */
    uiHover() { play('tick', null, { gain: MIX.ui * 0.037, rate: 1.25 }); },
    uiSelect() { play('click', null, { gain: MIX.ui * 0.22, rate: 1.1 }); play('tick', null, { gain: MIX.ui * 0.06, rate: 0.8, delay: 0.03 }); },
    uiBack() { play('click', null, { gain: MIX.ui * 0.15, rate: 0.75 }); },
    grappleLaunch(dist = 20) {
      const g = MIX.grapple, bite = Math.min(0.22, dist / 140);
      play('gThunk', null, { gain: g, rate: jitter(0.95, 1.05) });
      play('gZip', null, { gain: g * 0.5, rate: jitter(0.92, 1.05) });
      play('gAttach', null, { gain: g * 0.55, delay: bite, rate: jitter(0.95, 1.05) });
      play('gReel', null, { gain: g * 0.3, delay: bite + 0.05 });
    },
    grappleDeny() { play('gDeny', null, { gain: MIX.grapple * 0.5 }); },
    grappleRelease() { play('gRelease', null, { gain: MIX.grapple * 0.55, rate: jitter(0.95, 1.05) }); },
    dash() { play('swoosh', null, { gain: MIX.kit * 0.55, rate: 0.75 }); play('thrust', null, { gain: MIX.kit * 0.35, rate: 1.2 }); },
    thruster(pos = null) { play('thrust', pos, { gain: MIX.kit * (pos ? 1.2 : 0.65), dist: 'near' }); },
    mantle() { play('swoosh', null, { gain: MIX.kit * 0.22, rate: 0.6 }); play('land_concrete', null, { gain: MIX.foot * MIX.footLocal * 0.65, delay: 0.16, rate: 1.05 }); },
    remoteGrapple(pos) { play('gAttach', pos, { gain: MIX.grapple * 0.9, dist: 'near' }); play('gZip', pos, { gain: MIX.grapple * 0.45, rate: 0.9, dist: 'near' }); },
    pin() { play('click', null, { gain: 0.4, rate: 0.7 }); play('click', null, { gain: 0.28, rate: 1.2, delay: 0.08 }); },
    throwWhoosh() { play('swoosh', null, { gain: MIX.kit * 0.6, rate: 1.1 }); },
    explosion(pos) { play('boom', pos, { gain: MIX.explosion, dist: 'boom' }); },
    ringing(sec = 2) {
      if (!ctx || !muffle) return;
      const t = ctx.currentTime;
      muffle.frequency.cancelScheduledValues(t);
      muffle.frequency.setValueAtTime(600, t);
      muffle.frequency.exponentialRampToValueAtTime(20000, t + sec);
      play('ring', null, { gain: MIX.ring });
    },
    jet(pos, delay = 0) { play('jet', pos, { gain: MIX.jet, dist: 'vehicle', delay: Math.max(0, delay - 1.6) }); },
    plane(pos) { play('jet', pos, { gain: MIX.plane, dist: 'vehicle' }); },
    /** Strike-jet flyby voice: call update(pos, vel) each frame; doppler from the radial speed vs the listener. */
    jetFlyby(gain = 1) {
      if (!ctx || ctx.state !== 'running' || !buffers.jetLoop) return null;
      const src = ctx.createBufferSource();
      src.buffer = buffers.jetLoop;
      src.loop = true;
      src.loopStart = 0; src.loopEnd = buffers.jetLoop.duration;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2000;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = panner(listenerPos);
      src.connect(lp).connect(g).connect(pan).connect(sfx);
      src.start();
      let stopped = false;
      const m = { ref: 45, roll: 1.1, max: 5000 };
      return {
        update(pos, vel) {
          if (stopped) return;
          const dist = Math.max(1, distTo(pos));
          const dx = pos.x - listenerPos.x, dy = pos.y - listenerPos.y, dz = pos.z - listenerPos.z;
          const radial = (vel.x * dx + vel.y * dy + vel.z * dz) / dist;   // > 0: moving away
          const doppler = Math.max(0.55, Math.min(1.7, 343 / (343 + radial)));
          const t = ctx.currentTime;
          setPos(pan, pos, 0.03);
          src.playbackRate.setTargetAtTime(doppler * 0.9, t, 0.05);
          // Far away: only the rumble carries; overhead: the full roar (but no hiss).
          lp.frequency.setTargetAtTime(Math.min(6000, Math.max(450, 9000 / (1 + dist / 120)) * doppler), t, 0.05);
          g.gain.setTargetAtTime(gain * MIX.jetFlyby * distGain(dist, m), t, 0.15);
        },
        stop() {
          if (stopped) return;
          stopped = true;
          try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); src.stop(ctx.currentTime + 2); } catch { /* ignore */ }
        },
      };
    },
    /** Melee finisher hits (positional). */
    impact(pos = null) { play('boom', pos, { gain: 0.35, rate: 2.7, dist: 'impact' }); play('land_concrete', pos, { gain: 1.0, rate: 0.7, dist: 'impact' }); },
    thud(pos = null) { play('boom', pos, { gain: 0.4, rate: 1.6, dist: 'impact' }); play('land_dirt', pos, { gain: 1.1, rate: 0.65, dist: 'impact' }); },
    stab(pos = null) { play('swoosh', pos, { gain: 0.35, rate: 2.0, dist: 'near' }); play('click', pos, { gain: 0.45, rate: 0.45, dist: 'near', delay: 0.03 }); },
    crateLand(pos) { play('boom', pos, { gain: MIX.crate * 0.6, rate: 2.2, dist: 'impact' }); play('clank', pos, { gain: MIX.crate, dist: 'impact' }); },
    /** Looping positional sound (helicopter rotor). Returns { set(pos, gain, rate, local), stop() } or null. */
    loop(name) {
      if (!ctx || ctx.state !== 'running' || !buffers[name]) return null;
      const src = ctx.createBufferSource();
      src.buffer = buffers[name];
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = panner(listenerPos);
      src.connect(lp).connect(g).connect(pan).connect(sfx);
      src.start();
      const m = { ref: 12, roll: 1.35, max: 900, air: 40 };
      return {
        set(pos, gain, rate, local = false) {
          const p = local ? listenerPos : pos;
          const dist = local ? 0 : distTo(pos);
          const t = ctx.currentTime;
          setPos(pan, p);
          // In the cockpit the rotor is a muffled drone through the hull; outside, distance dulls it.
          lp.frequency.setTargetAtTime(local ? 1400 : Math.max(500, 4000 / (1 + dist / m.air)), t, 0.1);
          g.gain.setTargetAtTime(gain * MIX.rotor * (local ? 0.75 : distGain(dist, m)), t, 0.1);
          src.playbackRate.setTargetAtTime(Math.max(0.3, rate), t, 0.1);
        },
        stop() { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); src.stop(ctx.currentTime + 0.8); } catch { /* ignore */ } },
      };
    },
    crunch(pos = null, big = false) {
      const g = MIX.crash;
      play('boom', pos, { gain: g * (big ? 0.9 : 0.5), rate: big ? 1.3 : 2.0, dist: 'impact' });
      play('clank', pos, { gain: g * 0.8, rate: jitter(0.7, 0.9), dist: 'impact' });
      play('magOut', pos, { gain: g * 0.6, rate: 0.5, dist: 'impact', delay: 0.04 });
    },
    beep() { play('tick', null, { gain: 0.45, rate: 0.55 }); play('tick', null, { gain: 0.45, rate: 0.55, delay: 0.12 }); },
    cannon(pos = null) { play('shot_smg', pos, { gain: MIX.cannon * (pos ? MIX.shotRemote * 1.4 : 0.64), rate: jitter(0.72, 0.77), dist: 'gun' }); },
    rocket(pos = null) { play('swoosh', pos, { gain: MIX.rocket, rate: 0.6, dist: 'impact' }); play('thrust', pos, { gain: MIX.rocket * 0.9, rate: 0.7, dist: 'impact' }); },
    /** The AudioContext (for voice chat), created on the first user gesture. */
    get context() { return ctx; },
    get masterVolume() { return volume; },
    /** CTF stingers: 'good' | 'bad' | 'neutral' | 'capture' | 'enemyCapture' */
    jingle(kind) { play('j_' + kind, null, { gain: MIX.jingle }); },
  };
}
