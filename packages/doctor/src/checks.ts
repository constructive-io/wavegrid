/**
 * Pure diagnostic helpers for `wavegrid doctor`. Kept free of I/O so the check
 * logic is unit-testable; the command module wires these to the store, config,
 * filesystem, and a live server.
 */

import type { WavegridConfig } from '@wavegrid/layout';

import type { UdpState } from './probe';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  /** Exact command/action to fix a warn/fail. */
  remedy?: string;
}

/**
 * Generic env vars that used to hijack the server config (`PORT` bound the
 * server to a stray :5000). They are no longer honored — only `WAVEGRID_*` is —
 * so if one is set we flag it as an ignored footgun the operator should clear.
 */
export const IGNORED_ENV_VARS = ['PORT', 'SIM_PORT', 'HOST', 'UI_PORT'] as const;

export function checkEnvHijack(env: NodeJS.ProcessEnv): Check {
  const present = IGNORED_ENV_VARS.filter(k => env[k] != null && env[k] !== '');
  if (present.length === 0) {
    return { name: 'Ambient env', status: 'pass', detail: 'no conflicting generic env vars set' };
  }
  const list = present.map(k => `${k}=${env[k]}`).join(', ');
  return {
    name: 'Ambient env',
    status: 'warn',
    detail: `generic env var(s) set but IGNORED by config: ${list}`,
    remedy: `unset ${present.join(' ')}   # use WAVEGRID_PORT / WAVEGRID_HOST / WAVEGRID_UI_PORT instead`
  };
}

/** Validate a receiver shard range against the layout's cannon count. */
export function checkShard(count: number, shard: { start: number; end: number } | undefined): Check {
  if (!shard) {
    return { name: 'Shard', status: 'pass', detail: 'no shard (drives all cannons)' };
  }
  const problems: string[] = [];
  if (shard.start < 0) problems.push(`start ${shard.start} < 0`);
  if (shard.end >= count) problems.push(`end ${shard.end} ≥ count ${count}`);
  if (shard.start > shard.end) problems.push(`start ${shard.start} > end ${shard.end}`);
  if (problems.length > 0) {
    return {
      name: 'Shard',
      status: 'fail',
      detail: `invalid shard: ${problems.join(', ')}`,
      remedy: `fix receiver.shard to a range within 0–${count - 1}`
    };
  }
  return {
    name: 'Shard',
    status: 'pass',
    detail: `cannons ${shard.start}–${shard.end} of ${count}`
  };
}

/** A file mode is acceptable for a secret only when group/other bits are clear. */
export function isSecureMode(mode: number): boolean {
  return (mode & 0o077) === 0;
}

/** The single OSC endpoint a probe can be aimed at, when there is one. */
export interface OscEndpoint {
  kind: 'BEYOND' | 'FB4';
  host: string;
  port: number;
}

/**
 * The endpoint to probe. A routing file can name many targets, so it is left to
 * `wavegrid signals` rather than guessed at here.
 */
export function oscEndpoint(config: WavegridConfig): OscEndpoint | null {
  if (config.osc.beyond) {
    return { kind: 'BEYOND', host: config.osc.beyond.host, port: config.osc.beyond.port };
  }
  if (config.osc.fb4) {
    return { kind: 'FB4', host: config.osc.fb4.host, port: config.osc.fb4.port };
  }
  return null;
}

/**
 * Report the OSC output target *and whether anything is listening on it*.
 *
 * `probe` comes from `udpProbe`. Without it this only says what is configured,
 * which is how a wrong port stayed green through a whole show: OSC is UDP, so
 * every frame aimed at an unbound port is dropped in silence.
 */
export function checkOsc(config: WavegridConfig, probe?: UdpState): Check {
  const endpoint = oscEndpoint(config);
  if (endpoint) {
    const where = `${endpoint.kind} → ${endpoint.host}:${endpoint.port}`;
    if (probe === 'refused') {
      return {
        name: 'OSC target',
        status: 'fail',
        detail: `${where} — nothing listening (port unreachable)`,
        remedy:
          endpoint.kind === 'BEYOND'
            ? `enable BEYOND's OSC server and match its receive port ([OSC] port in BEYOND.ini), then \`wavegrid projects osc beyond --host ${endpoint.host} --port <that port>\``
            : `check the FB4's OSC port, then \`wavegrid projects osc fb4 --host ${endpoint.host} --port <that port>\``
      };
    }
    if (probe === 'unreachable') {
      return {
        name: 'OSC target',
        status: 'warn',
        detail: `${where} — host unreachable`,
        remedy: `check the network route to ${endpoint.host} (\`ping ${endpoint.host}\`)`
      };
    }
    if (probe === 'no-rejection') {
      // UDP gives no delivery confirmation; say so rather than imply proof.
      return { name: 'OSC target', status: 'pass', detail: `${where} — port not rejecting (UDP: no delivery proof)` };
    }
    return { name: 'OSC target', status: 'pass', detail: `${where} (not probed)` };
  }
  if (config.osc.routingConfig) {
    return { name: 'OSC target', status: 'pass', detail: `routing file ${config.osc.routingConfig} (not probed)` };
  }
  return {
    name: 'OSC target',
    status: 'warn',
    detail: 'no OSC target — receiver logs to console only',
    remedy: 'run `wavegrid projects osc` to point it at BEYOND/FB4 and drive real hardware'
  };
}

/** Worst status across a set of checks (fail > warn > pass). */
export function overallStatus(checks: Check[]): CheckStatus {
  if (checks.some(c => c.status === 'fail')) return 'fail';
  if (checks.some(c => c.status === 'warn')) return 'warn';
  return 'pass';
}
