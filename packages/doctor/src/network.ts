/**
 * Network diagnostics: can anything else on the wifi actually reach this brain?
 *
 * The honest limits of what a laptop can conclude on its own:
 *  - It KNOWS what it bound to, and whether its own LAN address accepts a TCP
 *    connection (that rules out a bad bind and a host firewall).
 *  - It CANNOT prove a phone can reach it. Venue and guest wifi commonly enable
 *    AP/client isolation, which drops device-to-device traffic while leaving the
 *    internet — and every local check — perfectly healthy.
 *
 * So the verdict below is graded by evidence: a device that actually connected
 * is proof; everything else is a narrowing of the possibilities, labelled as
 * such rather than dressed up as a diagnosis.
 */
import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { promisify } from 'node:util';

import { tcpProbe } from './probe';

const execFileAsync = promisify(execFile);

/** An IPv4 address this machine holds on a real (non-loopback) interface. */
export interface LanInterface {
  name: string;
  address: string;
  netmask: string;
}

export interface SelfProbe {
  address: string;
  url: string;
  /** Whether this machine can open the port on its own LAN address. */
  reachable: boolean;
}

/** Another device this machine has exchanged traffic with (ARP/neighbour table). */
export interface Neighbour {
  address: string;
  mac: string;
}

export type NetworkVerdict =
  | 'proven-reachable'
  | 'loopback-only'
  | 'blocked-locally'
  | 'no-network'
  | 'isolation-likely'
  | 'unproven';

export interface NetworkReport {
  /** What the server bound to (`0.0.0.0` = every interface). */
  bindHost: string;
  port: number;
  interfaces: LanInterface[];
  urls: string[];
  selfProbes: SelfProbe[];
  neighbours: Neighbour[];
  /** Whether the neighbour table could be read at all on this platform. */
  neighboursKnown: boolean;
  /** Devices that actually loaded something from the brain, newest first. */
  visitors: { address: string; userAgent: string; lastSeen: number }[];
  verdict: NetworkVerdict;
  summary: string;
  /** What to try next, when there is something to try. */
  hint: string | null;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** Every IPv4 address this machine holds on a real interface. */
export function lanInterfaces(): LanInterface[] {
  const out: LanInterface[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const net of entries ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.push({ name, address: net.address, netmask: net.netmask });
      }
    }
  }
  return out;
}

/**
 * Devices in this machine's ARP/neighbour table — everything it has recently
 * exchanged packets with on the local segment. Under client isolation this is
 * usually just the gateway, because no peer traffic is ever allowed through.
 */
export async function neighbours(): Promise<{ list: Neighbour[]; known: boolean }> {
  try {
    // `arp -an` exists on macOS, Linux and Windows (different spellings of the
    // same output), and needs no privileges.
    const { stdout } = await execFileAsync('arp', ['-an'], { timeout: 3000 });
    const list: Neighbour[] = [];
    for (const line of stdout.split('\n')) {
      const ip = /\(?(\d+\.\d+\.\d+\.\d+)\)?/.exec(line)?.[1];
      const mac = /([0-9a-f]{1,2}(?::[0-9a-f]{1,2}){5})/i.exec(line)?.[1];
      if (ip && mac && !mac.startsWith('ff:ff')) list.push({ address: ip, mac: mac.toLowerCase() });
    }
    return { list, known: true };
  } catch {
    // No `arp` binary (some minimal images), or it refused — report "unknown"
    // rather than "no neighbours", which would read as a network problem.
    return { list: [], known: false };
  }
}

export interface NetworkProbeInput {
  bindHost: string;
  port: number;
  /** Devices the running brain has served over the network, newest first. */
  visitors: { address: string; userAgent: string; lastSeen: number }[];
  timeoutMs?: number;
}

/** Facts in, verdict out. Pure, so the wording an operator reads at 1am is
 *  testable without a network. */
export function verdictFor(report: Omit<NetworkReport, 'verdict' | 'summary' | 'hint'>): {
  verdict: NetworkVerdict;
  summary: string;
  hint: string | null;
} {
  if (report.visitors.length > 0) {
    const v = report.visitors[0];
    return {
      verdict: 'proven-reachable',
      summary: `Reachable over the network — ${v.address} loaded the show.`,
      hint: null
    };
  }
  if (LOOPBACK_HOSTS.has(report.bindHost)) {
    return {
      verdict: 'loopback-only',
      summary: `Bound to ${report.bindHost} — only this laptop can reach the show.`,
      hint: 'Set the server host to 0.0.0.0 in Config → Network, then restart the show.'
    };
  }
  if (report.interfaces.length === 0) {
    return {
      verdict: 'no-network',
      summary: 'This machine has no network address — wifi is off or not associated.',
      hint: 'Join a network, then re-run this check.'
    };
  }
  const blocked = report.selfProbes.filter((p) => !p.reachable);
  if (blocked.length > 0) {
    return {
      verdict: 'blocked-locally',
      summary: `This machine can't open its own ${blocked.map((p) => p.address).join(', ')}:${report.port} — something local is blocking it.`,
      hint: 'Allow incoming connections for the app in the operating system firewall.'
    };
  }
  // Local side is provably fine. Nobody has connected yet: either no one has
  // tried, or the network forbids peer traffic. A neighbour table holding only
  // the gateway is the usual fingerprint of client isolation.
  if (report.neighboursKnown && report.neighbours.length <= 1) {
    return {
      verdict: 'isolation-likely',
      summary:
        'Listening on every interface, but no other device is visible on this network — guest wifi often isolates clients from each other.',
      hint: 'Scan the QR from a phone to confirm. If it fails, use a phone hotspot or a router you control.'
    };
  }
  return {
    verdict: 'unproven',
    summary: 'Listening on every interface. No device has connected yet.',
    hint: 'Scan the QR from a phone — that is the only way to prove the network allows it.'
  };
}

/** Collect the whole network picture. Never throws: every probe reports a fact. */
export async function probeNetwork(input: NetworkProbeInput): Promise<NetworkReport> {
  const { bindHost, port, visitors, timeoutMs = 1500 } = input;
  const interfaces = lanInterfaces();
  const bindsEverywhere = bindHost === '0.0.0.0' || bindHost === '::';
  const probeTargets = bindsEverywhere
    ? interfaces.map((i) => i.address)
    : interfaces.filter((i) => i.address === bindHost).map((i) => i.address);

  const selfProbes: SelfProbe[] = await Promise.all(
    probeTargets.map(async (address) => ({
      address,
      url: `http://${address}:${port}`,
      // tcpProbe rewrites a wildcard host to loopback; these are real addresses,
      // so this genuinely tests the interface.
      reachable: (await tcpProbe(address, port, timeoutMs)) === 'open'
    }))
  );

  const { list, known } = await neighbours();
  // A request from one of our own addresses is this laptop talking to itself
  // (a browser here opening the LAN URL) — it proves nothing about the network.
  const own = new Set(interfaces.map((i) => i.address));
  const base = {
    bindHost,
    port,
    interfaces,
    urls: selfProbes.map((p) => p.url),
    selfProbes,
    neighbours: list,
    neighboursKnown: known,
    visitors: visitors.filter((v) => !own.has(v.address))
  };
  return { ...base, ...verdictFor(base) };
}
