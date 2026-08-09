/**
 * Shared runtime wiring for the processes that actually run an installation:
 * `start` (fused server+receiver), `server` (brain only), `receiver` (only).
 * Keeps the store→env plumbing in one place so the three entry points stay in
 * lockstep on secrets, paths, and UI asset resolution.
 */
import { generateDeviceRouting, type ResolvedConfig, RoutingValidationError, type ShardConfig } from '@wavegrid/layout';
import { type SettingsStore } from '@wavegrid/settings';
import { mkdirSync, writeFileSync } from 'fs';
import { networkInterfaces } from 'os';
import { join } from 'path';
import c from 'yanse';

import { applyConfigToEnv } from './env';

/** Locate the built UI (Vite `dist`) so the server can serve it on its port. */
export function resolveUiDir(): string | undefined {
  if (process.env.WG_UI_DIR) return process.env.WG_UI_DIR;
  try {
    return join(require.resolve('@wavegrid/ui/package.json'), '..', 'dist');
  } catch {
    return undefined;
  }
}

/**
 * Wire the env the in-process server reads. The store is authoritative for the
 * JWT secret (a stale ambient value would desync UI/server and 401 the WS
 * upgrade — the red status-dot bug); the receiver key may be operator-set so it
 * can be shared across laptops.
 */
export function applyServerEnv(store: SettingsStore, project: string, resolved: ResolvedConfig): void {
  if (!process.env.WG_RECEIVER_KEY) process.env.WG_RECEIVER_KEY = store.requireSecret(project, 'receiverKey');
  process.env.WG_JWT_SECRET = store.requireSecret(project, 'jwtSecret');
  applyConfigToEnv(resolved.config);
  if (!process.env.WG_STATE_DIR) process.env.WG_STATE_DIR = store.stateDir(project);
  const uiDir = resolveUiDir();
  if (uiDir && !process.env.WG_UI_DIR) process.env.WG_UI_DIR = uiDir;
}

/** Wire the env the in-process receiver reads (upstream URL, key, shard, log). */
export function applyReceiverEnv(store: SettingsStore, project: string, resolved: ResolvedConfig): void {
  if (!process.env.WG_RECEIVER_KEY) process.env.WG_RECEIVER_KEY = store.requireSecret(project, 'receiverKey');
  applyConfigToEnv(resolved.config);
  if (!process.env.WG_STATE_DIR) process.env.WG_STATE_DIR = store.stateDir(project);
  if (!process.env.RECEIVER_LOG) process.env.RECEIVER_LOG = join(store.logsDir(project), 'receiver.log');
  // Machine-local device identity so the server can enumerate laptops by a
  // stable id + friendly name (self-registration).
  const device = store.getDevice();
  if (!process.env.WG_DEVICE_ID) process.env.WG_DEVICE_ID = device.id;
  if (!process.env.WG_DEVICE_NAME) process.env.WG_DEVICE_NAME = device.name;
  // Distributed mode: pick up this laptop's operator-assigned shard from the
  // project registry when no explicit `--shard` was given.
  if (resolved.runMode === 'distributed') applyAssignedShard(store, project, device.id);
  applyGeneratedRouting(store, project, resolved, device.name);
}

/** The shard this receiver will run with, per the env applied so far. */
function envShard(): ShardConfig | undefined {
  const start = process.env.SHARD_START;
  const end = process.env.SHARD_END;
  if (start === undefined || end === undefined) return undefined;
  return { start: parseInt(start, 10), end: parseInt(end, 10) };
}

/**
 * Turn the project's unified routing spec into THIS laptop's routing file and
 * point the receiver at it. The generated file is derived state in the state
 * dir — the spec is the only thing anyone edits, and no config is ever copied
 * between machines. A pre-set `ROUTING_CONFIG` (or `osc.routingConfig`) wins,
 * so the hand-written escape hatch still works.
 */
