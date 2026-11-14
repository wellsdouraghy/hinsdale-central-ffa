// Host networking that outlives a single match: PeerJS room, pre-match lobby (members, teams, ready, settings),
// countdown, match start (creates the Authority), late joins, and "back to lobby" with the same room code.
import { Authority, MATCH } from '../game/authority.js';
import { openPeer } from './peer.js';
import { TEAMS } from '../game/ctf.js';

const HEARTBEAT_TIMEOUT = 12;
export const DEFAULT_LIMITS = { ffa: 30, tdm: 50, ctf: 3 };

class LocalQueue {
  constructor() { this.q = []; this.onMessage = null; }
  push(msg) { this.q.push(msg); }
  flush() { const q = this.q; this.q = []; for (const m of q) this.onMessage?.(m); }
}

/** settings: { mode, bots, difficulty, scoreLimit } */
export async function createHostNet({ name, onStatus, settings }) {
  const localId = 1;
  let nextId = 2;
  let closed = false;
  const clients = new Map();   // id -> { ev, st, peerId, lastSeen }
  const byPeer = new Map();    // peerId -> id
  const { peer, code } = await openPeer(onStatus);
  const members = new Map();   // id -> { id, name, pid, team, ready, ping, host, mic }
  members.set(localId, { id: localId, name, pid: peer.id, team: null, ready: true, ping: 0, host: true, mic: true });
  const lobby = { code, phase: 'lobby', settings: normalize({ ...settings }) };
  let match = null;            // { authority, queue, session }
  const net = {
    mode: 'host', isHost: true, localId, roomCode: code, peer,
    onLobby: null, onCountdown: null, onMatchStart: null, onToLobby: null,
    get lobby() { return lobbyState(); },
    get phase() { return lobby.phase; },
    get match() { return match; },
  };

  // ---------- lobby state ----------
  function normalize(s) {
    s.mode = ['ffa', 'tdm', 'ctf'].includes(s.mode) ? s.mode : 'ffa';
    s.bots = Math.max(0, Math.min(7, Math.round(Number(s.bots) || 0)));
    s.difficulty = ['easy', 'normal', 'hard'].includes(s.difficulty) ? s.difficulty : 'normal';
    s.scoreLimit = Math.max(1, Math.min(200, Math.round(Number(s.scoreLimit) || DEFAULT_LIMITS[s.mode])));
    return s;
  }
  const teamMode = () => lobby.settings.mode !== 'ffa';
  const humans = () => [...members.values()];
  function teamCount(team, exceptId = null) { return humans().filter((m) => m.team === team && m.id !== exceptId).length; }
  function smallerTeam() {
    const r = teamCount('red'), b = teamCount('blue');
    return r === b ? (Math.random() < 0.5 ? 'red' : 'blue') : r < b ? 'red' : 'blue';
  }
  function autoBalance() {
    if (!teamMode()) { for (const m of members.values()) m.team = null; return; }
    const list = humans().sort(() => Math.random() - 0.5);
    list.forEach((m, i) => { m.team = TEAMS[i % 2]; });
  }
  function ensureTeams() {
    if (!teamMode()) { for (const m of members.values()) m.team = null; return; }
    for (const m of members.values()) if (!m.team) m.team = smallerTeam();
  }
  function lobbyState() {
    const hs = humans();
    const botSlots = Math.max(0, Math.min(lobby.settings.bots, MATCH.maxPlayers - hs.length));
    return {
      code, phase: lobby.phase, settings: { ...lobby.settings }, botSlots,
      members: hs.map((m) => ({ id: m.id, name: m.name, pid: m.pid, team: m.team, ready: m.ready, ping: m.ping, host: m.host, mic: m.mic })),
    };
  }
  function pushLobby() {
    const st = lobbyState();
    broadcast({ t: 'lobby', lobby: st });
    net.onLobby?.(st);
  }

  // ---------- transport ----------
  const send = (c, msg) => { try { if (c?.open) c.send(msg); } catch { /* closing */ } };
  function broadcast(msg, except = null) { for (const [id, c] of clients) if (id !== except) send(c.ev, msg); }

  function dropClient(id) {
    const c = clients.get(id);
    if (!c) return;
    clients.delete(id);
    byPeer.delete(c.peerId);
    members.delete(id);
    try { c.ev?.close(); c.st?.close(); } catch { /* ignore */ }
    match?.authority.removePlayer(id);
    pushLobby();
  }

  function onHello(conn, msg) {
    if (byPeer.has(conn.peer)) return;
    if (members.size >= MATCH.maxPlayers) { send(conn, { t: 'reject', reason: 'Room is full (8 players max).' }); setTimeout(() => conn.close(), 500); return; }
    const id = nextId++;
    byPeer.set(conn.peer, id);
    clients.set(id, { ev: conn, st: null, peerId: conn.peer, lastSeen: performance.now() / 1000 });
    const nm = uniqueName(String(msg.name || 'Player').slice(0, 20));
    members.set(id, { id, name: nm, pid: conn.peer, team: teamMode() ? smallerTeam() : null, ready: false, ping: 0, host: false, mic: true });
    if (lobby.phase === 'match' && match) {
      // Late join: straight into the running match.
      const m = members.get(id);
      match.authority.addPlayer(id, nm, { pid: conn.peer, team: m.team });
      match.authority.trimBots();
      send(conn, match.authority.welcomeFor(id));
    } else send(conn, { t: 'lobbyWelcome', id, lobby: lobbyState() });
    pushLobby();
  }

  function uniqueName(n) {
    const taken = new Set(humans().map((m) => m.name.toLowerCase()));
    if (!taken.has(n.toLowerCase())) return n;
    for (let i = 2; ; i++) if (!taken.has(`${n} (${i})`.toLowerCase())) return `${n} (${i})`;
  }

  function onData(id, msg) {
    const c = clients.get(id);
    if (c) c.lastSeen = performance.now() / 1000;
    const m = members.get(id);
    switch (msg.t) {
      case 'bye': dropClient(id); return;
      case 'pong': if (m) m.ping = Math.round((performance.now() / 1000 - msg.ts) * 1000); break;
      case 'lobbyReady': if (m) { m.ready = !!msg.ready; pushLobby(); } return;
      case 'lobbyTeam':
        if (m && teamMode() && TEAMS.includes(msg.team) && m.team !== msg.team && lobby.phase === 'lobby') {
          // Joiners may switch only if the teams stay within one player.
          if (teamCount(msg.team) + 1 - teamCount(m.team, m.id) <= 1) { m.team = msg.team; pushLobby(); }
          else send(c?.ev, { t: 'notice', text: 'Teams would be unbalanced.' });
        }
        return;
      case 'joinMatch':
        if (match) send(c?.ev, match.authority.welcomeFor(id));
        return;
      default: break;
    }
    match?.authority.handle(id, msg);
  }

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      if (closed) { conn.close(); return; }
      if (conn.label === 'st') {
        const id = byPeer.get(conn.peer);
        if (id !== undefined) clients.get(id).st = conn; else conn.close();
        conn.on('data', (msg) => {
          const cid = byPeer.get(conn.peer);
          if (cid !== undefined && msg?.t === 'st') match?.authority.handle(cid, msg);
        });
        return;
      }
      conn.on('data', (msg) => {
        if (!msg || typeof msg.t !== 'string') return;
        if (msg.t === 'hello') { onHello(conn, msg); return; }
        const id = byPeer.get(conn.peer);
        if (id !== undefined) onData(id, msg);
      });
      conn.on('close', () => {
        const id = byPeer.get(conn.peer);
        if (id !== undefined && clients.get(id)?.ev === conn) dropClient(id);
      });
    });
    conn.on('error', () => { /* handled by close */ });
  });

  // Lobby pings + heartbeat (the authority does its own pings during a match).
  const timer = setInterval(() => {
    if (closed) return;
    const t = performance.now() / 1000;
    if (lobby.phase !== 'match') { broadcast({ t: 'ping', ts: t }); net.onLobby?.(lobbyState()); }
    for (const [id, c] of clients) if (t - c.lastSeen > HEARTBEAT_TIMEOUT) dropClient(id);
  }, 2000);
  // Keep a running match ticking while the host tab is hidden.
  let lastTick = performance.now();
  const bgTimer = setInterval(() => {
    if (!document.hidden || closed || !match) return;
    const t = performance.now();
    match.session.tick(Math.min(1, (t - lastTick) / 1000));
  }, 250);

  // ---------- host actions ----------
  net.setSettings = (patch) => {
    if (lobby.phase !== 'lobby') return;
    const prevMode = lobby.settings.mode;
    Object.assign(lobby.settings, patch);
    if (patch.mode && patch.mode !== prevMode && !('scoreLimit' in patch)) lobby.settings.scoreLimit = DEFAULT_LIMITS[lobby.settings.mode];
    normalize(lobby.settings);
    // FFA -> team mode: deal players out evenly; TDM <-> CTF keeps the teams the host arranged.
    if (lobby.settings.mode !== prevMode) { if (teamMode() && prevMode === 'ffa') autoBalance(); else ensureTeams(); }
    pushLobby();
  };
  net.moveTeam = (id, team) => {
    const m = members.get(id);
    if (!m || !teamMode() || !TEAMS.includes(team) || lobby.phase !== 'lobby') return;
    m.team = team;
    pushLobby();
  };
  net.autoBalance = () => { autoBalance(); pushLobby(); };

  /** 3 s countdown, then `onMatchStart` (the app loads the world and calls startMatch). */
  net.startCountdown = (secs = 3) => {
    if (lobby.phase !== 'lobby') return;
    lobby.phase = 'countdown';
    ensureTeams();
    broadcast({ t: 'countdown', s: secs });
    net.onCountdown?.(secs);
    pushLobby();
    setTimeout(() => { if (!closed && lobby.phase === 'countdown') net.onMatchStart?.(); }, secs * 1000);
  };

  /** Creates the match authority with every lobby member; returns the host's Game session. */
  net.startMatch = (world) => {
    const queue = new LocalQueue();
    const out = (msg, to = null, except = null) => {
      if (to === null || to === localId) { if (except !== localId && msg.t !== 'ping') queue.push(msg); }
      for (const [id, c] of clients) {
        if (id === except || (to !== null && to !== id)) continue;
        if (msg.t === 'sts') {
          const s = msg.s.filter((x) => x.id !== id);
          if (s.length) send(c.st?.open ? c.st : c.ev, { t: 'sts', s });
        } else send(c.ev, msg);
      }
    };
    const s = lobby.settings;
    const authority = new Authority({ world, mode: s.mode, out, scoreLimit: s.scoreLimit });
    for (const m of members.values()) authority.addPlayer(m.id, m.name, { pid: m.pid, team: m.team });
    if (s.bots > 0) authority.bots.configure({ count: s.bots, difficulty: s.difficulty });
    const session = {
      mode: 'host', isHost: true, localId, roomCode: code, authority, peer,
      welcome: authority.welcomeFor(localId),
      set onMessage(fn) { queue.onMessage = fn; },
      onDisconnect: null,
      send(msg) { authority.handle(localId, msg); },
      sendState(msg) { authority.handle(localId, msg); },
      tick(dt) { lastTick = performance.now(); authority.update(dt); queue.flush(); },
      close() { /* the room stays open; leaving is handled by net.close() */ },
    };
    match = { authority, queue, session };
    lobby.phase = 'match';
    broadcast({ t: 'matchStart', mode: s.mode });
    pushLobby();
    return session;
  };

  /** End the current match and bring everyone back to the lobby (same room, same settings). */
  net.backToLobby = () => {
    if (!match) return;
    match = null;
    lobby.phase = 'lobby';
    for (const m of members.values()) m.ready = m.host;
    broadcast({ t: 'toLobby' });
    net.onToLobby?.();
    pushLobby();
  };

  net.close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    clearInterval(bgTimer);
    broadcast({ t: 'hostleft' });
    setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 150);
  };

  ensureTeams();
  return net;
}
