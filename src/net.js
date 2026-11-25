// Peer-to-peer link between driver and co-driver (WebRTC via PeerJS).
// The public PeerJS server is only used to find each other; game data goes directly between the two browsers.
import Peer from 'peerjs';

const PREFIX = 'rallykoop-v1-';

// How the two browsers find a path to each other. STUN servers reveal the public address
// (enough for most home routers). Behind strict NATs (mobile networks, carrier-grade NAT)
// only a TURN relay helps; it can be set at build time (VITE_TURN_URLS, VITE_TURN_USERNAME,
// VITE_TURN_CREDENTIAL) or in the browser: localStorage['rally.turn'] = '{"urls":[...],"username":"...","credential":"..."}'.
function iceServers() {
  const list = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  const env = import.meta.env;
  // TURN needs credentials; without them the browser would reject the whole configuration
  if (env.VITE_TURN_URLS && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL) {
    list.push({ urls: env.VITE_TURN_URLS.split(','), username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  }
  try {
    const own = JSON.parse(localStorage.getItem('rally.turn') || 'null');
    if (own && own.urls) list.push(own);
  } catch { /* ignore broken setting */ }
  return list;
}
const PEER_OPTIONS = () => ({ debug: 0, config: { iceServers: iceServers() } });
export const hasTurn = () => iceServers().some((s) => [].concat(s.urls).some((u) => u.startsWith('turn')));

export const NAT_MESSAGE = 'Keine direkte Verbindung möglich – eure Netzwerke (Router, Mobilfunk) blockieren sie. '
  + 'Abhilfe: im selben WLAN spielen oder einen TURN-Server einrichten.';

class NetError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function normalizeCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function errorText(err) {
  switch (err && err.type) {
    case 'peer-unavailable': return 'Raum nicht gefunden – stimmt der Code?';
    case 'network':
    case 'server-error':
    case 'socket-error': return 'Keine Verbindung zum Vermittlungs-Server.';
    case 'browser-incompatible': return 'Dieser Browser unterstützt kein WebRTC.';
    default: return `Verbindungsfehler (${err && err.type ? err.type : err})`;
  }
}

// Message wrapper with typed handlers.
export class Link {
  constructor(conn, peer) {
    this.conn = conn;
    this.peer = peer;
    this.handlers = new Map();
    this.pending = [];
    this.closeHandlers = [];
    this.open = true;
    this.ping = null;
    this.lastSeen = performance.now();
    conn.on('data', (msg) => {
      this.lastSeen = performance.now();
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') { this.send({ t: 'pong', s: msg.s }); return; }
      if (msg.t === 'pong') { this.ping = performance.now() - msg.s; return; }
      const list = this.handlers.get(msg.t);
      if (list) list.forEach((fn) => fn(msg));
      else if (this.pending.push(msg) > 200) this.pending.shift(); // keep until someone listens (e.g. "hello" right after connecting)
    });
    const closed = () => {
      if (!this.open) return;
      this.open = false;
      clearInterval(this.pingTimer);
      this.closeHandlers.forEach((fn) => fn());
    };
    conn.on('close', closed);
    conn.on('error', closed);
    // heartbeat: WebRTC can take very long to notice a closed tab, so treat 8 s of silence as gone
    this.pingTimer = setInterval(() => {
      if (!this.open) return;
      if (performance.now() - this.lastSeen > 8000) { conn.close(); closed(); return; }
      this.send({ t: 'ping', s: performance.now() });
    }, 1000);
  }

  send(msg) {
    if (this.open && this.conn.open) this.conn.send(msg);
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    const waiting = this.pending.filter((m) => m.t === type);
    this.pending = this.pending.filter((m) => m.t !== type);
    waiting.forEach((m) => fn(m));
  }

  onClose(fn) { this.closeHandlers.push(fn); }

  close() {
    clearInterval(this.pingTimer);
    this.open = false;
    this.conn.close();
  }
}

// Driver: open a room. onGuest is called for every co-driver who connects
// (a reconnecting co-driver replaces the previous connection).
// preferredCode: reopen the same room after the page was reloaded for the next stage;
// the server may still hold the old id for a few seconds, so keep retrying it.
export function hostRoom({ preferredCode, onCode, onGuest, onGuestFailed, onError }) {
  let attempts = 0;
  let current = null;
  const tryOpen = () => {
    const code = preferredCode && attempts < 12 ? preferredCode : randomCode();
    const peer = new Peer(PREFIX + code, PEER_OPTIONS());
    window.addEventListener('beforeunload', () => peer.destroy());
    peer.on('open', () => onCode(code));
    peer.on('connection', (conn) => {
      conn.on('iceStateChanged', (state) => { if (state === 'failed' && onGuestFailed) onGuestFailed(); });
      conn.on('open', () => {
        if (current && current.open) current.conn.close();
        current = new Link(conn, peer);
        onGuest(current);
      });
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempts++ < 16) {
        peer.destroy();
        setTimeout(tryOpen, preferredCode ? 1500 : 0);
        return;
      }
      if (err.type === 'peer-unavailable') return;
      onError(new Error(errorText(err)));
    });
  };
  tryOpen();
}

// Co-driver: join a room by code.
// Errors carry a kind: 'not-found' (no such room), 'nat' (networks block a direct link),
// 'timeout' or 'server' (worth retrying, e.g. while the driver loads the next stage).
export function joinRoom(code) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_OPTIONS());
    window.addEventListener('beforeunload', () => peer.destroy());
    let finished = false;
    const fail = (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    };
    const timer = setTimeout(() => fail(new NetError('Zeitüberschreitung – ist der Fahrer noch im Raum?', 'timeout')), 15000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + normalizeCode(code), { reliable: true, serialization: 'json' });
      conn.on('iceStateChanged', (state) => { if (state === 'failed') fail(new NetError(NAT_MESSAGE, 'nat')); });
      conn.on('open', () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(new Link(conn, peer));
      });
    });
    peer.on('error', (err) => {
      const kind = err.type === 'peer-unavailable' ? 'not-found' : 'server';
      fail(new NetError(errorText(err), kind));
    });
  });
}
