/**
 * `wavegrid receiver` — run a receiver only (no server, no UI). This is what
 * each receiver laptop of a distributed show runs; it dials the brain's
 * WebSocket, authenticates with the shared receiver key, and drives its shard
 * of cannons.
 *
 *   wavegrid receiver --server ws://192.168.1.42:3333 --shard 0-24
 *
 * `--server` is the explicit upstream (required when the brain isn't this
 * machine); `--shard start-end` restricts which cannons this laptop drives.
 */
import { browse, type DiscoveredBrain } from '@wavegrid/discovery';
import { loadWavegridConfig, type ResolvedConfig } from '@wavegrid/layout';
import type { Inquirerer, Question } from 'inquirerer';
import c from 'yanse';

import { type Flags, getStore, resolveProjectName } from '../project';
import { coordinate } from './coordinate';
import { applyReceiverEnv, applyServerEnv, applyShardFlag, awaitBind } from './runtime';

/** Turn a discovered brain into the ws:// URL the receiver dials. */
export function brainToWsUrl(brain: DiscoveredBrain): string {
  const host = brain.addresses[0] || brain.host;
  return `ws://${host}:${brain.port}`;
}

/** Label a discovered brain for the selection prompt. */
export function brainLabel(brain: DiscoveredBrain): string {
  const where = brain.addresses[0] || brain.host;
  return `${brain.project} — ${where}:${brain.port}${brain.deviceName ? ` (${brain.deviceName})` : ''}`;
}

export interface ReceiverOptions {
  cwd?: string;
  /** Resolve + print the plan but do not start anything (tests). */
  dryRun?: boolean;
  flags?: Flags;
  prompter?: Inquirerer;
}

export interface ReceiverResult {
  server: string;
  stop: () => void;
}

async function selectProject(opts: ReceiverOptions): Promise<string> {
  const store = getStore();
  const flags = opts.flags ?? {};
  const explicit =
    (typeof flags.project === 'string' ? flags.project : undefined) ?? process.env.WAVEGRID_PROJECT;

  if (!explicit && opts.prompter) {
    const projects = store.listProjects();
    if (projects.length > 1) {
      const answer = (await opts.prompter.prompt({}, [
        {
          type: 'list',
          name: 'project',
          message: 'Project for this receiver',
          options: projects,
          default: store.getActiveProject() ?? projects[0]
        } as Question
      ])) as unknown as { project: string };
      if (answer.project) return answer.project;
    }
  }
  return resolveProjectName(store, flags);
}

export async function runReceiver(opts: ReceiverOptions = {}): Promise<ReceiverResult> {
  const cwd = opts.cwd ?? process.cwd();
  const flags = opts.flags ?? {};

  // `--server ws://host:port` sets the upstream the receiver dials. Without it
  // we try mDNS discovery, then (if nothing is found) hold a coordinator
  // election, and only then fall back to the config/localhost default.
  let serverFlag = typeof flags.server === 'string' ? flags.server : undefined;
  const discover = flags.discover !== false && flags['no-discover'] !== true;
  if (!serverFlag && !opts.dryRun && discover) {
    const discovered = await discoverServer(opts);
    if (discovered) serverFlag = discovered;
  }

  if (!applyShardFlag(flags.shard)) {
    console.log(c.red(`Invalid --shard: expected "start-end" (e.g. 0-24), got "${String(flags.shard)}"`));
    process.exitCode = 1;
    return { server: '', stop: () => {} };
  }

  if (opts.dryRun) {
    const resolved = loadWavegridConfig({ cwd });
    printPlan(resolved, serverFlag);
    return { server: serverFlag ?? process.env.SIMULATOR_URL ?? '', stop: () => {} };
  }

  const store = getStore();
  const project = await selectProject(opts);

  const resolved = loadWavegridConfig({ cwd });

  // No brain on the LAN and this project replicates config across devices →
  // elect a coordinator so sync still has an authority. The winner promotes
  // itself to a transient brain (server + local receiver); everyone else homes
  // to it. Simple/one-laptop projects skip this entirely.
  if (!serverFlag && discover && p2pEligible(resolved, flags)) {
    const device = store.getDevice();
    console.log(c.gray('  No brain on the LAN — holding a coordinator election (mDNS)…'));
    const result = await coordinate({ project, deviceId: device.id });
    if (result.role === 'client' && result.server) {
      console.log(`  ${c.green('✓')} homing to elected brain ${c.cyan(result.server)}`);
      serverFlag = result.server;
    } else {
      console.log(`  ${c.green('▶')} ${c.bold('promoted to transient brain')} ${c.gray('— no server on the LAN; peers will connect here.')}`);
      return promoteToBrain({ store, project, resolved });
    }
  }

  if (serverFlag) process.env.SIMULATOR_URL = serverFlag;

  // Wire env first (may set SHARD_START/END from this device's assigned shard)
  // so the printed plan reflects the shard the receiver will actually drive.
  applyReceiverEnv(store, project, resolved);
  printPlan(resolved, serverFlag, project);

  const { startReceiver } = await import('@wavegrid/receiver');
  const receiverHandle = startReceiver(resolved);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    receiverHandle.stop();
  };

  const onSignal = () => {
    console.log('\n  Shutting down...');
    stop();
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  console.log('');
  console.log(`  ${c.green('▶')} receiver up.  ${c.gray('Ctrl-C stops it.')}`);
  console.log('');

  return { server: process.env.SIMULATOR_URL ?? '', stop };
}

