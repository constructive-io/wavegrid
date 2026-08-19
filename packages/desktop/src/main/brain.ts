/**
 * The one brain, owned by the Electron main process. This is the desktop
 * equivalent of `wavegrid start`: it reuses @wavegrid/settings (the appstash
 * store) and @wavegrid/server / @wavegrid/receiver in-process, so Desktop and
 * the CLI drive the exact same store and runtime — no second server, no
 * duplicated business logic.
 */
import { createRequire } from 'node:module';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

import type { ResolvedConfig } from '@wavegrid/layout';
import type { ReceiverHandle } from '@wavegrid/receiver';
import type { ServerHandle } from '@wavegrid/server';
import { openStore, type SettingsStore } from '@wavegrid/settings';

import { applyReceiverEnv, resolveProjectConfig } from '@/main/receiver-env';
import { runtime, sendToRenderer } from '@/main/runtime';
import type { BrainStatus } from '@/types/ipc';

const require = createRequire(import.meta.url);

interface RunningBrain {
  project: string;
  url: string;
  runMode: BrainStatus['runMode'];
  server: ServerHandle;
  receiver: ReceiverHandle | null;
  /** Why the output stage isn't running, when the brain came up without it. */
  receiverError: string | null;
}

let current: RunningBrain | null = null;

/** Why the last start attempt failed — kept so the UI can explain a red brain. */
let lastError: string | null = null;

/** IPv4 LAN addresses — the URLs operators point iPads / receivers at. */
function lanAddresses(): string[] {
  const out: string[] = [];
  const ifaces = networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const net of entries ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

/** Locate the built @wavegrid/ui `dist/` so the brain serves the real laser UI. */
function resolveUiDir(): string | undefined {
  if (process.env.WG_UI_DIR) return process.env.WG_UI_DIR;
  try {
    return join(require.resolve('@wavegrid/ui/package.json'), '..', 'dist');
  } catch {
    return undefined;
  }
}

/**
 * Wire the env the in-process server reads (mirrors the CLI's `applyServerEnv`).
 * The store is authoritative for the JWT secret — a stale ambient value would
 * desync UI/server and 401 the WebSocket upgrade.
 */
function applyServerEnv(store: SettingsStore, project: string): void {
  store.generateSecrets(project); // idempotent: fills any missing secrets
  process.env.WG_JWT_SECRET = store.requireSecret(project, 'jwtSecret');
  if (!process.env.WG_RECEIVER_KEY) process.env.WG_RECEIVER_KEY = store.requireSecret(project, 'receiverKey');
  process.env.WG_STATE_DIR = store.stateDir(project);
  const uiDir = resolveUiDir();
  if (uiDir) process.env.WG_UI_DIR = uiDir;
}

export function status(): BrainStatus {
  const s: BrainStatus = current
    ? {
      running: true,
      url: current.url,
      project: current.project,
      runMode: current.runMode,
      receiverRunning: current.receiver != null,
      lanUrls: lanAddresses().map((ip) => `http://${ip}:${new URL(current!.url).port}`),
      receiverError: current.receiverError,
      receiverOutputs: current.receiver?.outputs ?? [],
      lastError: null
    }
    : {
      running: false,
      url: null,
      project: null,
      runMode: null,
      receiverRunning: false,
      lanUrls: [],
      receiverError: null,
      receiverOutputs: [],
      lastError
    };
  runtime.lastStatus = s;
  return s;
}

function broadcast(): BrainStatus {
  const s = status();
  sendToRenderer('brain:status', s);
  return s;
}

export async function startBrain(project: string): Promise<BrainStatus> {
  if (current) await stopBrain();
  lastError = null;
  try {
    return await start(project);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    broadcast();
    throw err;
  }
}

async function start(project: string): Promise<BrainStatus> {
  const store = openStore();
  if (!store.hasProject(project)) throw new Error(`Unknown project: ${project}`);
  if (store.getActiveProject() !== project) store.setActiveProject(project);

  const resolved: ResolvedConfig = resolveProjectConfig();
  applyServerEnv(store, project);

  const { startServer } = await import('@wavegrid/server');
  const server = startServer(resolved);
  // Wait for the actual bind: a port clash surfaces here rather than leaving
  // the UI reporting a running show with nothing listening.
  try {
    await server.ready;
  } catch (err) {
    server.stop();
    throw err;
  }

  let receiver: ReceiverHandle | null = null;
  let receiverError: string | null = null;
  try {
    applyReceiverEnv(store, project, resolved);
    const { startReceiver } = await import('@wavegrid/receiver');
    receiver = startReceiver(resolved);
  } catch (err) {
    // A receiver failure (no OSC target, network) must not take down the show:
    // the brain + laser UI still run console-only. Reported, not just logged —
    // otherwise the show looks healthy while nothing reaches the lasers.
    receiverError = err instanceof Error ? err.message : String(err);
    console.error('[brain] receiver failed to start:', err);
  }

  const port = resolved.config.server.port;
  current = {
    project,
    url: `http://127.0.0.1:${port}`,
    runMode: resolved.runMode,
    server,
    receiver,
    receiverError
  };
  return broadcast();
}

/** What the running server bound to, or null when the brain is down. Network
 *  diagnostics need the bind host, which the status object deliberately hides
 *  (it reports the loopback URL the embedded UI loads). */
export function runningBind(): { host: string; port: number } | null {
  if (!current) return null;
  return {
    host: resolveProjectConfig().config.server.host,
    port: Number(new URL(current.url).port)
  };
}

/** Whether this machine's in-process receiver is driving `project` right now. */
export function receiverRunning(project: string): boolean {
  return current?.project === project && current.receiver != null;
}

/**
 * Start this machine's receiver against the already-running brain. Separate
 * from `startBrain` so an operator can restart just the output stage — the
 * receiver reads its OSC target, shard, and light map at startup, so a config
 * change only takes effect on a restart, and the show's server/UI keep running.
 */
export async function startLocalReceiver(): Promise<BrainStatus> {
  if (!current) throw new Error('Start the brain first — the receiver dials into it.');
  if (current.receiver) return status();

  const store = openStore();
  const { startReceiver } = await import('@wavegrid/receiver');
  try {
    const resolved = resolveProjectConfig();
    applyReceiverEnv(store, current.project, resolved);
    current.receiver = startReceiver(resolved);
    current.receiverError = null;
  } catch (err) {
    current.receiverError = err instanceof Error ? err.message : String(err);
    broadcast();
    throw err;
  }
  return broadcast();
}

/** Stop this machine's receiver, leaving the brain (server + laser UI) up. */
export function stopLocalReceiver(): BrainStatus {
  if (current?.receiver) {
    current.receiver.stop();
    current.receiver = null;
  }
  return broadcast();
}

/**
 * Inject a command into the running brain for `project`, in-process. Returns
 * false (a no-op) unless that exact project's brain is currently driving the
 * show — so a light-map identify can never light the wrong project's rig.
 */
export function sendToBrain(project: string, cmd: Record<string, unknown>): boolean {
  if (!current || current.project !== project) return false;
  current.server.send(cmd);
  return true;
}

export async function stopBrain(): Promise<BrainStatus> {
  if (current) {
    try {
      current.receiver?.stop();
    } catch (err) {
      console.error('[brain] receiver stop failed:', err);
    }
    try {
      current.server.stop();
    } catch (err) {
      console.error('[brain] server stop failed:', err);
    }
    current = null;
  }
  return broadcast();
}
