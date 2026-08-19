// Pure helpers translating between the stored OscConfig and the flat
// OscTarget the renderer binds to. Same four choices as the CLI's
// `wavegrid projects osc` wizard: BEYOND, FB4, a routing file, or none.
import {
  DEFAULT_BEYOND_PORT,
  DEFAULT_FB4_PORT,
  LOOPBACK_HOST,
  normalizeOscHost,
  type OscConfig
} from '@wavegrid/layout';
import type { ProjectConfig } from '@wavegrid/settings';

import type { OscTarget } from '@/types/ipc';

/** Read the stored config as the flat target the editor shows. */
export function toOscTarget(stored: ProjectConfig | null): OscTarget {
  const osc: OscConfig = stored?.osc ?? {};
  if (osc.beyond) {
    return {
      kind: 'beyond',
      host: osc.beyond.host,
      port: osc.beyond.port,
      gridOrder: osc.beyond.gridOrder === 'column' ? 'column' : 'row',
      file: '',
      // A unified routing spec makes per-device configs authoritative; surface it
      // so the editor can say so instead of implying a single target drives all.
      hasUnifiedRouting: osc.routing != null
    };
  }
  if (osc.fb4) {
    return {
      kind: 'fb4',
      host: osc.fb4.host,
      port: osc.fb4.port,
      gridOrder: 'row',
      file: '',
      hasUnifiedRouting: osc.routing != null
    };
  }
  if (osc.routingConfig) {
    return {
      kind: 'routing',
      host: LOOPBACK_HOST,
      port: DEFAULT_BEYOND_PORT,
      gridOrder: 'row',
      file: osc.routingConfig,
      hasUnifiedRouting: osc.routing != null
    };
  }
  // Nothing stored yet: BEYOND almost always runs on this laptop, so offer
  // loopback rather than a blank field that saves as an error.
  return {
    kind: 'none',
    host: LOOPBACK_HOST,
    port: DEFAULT_BEYOND_PORT,
    gridOrder: 'row',
    file: '',
    hasUnifiedRouting: osc.routing != null
  };
}

/**
 * Fold a chosen target back into the stored config. Exactly one of
 * beyond/fb4/routingConfig survives — switching kinds must not leave the
 * previous target behind for the receiver to pick up. A unified `routing`
 * spec is preserved: it is authored separately (`wavegrid projects routing`)
 * and this screen does not own it.
 */
export function applyOscTarget(existing: ProjectConfig | null, target: OscTarget): ProjectConfig {
  const prev: ProjectConfig = existing ?? {};
  const routing = prev.osc?.routing;
  const keep = routing ? { routing } : {};

  if (target.kind === 'beyond') {
    // An empty field means "the usual setup": BEYOND on this machine.
    const host = normalizeOscHost(target.host) || LOOPBACK_HOST;
    return {
      ...prev,
      osc: {
        ...keep,
        beyond: {
          host,
          port: validPort(target.port, DEFAULT_BEYOND_PORT),
          gridOrder: target.gridOrder === 'column' ? 'column' : 'row'
        }
      }
    };
  }
  if (target.kind === 'fb4') {
    const host = normalizeOscHost(target.host);
    if (!host) throw new Error('FB4 needs a host address — the FB4 device’s IP.');
    return {
      ...prev,
      osc: { ...keep, fb4: { host, port: validPort(target.port, DEFAULT_FB4_PORT) } }
    };
  }
  if (target.kind === 'routing') {
    const file = target.file.trim();
    if (!file) throw new Error('Point at a routing JSON file, or pick another target.');
    return { ...prev, osc: { ...keep, routingConfig: file } };
  }
  return { ...prev, osc: { ...keep } };
}

function validPort(port: number, fallback: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}

/** One-line description of a target, matching the CLI's `osc show` wording. */
export function describeOscTarget(target: OscTarget): string {
  if (target.kind === 'beyond') return `BEYOND → ${target.host}:${target.port} (${target.gridOrder})`;
  if (target.kind === 'fb4') return `FB4 → ${target.host}:${target.port}`;
  if (target.kind === 'routing') return `routing file → ${target.file}`;
  return 'none (console only — no lasers)';
}
