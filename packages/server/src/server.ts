import { advertise, type AdvertiseHandle } from '@wavegrid/discovery';
import { type Layout, loadWavegridConfig, type ResolvedConfig } from '@wavegrid/layout';
import { isValidScope, openStore } from '@wavegrid/settings';
import * as fs from 'fs';
import http from 'http';
import { resolve } from 'path';
import { URL } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

import { animations } from './animations';
import { computeCoverage } from './coverage';
import type { BlendMode, CannonState, Orientation, Rotation } from './grid';
import {compositeLayer, createGrid, DEFAULT_ALPHA, defaultOrientation, mapUiToGrid, remapGridForUi, resetGrid, setAllTargets, setCannonTarget, shiftGrid, tickGrid } from './grid';
import { createHttpApp, lanVisitors, resolveUiDir } from './http-app';
import { fanout, fanoutLossy, type LivenessState,selectRevokedSockets, sweepLiveness, WS_CLOSE_SESSION_REVOKED, WS_REASON_SESSION_REVOKED } from './hub';
import type { JwtPayload } from './jwt';
import { verifyJwt } from './jwt';
import { ServerPatternEngine } from './pattern-engine';
import { compilePlaylist, type PlaylistDef, type PlaylistStep } from './playlist-compiler';
import type {
  ClientInfo,
  HelloMessage,
  SyncAckMessage,
  SyncMergeMessage,
  SyncPushMessage,
  SyncRequestMessage,
  SyncUpdateMessage,
  SystemStatus
} from './protocol';
import { applyScene, scenes } from './scenes';

export interface ServerHandle {
  server: http.Server;
  grid: ReturnType<typeof createGrid>;
  /** Resolves once the port is bound, rejects with the bind error (e.g. a port
   *  already in use). `listen` is async, so without awaiting this a caller
   *  would report a healthy show while nothing is listening. */
  ready: Promise<void>;
  stop: () => void;
  /**
   * Inject a command in-process, exactly as if an authenticated client had sent
   * it over the WebSocket. Lets an embedding process (the Electron brain, tests)
   * drive the show — e.g. light-map identify (`physical_preview`) — without
   * opening a self-connected socket. Same handler, same relay to receivers.
   */
  send: (cmd: Record<string, unknown>) => void;
}

export interface StartServerOptions {
  /** Built UI assets to serve on this port. Defaults to the resolved @wavegrid/ui dist. */
  uiDir?: string | null;
  /**
   * Advertise this brain on the LAN via mDNS (`_wavegrid._tcp`) so receivers can
   * discover it without an explicit `--server`. The CLI supplies the project +
   * machine-local device identity; omit (or pass false) to stay silent.
   * Discovery is convenience only — connections still authenticate.
   */
  advertise?: { project: string; deviceId: string; deviceName: string; transient?: boolean } | false;
}

/**
 * Start the wavegrid server. Accepts an already-resolved config (so an
 * embedding process like the CLI can pass the layout it resolved) and
 * otherwise loads it from cwd/env. Returns a handle with a stop() for
 * clean in-process shutdown.
 */
export function startServer(
  resolved: ResolvedConfig = loadWavegridConfig(),
  opts: StartServerOptions = {}
): ServerHandle {
  const layout: Layout = resolved.layout;
  const NUM_CANNONS = layout.count;
  const GRID_COLUMNS = layout.cols;
  const GRID_ROWS = layout.rows;
  const RUN_MODE = resolved.runMode;

  const PORT = resolved.config.server.port;
  const TICK_MS = 1000 / 60; // 60fps interpolation
  const SERVER_VERSION = '0.5.0';
  const startedAt = Date.now();

  // Per-socket registry powering `system_status` (→ `wavegrid doctor`).
  const clients = new Map<WebSocket, ClientInfo>();

  // ── State persistence ─────────────────────────────────────────────
  // The CLI points WG_STATE_DIR at the per-project store; standalone runs
  // fall back to a local .state dir.
  const STATE_DIR = process.env.WG_STATE_DIR || resolve(process.cwd(), '.state');
  const STATE_FILE = resolve(STATE_DIR, `server-${PORT}.json`);
  // Light-map lives in the per-project state dir (written by /api/light-map),
  // not a cwd-relative deploy file. Server + API read/write the same path.
  const LIGHT_MAP_FILE = process.env.LIGHT_MAP_CONFIG || resolve(STATE_DIR, 'light-map.json');

interface PersistedState {
  currentAnimation: string | null;
  animSpeed: number;
  currentAlpha: number;
  currentAttack: number;
  orientation: Orientation;
  shiftVx: number;
  shiftVy: number;
  grid: Array<{ h: number; s: number; b: number }>;
  playlist: PlaylistDef | null;
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const state: PersistedState = {
      currentAnimation,
      animSpeed,
      currentAlpha,
      currentAttack,
      orientation,
      shiftVx,
      shiftVy,
      grid: grid.map(c => ({ h: c.targetH, s: c.targetS, b: c.targetB })),
      playlist: activePlaylist
    };
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
    } catch (e) {
      console.error('  ◈ State save error:', e instanceof Error ? e.message : String(e));
    }
  }, 1000);
}

