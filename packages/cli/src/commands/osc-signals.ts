/**
 * `wavegrid signals` — hand-driven OSC, for debugging what actually reaches
 * Pangolin.
 *
 * The show sends a whole grid 30 times a second, which is the wrong instrument
 * for "did BEYOND receive anything at all?" and "which zone is fixture 7?".
 * These send one message at a time, walk fixtures one at a time, and can sit on
 * a port and print the stream the hardware would see.
 *
 * Aiming: the project's configured OSC target by default (so this debugs the
 * same path the show uses), or `--host/--port` for a one-off.
 */
import { loadWavegridConfig } from '@wavegrid/layout';
import {
  BeyondOscOutput,
  type CannonState,
  FB4OscOutput,
  listenForOsc,
  type OutputAdapter,
  parseIndexRange,
  parseOscArg,
  probeGrid,
  sendOscMessage
} from '@wavegrid/osc';
import c from 'yanse';

import { type Flags, getStore, resolveProjectName } from '../project';

export const SIGNALS_USAGE = [
  '  Usage:',
  '    wavegrid signals send /beyond/zone/0/livecontrol/red 255',
  '    wavegrid signals send /FB4-12345/color_red 100 --host 192.168.1.50 --port 8000',
  '    wavegrid signals probe [--zones 0-11] [--hold 500] [--hue 40]',
  '    wavegrid signals listen [--port 7001]',
  '',
  '  Options:',
  '    --host <ip>      Override the project\'s OSC host',
  '    --port <n>       Override the port (BEYOND 7001, FB4 8000)',
  '    --dry-run        Print what would be sent, send nothing',
  '',
  '  Arguments are floats unless tagged: `i:3` integer, `s:text` string.',
  '  BEYOND needs its OSC server enabled (Settings \u2192 OSC) and the zone under',
  '  live-control for these to have any visible effect.'
].join('\n');

interface Target {
  kind: 'beyond' | 'fb4';
  host: string;
  port: number;
  /** Where the target came from, for the line printed before sending. */
  origin: string;
}

