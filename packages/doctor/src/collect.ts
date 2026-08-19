/**
 * Collect every diagnostic as data. `wavegrid doctor` renders this to a
 * terminal and the desktop app renders the same snapshot as a live status
 * screen — one implementation, so the two can never disagree about health.
 */
import type { ResolvedConfig } from '@wavegrid/layout';
import type { SystemStatus } from '@wavegrid/server';
import {
  type DeviceRecord,
  type DivergentDevice,
  projectSecretsFile,
  type SettingsStore
} from '@wavegrid/settings';
import { accessSync, constants, existsSync, readFileSync, statSync } from 'fs';
import { dirname } from 'path';
import { URL } from 'url';

import { type BeyondSettings, checkBeyond, findBeyondIni, readBeyondSettings } from './beyond';
import {
  type Check,
  checkEnvHijack,
  checkOsc,
  checkShard,
  type CheckStatus,
  isSecureMode,
  oscEndpoint,
  overallStatus
} from './checks';
import { type ProbeError, querySystemStatus, tcpProbe, udpProbe, type UdpState } from './probe';

const NODE_MIN_MAJOR = 18;

/** Why the server view is missing, when it is. */
export type ServerError = ProbeError | 'not-running';

export interface Diagnostics {
  project: string;
  checks: Check[];
  overall: CheckStatus;
  /** Devices registered with the project, online or not. */
  devices: DeviceRecord[];
  sync: {
    /** False when the operator turned replication off for this project. */
    enabled: boolean;
    revision: number;
    /** Number of replicated config entries this laptop holds. */
    entryCount: number;
    divergent: DivergentDevice[];
    /** True when the revision/divergence came from the running brain rather
     *  than this laptop's local state. */
    fromServer: boolean;
  };
  /** The URL probed for a live server view. */
  serverUrl: string;
  /** The brain's own report, or null when it could not be read. */
  server: SystemStatus | null;
  serverError?: ServerError;
}

/**
 * Whether `dir` is (or can be) writable. Store subdirs are created lazily at
 * `start`, so a missing dir is fine as long as its nearest existing ancestor
 * is writable — otherwise a fresh project would spuriously fail the check.
 */
