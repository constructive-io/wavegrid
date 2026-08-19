/**
 * The OSC debugger's back end (Output → Advanced).
 *
 * Debugging "the lasers aren't responding" needs three things a show cannot
 * give you: is anything listening where we send, what exactly goes on the wire,
 * and does one hand-made message move a laser. OSC is UDP, so none of that is
 * observable from a running show — every frame aimed at a wrong port is dropped
 * in silence.
 *
 * What it sends is deliberately small: single messages, built by the same
 * encoders the show uses, at the project's own configured target. Nothing here
 * starts an animation or invents a hardware command.
 */
import { existsSync, readFileSync } from 'node:fs';

import { checkBeyond, findBeyondIni, readBeyondSettings, udpProbe, type UdpState } from '@wavegrid/doctor';
import { resolveLayout } from '@wavegrid/layout';
import {
  type CannonState,
  encodeBeyondMessages,
  encodeFB4Messages,
  listenForOsc,
  type OscListener,
  type OscMessage,
  parseOscArg,
  sendOscMessage
} from '@wavegrid/osc';
import { openStore } from '@wavegrid/settings';

import type {
  OscDebugPreset,
  OscDebugState,
  OscDebugTarget,
  OscSignalEntry,
  OscSignalResult
} from '@/types/ipc';

/** Colours the preset buttons send, as the artist UI would describe them. */
const PRESET_COLORS: Record<Exclude<OscDebugPreset, 'blackout'>, CannonState> = {
  white: { h: 0, s: 0, b: 100 },
  amber: { h: 40, s: 100, b: 100 }
};

/** Enough log to see a pattern, little enough to render every poll. */
const LOG_LIMIT = 200;

/** How long a probe waits for an ICMP rejection before calling it quiet. */
const PROBE_MS = 700;

const log: OscSignalEntry[] = [];
let probe: UdpState | null = null;
let listener: OscListener | null = null;
let listenPort: number | null = null;

function record(entry: OscSignalEntry): void {
  log.push(entry);
  if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
}

/** The project's own OSC target, or null when it has none to debug. */
export function oscDebugTarget(project: string): OscDebugTarget | null {
  const store = openStore();
  if (!store.hasProject(project)) return null;
  const osc = store.getProjectConfig(project)?.osc;
  if (osc?.beyond) return { kind: 'beyond', host: osc.beyond.host, port: osc.beyond.port };
  if (osc?.fb4) return { kind: 'fb4', host: osc.fb4.host, port: osc.fb4.port };
  return null;
}

/**
 * BEYOND's own settings, when it is installed here — the two values that mute
 * OSC without any error: its receive port, and the R-G-B-A panel that gates the
 * `livecontrol` colour addresses.
 */
function beyondAdvice(target: OscDebugTarget | null): OscDebugState['beyond'] {
  const path = findBeyondIni(process.env, existsSync);
  if (!path) return null;
  try {
    const settings = readBeyondSettings(readFileSync(path, 'utf8'));
    return {
      path,
      oscPort: settings.oscPort ?? null,
      showRgbaPanel: settings.showRgbaPanel ?? null,
      checks: checkBeyond(settings, target?.kind === 'beyond' ? target.port : undefined)
    };
  } catch {
    return null;
  }
}

/** How many fixtures "all" means for this project. */
function cannonCount(project: string): number {
  const preset = openStore().getProjectConfig(project)?.layout?.preset;
  try {
    return resolveLayout({ preset: preset ?? 'ring-6' }).count;
  } catch {
    return 6;
  }
}

export function oscDebugState(project: string): OscDebugState {
  const target = oscDebugTarget(project);
  return {
    target,
    probe,
    listening: listenPort,
    log: [...log],
    beyond: beyondAdvice(target)
  };
}

/** Is anything bound where we send? A rejection is proof it is not. */
export async function probeOscTarget(project: string): Promise<OscDebugState> {
  const target = oscDebugTarget(project);
  probe = target ? await udpProbe(target.host, target.port, PROBE_MS) : null;
  return oscDebugState(project);
}

