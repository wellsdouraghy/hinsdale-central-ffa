// Client networking that outlives a single match: joins the host's room, mirrors the lobby, follows the host into
// matches (joinMatch -> welcome) and back to the lobby. Match traffic is queued for the Game's frame loop.
// Robustness: any host message (pings included) counts as a heartbeat; the watchdog runs on a worker timer and forgives
// gaps where this tab itself was frozen; the broker link reconnects quietly; if movement states stop arriving on the
// unordered channel the host is asked to relay them on the reliable one.
import { connectToHost } from './peer.js';
import { every } from './ticker.js';

const HEARTBEAT_TIMEOUT = 20;   // s without any message from the host
const FREEZE_GAP = 3;           // s between our own ticks = this tab was frozen: don't blame the host

class LocalQueue {
  constructor() { this.q = []; this.onMessage = null; }
  push(msg) { this.q.push(msg); }
  flush() {
    const q = this.q; this.q = [];
    for (const m of q) {
      try { this.onMessage?.(m); } catch (err) { console.error('[match message]', m?.t, err); }
    }
  }
}

const now = () => performance.now() / 1000;

export async function createClientNet({ code, name, onStatus }) {
  let lastHeard = now();
  let closed = false;
  let queue = null;          // current match queue (null in the lobby)
  let pendingWelcome = null; // resolver for joinMatch()
  let net = null;
  let lastSts = 0, matchAt = 0, askedFallback = false, stateViaEv = false;
  const early = [];          // lobby/control messages that arrive before `net` exists

  const onData = (msg) => {
    lastHeard = now();
    if (!net) { early.push(msg); return; }
    try { handle(msg); } catch (err) { console.error('[client message]', msg?.t, err); }
  };
  const { peer, ev, st, welcome } = await connectToHost(code, name, onStatus, onData);

  function handle(msg) {
    switch (msg.t) {
      case 'ping': return;
      case 'hostleft': lost('The host left the match.'); return;
      case 'kicked': lost(msg.reason || 'Removed by the host.'); return;
      case 'lobby': net.lobby = msg.lobby; net.onLobby?.(msg.lobby); return;
      case 'countdown': net.onCountdown?.(msg.s); return;
      case 'countdownCancel': net.onCountdownCancel?.(msg.reason); return;
      case 'matchStart': net.onMatchStart?.(msg); return;
      case 'toLobby': queue = null; net.onToLobby?.(); return;
      case 'notice': net.onNotice?.(msg.text); if (queue) queue.push(msg); return;
      case 'useEv': stateViaEv = true; return;
      case 'welcome':
        if (pendingWelcome) { const r = pendingWelcome; pendingWelcome = null; r(msg); }
        return;
      case 'sts': lastSts = now(); if (queue) queue.push(msg); return;
      default:
        if (queue) queue.push(msg);
    }
  }

  function lost(reason) {
    if (closed) return;
    closed = true;
    stopWatch();
    console.info('[client] disconnected:', reason);
    try { peer.destroy(); } catch { /* ignore */ }
    net.onDisconnect?.(reason);
  }
  ev.on('close', () => lost('The connection to the host closed.'));
  let lastTick = now();
  const stopWatch = every(1000, () => {
    if (closed) return;
    const t = now();
    if (t - lastTick > FREEZE_GAP) lastHeard = t;            // we were frozen (background tab), not the host
    lastTick = t;
    if (t - lastHeard > HEARTBEAT_TIMEOUT) { lost(`Lost connection to the host (nothing received for ${HEARTBEAT_TIMEOUT} s).`); return; }
    // Movement states stopped arriving on the unordered channel: ask the host to use the reliable one.
    if (queue && !askedFallback && t - matchAt > 4 && t - Math.max(lastSts, matchAt) > 2 && t - lastHeard < 2) {
      askedFallback = true;
      sendRaw({ t: 'stFallback' });
    }
  });

  const sendRaw = (msg) => { try { if (ev.open) ev.send(msg); } catch { /* closing */ } };

  /** Builds a Game session for a match given its welcome message. */
  function makeSession(w) {
    queue = new LocalQueue();
    matchAt = now();
    const q = queue;
    return {
      mode: 'client', isHost: false, localId: w.id, roomCode: code, welcome: w, peer,
      set onMessage(fn) { q.onMessage = fn; },
      onDisconnect: null,
      send: sendRaw,
      sendState(msg) {
        try { if (st.open && !stateViaEv) st.send(msg); else if (ev.open) ev.send(msg); } catch { /* closing */ }
      },
      tick() { q.flush(); },
      close() { /* stay connected for the lobby; leaving is net.close() */ },
      diag: () => net.diag(),
    };
  }

  net = {
    mode: 'client', isHost: false, roomCode: code, peer,
    localId: welcome.id,
    lobby: welcome.t === 'lobbyWelcome' ? welcome.lobby : null,
    campus: welcome.campus || welcome.lobby?.settings?.campus || null,   // the host's campus (fixed for the room)
    /** Mid-match join: the first message was already a match welcome (session created below, before queued data). */
    initialSession: null,
    onLobby: null, onCountdown: null, onCountdownCancel: null, onMatchStart: null, onToLobby: null, onDisconnect: null, onNotice: null,
    setReady(ready) { sendRaw({ t: 'lobbyReady', ready }); },
    setTeam(team) { sendRaw({ t: 'lobbyTeam', team }); },
    /** Ask the host for the running match's welcome and get a Game session. */
    joinMatch() {
      return new Promise((resolve) => {
        // Re-ask every 3 s until the host answers (a lost message used to leave the client on "GO" forever).
        let asks = 0;
        const timer = setInterval(() => { if (pendingWelcome && ++asks <= 20) sendRaw({ t: 'joinMatch' }); else clearInterval(timer); }, 3000);
        pendingWelcome = (w) => { clearInterval(timer); resolve(makeSession(w)); };
        sendRaw({ t: 'joinMatch' });
      });
    },
    sessionFromWelcome: makeSession,
    /** Connection diagnostics for the Esc menu. */
    diag() {
      return {
        role: 'client', broker: peer.disconnected ? 'reconnecting' : 'ok', link: ev.open ? 'open' : 'closed',
        lastHeard: now() - lastHeard, stateChannel: st.open && !stateViaEv ? 'fast' : 'reliable',
      };
    },
    close() {
      if (closed) return;
      closed = true;
      stopWatch();
      sendRaw({ t: 'bye' });
      setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 150);
    },
  };
  if (welcome.t === 'welcome') net.initialSession = makeSession(welcome);
  for (const m of early.splice(0)) { try { handle(m); } catch (err) { console.error('[client message]', m?.t, err); } }
  return net;
}
