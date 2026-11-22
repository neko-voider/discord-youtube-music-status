'use strict';

// Native Messaging host: reads/writes Chrome's 4-byte little-endian framed JSON.
// The final Windows release will package this script with Node into a standalone EXE.

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');

const CLIENT_ID = process.env.YTM_DISCORD_APPLICATION_ID || 'PASTE_YOUR_APPLICATION_ID_HERE';
let ipc = null;
let ipcReady = false;
let rx = Buffer.alloc(0);
let input = Buffer.alloc(0);
let currentTrack = null;
let lastSignature = '';
let lastUpdate = 0;
let nonce = 0;

function sendNative(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([head, body]));
}
function log(message) { sendNative({ type: 'status', message }); }

function ipcCandidates() {
  if (process.platform === 'win32') return Array.from({length: 10}, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  if (process.platform === 'darwin') return Array.from({length: 10}, (_, i) => path.join(os.homedir(), 'Library/Application Support/discord', `discord-ipc-${i}`));
  const dirs = [process.env.XDG_RUNTIME_DIR, process.env.TMPDIR, '/tmp', path.join(os.homedir(), '.config/discord')].filter(Boolean);
  return [...new Set(dirs.flatMap(d => Array.from({length: 10}, (_, i) => path.join(d, `discord-ipc-${i}`))))];
}
function writeIPC(op, obj) {
  if (!ipc || ipc.destroyed) return;
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const h = Buffer.alloc(8); h.writeInt32LE(op, 0); h.writeInt32LE(body.length, 4);
  ipc.write(Buffer.concat([h, body]));
}
function clearActivity() {
  if (ipcReady) writeIPC(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: String(++nonce) });
  lastSignature = '';
}
function buildActivity(track) {
  const now = Math.floor(Date.now() / 1000);
  const duration = Number(track.duration) || 0;
  const pos = Math.max(0, Number(track.position) || 0);
  const activity = {
    type: 2,
    details: String(track.title || 'Unknown track').slice(0, 128),
    state: String(track.album ? `${track.album} • ${track.artist || 'Unknown artist'}` : (track.artist || 'Unknown artist')).slice(0, 128),
    assets: {}
  };
  if (track.artwork && /^https?:\/\//i.test(track.artwork)) {
    activity.assets.large_image = track.artwork;
    if (track.url && /^https:\/\/music\.youtube\.com\/watch\?v=[\w-]+(?:&|$)/i.test(track.url)) {
      activity.assets.large_url = track.url;
    }
  }
  if (duration > 0) {
    const elapsed = Math.min(pos, duration);
    activity.timestamps = { start: now - Math.floor(elapsed), end: now + Math.max(0, Math.floor(duration - elapsed)) };
  } else activity.timestamps = { start: now };
  return activity;
}
function update(force = false) {
  if (!ipcReady) return;
  if (!currentTrack || !currentTrack.playing || !currentTrack.title) {
    clearActivity(); return;
  }
  const a = buildActivity(currentTrack);
  const sig = JSON.stringify([a.details, a.state, a.assets.large_image || '', currentTrack.duration]);
  if (force || sig !== lastSignature || Date.now() - lastUpdate > 5000) {
    writeIPC(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: a }, nonce: String(++nonce) });
    lastSignature = sig;
    lastUpdate = Date.now();
  }
}
function onIPCFrame(op, data) {
  if (op === 1 && data && data.evt === 'READY') { ipcReady = true; log('Connected to Discord'); update(true); }
  else if (op === 1 && data && data.evt === 'ERROR') log('Discord RPC error: ' + JSON.stringify(data.data || data));
  else if (op === 3) writeIPC(4, data || {});
}
function connectIPC() {
  if (ipc && !ipc.destroyed) return;
  const candidates = ipcCandidates();
  let i = 0;
  const next = () => {
    if (i >= candidates.length) { log('Discord Desktop IPC not found; retrying'); setTimeout(connectIPC, 3000); return; }
    const name = candidates[i++];
    const s = net.createConnection(name);
    let connected = false;
    s.once('connect', () => {
      connected = true; ipc = s; ipcReady = false; rx = Buffer.alloc(0);
      writeIPC(0, { v: 1, client_id: CLIENT_ID });
    });
    s.on('data', chunk => {
      rx = Buffer.concat([rx, chunk]);
      while (rx.length >= 8) {
        const op = rx.readInt32LE(0), len = rx.readInt32LE(4);
        if (len < 0 || len > 10 * 1024 * 1024) return s.destroy();
        if (rx.length < len + 8) break;
        const raw = rx.subarray(8, len + 8); rx = rx.subarray(len + 8);
        let obj = {}; try { obj = JSON.parse(raw.toString('utf8')); } catch {}
        onIPCFrame(op, obj);
      }
    });
    s.on('error', () => {});
    s.on('close', () => {
      if (ipc === s) { ipc = null; ipcReady = false; lastSignature = ''; setTimeout(connectIPC, 2000); }
      else if (!connected) next();
    });
  };
  next();
}

function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'stop') {
    currentTrack = null; clearActivity();
    // Chrome will disconnect the Native Messaging port after all YTM tabs close.
    return;
  }
  if (msg.type === 'track') {
    const t = msg.track || {};
    currentTrack = t.playing ? {
      playing: true,
      title: String(t.title || '').slice(0, 128),
      artist: String(t.artist || '').slice(0, 128),
      album: String(t.album || '').slice(0, 128),
      artwork: String(t.artwork || ''),
      url: String(t.url || ''),
      duration: Number(t.duration) || 0,
      position: Number(t.position) || 0
    } : null;
    update();
  }
}

process.stdin.on('data', chunk => {
  input = Buffer.concat([input, chunk]);
  while (input.length >= 4) {
    const len = input.readUInt32LE(0);
    if (len > 1024 * 1024) process.exit(2);
    if (input.length < 4 + len) break;
    const body = input.subarray(4, 4 + len);
    input = input.subarray(4 + len);
    try { handleMessage(JSON.parse(body.toString('utf8'))); } catch (e) { log('Bad message: ' + e.message); }
  }
});
process.stdin.on('end', () => { clearActivity(); process.exit(0); });
process.on('SIGTERM', () => { clearActivity(); process.exit(0); });
process.on('uncaughtException', e => { log('Fatal: ' + e.message); process.exit(1); });

if (!CLIENT_ID || CLIENT_ID === 'PASTE_YOUR_APPLICATION_ID_HERE') {
  log('Application ID is not configured. Set YTM_DISCORD_APPLICATION_ID in the host environment or in the packaged build.');
} else {
  connectIPC();
}



