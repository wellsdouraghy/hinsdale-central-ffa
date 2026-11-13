// Thin PeerJS helpers (default public PeerJS cloud broker + default STUN config).
import { Peer } from 'peerjs';

export const PEER_PREFIX = 'hcffa-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion

export function randomCode() {
  let s = '';
  const r = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) s += CODE_CHARS[r[i] % CODE_CHARS.length];
  return s;
}

export function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function describe(err) {
  switch (err?.type) {
    case 'browser-incompatible': return 'This browser does not support WebRTC.';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
      return 'Could not reach the matchmaking server. Check your internet connection.';
    case 'peer-unavailable': return 'Room not found. Check the code and make sure the host is still in the match.';
    case 'webrtc': return 'Peer-to-peer connection failed (a strict firewall/NAT may be blocking it).';
    default: return err?.message || 'Network error.';
  }
}

/** Host: register `hcffa-<CODE>` with the broker (retries on id collision). */
export function openPeer(onStatus = () => {}) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOpen = () => {
      attempts++;
      const code = randomCode();
      onStatus('Registering room with matchmaking server');
      const peer = new Peer(PEER_PREFIX + code, { debug: 0 });
      let opened = false;
      const timer = setTimeout(() => {
        if (opened) return;
        peer.destroy();
        reject(new Error('Timed out contacting the matchmaking server.'));
      }, 15000);
      peer.on('open', () => {
        opened = true;
        clearTimeout(timer);
        resolve({ peer, code });
      });
      peer.on('error', (err) => {
        if (!opened) {
          clearTimeout(timer);
          peer.destroy();
          if (err.type === 'unavailable-id' && attempts < 5) tryOpen();
          else reject(new Error(describe(err)));
        }
      });
      // Keep the broker connection alive so new players can still join.
      peer.on('disconnected', () => {
        if (opened && !peer.destroyed) setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1000);
      });
    };
    tryOpen();
  });
}

/**
 * Client: connect to host. Opens a reliable 'ev' channel and an unordered 'st' channel.
 * onData(msg) receives every host message after the welcome. Resolves { peer, ev, st, welcome }.
 */
export function connectToHost(code, name, onStatus = () => {}, onData = () => {}) {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    // Voice calls can arrive while the world is still loading: hold them until the voice mesh attaches.
    peer._pendingCalls = [];
    peer.on('call', (c) => { if (!peer._voiceAttached) peer._pendingCalls.push(c); });
    let done = false;
    const fail = (msg) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { peer.destroy(); } catch { /* ignore */ }
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('Timed out connecting to the host.'), 20000);
    onStatus('Contacting matchmaking server');
    peer.on('error', (err) => fail(describe(err)));
    peer.on('open', () => {
      onStatus('Connecting to host');
      const hostId = PEER_PREFIX + normalizeCode(code);
      const ev = peer.connect(hostId, { reliable: true, serialization: 'json', label: 'ev' });
      let st = null;
      ev.on('open', () => {
        onStatus('Joining match');
        ev.send({ t: 'hello', name });
        // Unordered/unreliable channel for movement state (opened after hello so the host knows us).
        setTimeout(() => {
          st = peer.connect(hostId, { reliable: false, serialization: 'json', label: 'st' });
          st.on('error', () => {});
          st.on('data', (msg) => { if (done && msg && msg.t === 'sts') onData(msg); });
        }, 300);
      });
      ev.on('data', (msg) => {
        if (!msg || typeof msg.t !== 'string') return;
        if (msg.t === 'ping') { try { ev.send({ t: 'pong', ts: msg.ts }); } catch { /* ignore */ } }
        if (!done) {
          if (msg.t === 'welcome') {
            done = true;
            clearTimeout(timer);
            // st may not exist yet: hand out a proxy that resolves lazily.
            const stProxy = {
              get open() { return !!st?.open; },
              send: (m) => st?.send(m),
            };
            resolve({ peer, ev, st: stProxy, welcome: msg });
          } else if (msg.t === 'reject') {
            fail(msg.reason || 'The host rejected the connection.');
          }
          return;
        }
        if (msg.t !== 'ping') onData(msg);
      });
      ev.on('error', () => {});
      ev.on('close', () => fail('The host closed the connection.'));
    });
  });
}