// ── Grid & state variables ────────────────────────────────────────
const grid = createGrid(NUM_CANNONS);
let currentAlpha = DEFAULT_ALPHA;
let currentAttack = 1.0;
let currentAnimation: string | null = null;
let animationTick = 0;
let animSpeed = 1.0;
let audioLayer: CannonState[] | null = null;
let audioBlend: BlendMode = 'replace';
let videoLayer: CannonState[] | null = null;
let videoBlend: BlendMode = 'replace';
let calibrationMode = false;
let previewPhysicalIndex: number | null = null;
let orientation: Orientation = defaultOrientation();
let shiftVx = 0;
let shiftVy = 0;
let shiftAccX = 0;
let shiftAccY = 0;
let activePlaylist: PlaylistDef | null = null;
let playlistCurrentStep = 0;
const patternEngine = new ServerPatternEngine(layout);

// Restore persisted state on boot
const restored = loadPersistedState();
if (restored) {
  currentAnimation = restored.currentAnimation && animations[restored.currentAnimation] ? restored.currentAnimation : null;
  animSpeed = restored.animSpeed ?? animSpeed;
  currentAlpha = restored.currentAlpha ?? currentAlpha;
  currentAttack = restored.currentAttack ?? currentAttack;
  if (restored.orientation) orientation = { ...defaultOrientation(), ...restored.orientation };
  shiftVx = restored.shiftVx ?? 0;
  shiftVy = restored.shiftVy ?? 0;
  if (Array.isArray(restored.grid)) {
    for (let i = 0; i < Math.min(restored.grid.length, grid.length); i++) {
      const c = restored.grid[i];
      grid[i].targetH = c.h ?? 0;
      grid[i].targetS = c.s ?? 0;
      grid[i].targetB = c.b ?? 0;
      grid[i].h = c.h ?? 0;
      grid[i].s = c.s ?? 0;
      grid[i].b = c.b ?? 0;
    }
  }
  activePlaylist = restored.playlist ?? null;
  console.log(`  ◈ Restored state from ${STATE_FILE}`);
}