export function applyGeneratedRouting(
  store: SettingsStore,
  project: string,
  resolved: ResolvedConfig,
  deviceName: string
): void {
  const spec = resolved.config.osc.routing;
  if (!spec) return;
  if (process.env.ROUTING_CONFIG) return;

  const shard = envShard();
  try {
    const { devices, warnings } = generateDeviceRouting(
      spec,
      [{ name: deviceName, ...(shard ? { shard } : {}) }],
      resolved.layout.count
    );
    const dir = join(store.stateDir(project), 'routing');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'this-device.json');
    writeFileSync(file, `${JSON.stringify(devices[0], null, 2)}\n`);
    process.env.ROUTING_CONFIG = file;
    for (const warning of warnings) console.log(c.yellow(`  ⚠ ${warning}`));
  } catch (e) {
    // Emitting a config we know is wrong would light the wrong lasers, which is
    // worse than no OSC output at all — so refuse, loudly.
    const problems = e instanceof RoutingValidationError ? e.problems : [(e as Error).message];
    console.log('');
    console.log(c.red(`  ✗ Routing spec for ${project} is invalid — OSC output disabled:`));
    for (const problem of problems) console.log(c.red(`    - ${problem}`));
    console.log(c.gray('    Fix it with `wavegrid projects routing show`.'));
    console.log('');
  }
}

/**
 * Wait for the brain to actually bind its port, and fail with the bind error
 * rather than a stack trace from an unhandled `error` event. Without this a
 * clashing port left the CLI printing "brain up" while nothing listened.
 */
export async function awaitBind(handle: { ready: Promise<void>; stop: () => void }): Promise<void> {
  try {
    await handle.ready;
  } catch (e) {
    handle.stop();
    console.log('');
    console.log(c.red(`  ✗ ${e instanceof Error ? e.message : String(e)}`));
    console.log('');
    throw e;
  }
}

/** IPv4 LAN addresses of this machine — the URLs operators point iPads/receivers at. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

/** Print the reachable URLs for a running brain on `port` (server side of discovery). */
export function printLanUrls(port: number): void {
  const addrs = lanAddresses();
  console.log('');
  console.log(`  ${c.bold('Reachable at')}`);
  console.log(`  → ${c.cyan(`http://localhost:${port}`)}  ${c.gray('(this machine)')}`);
  for (const ip of addrs) {
    console.log(`  → ${c.cyan(`http://${ip}:${port}`)}  ${c.gray('(LAN — open the UI / point receivers here)')}`);
  }
  if (addrs.length === 0) {
    console.log(`  ${c.yellow('No LAN address detected — check Wi-Fi/Ethernet.')}`);
  }
  console.log('');
}

/**
 * Parse a shard string into a range. `all`/`none`/empty clear the shard
 * (→ null, drives all cannons); `start-end` or a bare `start` give a range;
 * anything else is malformed (→ 'invalid').
 */
export function parseShardRange(raw: string): { start: number; end: number } | null | 'invalid' {
  const s = raw.trim().toLowerCase();
  if (s === '' || s === 'all' || s === 'none') return null;
  const m = /^(\d+)(?:-(\d+))?$/.exec(s);
  if (!m) return 'invalid';
  const start = parseInt(m[1], 10);
  const end = m[2] !== undefined ? parseInt(m[2], 10) : start;
  if (end < start) return 'invalid';
  return { start, end };
}

/**
 * Parse a `--shard 0-24` flag into SHARD_START/SHARD_END env vars the receiver
 * reads. Accepts `start-end` or a bare `start` (single cannon). Returns false
 * on a malformed value.
 */
export function applyShardFlag(shard: unknown): boolean {
  if (shard === undefined) return true;
  const parsed = parseShardRange(String(shard));
  if (parsed === 'invalid') return false;
  if (parsed === null) return true; // `--shard all` → no restriction
  process.env.SHARD_START = String(parsed.start);
  process.env.SHARD_END = String(parsed.end);
  return true;
}

/**
 * Apply this machine's operator-assigned shard (from `wavegrid devices assign`,
 * stored in the project registry) to the receiver env — unless an explicit
 * `--shard` already set it. Lets a laptop pick up its slice with a bare
 * `wavegrid receiver`, no flag needed.
 */
export function applyAssignedShard(store: SettingsStore, project: string, deviceId: string): void {
  if (process.env.SHARD_START !== undefined) return; // explicit --shard / env wins
  const record = store.getDeviceRecord(project, deviceId);
  if (record?.shard) {
    process.env.SHARD_START = String(record.shard.start);
    process.env.SHARD_END = String(record.shard.end);
  }
}
