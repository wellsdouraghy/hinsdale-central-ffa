// Sessions: the transport between the local Game and the match Authority.
//   practice: Authority runs locally, no network.
//   host:     Authority runs locally; clients connect via PeerJS (star topology, host relays).
//   client:   connects to the host's peer id `hcffa-<CODE>`.
// Common interface:
//   { mode, isHost, localId, roomCode, authority?, send(msg), sendState(msg), tick(dt), onMessage, onDisconnect, close() }
import { Authority, MATCH } from '../game/authority.js';
import { openPeer, connectToHost, PEER_PREFIX, randomCode } from './peer.js';

const HEARTBEAT_TIMEOUT = 12; // seconds without any message => drop

class LocalQueue {
  constructor() { this.q = []; this.onMessage = null; }
  push(msg) { this.q.push(msg); }
  flush() {
    const q = this.q;
    this.q = [];
    for (const m of q) this.onMessage?.(m);
  }
}

/** Practice: local authority with static bot dummies. */
export function createPracticeSession({ world, name, dummies, spawn, mode = 'ffa' }) {
  const queue = new LocalQueue();
  const localId = 1;
  const authority = new Authority({
    world, mode, practice: true, practiceSpawn: spawn,
    out: (msg, to = null, except = null) => {
      if (msg.t === 'ping' || msg.t === 'sts') return;
      if ((to === null || to === localId) && except !== localId) queue.push(msg);
    },
  });
  authority.addPlayer(localId, name, { team: mode === 'ctf' ? 'red' : null });
  const welcome = authority.welcomeFor(localId);
  dummies.forEach((d, i) => authority.addPlayer(100 + i, `Dummy ${i + 1}`, { bot: true, pos: d.pos, yaw: d.yaw, team: mode === 'ctf' ? 'blue' : null }));
  return {
    mode: 'practice', isHost: true, localId, roomCode: null, authority, welcome,
    set onMessage(fn) { queue.onMessage = fn; },
    onDisconnect: null,
    send(msg) { authority.handle(localId, msg); },
    sendState(msg) { authority.handle(localId, msg); }, // keeps the authority's idea of our position current (flags, spawns)
    tick(dt) { authority.update(dt); queue.flush(); },
    close() {},
  };
}