function str(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function num(flags: Flags, key: string): number | undefined {
  const v = flags[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/**
 * Where to aim. Flags win, then the project's configured target — so a probe
 * with no arguments exercises exactly what the show would drive.
 */
export function resolveTarget(flags: Flags, config: { osc: { beyond?: { host: string; port: number }; fb4?: { host: string; port?: number } } }): Target {
  const host = str(flags, 'host');
  const port = num(flags, 'port');
  const kindFlag = str(flags, 'kind');

  if (host) {
    const kind = kindFlag === 'fb4' ? 'fb4' : 'beyond';
    return { kind, host, port: port ?? (kind === 'fb4' ? 8000 : 7001), origin: 'flags' };
  }
  if (config.osc.beyond) {
    return {
      kind: 'beyond',
      host: config.osc.beyond.host,
      port: port ?? config.osc.beyond.port,
      origin: 'project config (BEYOND)'
    };
  }
  if (config.osc.fb4) {
    return {
      kind: 'fb4',
      host: config.osc.fb4.host,
      port: port ?? config.osc.fb4.port ?? 8000,
      origin: 'project config (FB4)'
    };
  }
  throw new Error(
    'No OSC target. Set one with `wavegrid projects osc`, or pass --host (and --port).'
  );
}

function targetLine(target: Target): string {
  return c.gray(`  → ${target.kind.toUpperCase()} ${target.host}:${target.port}  (${target.origin})`);
}

function projectConfig(flags: Flags) {
  const store = getStore();
  // Resolve the project so an explicit --project is honoured and a missing one
  // fails loudly rather than debugging the wrong installation.
  resolveProjectName(store, flags);
  return loadWavegridConfig().config;
}

export async function runSignalsSend(args: string[], flags: Flags): Promise<void> {
  const address = args[0];
  if (!address || !address.startsWith('/')) {
    console.log(c.red('  An OSC address is required, e.g. /beyond/zone/0/livecontrol/red'));
    console.log(SIGNALS_USAGE);
    process.exitCode = 1;
    return;
  }
  const target = resolveTarget(flags, projectConfig(flags));
  const oscArgs = args.slice(1).map(parseOscArg);
  const rendered = oscArgs.map((a) => `${a.type[0]}:${a.value}`).join(' ');

  console.log('');
  console.log(`  ${c.bold(address)} ${rendered}`);
  console.log(targetLine(target));
  if (flags['dry-run']) {
    console.log(c.yellow('  dry run — nothing sent'));
    console.log('');
    return;
  }
  await sendOscMessage(target.host, target.port, address, oscArgs);
  console.log(c.green('  ✓ sent'));
  console.log(c.gray('  UDP is fire-and-forget: `wavegrid signals listen` on the far side is the'));
  console.log(c.gray('  only proof it arrived.'));
  console.log('');
}

/**
 * One adapter for the whole walk, mapping each index to itself (BEYOND zone) or
 * to the given serial (FB4) — the same encoders the show uses, so the bytes on
 * the wire are the show's bytes.
 */
function probeAdapter(
  target: Target,
  zones: number[],
  serial: string | undefined
): OutputAdapter & { connect: () => void } {
  if (target.kind === 'fb4') {
    if (!serial) throw new Error('FB4 addressing needs a 5-digit serial: --serial 12345');
    return new FB4OscOutput({
      host: target.host,
      port: target.port,
      serialMap: Object.fromEntries(zones.map((z) => [z, serial])),
      sendEveryNFrames: 1
    });
  }
  return new BeyondOscOutput({
    host: target.host,
    port: target.port,
    projectorMap: Object.fromEntries(zones.map((z) => [z, z])),
    sendEveryNFrames: 1
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Time given to the UDP socket to flush before it is closed. */
const FLUSH_MS = 100;

/**
 * Light one fixture at a time so the operator can watch which physical laser
 * answers to which index — the mapping question no capture can answer.
 */
export async function runSignalsProbe(flags: Flags): Promise<void> {
  const config = projectConfig(flags);
  const target = resolveTarget(flags, config);
  const zones = parseIndexRange(str(flags, 'zones') ?? '0-11');
  const hold = num(flags, 'hold') ?? 500;
  const color: CannonState = {
    h: num(flags, 'hue') ?? 40,
    s: num(flags, 'sat') ?? 100,
    b: num(flags, 'bright') ?? 100
  };
  const serial = str(flags, 'serial');
  const count = Math.max(...zones) + 1;

  console.log('');
  console.log(`  Walking ${zones.length} ${target.kind === 'fb4' ? 'fixtures' : 'zones'}, ${hold}ms each`);
  console.log(targetLine(target));
  if (flags['dry-run']) {
    console.log(c.yellow(`  dry run — would light ${zones.join(', ')} then blackout`));
    console.log('');
    return;
  }
  console.log(c.yellow('  Lasers will output. Make sure the room is safe.'));
  console.log('');

  const adapter = probeAdapter(target, zones, serial);
  adapter.connect();
  try {
    for (const zone of zones) {
      console.log(`  ${c.bold(String(zone))} on`);
      adapter.send(probeGrid(count, zone, color));
      await sleep(hold);
    }
    adapter.send(probeGrid(count, null, color));
    // UDP sends are queued on the socket; closing it immediately drops the
    // blackout frame, which is the one frame that must not be lost.
    await sleep(FLUSH_MS);
  } finally {
    adapter.close();
  }
  console.log('');
  console.log(c.green('  ✓ done — everything blacked out'));
  console.log('');
}

/** Sit on a port and print what arrives. Ctrl-C to stop. */
export async function runSignalsListen(flags: Flags): Promise<void> {
  const port = num(flags, 'port') ?? 7001;
  const host = str(flags, 'host') ?? '0.0.0.0';
  let seen = 0;

  const listener = await listenForOsc(port, host, ({ address, args, from }) => {
    seen += 1;
    const rendered = args.map((a) => (typeof a === 'number' ? a.toFixed(2) : String(a))).join(' ');
    console.log(`  ${c.gray(from.padEnd(21))} ${c.bold(address)} ${rendered}`);
  });

  console.log('');
  console.log(`  Listening for OSC on ${host}:${port} — Ctrl-C to stop`);
  console.log(c.gray('  Point the show at this (`wavegrid projects osc beyond --host 127.0.0.1'));
  console.log(c.gray(`  --port ${port}`) + c.gray(') to see the exact stream the hardware gets.'));
  console.log('');

  await new Promise<void>((resolve) => {
    const stop = () => {
      void listener.close().then(() => {
        console.log('');
        console.log(c.green(`  ✓ ${seen} message${seen === 1 ? '' : 's'} seen`));
        resolve();
      });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}