/**
 * Whether this receiver should hold a coordinator election when no brain is
 * found. Only for distributed projects that replicate config — a simple
 * one-laptop project (or one with sync turned off) never elects anything, so
 * the server-less machinery stays invisible. `--no-p2p` opts out explicitly.
 */
export function p2pEligible(resolved: ResolvedConfig, flags: Flags): boolean {
  if (flags['no-p2p'] === true || flags.p2p === false) return false;
  if (resolved.config.sync?.enabled === false) return false;
  return resolved.runMode === 'distributed';
}

/**
 * Promote this laptop to a transient brain: run the server (advertised as
 * transient so a dedicated brain can later supersede it) plus a local receiver,
 * exactly like `wavegrid start` but flagged so peers know it's a stand-in.
 */
async function promoteToBrain(ctx: {
  store: ReturnType<typeof getStore>;
  project: string;
  resolved: ResolvedConfig;
}): Promise<ReceiverResult> {
  const { store, project, resolved } = ctx;
  applyServerEnv(store, project, resolved);
  applyReceiverEnv(store, project, resolved);
  const device = store.getDevice();

  const { startServer } = await import('@wavegrid/server');
  const { startReceiver } = await import('@wavegrid/receiver');
  const serverHandle = startServer(resolved, {
    advertise: { project, deviceId: device.id, deviceName: device.name, transient: true }
  });
  // The receiver dials in only once the port is actually bound.
  await awaitBind(serverHandle);
  const receiverHandle = startReceiver(resolved);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    receiverHandle.stop();
    serverHandle.stop();
  };
  const onSignal = () => {
    console.log('\n  Shutting down...');
    stop();
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const port = resolved.config.server.port;
  console.log('');
  console.log(`  ${c.green('▶')} transient brain + receiver up on ${c.cyan(`:${port}`)}.  ${c.gray('Ctrl-C stops everything.')}`);
  console.log('');
  return { server: `ws://localhost:${port}`, stop };
}

/**
 * Browse the LAN for advertised brains. Returns a ws:// URL, or undefined to
 * fall through to the config/localhost default. Prompts when several are found
 * and a prompter is available; picks the only one automatically. Discovery is
 * pure convenience — the connection still authenticates with the shared key.
 */
async function discoverServer(opts: ReceiverOptions): Promise<string | undefined> {
  console.log(c.gray('  Searching the LAN for a Wavegrid brain (mDNS)…'));
  const brains = await browse({ timeoutMs: 2000 });
  if (brains.length === 0) {
    console.log(c.gray('  No brain discovered — using --server / config default.'));
    return undefined;
  }
  if (brains.length === 1) {
    console.log(`  ${c.green('✓')} Found ${c.cyan(brainLabel(brains[0]))}`);
    return brainToWsUrl(brains[0]);
  }
  if (opts.prompter) {
    const answer = (await opts.prompter.prompt({}, [
      {
        type: 'list',
        name: 'brain',
        message: 'Multiple Wavegrid brains found — pick one',
        options: brains.map(brainLabel)
      } as Question
    ])) as unknown as { brain: string };
    const chosen = brains.find(b => brainLabel(b) === answer.brain) ?? brains[0];
    return brainToWsUrl(chosen);
  }
  // No TTY: default to the first, but tell the operator how to be explicit.
  console.log(c.yellow(`  ${brains.length} brains found; using ${brainLabel(brains[0])}. Pass --server to choose.`));
  return brainToWsUrl(brains[0]);
}

function printPlan(
  resolved: ReturnType<typeof loadWavegridConfig>,
  server: string | undefined,
  project?: string
): void {
  console.log('');
  console.log(c.bold('  Wavegrid · receiver (only)'));
  if (project) console.log(`  → Project:  ${c.cyan(project)}`);
  console.log(`  → Layout:   ${c.cyan(resolved.layout.name)} (${resolved.layout.topology}, ${resolved.layout.count} cannons)`);
  console.log(`  → Server:   ${server ? c.cyan(server) : c.gray('(config/localhost default)')}`);
  const shard =
    process.env.SHARD_START !== undefined && process.env.SHARD_END !== undefined
      ? `${process.env.SHARD_START}–${process.env.SHARD_END}`
      : 'all cannons (no shard)';
  console.log(`  → Shard:    ${c.cyan(shard)}`);
  console.log('');
}