/** Host: opens a PeerJS peer with a room code and accepts up to MATCH.maxPlayers. */
export async function createHostSession({ world, name, onStatus, mode = 'ffa' }) {
  const queue = new LocalQueue();
  const localId = 1;
  let nextId = 2;
  const clients = new Map(); // id -> { ev, st, peerId }
  const byPeer = new Map();  // peerId -> id
  let closed = false;

  const send = (c, msg) => {
    try { if (c?.open) c.send(msg); } catch { /* channel closing */ }
  };
  const out = (msg, to = null, except = null) => {
    if (to === null || to === localId) {
      if (except !== localId && msg.t !== 'ping') queue.push(msg);
    }
    for (const [id, c] of clients) {
      if (id === except) continue;
      if (to !== null && to !== id) continue;
      if (msg.t === 'sts') {
        // Skip a client's own state to save bandwidth.
        const s = msg.s.filter((x) => x.id !== id);
        if (s.length) send(c.st?.open ? c.st : c.ev, { t: 'sts', s });
      } else send(c.ev, msg);
    }
  };
  const authority = new Authority({ world, mode, out });
  authority.addPlayer(localId, name);

  const { peer, code } = await openPeer(onStatus);

  const dropClient = (id) => {
    const c = clients.get(id);
    if (!c) return;
    clients.delete(id);
    byPeer.delete(c.peerId);
    try { c.ev?.close(); c.st?.close(); } catch { /* ignore */ }
    authority.removePlayer(id);
  };

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      if (closed) { conn.close(); return; }
      if (conn.label === 'st') {
        const id = byPeer.get(conn.peer);
        if (id !== undefined) clients.get(id).st = conn;
        else conn.close();
        conn.on('data', (msg) => {
          const cid = byPeer.get(conn.peer);
          if (cid !== undefined && msg && msg.t === 'st') authority.handle(cid, msg);
        });
        return;
      }
      conn.on('data', (msg) => {
        if (!msg || typeof msg.t !== 'string') return;
        let id = byPeer.get(conn.peer);
        if (msg.t === 'hello') {
          if (id !== undefined) return;
          if (authority.isFull()) { send(conn, { t: 'reject', reason: 'Room is full (8 players max).' }); setTimeout(() => conn.close(), 500); return; }
          id = nextId++;
          byPeer.set(conn.peer, id);
          clients.set(id, { ev: conn, st: null, peerId: conn.peer });
          authority.addPlayer(id, String(msg.name || 'Player').slice(0, 20));
          send(conn, authority.welcomeFor(id));
          return;
        }
        if (msg.t === 'bye') { if (id !== undefined) dropClient(id); return; }
        if (id !== undefined) authority.handle(id, msg);
      });
      conn.on('close', () => {
        const id = byPeer.get(conn.peer);
        if (id !== undefined && clients.get(id)?.ev === conn) dropClient(id);
      });
    });
    conn.on('error', () => { /* handled by close */ });
  });

  let staleTimer = 0;
  let lastTick = performance.now();
  // Keep the authority running while the host tab is hidden (rAF pauses; timers still fire ~1 Hz).
  const bgTimer = setInterval(() => {
    if (!document.hidden || closed) return;
    const t = performance.now();
    host.tick(Math.min(1, (t - lastTick) / 1000));
  }, 250);
  const host = {
    mode: 'host', isHost: true, localId, roomCode: code, authority, peer,
    welcome: authority.welcomeFor(localId),
    set onMessage(fn) { queue.onMessage = fn; },
    onDisconnect: null,
    send(msg) { authority.handle(localId, msg); },
    sendState(msg) { authority.handle(localId, msg); },
    tick(dt) {
      lastTick = performance.now();
      authority.update(dt);
      staleTimer += dt;
      if (staleTimer > 2) {
        staleTimer = 0;
        for (const id of authority.stalePlayers(HEARTBEAT_TIMEOUT, localId)) dropClient(id);
      }
      queue.flush();
    },
    playerCount: () => clients.size + 1,
    close() {
      closed = true;
      clearInterval(bgTimer);
      for (const c of clients.values()) send(c.ev, { t: 'hostleft' });
      setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 150);
    },
  };
  return host;
}

/** Client: connects to host by room code. Resolves after the host's welcome. */
export async function createClientSession({ code, name, onStatus }) {
  const queue = new LocalQueue();
  let lastHeard = performance.now() / 1000;
  let closed = false;
  let session = null;
  const onData = (msg) => {
    lastHeard = performance.now() / 1000;
    if (msg.t === 'hostleft') { lost('The host left the match.'); return; }
    queue.push(msg);
  };
  const { peer, ev, st, welcome } = await connectToHost(code, name, onStatus, onData);
  function lost(reason) {
    if (closed) return;
    closed = true;
    try { peer.destroy(); } catch { /* ignore */ }
    session?.onDisconnect?.(reason);
  }
  ev.on('close', () => lost('The host left the match.'));
  // Heartbeat watchdog runs on a timer so it also works while the tab is in the background.
  const watchdog = setInterval(() => {
    if (closed) { clearInterval(watchdog); return; }
    if (performance.now() / 1000 - lastHeard > HEARTBEAT_TIMEOUT) lost('Lost connection to the host.');
  }, 1000);
  session = {
    mode: 'client', isHost: false, localId: welcome.id, roomCode: code, welcome,
    set onMessage(fn) { queue.onMessage = fn; },
    onDisconnect: null,
    send(msg) { try { if (ev.open) ev.send(msg); } catch { /* closing */ } },
    sendState(msg) {
      try {
        if (st.open) st.send(msg);
        else if (ev.open) ev.send(msg);
      } catch { /* closing */ }
    },
    tick() { queue.flush(); },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(watchdog);
      try { if (ev.open) ev.send({ t: 'bye' }); } catch { /* ignore */ }
      setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 150);
    },
  };
  return session;
}

export { PEER_PREFIX, randomCode, MATCH };
