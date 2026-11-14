// Client networking that outlives a single match: joins the host's room, mirrors the lobby, follows the host into
// matches (joinMatch -> welcome) and back to the lobby. Match traffic is queued for the Game's frame loop.
import { connectToHost } from './peer.js';

const HEARTBEAT_TIMEOUT = 12;

class LocalQueue {
  constructor() { this.q = []; this.onMessage = null; }
  push(msg) { this.q.push(msg); }
  flush() { const q = this.q; this.q = []; for (const m of q) this.onMessage?.(m); }
}

export async function createClientNet({ code, name, onStatus }) {
  let lastHeard = performance.now() / 1000;
  let closed = false;
  let queue = null;          // current match queue (null in the lobby)
  let pendingWelcome = null; // resolver for joinMatch()
  let net = null;
  const early = [];          // lobby/control messages that arrive before `net` exists

  const onData = (msg) => {
    lastHeard = performance.now() / 1000;
    if (!net) { early.push(msg); return; }
    handle(msg);
  };
  const { peer, ev, st, welcome } = await connectToHost(code, name, onStatus, onData);

  function handle(msg) {
    switch (msg.t) {
      case 'hostleft': lost('The host left the match.'); return;
      case 'lobby': net.lobby = msg.lobby; net.onLobby?.(msg.lobby); return;
      case 'countdown': net.onCountdown?.(msg.s); return;
      case 'matchStart': net.onMatchStart?.(msg); return;
      case 'toLobby': queue = null; net.onToLobby?.(); return;
      case 'notice': net.onNotice?.(msg.text); if (queue) queue.push(msg); return;
      case 'welcome':
        if (pendingWelcome) { const r = pendingWelcome; pendingWelcome = null; r(msg); }
        return;
      default:
        if (queue) queue.push(msg);
    }
  }

  function lost(reason) {
    if (closed) return;
    closed = true;
    clearInterval(watchdog);
    try { peer.destroy(); } catch { /* ignore */ }
    net.onDisconnect?.(reason);
  }
  ev.on('close', () => lost('The host left the match.'));
  const watchdog = setInterval(() => {
    if (closed) { clearInterval(watchdog); return; }
    if (performance.now() / 1000 - lastHeard > HEARTBEAT_TIMEOUT) lost('Lost connection to the host.');
  }, 1000);

  const sendRaw = (msg) => { try { if (ev.open) ev.send(msg); } catch { /* closing */ } };

  /** Builds a Game session for a match given its welcome message. */
  function makeSession(w) {
    queue = new LocalQueue();
    const q = queue;
    return {
      mode: 'client', isHost: false, localId: w.id, roomCode: code, welcome: w, peer,
      set onMessage(fn) { q.onMessage = fn; },
      onDisconnect: null,
      send: sendRaw,
      sendState(msg) {
        try { if (st.open) st.send(msg); else if (ev.open) ev.send(msg); } catch { /* closing */ }
      },
      tick() { q.flush(); },
      close() { /* stay connected for the lobby; leaving is net.close() */ },
    };
  }

  net = {
    mode: 'client', isHost: false, roomCode: code, peer,
    localId: welcome.id,
    lobby: welcome.t === 'lobbyWelcome' ? welcome.lobby : null,
    /** Mid-match join: the first message was already a match welcome (session created below, before queued data). */
    initialSession: null,
    onLobby: null, onCountdown: null, onMatchStart: null, onToLobby: null, onDisconnect: null, onNotice: null,
    setReady(ready) { sendRaw({ t: 'lobbyReady', ready }); },
    setTeam(team) { sendRaw({ t: 'lobbyTeam', team }); },
    /** Ask the host for the running match's welcome and get a Game session. */
    joinMatch() {
      return new Promise((resolve) => {
        pendingWelcome = (w) => resolve(makeSession(w));
        sendRaw({ t: 'joinMatch' });
      });
    },
    sessionFromWelcome: makeSession,
    close() {
      if (closed) return;
      closed = true;
      clearInterval(watchdog);
      sendRaw({ t: 'bye' });
      setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 150);
    },
  };
  if (welcome.t === 'welcome') net.initialSession = makeSession(welcome);
  for (const m of early.splice(0)) handle(m);
  return net;
}
