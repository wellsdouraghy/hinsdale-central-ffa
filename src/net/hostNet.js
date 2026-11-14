// Host networking that outlives a single match: PeerJS room, pre-match lobby (members, teams, ready, settings, bot
// split per team), countdown, match start (creates the Authority), late joins, and "back to lobby" with the same code.
// Robustness: every timer runs on a Worker (keeps ticking in a background tab), heartbeats forgive gaps where this tab
// was frozen, messages from one client can never take the room down (each handler is isolated), validation never kicks
// (bad messages are dropped), a human joining a full room evicts a bot, and every drop has a logged, shown reason.
import { Authority, MATCH } from '../game/authority.js';
import { openPeer } from './peer.js';
import { TEAMS } from '../game/ctf.js';
import { every } from './ticker.js';
import { PROTOCOL, MISMATCH_TEXT } from './version.js';

const HEARTBEAT_TIMEOUT = 20;   // s without any message from a client
const FREEZE_GAP = 3;           // s between our own ticks = we were frozen: don't blame the clients
export const DEFAULT_LIMITS = { ffa: 30, tdm: 50, ctf: 3 };

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
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

/** settings: { mode, bots, botsRed, botsBlue, difficulty, scoreLimit } */
export async function createHostNet({ name, onStatus, settings }) {
  const localId = 1;
  let nextId = 2;
  let closed = false;
  const clients = new Map();   // id -> { ev, st, peerId, lastSeen, lastSt, relayEv, evState }
  const byPeer = new Map();    // peerId -> id
  const { peer, code } = await openPeer(onStatus);
  const members = new Map();   // id -> { id, name, pid, team, ready, ping, host, mic }
  members.set(localId, { id: localId, name, pid: peer.id, team: null, ready: true, ping: 0, host: true, mic: true });
  const lobby = { code, phase: 'lobby', settings: normalize({ ...settings }) };
  let match = null;            // { authority, queue, session }
  const net = {
    mode: 'host', isHost: true, localId, roomCode: code, peer,
    onLobby: null, onCountdown: null, onMatchStart: null, onToLobby: null, onNotice: null,
    get lobby() { return lobbyState(); },
    get phase() { return lobby.phase; },
    get match() { return match; },
  };

  // ---------- lobby state ----------
  function normalize(s) {
    s.mode = ['ffa', 'tdm', 'ctf'].includes(s.mode) ? s.mode : 'ffa';
    s.bots = clampInt(s.bots, 0, MATCH.maxPlayers - 1);
    if (s.botsRed === undefined || s.botsBlue === undefined) { s.botsRed = Math.ceil(s.bots / 2); s.botsBlue = Math.floor(s.bots / 2); }
    s.botsRed = clampInt(s.botsRed, 0, MATCH.maxPlayers - 1);
    s.botsBlue = clampInt(s.botsBlue, 0, MATCH.maxPlayers - 1);
    s.difficulty = ['easy', 'normal', 'hard'].includes(s.difficulty) ? s.difficulty : 'normal';
    s.scoreLimit = Math.max(1, Math.min(200, Math.round(Number(s.scoreLimit) || DEFAULT_LIMITS[s.mode])));
    return s;
  }
  const teamMode = () => lobby.settings.mode !== 'ffa';
  const humans = () => [...members.values()];
  function teamCount(team, exceptId = null) { return humans().filter((m) => m.team === team && m.id !== exceptId).length; }
  function smallerTeam() {
    const bs = botSplit();
    const r = teamCount('red') + bs.red, b = teamCount('blue') + bs.blue;
    return r === b ? (Math.random() < 0.5 ? 'red' : 'blue') : r < b ? 'red' : 'blue';
  }
  /** Bots that actually fit (humans + bots <= cap): the fuller team gives up bots first. */
  function botSplit() {
    const s = lobby.settings, h = humans().length;
    if (!teamMode()) return { ffa: Math.max(0, Math.min(s.bots, MATCH.maxPlayers - h)), red: 0, blue: 0 };
    let red = s.botsRed, blue = s.botsBlue;
    const hr = humans().filter((m) => m.team === 'red').length, hb = humans().filter((m) => m.team === 'blue').length;
    while (h + red + blue > MATCH.maxPlayers && red + blue > 0) {
      if ((hr + red >= hb + blue && red > 0) || blue === 0) red--; else blue--;
    }
    return { ffa: 0, red, blue };
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
    const bs = botSplit();
    return {
      code, phase: lobby.phase, settings: { ...lobby.settings }, botSlots: teamMode() ? bs.red + bs.blue : bs.ffa,
      botTeams: { red: bs.red, blue: bs.blue }, cap: MATCH.maxPlayers,
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

  function dropClient(id, reason = 'left') {
    const c = clients.get(id);
    if (!c) return;
    const m = members.get(id);
    console.info('[host] dropping client', id, m?.name, '-', reason);
    if (reason !== 'left') { send(c.ev, { t: 'kicked', reason }); net.onNotice?.(`${m?.name || 'A player'} disconnected (${reason})`); }
    clients.delete(id);
    byPeer.delete(c.peerId);
    members.delete(id);
    setTimeout(() => { try { c.ev?.close(); c.st?.close(); } catch { /* ignore */ } }, reason !== 'left' ? 300 : 0);
    try { match?.authority.removePlayer(id); } catch (err) { console.error('[host] removePlayer', err); }
    pushLobby();
  }

  function onHello(conn, msg) {
    if (byPeer.has(conn.peer)) return;
    if (msg.v !== PROTOCOL) {
      console.info('[host] version mismatch from', msg.name, msg.v, '!=', PROTOCOL);
      send(conn, { t: 'reject', reason: MISMATCH_TEXT });
      net.onNotice?.(`${String(msg.name || 'A player').slice(0, 20)} could not join: ${MISMATCH_TEXT}`);
      setTimeout(() => conn.close(), 800);
      return;
    }
    if (humans().length >= MATCH.maxHumans) { send(conn, { t: 'reject', reason: `Room is full (${MATCH.maxHumans} players max).` }); setTimeout(() => conn.close(), 500); return; }
    const id = nextId++;
    byPeer.set(conn.peer, id);
    clients.set(id, { ev: conn, st: null, peerId: conn.peer, lastSeen: now(), lastSt: now(), relayEv: false, evState: false });
    const nm = uniqueName(String(msg.name || 'Player').slice(0, 20));
    members.set(id, { id, name: nm, pid: conn.peer, team: teamMode() ? smallerTeam() : null, ready: false, ping: 0, host: false, mic: true });
    if (lobby.phase === 'match' && match) {
      // Late join: straight into the running match (a bot gives up its slot if the room is at the cap).
      const m = members.get(id);
      match.authority.addPlayer(id, nm, { pid: conn.peer, team: m.team });
      match.authority.trimBots(m.team);
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
    if (c) c.lastSeen = now();
    const m = members.get(id);
    switch (msg.t) {
      case 'bye': dropClient(id); return;
      case 'pong': if (m) m.ping = Math.round((now() - msg.ts) * 1000); break;
      case 'lobbyReady': if (m) { m.ready = !!msg.ready; pushLobby(); } return;
      case 'lobbyTeam':
        if (m && teamMode() && TEAMS.includes(msg.team) && m.team !== msg.team && lobby.phase === 'lobby') {
          // Joiners may switch only if the human teams stay within one player.
          if (teamCount(msg.team) + 1 - teamCount(m.team, m.id) <= 1) { m.team = msg.team; pushLobby(); }
          else send(c?.ev, { t: 'notice', text: 'Teams would be unbalanced.' });
        }
        return;
      case 'joinMatch':
        if (match) send(c?.ev, match.authority.welcomeFor(id));
        return;
      case 'stFallback': if (c) { c.relayEv = true; console.info('[host] relaying states to', id, 'on the reliable channel'); } return;
      case 'st': if (c) c.lastSt = now(); break;
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
          try {
            const cid = byPeer.get(conn.peer);
            if (cid === undefined || msg?.t !== 'st') return;
            const c = clients.get(cid);
            if (c) { c.lastSeen = now(); c.lastSt = now(); }
            match?.authority.handle(cid, msg);
          } catch (err) { console.error('[host] state from', conn.peer, err); }
        });
        conn.on('error', () => {});
        return;
      }
      conn.on('data', (msg) => {
        try {
          if (!msg || typeof msg.t !== 'string') return;
          if (msg.t === 'hello') { onHello(conn, msg); return; }
          const id = byPeer.get(conn.peer);
          if (id !== undefined) onData(id, msg);
        } catch (err) { console.error('[host] message', msg?.t, 'from', conn.peer, err); }   // never tear the room down
      });
      conn.on('close', () => {
        const id = byPeer.get(conn.peer);
        if (id !== undefined && clients.get(id)?.ev === conn) dropClient(id, 'connection closed');
      });
    });
    conn.on('error', (err) => console.info('[host] connection error', conn.peer, err?.type || err));
  });

  // Lobby pings + lobby refresh + heartbeat + state-channel health (the authority does its own pings in a match).
  let lastBeat = now();
  const stopBeat = every(1000, () => {
    if (closed) return;
    const t = now();
    if (t - lastBeat > FREEZE_GAP) for (const c of clients.values()) { c.lastSeen = t; c.lastSt = t; }   // we were frozen
    lastBeat = t;
    if (lobby.phase !== 'match') { broadcast({ t: 'ping', ts: t }); if (Math.floor(t) % 2 === 0) pushLobby(); }
    for (const [id, c] of clients) {
      if (t - c.lastSeen > HEARTBEAT_TIMEOUT) { dropClient(id, `no response for ${HEARTBEAT_TIMEOUT} s`); continue; }
      // Alive in a match but no movement states for a while although they are otherwise talking: use the reliable channel.
      const p = match?.authority.players.get(id);
      if (p?.alive && !c.evState && t - Math.max(c.lastSt, p.spawnInfo?.t ?? 0) > 2.5 && t - c.lastSeen < 2) {
        c.evState = true;
        console.info('[host] no movement states from', id, 'on the fast channel: switching them to the reliable one');
        send(c.ev, { t: 'useEv' });
      }
    }
  });
  // Keep a running match simulating when this tab is hidden or the frame rate collapses (rAF stops in the background).
  let lastTick = performance.now();
  const stopBg = every(50, () => {
    if (closed || !match) return;
    const t = performance.now();
    if (t - lastTick < 120) return;
    match.session.tick(Math.min(0.25, (t - lastTick) / 1000));
  });

  // ---------- host actions ----------
  net.setSettings = (patch) => {
    if (lobby.phase !== 'lobby') return;
    const s = lobby.settings;
    const prevMode = s.mode;
    Object.assign(s, patch);
    if (patch.mode && patch.mode !== prevMode) {
      if (!('scoreLimit' in patch)) s.scoreLimit = DEFAULT_LIMITS[s.mode];
      // Carry the bot count across FFA <-> team modes.
      if (prevMode === 'ffa' && s.mode !== 'ffa') { s.botsRed = Math.ceil(s.bots / 2); s.botsBlue = Math.floor(s.bots / 2); }
      if (prevMode !== 'ffa' && s.mode === 'ffa') s.bots = Math.min(MATCH.maxPlayers - 1, s.botsRed + s.botsBlue);
    }
    if ('bots' in patch && s.mode !== 'ffa' && !('botsRed' in patch)) {
      // A plain total in a team mode: split it evenly.
      s.botsRed = Math.ceil(s.bots / 2); s.botsBlue = Math.floor(s.bots / 2);
    }
    normalize(s);
    // Keep the configured split within the cap.
    const h = humans().length;
    while (h + s.botsRed + s.botsBlue > MATCH.maxPlayers && (s.botsRed + s.botsBlue) > 0) { if (s.botsRed >= s.botsBlue) s.botsRed--; else s.botsBlue--; }
    if (s.mode === 'ffa') s.bots = Math.min(s.bots, MATCH.maxPlayers - h);
    if (s.mode !== prevMode) { if (teamMode() && prevMode === 'ffa') autoBalance(); else ensureTeams(); }
    pushLobby();
  };
  /** Team modes: +/- one bot on a team, or move one bot to the other team. */
  net.botTeam = (team, delta) => {
    if (!teamMode() || !TEAMS.includes(team)) return;
    const s = lobby.settings, key = team === 'red' ? 'botsRed' : 'botsBlue';
    if (delta > 0 && humans().length + botSplit().red + botSplit().blue >= MATCH.maxPlayers) return;
    net.setSettings({ [key]: Math.max(0, s[key] + delta) });
  };
  net.moveBot = (fromTeam) => {
    if (!teamMode() || !TEAMS.includes(fromTeam)) return;
    const s = lobby.settings, from = fromTeam === 'red' ? 'botsRed' : 'botsBlue', to = fromTeam === 'red' ? 'botsBlue' : 'botsRed';
    if (s[from] <= 0) return;
    net.setSettings({ [from]: s[from] - 1, [to]: s[to] + 1 });
  };
  net.moveTeam = (id, team) => {
    const m = members.get(id);
    if (!m || !teamMode() || !TEAMS.includes(team) || lobby.phase !== 'lobby') return;
    m.team = team;
    pushLobby();
  };
  net.autoBalance = () => {
    autoBalance();
    if (teamMode()) {
      // Even out the whole teams (humans + bots).
      const s = lobby.settings, total = s.botsRed + s.botsBlue;
      const hr = teamCount('red'), hb = teamCount('blue');
      let red = Math.max(0, Math.min(total, Math.round((total + hb - hr) / 2)));
      s.botsRed = red; s.botsBlue = total - red;
    }
    pushLobby();
  };

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
          if (s.length) send(c.st?.open && !c.relayEv ? c.st : c.ev, { t: 'sts', s });
        } else send(c.ev, msg);
      }
    };
    const s = lobby.settings;
    const authority = new Authority({ world, mode: s.mode, out, scoreLimit: s.scoreLimit });
    for (const m of members.values()) authority.addPlayer(m.id, m.name, { pid: m.pid, team: m.team });
    const bs = botSplit();
    if (teamMode()) authority.bots.configure({ difficulty: s.difficulty, red: bs.red, blue: bs.blue });
    else if (bs.ffa > 0) authority.bots.configure({ count: bs.ffa, difficulty: s.difficulty });
    const session = {
      mode: 'host', isHost: true, localId, roomCode: code, authority, peer,
      welcome: authority.welcomeFor(localId),
      set onMessage(fn) { queue.onMessage = fn; },
      onDisconnect: null,
      send(msg) { authority.handle(localId, msg); },
      sendState(msg) { authority.handle(localId, msg); },
      tick(dt) { lastTick = performance.now(); authority.update(dt); queue.flush(); },
      close() { /* the room stays open; leaving is handled by net.close() */ },
      diag: () => net.diag(),
    };
    match = { authority, queue, session };
    lobby.phase = 'match';
    for (const c of clients.values()) { c.lastSt = now(); c.evState = false; }
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

  /** Connection diagnostics for the Esc menu. */
  net.diag = () => {
    const t = now();
    return {
      role: 'host', broker: peer.disconnected ? 'reconnecting' : 'ok', link: `${clients.size} connected`,
      clients: [...clients.entries()].map(([id, c]) => ({ id, name: members.get(id)?.name, ping: members.get(id)?.ping, heard: t - c.lastSeen, channel: c.st?.open && !c.relayEv ? 'fast' : 'reliable' })),
    };
  };

  net.close = () => {
    if (closed) return;
    closed = true;
    stopBeat();
    stopBg();
    broadcast({ t: 'hostleft' });
    setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 150);
  };

  ensureTeams();
  return net;
}