export function dirWritable(dir: string): boolean {
  let target = dir;
  while (!existsSync(target)) {
    const parent = dirname(target);
    if (parent === target) return false;
    target = parent;
  }
  try {
    accessSync(target, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export interface LocalChecksInput {
  store: SettingsStore;
  project: string;
  resolved: ResolvedConfig;
  env?: NodeJS.ProcessEnv;
  /** Result of probing the configured OSC target, when one was probed. */
  oscProbe?: UdpState;
}

/**
 * BEYOND's own settings, when it is installed on this machine. Unreadable or
 * absent means "no BEYOND here", which is the normal case off the show PC.
 */
function beyondSettings(env: NodeJS.ProcessEnv): BeyondSettings | null {
  const path = findBeyondIni(env, existsSync);
  if (!path) return null;
  try {
    return readBeyondSettings(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The this-laptop checks for an already-resolved project. Callers own project
 * resolution, because "which project" is answered differently by the CLI
 * (flags/env/active) and the desktop app (the selected one).
 */
export function localChecks({ store, project, resolved, env = process.env, oscProbe }: LocalChecksInput): Check[] {
  const checks: Check[] = [];
  const { config, layout, runMode } = resolved;

  const major = parseInt(process.versions.node.split('.')[0], 10);
  checks.push(
    major >= NODE_MIN_MAJOR
      ? { name: 'Node', status: 'pass', detail: `v${process.versions.node}` }
      : { name: 'Node', status: 'warn', detail: `v${process.versions.node} < ${NODE_MIN_MAJOR}`, remedy: `install Node ${NODE_MIN_MAJOR}+` }
  );

  checks.push(
    dirWritable(store.paths.root)
      ? { name: 'Store', status: 'pass', detail: store.paths.root }
      : { name: 'Store', status: 'fail', detail: `not writable: ${store.paths.root}`, remedy: 'check permissions or APPSTASH_BASE_DIR' }
  );

  const device = store.getDevice();
  checks.push({ name: 'Device', status: 'pass', detail: `${device.name} (${device.id.slice(0, 8)}…)` });
  checks.push({ name: 'Project', status: 'pass', detail: project });
  checks.push({ name: 'Layout', status: 'pass', detail: `${layout.name} (${layout.topology}, ${layout.count} cannons) · ${runMode}` });
  checks.push(checkShard(layout.count, config.receiver.shard));

  for (const secret of store.requiredSecrets(project)) {
    if (!secret.set) {
      checks.push({ name: `Secret ${secret.name}`, status: 'fail', detail: 'NOT SET', remedy: 'wavegrid secrets init' });
      continue;
    }
    let modeOk = true;
    try {
      modeOk = isSecureMode(statSync(projectSecretsFile(store.paths, project)).mode);
    } catch { /* file existence already implied by secret.set */ }
    checks.push(
      modeOk
        ? { name: `Secret ${secret.name}`, status: 'pass', detail: 'set (0600)' }
        : {
          name: `Secret ${secret.name}`,
          status: 'warn',
          detail: 'set but file is group/other-readable',
          remedy: `chmod 600 ${projectSecretsFile(store.paths, project)}`
        }
    );
  }

  const users = store.listUsers(project);
  checks.push(
    users.length > 0
      ? { name: 'Users', status: 'pass', detail: `${users.length} UI login(s)` }
      : { name: 'Users', status: 'warn', detail: 'no UI users — login returns 503', remedy: 'wavegrid users add <name>' }
  );

  for (const [label, dir] of [['State dir', store.stateDir(project)], ['Logs dir', store.logsDir(project)]] as const) {
    checks.push(
      dirWritable(dir)
        ? { name: label, status: 'pass', detail: dir }
        : { name: label, status: 'warn', detail: `not writable: ${dir}`, remedy: 'check store permissions' }
    );
  }

  checks.push(checkOsc(config, oscProbe));
  const beyond = beyondSettings(env);
  if (beyond) checks.push(...checkBeyond(beyond, config.osc.beyond?.port));
  checks.push(checkEnvHijack(env));
  return checks;
}

export interface CollectInput extends LocalChecksInput {
  /** Override the probed brain URL (defaults to the project's server port). */
  serverUrl?: string;
  timeoutMs?: number;
  /** Budget for the OSC liveness probe. Kept short: the target is often a
   *  remote show PC, and a diagnostic must never hang on it. */
  oscTimeoutMs?: number;
}

/** Run the local checks, then read the brain's own view if it is reachable. */
export async function collectDiagnostics(input: CollectInput): Promise<Diagnostics> {
  const { store, project, resolved, serverUrl, timeoutMs, oscTimeoutMs } = input;

  const endpoint = oscEndpoint(resolved.config);
  const oscProbe =
    input.oscProbe ??
    (endpoint ? await udpProbe(endpoint.host, endpoint.port, oscTimeoutMs) : undefined);
  const checks = localChecks({ ...input, oscProbe });

  const url = serverUrl ?? `ws://localhost:${resolved.config.server.port}`;
  const parsed = new URL(url);
  const port = parseInt(parsed.port || '3000', 10);
  const portState = await tcpProbe(parsed.hostname, port, timeoutMs);

  const key = store.hasSecret(project, 'receiverKey') ? store.requireSecret(project, 'receiverKey') : '';
  const probe = portState === 'open' ? await querySystemStatus(url, key, timeoutMs) : undefined;

  const local = store.getSyncState(project);
  const known = store.listDevices(project);
  const serverSync = probe?.status?.sync;

  return {
    project,
    checks,
    overall: overallStatus(checks),
    devices: known,
    sync: {
      enabled: store.getProjectConfig(project)?.sync?.enabled !== false,
      revision: serverSync?.revision ?? local.revision,
      entryCount: Object.keys(local.entries).length,
      divergent: serverSync?.divergent ?? store.divergentDevices(project, known.map((d) => d.id)),
      fromServer: serverSync != null
    },
    serverUrl: url,
    server: probe?.status ?? null,
    serverError: portState === 'closed' ? 'not-running' : probe?.error
  };
}
