/**
 * Presentation for the network verdict. Kept pure so the wording — the part an
 * operator acts on at 1am — is testable without a running brain.
 */
import type { NetworkReport, NetworkVerdict } from '@/types/ipc';

export type VerdictTone = 'good' | 'bad' | 'unknown';

const TONE: Record<NetworkVerdict, VerdictTone> = {
  'proven-reachable': 'good',
  'loopback-only': 'bad',
  'blocked-locally': 'bad',
  'no-network': 'bad',
  'isolation-likely': 'unknown',
  unproven: 'unknown'
};

const LABEL: Record<NetworkVerdict, string> = {
  'proven-reachable': 'Reachable',
  'loopback-only': 'This laptop only',
  'blocked-locally': 'Blocked on this machine',
  'no-network': 'No network',
  'isolation-likely': 'Probably isolated',
  unproven: 'Not proven yet'
};

export function verdictTone(v: NetworkVerdict): VerdictTone {
  return TONE[v];
}

export function verdictLabel(v: NetworkVerdict): string {
  return LABEL[v];
}

/** One line describing what the machine is listening on. */
export function bindDescription(report: NetworkReport): string {
  if (report.bindHost === '0.0.0.0' || report.bindHost === '::') {
    return `Listening on every interface, port ${report.port}`;
  }
  return `Listening on ${report.bindHost} only, port ${report.port}`;
}

/** How the neighbour count should read, including "we couldn't tell". */
export function neighbourSummary(report: NetworkReport): string {
  if (!report.neighboursKnown) return 'Other devices on this network: unknown';
  if (report.neighbourCount === 0) return 'Other devices on this network: none visible';
  return `Other devices on this network: ${report.neighbourCount}`;
}