// One origin: static UI + JSON API on the same port the WebSocket upgrades on.
const uiDir = opts.uiDir !== undefined ? opts.uiDir : resolveUiDir();
const httpApp = createHttpApp(resolved, {
  uiDir,
  // An admin revoking through the API shouldn't have to wait for the sweep.
  onSessionsRevoked: () => disconnectRevokedSessions()
});
const server = http.createServer((req, res) => {
  httpApp(req, res).catch((err) => {
    console.error('  ◈ HTTP error:', err instanceof Error ? err.message : String(err));
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

const wss = new WebSocketServer({ noServer: true });
const verifiedPayloads = new WeakMap<http.IncomingMessage, JwtPayload>();
const liveness = new Map<WebSocket, LivenessState>();

const RECEIVER_KEY = process.env.WG_RECEIVER_KEY || '';

server.on('upgrade', (req, socket, head) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const token = reqUrl.searchParams.get('token');
  const key = reqUrl.searchParams.get('key');

  // Require either a valid JWT token whose session is still live, or a valid
  // receiver key. Connections with neither are rejected.
  if (token) {
    const payload = verifyJwt(token);
    if (!payload) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    if (payload.sid) {
      const target = resolveSyncTarget();
      if (target && !target.store.getSession(target.project, payload.sid)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    verifiedPayloads.set(req, payload);
  } else if (key && RECEIVER_KEY && key === RECEIVER_KEY) {
    // valid receiver key — allow
  } else {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

function dropClient(ws: WebSocket, error?: unknown): void {
  const wasTracked = clients.delete(ws);
  liveness.delete(ws);
  if (!wasTracked) return;
  if (error) {
    console.error('  ◈ WebSocket client error:', error instanceof Error ? error.message : String(error));
  }
  try {
    ws.terminate();
  } catch {
    // The peer is already gone.
  }
}

function sendToClient(ws: WebSocket, payload: string): boolean {
  return fanout([ws], payload, dropClient) === 1;
}

function revokeClient(ws: WebSocket): void {
  clients.delete(ws);
  liveness.delete(ws);
  try {
    ws.close(WS_CLOSE_SESSION_REVOKED, WS_REASON_SESSION_REVOKED);
  } catch {
    ws.terminate();
  }
}

/**
 * Close every socket whose session record is gone. Called on the heartbeat —
 * revocation also happens in another process (the desktop app writes the same
 * store), so the session row is the only thing that can tell us — and directly
 * from the API routes that revoke, so an operator booting someone off doesn't
 * wait out a heartbeat.
 */
function disconnectRevokedSessions(): void {
  const target = resolveSyncTarget();
  if (!target) return;
  try {
    const live = new Set(target.store.listSessions(target.project).map((session) => session.id));
    for (const ws of selectRevokedSockets(clients, (sid) => live.has(sid))) revokeClient(ws);
  } catch {
    // Session checks are best-effort when the project store is unavailable.
  }
}

// Broadcast the current grid snapshot to all UI clients.
// Used for calibration, orientation changes, and paint/clear — so the
// browser UI preview stays up-to-date.  Receivers ignore these messages
// (they only act on {type:"command"} packets).
function broadcastState() {
  const output = calibrationMode
    ? getCalibrationOutput()
    : remapGridForUi(
      (() => {
        let base = grid.map(c => ({ h: c.h, s: c.s, b: c.b }));
        if (audioLayer) base = compositeLayer(base, audioLayer, audioBlend);
        if (videoLayer) base = compositeLayer(base, videoLayer, videoBlend);
        return base;
      })(),
      GRID_COLUMNS, GRID_ROWS, orientation
    );
  const payload = JSON.stringify({ type: 'state', grid: output });
  // Lossy: this goes out 60 times a second and each frame replaces the last, so
  // a client that cannot keep up must skip frames rather than build a backlog
  // that leaves it rendering the past while the rig runs on the present.
  fanoutLossy(wss.clients, payload, dropClient);
}

function getCalibrationOutput(): CannonState[] {
  const output = Array.from({ length: NUM_CANNONS }, () => ({ h: 0, s: 0, b: 0 }));
  if (previewPhysicalIndex === null) return output;

  const map = loadPhysicalLightMap();
  const logicalIndex = map.indexOf(previewPhysicalIndex);
  const index = logicalIndex >= 0 ? logicalIndex : previewPhysicalIndex;
  if (index >= 0 && index < output.length) {
    output[index] = { h: 45, s: 0, b: 100 };
  }
  return output;
}

function loadPhysicalLightMap(): number[] {
  const identity = Array.from({ length: NUM_CANNONS }, (_, index) => index);
  try {
    const raw = fs.readFileSync(LIGHT_MAP_FILE, 'utf8');
    const config = JSON.parse(raw);
    if (!Array.isArray(config.physicalLights)) return identity;
    const used = new Set<number>();
    return identity.map((fallback, index) => {
      const value = Number(config.physicalLights[index]);
      if (!Number.isInteger(value) || value < 0 || value >= NUM_CANNONS || used.has(value)) {
        used.add(fallback);
        return fallback;
      }
      used.add(value);
      return value;
    });
  } catch {
    return identity;
  }
}

function broadcastOrientation() {
  const payload = JSON.stringify({ type: 'orientation', ...orientation });
  fanout(wss.clients, payload, dropClient);
}

function broadcastCommand(cmd: Record<string, unknown>) {
  const payload = JSON.stringify({ type: 'command', ...cmd });
  fanout(wss.clients, payload, dropClient);
}

function broadcastPlaylistState() {
  const payload = JSON.stringify({
    type: 'playlist_state',
    active: activePlaylist !== null,
    playlist: activePlaylist,
    currentStep: playlistCurrentStep
  });
  fanout(wss.clients, payload, dropClient);
}

/** Cancel any active playlist when another visual command arrives. */
function cancelPlaylistIfActive() {
  if (activePlaylist) {
    activePlaylist = null;
    broadcastPlaylistState();
    scheduleSave();
  }
}

/** Normalize an IPv6-mapped IPv4 address (`::ffff:1.2.3.4`) to plain IPv4. */
function normalizeAddress(remote: string): string {
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(remote);
  return m ? m[1] : remote;
}

/**
 * Persist a receiver's self-registration into the project device registry.
 * Best-effort: a registry write failure must never drop the live connection.
 */
function persistRegistration(hello: HelloMessage, remote: string): void {
  if (!hello.deviceId) return; // older receivers don't carry a device id
  try {
    const store = openStore();
    const project = process.env.WAVEGRID_PROJECT ?? store.getActiveProject();
    if (!project) return;
    store.registerDevice(project, {
      id: hello.deviceId,
      name: hello.deviceName,
      hostname: hello.host,
      address: normalizeAddress(remote),
      layout: hello.layout?.id,
      mode: hello.mode,
      shard: hello.shard ?? null
    });
  } catch {
    /* registry is a convenience; never break the connection over it */
  }
}

/**
 * Resolve the project this server acts on (env override → active project).
 * Returns the open store + project name, or null when nothing is configured
 * (a server can still relay commands without a store-backed project).
 */
function resolveSyncTarget(): { store: ReturnType<typeof openStore>; project: string } | null {
  try {
    const store = openStore();
    const project = process.env.WAVEGRID_PROJECT ?? store.getActiveProject();
    if (!project) return null;
    return { store, project };
  } catch {
    return null;
  }
}

/** Whether this project replicates config edits (workstream F kill switch). */
function syncEnabled(): boolean {
  return resolved.config.sync?.enabled !== false;
}

/** A sync scope carrying project secrets — gated behind `sync.secrets`. */
function isSecretScope(scope: string): boolean {
  return scope === 'secrets' || scope.startsWith('secret:') || scope.startsWith('secrets:');
}

/** Broadcast an accepted config revision to every connected client. */
function broadcastSync(update: SyncUpdateMessage): void {
  const payload = JSON.stringify(update);
  fanout(wss.clients, payload, dropClient);
}

/** Serialize + persist a client's config push, then broadcast the revision. */
function handleSyncPush(msg: SyncPushMessage): void {
  if (!msg.scope) return;
  // Reject anything that isn't a known scope (project / device:<id> / secrets).
  if (!isValidScope(msg.scope)) return;
  // Replication off: the edit stays local to the laptop that made it.
  if (!syncEnabled()) return;
  // Secrets never ride the sync channel unless explicitly opted in.
  if (isSecretScope(msg.scope) && resolved.config.sync?.secrets !== true) return;
  const target = resolveSyncTarget();
  if (!target) return;
  try {
    const res = target.store.applySyncUpdate(target.project, {
      scope: msg.scope,
      config: msg.config,
      deviceId: typeof msg.deviceId === 'string' ? msg.deviceId : null,
      baseRevision: typeof msg.baseRevision === 'number' ? msg.baseRevision : undefined
    });
    broadcastSync({ type: 'sync_update', revision: res.revision, entry: res.entry, staleBase: res.staleBase });
  } catch {
    /* sync is best-effort; never drop the connection over a bad push */
  }
}

/** Send the full replicated document to one client (join / reconnect / resync). */
function sendSyncState(ws: WebSocket, msg: SyncRequestMessage): void {
  const target = resolveSyncTarget();
  if (!target) {
    sendToClient(ws, JSON.stringify({ type: 'sync_state', revision: 0, entries: {} }));
    return;
  }
  const state = target.store.getSyncState(target.project);
  if (msg.deviceId) {
    // A device asking for state has, at minimum, whatever it already had.
    try {
      target.store.ackSync(target.project, msg.deviceId, msg.haveRevision ?? 0);
    } catch {
      /* ignore */
    }
  }
  sendToClient(ws, JSON.stringify({ type: 'sync_state', revision: state.revision, entries: state.entries }));
}

/** Record a client's acknowledgement of the revision it applied. */
function handleSyncAck(msg: SyncAckMessage): void {
  if (!msg.deviceId || typeof msg.revision !== 'number') return;
  const target = resolveSyncTarget();
  if (!target) return;
  try {
    target.store.ackSync(target.project, msg.deviceId, msg.revision);
  } catch {
    /* ignore */
  }
}

/**
 * Reconcile a re-homing peer's whole sync document into ours, then broadcast
 * the reconciled state so every client converges. This is the offline→online
 * handover: a transient coordinator hands the edits it accepted to the
 * dedicated brain, which merges deterministically (highest revision per scope).
 */
function handleSyncMerge(msg: SyncMergeMessage): void {
  if (!syncEnabled()) return;
  if (!msg.state || typeof msg.state !== 'object' || typeof msg.state.entries !== 'object') return;
  const target = resolveSyncTarget();
  if (!target) return;
  try {
    // Secrets never ride the sync channel unless explicitly opted in — strip
    // any secret-scoped entries from the incoming document before merging.
    const remote =
      resolved.config.sync?.secrets === true
        ? msg.state
        : { ...msg.state, entries: filterSecretScopes(msg.state.entries) };
    const { state, changed } = target.store.mergeSync(target.project, remote);
    if (changed) broadcastSyncStateTo(state);
  } catch {
    /* sync is best-effort; never drop the connection over a bad merge */
  }
}

/** Drop secret-scoped entries from a sync document's entry map. */
function filterSecretScopes<T>(entries: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [scope, entry] of Object.entries(entries)) {
    if (!isSecretScope(scope)) out[scope] = entry;
  }
  return out;
}

/** Broadcast the full replicated document to every client (post-merge convergence). */
function broadcastSyncStateTo(state: { revision: number; entries: unknown }): void {
  const payload = JSON.stringify({ type: 'sync_state', revision: state.revision, entries: state.entries });
  fanout(wss.clients, payload, dropClient);
}

/** Sync summary for `system_status` (revision + devices that lag it). */
function buildSyncStatus(): SystemStatus['sync'] {
  const target = resolveSyncTarget();
  if (!target) return undefined;
  try {
    const state = target.store.getSyncState(target.project);
    if (state.revision === 0 && Object.keys(state.entries).length === 0) return undefined;
    const known = target.store.listDevices(target.project).map(d => d.id);
    return { revision: state.revision, divergent: target.store.divergentDevices(target.project, known) };
  } catch {
    return undefined;
  }
}

function buildSystemStatus(): SystemStatus {
  const receivers: ClientInfo[] = [];
  let uiClients = 0;
  for (const info of clients.values()) {
    if (info.role === 'receiver') receivers.push(info);
    else if (info.role === 'ui') uiClients++;
  }
  const coverage = computeCoverage(
    NUM_CANNONS,
    receivers.map(r => r.hello?.shard ?? null)
  );
  return {
    type: 'system_status',
    server: {
      version: SERVER_VERSION,
      layout: { id: layout.id, name: layout.name, count: NUM_CANNONS },
      mode: RUN_MODE,
      port: PORT,
      host: resolved.config.server.host,
      uptimeMs: Date.now() - startedAt
    },
    receivers,
    uiClients,
    coverage,
    lanVisitors: lanVisitors(),
    sync: buildSyncStatus()
  };
}

wss.on('connection', (ws, req: http.IncomingMessage) => {
  const remote = req.socket.remoteAddress ?? 'unknown';
  const payload = verifiedPayloads.get(req);
  const isUi = payload !== undefined;
  const now = Date.now();
  clients.set(ws, {
    role: isUi ? 'ui' : 'unknown',
    remote,
    connectedAt: now,
    lastSeen: now,
    sid: payload?.sid,
    username: payload?.sub
  });
  liveness.set(ws, { alive: true });
  ws.on('close', () => {
    clients.delete(ws);
    liveness.delete(ws);
  });
  ws.on('error', (error) => dropClient(ws, error));
  ws.on('pong', () => {
    const state = liveness.get(ws);
    if (state) state.alive = true;
  });

  // Send the resolved layout first — the single source of truth for geometry —
  // so UI and receiver render/route from the same fixtures the server uses.
  sendToClient(ws, JSON.stringify({ type: 'layout', layout, runMode: RUN_MODE }));
  // Send initial state + orientation
  const initGrid = remapGridForUi(
    grid.map(c => ({ h: c.h, s: c.s, b: c.b })),
    GRID_COLUMNS, GRID_ROWS, orientation
  );
  sendToClient(ws, JSON.stringify({ type: 'state', grid: initGrid }));
  sendToClient(ws, JSON.stringify({ type: 'orientation', ...orientation }));
  sendToClient(ws, JSON.stringify({ type: 'command', action: 'setOrientation', rotation: orientation.rotation, flipH: orientation.flipH, flipV: orientation.flipV }));
  sendToClient(ws, JSON.stringify({ type: 'command', action: 'setSmoothness', value: currentAlpha }));
  sendToClient(ws, JSON.stringify({ type: 'command', action: 'setAttack', value: currentAttack }));
  sendToClient(ws, JSON.stringify({ type: 'command', action: 'setSpeed', value: animSpeed }));
  sendToClient(ws, JSON.stringify({
    type: 'settings',
    alpha: currentAlpha,
    attack: currentAttack,
    speed: animSpeed,
    animation: currentAnimation
  }));
  if (currentAnimation) {
    sendToClient(ws, JSON.stringify({ type: 'command', action: 'setAnimation', name: currentAnimation, speed: animSpeed }));
  }
  if (activePlaylist) {
    sendToClient(ws, JSON.stringify({ type: 'playlist_state', active: true, playlist: activePlaylist }));
    // Re-send compiled playlist to receiver on reconnect
    const compiled = compilePlaylist(activePlaylist);
    sendToClient(ws, JSON.stringify({ type: 'command', action: 'evalPattern', code: compiled, params: {} }));
  }
  if (shiftVx !== 0 || shiftVy !== 0) {
    sendToClient(ws, JSON.stringify({ type: 'command', action: 'setShift', vx: shiftVx, vy: shiftVy }));
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const info = clients.get(ws);
      if (info) info.lastSeen = Date.now();

      if (msg.type === 'hello' && msg.role === 'receiver' && info) {
        const hello = msg as HelloMessage;
        info.role = 'receiver';
        info.hello = {
          host: hello.host,
          pid: hello.pid,
          version: hello.version,
          layout: hello.layout,
          mode: hello.mode,
          shard: hello.shard ?? null,
          deviceId: hello.deviceId,
          deviceName: hello.deviceName
        };
        // Self-registration: persist the receiver into the project's device
        // registry (keyed by its machine-local device id) with the address it
        // connected from. The socket is already authenticated (receiverKey),
        // and the server only ever serves one project, so a device can't
        // silently register itself against a different project/installation.
        persistRegistration(hello, info.remote);
        return;
      }
      if (msg.type === 'system_status') {
        sendToClient(ws, JSON.stringify(buildSystemStatus()));
        return;
      }
      // Config synchronization (Phase D): the socket is already authenticated
      // (receiverKey or JWT), so an authenticated client may push/pull the
      // replicated project document. The server serializes writes.
      if (msg.type === 'sync_request') {
        sendSyncState(ws, msg as SyncRequestMessage);
        return;
      }
      if (msg.type === 'sync_push') {
        handleSyncPush(msg as SyncPushMessage);
        return;
      }
      if (msg.type === 'sync_ack') {
        handleSyncAck(msg as SyncAckMessage);
        return;
      }
      if (msg.type === 'sync_merge') {
        handleSyncMerge(msg as SyncMergeMessage);
        return;
      }
      handleMessage(msg);
    } catch {
      // ignore malformed messages
    }
  });
});

function handleMessage(msg: any) {
  switch (msg.type) {
  case 'cannon': {
    currentAnimation = null;
    const gi = mapUiToGrid(msg.index, GRID_COLUMNS, GRID_ROWS, orientation);
    setCannonTarget(
      grid,
      gi,
      msg.h ?? undefined,
      msg.s ?? undefined,
      msg.b ?? undefined,
      currentAttack
    );
    broadcastCommand({ action: 'paint', cells: [{ idx: gi, h: msg.h ?? 0, s: msg.s ?? 0, b: msg.b ?? 0 }] });
    scheduleSave();
    break;
  }
  case 'master_brightness':
    setAllTargets(grid, undefined, undefined, msg.value * 100, currentAttack);
    broadcastCommand({ action: 'setBrightness', value: msg.value * 100 });
    scheduleSave();
    break;
  case 'scene':
    if (msg.name && scenes[msg.name]) {
      currentAnimation = null;
      cancelPlaylistIfActive();
      patternEngine.stop();
      applyScene(grid, msg.name, layout);
      broadcastCommand({ action: 'setScene', name: msg.name });
      scheduleSave();
    }
    break;
  case 'animation':
    if (msg.name && animations[msg.name]) {
      currentAnimation = msg.name;
      animationTick = 0;
      cancelPlaylistIfActive();
      patternEngine.stop();
      broadcastCommand({ action: 'setAnimation', name: msg.name, speed: animSpeed });
      scheduleSave();
    } else if (msg.name === 'stop') {
      currentAnimation = null;
      cancelPlaylistIfActive();
      patternEngine.stop();
      broadcastCommand({ action: 'stop' });
      scheduleSave();
    }
    break;
  case 'calibration_mode':
    calibrationMode = !!msg.enabled;
    if (!calibrationMode) previewPhysicalIndex = null;
    broadcastState();
    break;
  case 'physical_preview':
    if (typeof msg.physicalIndex === 'number') {
      calibrationMode = true;
      previewPhysicalIndex = Math.max(0, Math.min(NUM_CANNONS - 1, Math.round(msg.physicalIndex)));
      broadcastState();
    }
    break;
  case 'physical_preview_clear':
    previewPhysicalIndex = null;
    if (calibrationMode) broadcastState();
    break;
  case 'selection':
    if (Array.isArray(msg.indices)) {
      currentAnimation = null;
      cancelPlaylistIfActive();
      patternEngine.stop();
      const cells: Array<{ idx: number; h: number; s: number; b: number }> = [];
      for (const uiIdx of msg.indices) {
        const gi = mapUiToGrid(uiIdx, GRID_COLUMNS, GRID_ROWS, orientation);
        if (gi >= 0 && gi < grid.length) {
          setCannonTarget(
            grid,
            gi,
            msg.h ?? undefined,
            msg.s ?? undefined,
            msg.b ?? undefined,
            currentAttack
          );
          cells.push({ idx: gi, h: msg.h ?? 0, s: msg.s ?? 0, b: msg.b ?? 0 });
        }
      }
      if (cells.length > 0) {
        broadcastCommand({ action: 'paint', cells });
      }
      scheduleSave();
    }
    break;
  case 'audio_layer':
    if (Array.isArray(msg.grid)) {
      // Remap audio layer from UI coordinate space to grid space
      const remapped = new Array<CannonState>(msg.grid.length);
      for (let ui = 0; ui < msg.grid.length; ui++) {
        const gi = mapUiToGrid(ui, GRID_COLUMNS, GRID_ROWS, orientation);
        remapped[gi] = msg.grid[ui];
      }
      audioLayer = remapped;
      audioBlend = msg.blend || 'replace';
      broadcastState();
    }
    break;
  case 'audio_layer_clear':
    audioLayer = null;
    broadcastState();
    break;
  case 'video_layer':
    if (Array.isArray(msg.grid)) {
      const remapped = new Array<CannonState>(msg.grid.length);
      for (let ui = 0; ui < msg.grid.length; ui++) {
        const gi = mapUiToGrid(ui, GRID_COLUMNS, GRID_ROWS, orientation);
        remapped[gi] = msg.grid[ui];
      }
      videoLayer = remapped;
      videoBlend = msg.blend || 'replace';
      broadcastState();
    }
    break;
  case 'video_layer_clear':
    videoLayer = null;
    broadcastState();
    break;
  case 'smoothness':
    if (typeof msg.value === 'number') {
      currentAlpha = msg.value;
      broadcastCommand({ action: 'setSmoothness', value: msg.value });
      scheduleSave();
    }
    break;
  case 'attack':
    if (typeof msg.value === 'number') {
      currentAttack = msg.value;
      broadcastCommand({ action: 'setAttack', value: msg.value });
      scheduleSave();
    }
    break;
  case 'clear':
    currentAnimation = null;
    cancelPlaylistIfActive();
    patternEngine.stop();
    resetGrid(grid);
    broadcastCommand({ action: 'clear' });
    broadcastState();
    scheduleSave();
    break;
  case 'rotate': {
    const delta = msg.direction === 'ccw' ? 270 : 90;
    orientation = {
      ...orientation,
      rotation: ((orientation.rotation + delta) % 360) as Rotation
    };
    broadcastOrientation();
    broadcastCommand({ action: 'setOrientation', rotation: orientation.rotation, flipH: orientation.flipH, flipV: orientation.flipV });
    broadcastState();
    scheduleSave();
    break;
  }
  case 'mirror':
    if (msg.axis === 'vertical') {
      orientation = { ...orientation, flipV: !orientation.flipV };
    } else {
      orientation = { ...orientation, flipH: !orientation.flipH };
    }
    broadcastOrientation();
    broadcastCommand({ action: 'setOrientation', rotation: orientation.rotation, flipH: orientation.flipH, flipV: orientation.flipV });
    broadcastState();
    scheduleSave();
    break;
  case 'shift':
    shiftVx = typeof msg.vx === 'number' ? msg.vx : 0;
    shiftVy = typeof msg.vy === 'number' ? msg.vy : 0;
    if (shiftVx === 0 && shiftVy === 0) {
      shiftAccX = 0;
      shiftAccY = 0;
    }
    broadcastCommand({ action: 'setShift', vx: shiftVx, vy: shiftVy });
    scheduleSave();
    break;
  case 'anim_speed':
    if (typeof msg.value === 'number') {
      animSpeed = Math.max(0.001, Math.min(5.0, msg.value));
      patternEngine.speed = animSpeed;
      broadcastCommand({ action: 'setSpeed', value: animSpeed });
      scheduleSave();
    }
    break;
  case 'evalPattern':
    if (typeof msg.code === 'string') {
      currentAnimation = null;
      cancelPlaylistIfActive();
      patternEngine.load(msg.code);
      broadcastCommand({
        action: 'evalPattern',
        code: msg.code,
        params: msg.params || {}
      });
    }
    break;
  case 'setPatternParam':
    if (typeof msg.name === 'string') {
      broadcastCommand({
        action: 'setPatternParam',
        name: msg.name,
        value: msg.value
      });
    }
    break;
  case 'stopPattern':
    patternEngine.stop();
    broadcastCommand({ action: 'stopPattern' });
    break;
  case 'playlist':
    if (Array.isArray(msg.steps) && msg.steps.length > 0) {
      const playlistDef: PlaylistDef = {
        steps: msg.steps as PlaylistStep[],
        loop: msg.loop !== false,
        transition: msg.transition === 'fade' ? 'fade' : 'cut',
        transitionDuration: typeof msg.transitionDuration === 'number' ? msg.transitionDuration : 2
      };
      activePlaylist = playlistDef;
      playlistCurrentStep = typeof msg.startAt === 'number' ? msg.startAt : 0;
      currentAnimation = null;
      const compiled = compilePlaylist(playlistDef, playlistCurrentStep);
      patternEngine.load(compiled);
      broadcastCommand({ action: 'evalPattern', code: compiled, params: {} });
      broadcastPlaylistState();
      scheduleSave();
    }
    break;
  case 'playlist_stop':
    activePlaylist = null;
    playlistCurrentStep = 0;
    patternEngine.stop();
    broadcastCommand({ action: 'stopPattern' });
    broadcastPlaylistState();
    scheduleSave();
    break;
  case 'playlist_skip':
    if (activePlaylist) {
      const stepCount = activePlaylist.steps.length;
      const direction = msg.direction === 'back' ? -1 : 1;
      playlistCurrentStep = ((playlistCurrentStep + direction) % stepCount + stepCount) % stepCount;
      const recompiled = compilePlaylist(activePlaylist, playlistCurrentStep);
      patternEngine.load(recompiled);
      broadcastCommand({ action: 'evalPattern', code: recompiled, params: {} });
      broadcastPlaylistState();
      scheduleSave();
    }
    break;
  case 'playlist_get':
    // Respond with current playlist state (handled per-client below)
    break;
  }
}

// Animation loop: tick the local grid interpolation (for UI preview)
// and send periodic keepalive commands so receivers don't fallback.
const COMMAND_KEEPALIVE_FRAMES = 120; // ~2 seconds at 60fps
let framesSinceLastCommand = 0;

const tickTimer = setInterval(() => {
  if (!calibrationMode && currentAnimation && animations[currentAnimation]) {
    animations[currentAnimation](grid, animationTick, currentAttack, layout);
    animationTick += animSpeed;
  } else if (!calibrationMode && patternEngine.active) {
    // Render evalPattern locally for UI preview — write to targets so tickGrid lerps smoothly
    const previewGrid = grid.map(c => ({ h: c.targetH, s: c.targetS, b: c.targetB }));
    if (patternEngine.render(previewGrid)) {
      for (let i = 0; i < previewGrid.length && i < grid.length; i++) {
        grid[i].targetH = previewGrid[i].h;
        grid[i].targetS = previewGrid[i].s;
        grid[i].targetB = previewGrid[i].b;
      }
    }
  }
  if (shiftVx !== 0 || shiftVy !== 0) {
    shiftAccX += shiftVx / 60;
    shiftAccY += shiftVy / 60;
    const stepsX = Math.trunc(shiftAccX);
    const stepsY = Math.trunc(shiftAccY);
    if (stepsX !== 0 || stepsY !== 0) {
      shiftGrid(grid, GRID_COLUMNS, GRID_ROWS, stepsX, stepsY);
      shiftAccX -= stepsX;
      shiftAccY -= stepsY;
    }
  }
  tickGrid(grid, currentAlpha);

  // When audio/video layers are active, composite them with the base grid and
  // send paint commands to receivers so the lasers reflect the visuals.
  if (audioLayer || videoLayer) {
    let base = grid.map(c => ({ h: c.h, s: c.s, b: c.b }));
    if (audioLayer) base = compositeLayer(base, audioLayer, audioBlend);
    if (videoLayer) base = compositeLayer(base, videoLayer, videoBlend);
    const cells = base.map((c, i) => ({ idx: i, h: c.h, s: c.s, b: c.b }));
    broadcastCommand({ action: 'paint', cells });
    framesSinceLastCommand = 0;
  }

  // Send grid state to UI clients so the preview stays in sync
  broadcastState();

  // Periodic keepalive so receivers don't enter fallback
  framesSinceLastCommand++;
  if (framesSinceLastCommand >= COMMAND_KEEPALIVE_FRAMES) {
    broadcastCommand({ action: 'keepalive' });
    framesSinceLastCommand = 0;
  }
}, TICK_MS);

const heartbeatMs = Number(process.env.WG_HEARTBEAT_MS);
const heartbeatIntervalMs = Number.isFinite(heartbeatMs) && heartbeatMs > 0 ? heartbeatMs : 15_000;
const heartbeatTimer = setInterval(() => {
  sweepLiveness(
    liveness,
    dropClient,
    dropClient
  );

  disconnectRevokedSessions();
}, heartbeatIntervalMs);

let advertiseHandle: AdvertiseHandle | null = null;

const ready = new Promise<void>((resolveReady, rejectReady) => {
  server.once('listening', () => resolveReady());
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      rejectReady(
        new Error(
          `Port ${PORT} is already in use — another Wavegrid (or app) is on it. Stop it, or change the project's server port.`
        )
      );
      return;
    }
    rejectReady(err);
  });
});

server.listen(PORT, resolved.config.server.host, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Wavegrid Server                         ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Layout: ${layout.name} (${layout.topology}, ${NUM_CANNONS} cannons)`);
  console.log(`  → Run mode: ${RUN_MODE}`);
  console.log('  → Mode: command relay');
  // Announce over mDNS so `wavegrid receiver` can find us without an IP. Best
  // effort: silently a no-op where multicast is blocked. Never bypasses auth.
  if (opts.advertise) {
    advertiseHandle = advertise({ port: PORT, ...opts.advertise });
    console.log(`  → Discoverable: _wavegrid._tcp (project "${opts.advertise.project}")`);
  }
  console.log('');
});

const stop = () => {
  clearInterval(tickTimer);
  clearInterval(heartbeatTimer);
  if (saveTimer) clearTimeout(saveTimer);
  if (advertiseHandle) advertiseHandle.stop();
  wss.close();
  server.close();
};

const send = (cmd: Record<string, unknown>) => {
  handleMessage(cmd);
};

return { server, grid, ready, stop, send };
}

// Run directly (dev script / node bin). The CLI imports startServer instead.
if (typeof require !== 'undefined' && require.main === module) {
  startServer();
}
