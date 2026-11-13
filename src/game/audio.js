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
  let ctx = null, master = null, sfx = null;
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
    sfx.connect(master);
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
      buffers['foot_' + surf] = [0, 1, 2, 3].map(() => synthFoot(sr, cut));
    }
    buffers.tick = synthTone(sr, [[3100, 0.5], [5200, 0.25]], 0.022, 0.5);
    buffers.headTick = synthTone(sr, [[2450, 0.6], [3720, 0.45], [6100, 0.2]], 0.11, 0.6);
    buffers.killDing = synthTone(sr, [[1318, 0.55], [1976, 0.35], [2637, 0.15]], 0.28, 0.6);
    buffers.hurt = synthHurt(sr);
    buffers.swoosh = synthSwoosh(sr);
    buffers.equip = synthClick(sr, 1300, 0.05, 0.7, 0.03);
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

  function synthFoot(sr, cut) {
    return makeBuffer(sr, 0.14, (d, n) => {
      const a = onePole(cut * (0.85 + Math.random() * 0.3), sr);
      let l = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        l += a * ((Math.random() * 2 - 1) - l);
        const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.035) + 0.4 * Math.exp(-Math.abs(t - 0.045) / 0.01);
        d[i] = l * env;
      }
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
      play(name, pos, { gain: (pos ? 0.9 : 0.35) * gain, rate: 0.9 + Math.random() * 0.2, ref: 3, rolloff: 1.6 });
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
  };
}
