// Proximity voice audio: each remote voice stream -> analyser (speaking) -> occlusion low-pass -> gain -> HRTF panner
// at that player's head. Full volume within ~4 m, silent by ~45 m. A floor keeps voice audible at low master volume.
import * as THREE from 'three';

const NEAR = 4, FAR = 45;
const SPEAK_RMS = 0.015;

export class VoiceAudio {
  constructor(game, audio, localStream) {
    this.game = game;
    this.audio = audio;
    this.ctx = audio.context;
    this.voices = new Map();   // gid -> { el, src, analyser, lp, gain, panner, buf, speakingUntil, occT }
    this.bus = this.ctx.createGain();
    this.bus.gain.value = audio.muted ? 0 : 0.7;
    this.bus.connect(this.ctx.destination);
    // Local mic level meter (never routed to the speakers).
    this.localSrc = this.ctx.createMediaStreamSource(localStream);
    this.localAnalyser = this.ctx.createAnalyser();
    this.localAnalyser.fftSize = 512;
    this.localSrc.connect(this.localAnalyser);
    this.localBuf = new Float32Array(this.localAnalyser.fftSize);
    this.level = 0;
    this._ray = new THREE.Vector3();
  }

  add(gid, stream) {
    this.remove(gid);
    // Chrome only feeds remote WebRTC audio into Web Audio if it is also attached to a (muted) media element.
    const el = new Audio();
    el.muted = true;
    el.srcObject = stream;
    el.play().catch(() => {});
    const ctx = this.ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 20000;
    const gain = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = NEAR;
    panner.maxDistance = FAR;
    panner.rolloffFactor = 1;
    src.connect(analyser);
    analyser.connect(lp).connect(gain);
    panner.connect(this.bus);
    // Lobby (no game): plain "everyone hears everyone" voice; in a match: positional.
    gain.connect(this.game ? panner : this.bus);
    this.voices.set(gid, { el, src, analyser, lp, gain, panner, buf: new Float32Array(analyser.fftSize), speakingUntil: 0, occT: 0 });
  }

  /** Switch between lobby voice (game null, non-spatial) and in-match proximity voice. */
  setGame(game) {
    this.game = game;
    for (const v of this.voices.values()) {
      try { v.gain.disconnect(); } catch { /* ignore */ }
      v.gain.connect(game ? v.panner : this.bus);
      v.lp.frequency.value = 20000;
      v.gain.gain.value = 1;
    }
  }

  remove(gid) {
    const v = this.voices.get(gid);
    if (!v) return;
    try { v.src.disconnect(); v.panner.disconnect(); } catch { /* ignore */ }
    v.el.srcObject = null;
    this.voices.delete(gid);
    const r = this.game?.remotes.get(gid);
    if (r) r.speaking = false;
  }

  speaking(gid) { return (this.voices.get(gid)?.speakingUntil || 0) > performance.now(); }

  update(dt) {
    const g = this.game, now = performance.now();
    // Voice can't be zeroed by the master slider; it sits a little under game SFX.
    this.bus.gain.value = this.audio.muted ? 0 : 0.85 * Math.max(0.5, this.audio.masterVolume);
    for (const [gid, v] of this.voices) {
      if (!g) continue; // lobby voice: no positions
      const r = g.remotes.get(gid);
      if (!r) continue;
      const head = r.eye(this._ray);
      if (v.panner.positionX) { v.panner.positionX.value = head.x; v.panner.positionY.value = head.y; v.panner.positionZ.value = head.z; }
      else v.panner.setPosition(head.x, head.y, head.z);
      v.gain.gain.value = r.alive ? 1 : 0.6; // the dead keep talking (a bit quieter) from where they fell
      // Occlusion low-pass ~5 Hz.
      v.occT -= dt;
      if (v.occT <= 0) {
        v.occT = 0.2;
        const from = g.camera.position;
        const dir = head.clone().sub(from);
        const d = dir.length();
        const blocked = d < FAR && d > 1 && !!g.hitscan.castWorld(from, dir.normalize(), d - 0.5);
        v.lp.frequency.setTargetAtTime(blocked ? 900 : 20000, this.ctx.currentTime, 0.08);
      }
      v.analyser.getFloatTimeDomainData(v.buf);
      if (rms(v.buf) > SPEAK_RMS) v.speakingUntil = now + 300;
      r.speaking = v.speakingUntil > now;
    }
    this.localAnalyser.getFloatTimeDomainData(this.localBuf);
    const l = Math.min(1, rms(this.localBuf) * 6);
    this.level += (l - this.level) * Math.min(1, dt * 12);
  }

  dispose() {
    for (const gid of [...this.voices.keys()]) this.remove(gid);
    try { this.localSrc.disconnect(); this.bus.disconnect(); } catch { /* ignore */ }
  }
}

function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}
