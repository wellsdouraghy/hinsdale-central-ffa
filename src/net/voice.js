// Proximity voice transport: microphone capture + a full mesh of PeerJS media calls between match players.
// Always on by design (the lobby requires it): no mute / push-to-talk. Gameplay data stays on the star topology.

/** Microphone stream (or a test tone with ?fakemic=1). Throws on denial / no device. */
export async function getMicStream(audioCtx, fake = false) {
  if (fake) {
    if (!audioCtx) throw new Error('Audio is not available.');
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    osc.frequency.value = 220;
    lfo.frequency.value = 0.5;            // "talks" in bursts so the speaking indicator toggles
    lfoGain.gain.value = 0.5;
    gain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(gain.gain);
    const dest = audioCtx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start(); lfo.start();
    const stream = dest.stream;
    stream._fakeStop = () => { try { osc.stop(); lfo.stop(); } catch { /* ignore */ } };
    return stream;
  }
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser cannot access a microphone.'), { name: 'NotSupportedError' });
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
}

export function stopStream(stream) {
  if (!stream) return;
  stream._fakeStop?.();
  for (const t of stream.getTracks()) t.stop();
}

/**
 * Full mesh: the player with the lower game id calls the higher one. Incoming calls are answered with our stream.
 * onStream(gameId, MediaStream) / onClose(gameId).
 */
export class VoiceMesh {
  constructor({ peer, localId, stream, onStream, onClose }) {
    this.peer = peer;
    this.localId = localId;
    this.stream = stream;
    this.onStream = onStream;
    this.onClose = onClose;
    this.calls = new Map();   // gameId -> MediaConnection
    this.pids = new Map();    // gameId -> peer id
    this.retryAt = new Map();
    this._onCall = (call) => {
      const gid = Number(call.metadata?.gid);
      if (!Number.isFinite(gid) || gid === this.localId) { call.close(); return; }
      this.calls.get(gid)?.close();
      call.answer(this.stream);
      this._wire(gid, call);
    };
    peer.on('call', this._onCall);
    peer._voiceAttached = true;
    for (const c of peer._pendingCalls || []) this._onCall(c);
    peer._pendingCalls = [];
  }

  _wire(gid, call) {
    this.calls.set(gid, call);
    call._startedAt = performance.now();
    call.on('stream', (s) => { call._gotStream = true; this.onStream(gid, s); });
    const closed = () => {
      if (this.calls.get(gid) === call) {
        this.calls.delete(gid);
        this.onClose(gid);
        this.retryAt.set(gid, performance.now() + 3000); // reconnect if they are still in the match
      }
    };
    call.on('close', closed);
    call.on('error', closed);
  }

  /** players: [{ id, pid }] currently in the match. Opens missing calls and closes calls to players who left. */
  sync(players) {
    const present = new Set();
    for (const p of players) {
      if (p.id === this.localId || !p.pid || p.bot) continue;
      present.add(p.id);
      this.pids.set(p.id, p.pid);
      const existing = this.calls.get(p.id);
      // A call that never produced audio (callee wasn't listening yet, ICE failure): drop it and redial.
      if (existing && !existing._gotStream && performance.now() - existing._startedAt > 8000 && this.localId < p.id) {
        this.calls.delete(p.id);
        existing.close();
      }
      if (this.calls.has(p.id) || this.localId > p.id) continue; // the lower id dials
      if (performance.now() < (this.retryAt.get(p.id) || 0)) continue;
      try {
        const call = this.peer.call(p.pid, this.stream, { metadata: { gid: this.localId } });
        if (call) this._wire(p.id, call);
      } catch { this.retryAt.set(p.id, performance.now() + 3000); }
    }
    for (const [gid, call] of this.calls) {
      if (!present.has(gid)) { this.calls.delete(gid); call.close(); this.onClose(gid); }
    }
  }

  dispose() {
    this.peer.off?.('call', this._onCall);
    for (const call of this.calls.values()) call.close();
    this.calls.clear();
  }
}
