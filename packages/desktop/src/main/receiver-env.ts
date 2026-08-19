/**
 * The env the in-process receiver reads, derived from the selected project.
 *
 * `startReceiver` takes its OSC target from `process.env` alone — the resolved
 * config it is handed is only geometry — so an embedding host that skips this
 * gets a receiver with no output: paint reaches the brain over the WebSocket,
 * the show looks healthy, and nothing reaches BEYOND. `wavegrid start` projects
 * config into env before starting its receiver; this is the desktop's copy of
 * that step, sharing the projection in @wavegrid/layout so the two can't drift.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  generateDeviceRouting,
  loadWavegridConfig,
  resetConfigEnv,
  type ResolvedConfig,
  RoutingValidationError
} from '@wavegrid/layout';
import type { SettingsStore } from '@wavegrid/settings';

/**
 * The env this process was launched with. Anything here is an explicit operator
 * override and outranks project config, exactly as in the CLI; every other
 * config-derived key is ours to rewrite on each project start.
 */
const ambientEnv: NodeJS.ProcessEnv = { ...process.env };

/**
 * The selected project's config, as the appstash holds it. Resolved against the
 * *ambient* env, never the live one: `applyReceiverEnv` writes a project's
 * target into `process.env`, and env outranks the project layer in the loader —
 * so reading the live env would resolve project B's show against project A's
 * lasers. One store, one project, everywhere.
 */
export function resolveProjectConfig(): ResolvedConfig {
  return loadWavegridConfig({ env: ambientEnv });
}

export function applyReceiverEnv(
  store: SettingsStore,
  project: string,
  resolved: ResolvedConfig
): void {
  if (!process.env.WG_RECEIVER_KEY) {
    process.env.WG_RECEIVER_KEY = store.requireSecret(project, 'receiverKey');
  }
  resetConfigEnv(resolved.config, ambientEnv);
  process.env.WG_STATE_DIR = store.stateDir(project);
  process.env.RECEIVER_LOG = join(store.logsDir(project), 'receiver.log');
  const device = store.getDevice();
  process.env.WG_DEVICE_ID = device.id;
  process.env.WG_DEVICE_NAME = device.name;
  if (resolved.runMode === 'distributed') applyAssignedShard(store, project, device.id);
  applyGeneratedRouting(store, project, resolved, device.name);
}

/** This laptop's operator-assigned shard, unless the env already pinned one. */
function applyAssignedShard(store: SettingsStore, project: string, deviceId: string): void {
  if (ambientEnv.SHARD_START !== undefined) return;
  const record = store.getDeviceRecord(project, deviceId);
  if (record?.shard) {
    process.env.SHARD_START = String(record.shard.start);
    process.env.SHARD_END = String(record.shard.end);
  }
}

/**
 * Turn the project's unified routing spec into this laptop's routing file and
 * point the receiver at it — the same derived state `wavegrid start` writes, so
 * a multi-target project drives its lasers from the desktop app too. A config or
 * ambient `ROUTING_CONFIG` wins: that is the hand-written escape hatch.
 */
function applyGeneratedRouting(
  store: SettingsStore,
  project: string,
  resolved: ResolvedConfig,
  deviceName: string
): string | null {
  const spec = resolved.config.osc.routing;
  if (!spec || process.env.ROUTING_CONFIG) return null;

  const start = process.env.SHARD_START;
  const end = process.env.SHARD_END;
  const shard =
    start !== undefined && end !== undefined
      ? { start: parseInt(start, 10), end: parseInt(end, 10) }
      : undefined;
  try {
    const { devices } = generateDeviceRouting(
      spec,
      [{ name: deviceName, ...(shard ? { shard } : {}) }],
      resolved.layout.count
    );
    const dir = join(store.stateDir(project), 'routing');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'this-device.json');
    writeFileSync(file, `${JSON.stringify(devices[0], null, 2)}\n`);
    process.env.ROUTING_CONFIG = file;
    return file;
  } catch (err) {
    // Emitting routing we know is wrong would light the wrong lasers, which is
    // worse than no OSC output — refuse, and let the caller report it.
    const problems =
      err instanceof RoutingValidationError ? err.problems : [(err as Error).message];
    throw new Error(
      `Routing spec for ${project} is invalid — OSC output disabled: ${problems.join('; ')}`
    );
  }
}
