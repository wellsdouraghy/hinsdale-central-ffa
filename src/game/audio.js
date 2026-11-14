// Procedural WebAudio sound: gunshots, reloads, footsteps, hit feedback. No external samples.
// The AudioContext is created lazily on the first user gesture (avoids autoplay warnings).

const SHOT_PARAMS = {
  ar:      { len: 0.9, crack: 0.9, body: 1.0, bodyCut: 2600, bodyDecay: 0.045, thump: 0.95, f0: 165, f1: 52, thumpDecay: 0.07, tail: 0.38, tailCut: 900, tailDecay: 0.3, drive: 2.4 },
  smg:     { len: 0.6, crack: 0.85, body: 0.8, bodyCut: 3400, bodyDecay: 0.03, thump: 0.6, f0: 210, f1: 70, thumpDecay: 0.045, tail: 0.26, tailCut: 1200, tailDecay: 0.2, drive: 2.2 },
  sniper:  { len: 1.7, crack: 1.0, body: 1.25, bodyCut: 2000, bodyDecay: 0.09, thump: 1.25, f0: 120, f1: 38, thumpDecay: 0.13, tail: 0.62, tailCut: 650, tailDecay: 0.75, drive: 2.8 },
  shotgun: { len: 1.3, crack: 0.75, body: 1.35, bodyCut: 1500, bodyDecay: 0.1, thump: 1.35, f0: 105, f1: 40, thumpDecay: 0.12, tail: 0.5, tailCut: 600, tailDecay: 0.55, drive: 2.8 },
  pistol:  { len: 0.7, crack: 0.95, body: 0.8, bodyCut: 3000, bodyDecay: 0.035, thump: 0.6, f0: 230, f1: 85, thumpDecay: 0.05, tail: 0.3, tailCut: 1300, tailDecay: 0.24, drive: 2.2 },
};

const FOOT_CUT = { grass: 380, dirt: 450, rubber: 500, wood: 800, metal: 1400, concrete: 950, asphalt: 850, brick: 950, glass: 1200 };