async function deliver(target: OscDebugTarget, messages: OscMessage[]): Promise<OscSignalResult> {
  try {
    for (const msg of messages) {
      // Floats, as the show's own output stage sends them — the point of the
      // panel is that these bytes are indistinguishable from a real frame's.
      const values = Array.isArray(msg.value) ? msg.value : [msg.value];
      await sendOscMessage(
        target.host,
        target.port,
        msg.address,
        values.map((value) => ({ type: 'float' as const, value }))
      );
      record({
        at: Date.now(),
        dir: 'out',
        address: msg.address,
        args: values.map((v) => `f:${v}`).join(' '),
        peer: `${target.host}:${target.port}`
      });
    }
    return { ok: true, sent: messages.length };
  } catch (err) {
    return { ok: false, sent: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Send one hand-typed message, so an address from BEYOND's docs can be tried. */
export async function sendOscSignal(
  project: string,
  address: string,
  args: string[]
): Promise<OscSignalResult> {
  const target = oscDebugTarget(project);
  if (!target) return { ok: false, sent: 0, error: 'This project has no OSC target — set one under Output.' };
  if (!address.startsWith('/')) return { ok: false, sent: 0, error: 'An OSC address starts with "/".' };
  try {
    const parsed = args.filter((a) => a.trim() !== '').map(parseOscArg);
    await sendOscMessage(target.host, target.port, address, parsed);
    record({
      at: Date.now(),
      dir: 'out',
      address,
      args: parsed.map((a) => `${a.type[0]}:${a.value}`).join(' '),
      peer: `${target.host}:${target.port}`
    });
    return { ok: true, sent: 1 };
  } catch (err) {
    return { ok: false, sent: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * A known-good frame for one fixture or all of them, encoded by the show's own
 * adapters — so if this lights a laser and the show does not, the difference is
 * upstream of the wire.
 */
export async function sendOscPreset(
  project: string,
  preset: OscDebugPreset,
  zone: number | null,
  serial?: string
): Promise<OscSignalResult> {
  const target = oscDebugTarget(project);
  if (!target) return { ok: false, sent: 0, error: 'This project has no OSC target — set one under Output.' };

  const count = cannonCount(project);
  const indices = zone == null ? Array.from({ length: count }, (_, i) => i) : [zone];
  const color = preset === 'blackout' ? { h: 0, s: 0, b: 0 } : PRESET_COLORS[preset];
  const grid: CannonState[] = [];
  for (const i of indices) grid[i] = { ...color };
  for (let i = 0; i < grid.length; i++) grid[i] ??= { h: 0, s: 0, b: 0 };

  if (target.kind === 'fb4') {
    if (!serial) return { ok: false, sent: 0, error: 'FB4 addressing needs the projector serial.' };
    const serialMap = Object.fromEntries(indices.map((i) => [i, serial]));
    return deliver(target, encodeFB4Messages(grid, serialMap));
  }
  const projectorMap = Object.fromEntries(indices.map((i) => [i, i]));
  return deliver(target, encodeBeyondMessages(grid, projectorMap));
}

/**
 * Bind a port and log what arrives. This is how you prove a send left the
 * machine, and how you read what another controller is emitting.
 */
export async function startOscListen(project: string, port: number): Promise<OscDebugState & { error?: string }> {
  await stopOscListen();
  try {
    listener = await listenForOsc(port, '0.0.0.0', ({ address, args, from }) => {
      record({
        at: Date.now(),
        dir: 'in',
        address,
        args: args.map((a) => String(a)).join(' '),
        peer: from
      });
    });
    listenPort = port;
    return oscDebugState(project);
  } catch (err) {
    listener = null;
    listenPort = null;
    // Almost always EADDRINUSE: BEYOND (or the show) already holds the port.
    return { ...oscDebugState(project), error: err instanceof Error ? err.message : String(err) };
  }
}

export async function stopOscListen(): Promise<void> {
  const current = listener;
  listener = null;
  listenPort = null;
  if (current) await current.close().catch(() => undefined);
}

export function clearOscLog(): void {
  log.length = 0;
}