export function createAudio() {
  let ctx = null, master = null, sfx = null, muffle = null;
  let volume = 0.8;
  const buffers = {};
  const listenerPos = { x: 0, y: 0, z: 0 };

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(comp);
    sfx = ctx.createGain();
    sfx.gain.value = 0.9;
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
    buffers.dry = synthClick(sr, 3200, 0.008, 0.5);
    for (const [surf, cut] of Object.entries(FOOT_CUT)) {
      buffers['foot_' + surf] = [0, 1, 2, 3, 4, 5].map(() => synthFoot(sr, surf));
    }
    buffers.tick = synthTone(sr, [[3100, 0.5], [5200, 0.25]], 0.022, 0.5);
    buffers.headTick = synthTone(sr, [[2450, 0.6], [3720, 0.45], [6100, 0.2]], 0.11, 0.6);
    buffers.killDing = synthTone(sr, [[1318, 0.55], [1976, 0.35], [2637, 0.15]], 0.28, 0.6);
    buffers.hurt = synthHurt(sr);
    buffers.swoosh = synthSwoosh(sr);
    buffers.equip = synthClick(sr, 1300, 0.05, 0.7, 0.03);
    // Movement kit.
    buffers.clank = synthTone(sr, [[880, 0.5], [1390, 0.35], [2310, 0.25], [3650, 0.12]], 0.07, 0.8);
    buffers.reel = makeBuffer(sr, 0.9, (d, n) => {
      let ph = 0, l = 0;
      const a = onePole(2400, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (2 * Math.PI * (55 + 140 * t)) / sr;
        l += a * ((Math.random() * 2 - 1) - l);
        const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1;
        d[i] = (saw * 0.5 + l * 0.6) * Math.min(1, t / 0.02) * Math.exp(-t * 2.2) * (0.7 + 0.3 * Math.sin(t * 90));
      }
    });
    buffers.boom = makeBuffer(sr, 2.6, (d, n) => {
      let l1 = 0, l2 = 0, ph = 0;
      const a = onePole(900, sr), a2 = onePole(260, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        l1 += a * (w - l1);
        l2 += a2 * (w - l2);
        ph += (2 * Math.PI * (30 + 60 * Math.exp(-t / 0.08))) / sr;
        const x = (w * Math.exp(-t / 0.02) * 0.8 + l1 * 3 * Math.exp(-t / 0.25) + l2 * 6 * Math.exp(-t / 0.9) + Math.sin(ph) * 1.4 * Math.exp(-t / 0.35)) * Math.min(1, t / 0.002);
        d[i] = Math.tanh(x * 2.2);
      }
    });
    buffers.ring = synthTone(sr, [[3520, 0.5], [3610, 0.4]], 1.2, 0.5);
    // Rotor wash loop: 1.0 s = exactly 5 blade slaps (seamless), plus a turbine whine.
    buffers.rotor = makeBuffer(sr, 1.0, (d, n) => {
      let l = 0;
      const a = onePole(420, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        l += a * ((Math.random() * 2 - 1) - l);
        const ph = (t * 5) % 1;
        const slap = Math.exp(-ph / 0.07);
        d[i] = l * 3 * (0.35 + slap) + Math.sin(2 * Math.PI * 880 * t) * 0.04 + Math.sin(2 * Math.PI * 40 * t) * slap * 0.5;
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
    buffers.thrust = makeBuffer(sr, 0.4, (d, n) => {
      let l = 0, l2 = 0;
      const a = onePole(1100, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        l += a * ((Math.random() * 2 - 1) - l);
        l2 += a * (l - l2);
        d[i] = (l2 * 3 + (Math.random() * 2 - 1) * 0.08) * Math.min(1, t / 0.006) * Math.exp(-t / 0.11);
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
          const env = Math.min(1, t / 0.008) * (t < l ? 1 : Math.exp(-(t - l) / 0.06)) * Math.exp(-t * (dark ? 2.5 : 1.5));
          // square-ish lead + octave sub for a radio-chirp feel
          const s = Math.tanh(Math.sin(2 * Math.PI * f * t) * 2.5) * 0.6 + Math.sin(Math.PI * f * t) * (dark ? 0.5 : 0.3);
          d[i] += s * env;
        }
      }
    });
  }

  function makeBuffer(sr, len, fn) {
    const n = Math.floor(sr * len);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    fn(d, n, sr);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
    return buf;
  }

  function onePole(fc, sr) { return 1 - Math.exp((-2 * Math.PI * fc) / sr); }

  function synthShot(sr, p) {
    return makeBuffer(sr, p.len, (d, n) => {
      const aBody = onePole(p.bodyCut * (0.9 + Math.random() * 0.2), sr);
      const aTail = onePole(p.tailCut, sr);
      let lb = 0, lt1 = 0, lt2 = 0, phase = 0, prevN = 0;
      const drive = p.drive;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        const crack = (w - prevN) * 0.5 * Math.exp(-t / 0.005) * p.crack;
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

  function synthClick(sr, freq, decay, gain, second = 0) {
    return makeBuffer(sr, decay * 4 + second + 0.02, (d, n) => {
      const hit = (t0, g) => {
        for (let i = Math.floor(t0 * sr); i < n; i++) {
          const t = i / sr - t0;
          d[i] += g * (Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / decay) * 0.6 +
            (Math.random() * 2 - 1) * Math.exp(-t / (decay * 0.25)));
        }
      };
      hit(0, gain);
      if (second) hit(second, gain * 0.8);
    });
  }

  // Punchy, readable boot step (heel strike + toe roll) with a per-surface texture layer and a little gear rattle.
  // Designed to be easy to locate in 3D: strong transients, a low thump, and bright crunch on top.
  const FOOT_SURF = {
    //          thump Hz, thump amt, click bandpass Hz, click amt, ring Hz, ring amt, grains (crunch), grain cut Hz, rustle
    grass:    [85, 0.55, 1800, 0.35, 0, 0, 10, 2400, 0.55],
    dirt:     [90, 0.6, 2200, 0.5, 0, 0, 22, 3200, 0.2],
    rubber:   [95, 0.6, 1500, 0.4, 0, 0, 4, 1800, 0.05],
    asphalt:  [100, 0.6, 2600, 0.75, 1900, 0.12, 14, 4200, 0.05],
    concrete: [105, 0.6, 3000, 0.85, 2300, 0.18, 8, 5000, 0.0],
    brick:    [100, 0.6, 2800, 0.8, 2100, 0.15, 10, 4600, 0.0],
    wood:     [120, 0.75, 1400, 0.6, 340, 0.45, 3, 2400, 0.0],
    metal:    [110, 0.5, 3400, 0.7, 1250, 0.55, 2, 6000, 0.0],
    glass:    [110, 0.5, 3800, 0.7, 2900, 0.35, 6, 7000, 0.0],
  };
  function synthFoot(sr, surf) {
    const [thF, thA, clF, clA, rgF, rgA, grains, grCut, rustle] = FOOT_SURF[surf] || FOOT_SURF.concrete;
    const len = 0.22;
    return makeBuffer(sr, len, (d, n) => {
      const toe = 0.055 + Math.random() * 0.02;               // heel -> toe gap
      const jit = 0.85 + Math.random() * 0.3;
      // band-passed noise for the click: two one-pole stages (low-pass minus a slower low-pass)
      const aHi = onePole(clF * 1.6 * jit, sr), aLo = onePole(clF * 0.45 * jit, sr), aGr = onePole(grCut, sr), aRu = onePole(5200, sr), aRuLo = onePole(1600, sr);
      let h1 = 0, l1 = 0, g1 = 0, r1 = 0, r2 = 0;
      const grainT = Array.from({ length: grains }, () => Math.random() * 0.07 + (Math.random() < 0.5 ? 0 : toe));
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        h1 += aHi * (w - h1); l1 += aLo * (w - l1);
        const band = h1 - l1;
        // transients: heel (strong) and toe (softer)
        const eHeel = Math.min(1, t / 0.0015) * Math.exp(-t / 0.012);
        const tt = t - toe, eToe = tt > 0 ? Math.min(1, tt / 0.002) * Math.exp(-tt / 0.016) * 0.55 : 0;
        let v = band * clA * 2.2 * (eHeel + eToe);
        // low thump (body weight), pitch drops slightly
        v += Math.sin(2 * Math.PI * thF * jit * t * (1 - t * 1.5)) * thA * Math.exp(-t / 0.028) * Math.min(1, t / 0.002);
        if (tt > 0) v += Math.sin(2 * Math.PI * thF * 1.2 * tt) * thA * 0.35 * Math.exp(-tt / 0.02);
        // surface ring (hard floors, wood knock, metal clank)
        if (rgA > 0) v += (Math.sin(2 * Math.PI * rgF * t) + 0.5 * Math.sin(2 * Math.PI * rgF * 2.13 * t)) * rgA * Math.exp(-t / 0.03) * Math.min(1, t / 0.001);
        // crunch grains (gravel, dirt, grit under the sole)
        g1 += aGr * (w - g1);
        let gr = 0;
        for (const gt of grainT) { const dt = t - gt; if (dt > 0 && dt < 0.012) gr += Math.exp(-dt / 0.0025); }
        v += (w - g1) * gr * 0.5;
        // grass/leaf rustle: high band noise smeared over the step
        if (rustle > 0) { r1 += aRu * (w - r1); r2 += aRuLo * (w - r2); v += (r1 - r2) * rustle * Math.exp(-t / 0.06) * Math.min(1, t / 0.01) * 1.4; }
        // gear jingle: faint bright ticks after the heel
        if (t > 0.01 && t < 0.09 && Math.random() < 0.004) v += (Math.random() * 2 - 1) * 0.25;
        d[i] = v * 0.8;
      }
      // fade the tail
      for (let i = Math.floor(n * 0.85); i < n; i++) d[i] *= (n - i) / (n * 0.15);
      let pk = 1e-6; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
      const k = 0.9 / pk; for (let i = 0; i < n; i++) d[i] *= k;   // consistent loudness across surfaces
    });
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
        const fc = 600 + 3000 * Math.sin(Math.PI * Math.min(1, t / 0.25));
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

  /** Plays buffer `name`. pos: {x,y,z} for 3D, else 2D. opts: { gain, rate, delay, distanceMuffle } */
  function play(name, pos = null, opts = {}) {
    if (!ctx || ctx.state !== 'running') return;
    const buf = pick(name);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    let node = src;
    node.connect(g);
    node = g;
    let when = ctx.currentTime + (opts.delay || 0);
    if (pos) {
      const dx = pos.x - listenerPos.x, dy = pos.y - listenerPos.y, dz = pos.z - listenerPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (opts.distanceMuffle) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = Math.max(700, 20000 / (1 + dist / 25));
        node.connect(lp);
        node = lp;
        when += Math.min(0.45, dist / 343);
      }
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = opts.ref ?? 6;
      pan.rolloffFactor = opts.rolloff ?? 1.1;
      pan.maxDistance = 2000;
      if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; }
      else pan.setPosition(pos.x, pos.y, pos.z);
      node.connect(pan);
      node = pan;
    }
    node.connect(sfx);
    src.start(when);
  }

  const RELOAD_SEQ = {
    default: [[0.15, 'magOut'], [0.62, 'magIn'], [0.85, 'bolt']],
    pistol: [[0.15, 'magOut'], [0.65, 'magIn'], [0.88, 'click']],
    sniper: [[0.1, 'bolt'], [0.3, 'magOut'], [0.65, 'magIn'], [0.9, 'bolt']],
  };

  return {
    ensure,
    get ready() { return !!ctx && ctx.state === 'running'; },
    setVolume(v) { volume = v; if (master) master.gain.value = v; },
    setListener(camera) {
      if (!ctx) return;
      const l = ctx.listener;
      const e = camera.matrixWorld.elements;
      const px = e[12], py = e[13], pz = e[14];
      listenerPos.x = px; listenerPos.y = py; listenerPos.z = pz;
      const fx = -e[8], fy = -e[9], fz = -e[10];
      const ux = e[4], uy = e[5], uz = e[6];
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
      const name = 'shot_' + (SHOT_PARAMS[weaponId] ? weaponId : 'ar');
      const rate = 0.95 + Math.random() * 0.1;
      if (!pos) {
        play(name, null, { gain: 0.85, rate });
      } else {
        play(name, pos, { gain: 1.1, rate, distanceMuffle: true, ref: 10, rolloff: 0.9 });
      }
      const mech = weaponId === 'sniper' ? 'bolt' : weaponId === 'shotgun' ? 'magOut' : null;
      if (mech) play(mech, pos, { gain: pos ? 0.3 : 0.6, delay: weaponId === 'sniper' ? 0.45 : 0.3, ref: 3 });
    },
    reload(weaponId, dur) {
      if (weaponId === 'shotgun') {
        const n = Math.max(1, Math.round((dur - 0.35) / 0.5));
        for (let i = 0; i < n; i++) play('magIn', null, { gain: 0.6, delay: 0.3 + i * 0.5, rate: 1.2 });
        play('magOut', null, { gain: 0.6, delay: dur - 0.15 });
        return;
      }
      const seq = RELOAD_SEQ[weaponId] || RELOAD_SEQ.default;
      for (const [f, n] of seq) play(n, null, { gain: 0.6, delay: f * dur });
    },
    footstep(surface, pos = null, gain = 1) {
      const name = 'foot_' + (FOOT_CUT[surface] ? surface : 'concrete');
      play(name, pos, { gain: (pos ? 1.25 : 0.35) * gain, rate: 0.94 + Math.random() * 0.12, ref: 5, rolloff: 1.15 });
    },
    hitmarker(kind) {
      if (kind === 'head') play('headTick', null, { gain: 0.5 });
      else play('tick', null, { gain: 0.45 });
    },
    kill(headshot) {
      play('killDing', null, { gain: 0.45 });
      if (headshot) play('headTick', null, { gain: 0.4, delay: 0.05, rate: 1.25 });
    },
    hurt() { play('hurt', null, { gain: 0.5, rate: 0.9 + Math.random() * 0.2 }); },
    dryFire() { play('dry', null, { gain: 0.5 }); },
    equip() { play('equip', null, { gain: 0.45 }); },
    melee(pos = null) { play('swoosh', pos, { gain: 0.6 }); },
    ui() { play('click', null, { gain: 0.3 }); },
    grappleLaunch(dist = 20) {
      play('swoosh', null, { gain: 0.5, rate: 1.7 });
      play('clank', null, { gain: 0.55, delay: Math.min(0.25, dist / 120) });
      play('reel', null, { gain: 0.35, delay: Math.min(0.25, dist / 120) + 0.03 });
    },
    grappleDeny() { play('dry', null, { gain: 0.45, rate: 0.7 }); },
    grappleRelease() { play('click', null, { gain: 0.35, rate: 0.8 }); },
    dash() { play('swoosh', null, { gain: 0.65, rate: 0.75 }); play('thrust', null, { gain: 0.45, rate: 1.3 }); },
    thruster(pos = null) { play('thrust', pos, { gain: pos ? 0.8 : 0.55, ref: 4 }); },
    mantle() { play('magOut', null, { gain: 0.3, rate: 0.6 }); play('foot_concrete', null, { gain: 0.5, delay: 0.18 }); },
    remoteGrapple(pos) { play('clank', pos, { gain: 0.8, ref: 5 }); },
    pin() { play('click', null, { gain: 0.5, rate: 0.7 }); play('click', null, { gain: 0.35, rate: 1.3, delay: 0.08 }); },
    throwWhoosh() { play('swoosh', null, { gain: 0.5, rate: 1.2 }); },
    explosion(pos) { play('boom', pos, { gain: 1.4, distanceMuffle: true, ref: 14, rolloff: 0.8 }); },
    ringing(sec = 2) {
      if (!ctx || !muffle) return;
      const t = ctx.currentTime;
      muffle.frequency.cancelScheduledValues(t);
      muffle.frequency.setValueAtTime(500, t);
      muffle.frequency.exponentialRampToValueAtTime(20000, t + sec);
      play('ring', null, { gain: 0.18 });
    },
    jet(pos, delay = 0) { play('jet', pos, { gain: 1.2, ref: 40, rolloff: 0.4, delay: Math.max(0, delay - 1.6) }); },
    plane(pos) { play('jet', pos, { gain: 0.9, ref: 60, rolloff: 0.3 }); },
    crateLand(pos) { play('boom', pos, { gain: 0.35, rate: 2.2, ref: 6 }); play('clank', pos, { gain: 0.6, ref: 6 }); },
    /** Looping positional sound (helicopter rotor). Returns { set(pos, gain, rate, local), stop() } or null. */
    loop(name) {
      if (!ctx || ctx.state !== 'running' || !buffers[name]) return null;
      const src = ctx.createBufferSource();
      src.buffer = buffers[name];
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 12; pan.rolloffFactor = 0.9; pan.maxDistance = 2000;
      src.connect(g).connect(pan).connect(sfx);
      src.start();
      return {
        set(pos, gain, rate, local = false) {
          const p = local ? listenerPos : pos;
          if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } else pan.setPosition(p.x, p.y, p.z);
          g.gain.setTargetAtTime(gain, ctx.currentTime, 0.1);
          src.playbackRate.setTargetAtTime(Math.max(0.3, rate), ctx.currentTime, 0.1);
        },
        stop() { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); src.stop(ctx.currentTime + 0.8); } catch { /* ignore */ } },
      };
    },
    cannon(pos = null) { play('shot_smg', pos, { gain: pos ? 1.1 : 0.7, rate: 0.72 + Math.random() * 0.05, distanceMuffle: !!pos, ref: 14 }); },
    rocket(pos = null) { play('swoosh', pos, { gain: 0.9, rate: 0.6, ref: 10 }); play('thrust', pos, { gain: 0.8, rate: 0.7, ref: 10 }); },
    /** The AudioContext (for voice chat), created on the first user gesture. */
    get context() { return ctx; },
    get masterVolume() { return volume; },
    /** CTF stingers: 'good' | 'bad' | 'neutral' | 'capture' | 'enemyCapture' */
    jingle(kind) { play('j_' + kind, null, { gain: 0.35 }); },
  };
}
