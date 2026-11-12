/**
 * OSC output adapters for Pangolin BEYOND and FB4 hardware.
 *
 * These adapters convert the internal HSB grid state to OSC messages
 * and send them via UDP. Each adapter implements the OutputAdapter
 * interface so it can be swapped into the receiver without modifying
 * the receiver core.
 *
 * OSC addressing follows Pangolin's documented schemas:
 *   BEYOND: /beyond/zone/{index}/livecontrol/{property}
 *   FB4:    /FB4-{serial}/{command}
 */

import { Client, Message } from 'node-osc';

import { hsbToRgb100, hsbToRgb255 } from './color';

/** When true, log every OSC message sent. Set via DEBUG_OSC=1 env var. */
export const DEBUG_OSC = !!process.env.DEBUG_OSC;

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

/** HSB state for a single cannon/beam. */
export interface CannonState {
  h: number; // hue 0–360
  s: number; // saturation 0–100
  b: number; // brightness 0–100
}

/** Cannon (single static beam) or projector (scanning head playing a BEYOND cue). */
export type FixtureKind = 'cannon' | 'projector';

/**
 * Projector-only live controls, one BEYOND zone livecontrol function each.
 * Ranges are Pangolin's documented ones (wiki `beyond:osc_commands`); values
 * are clamped on encode. Colour and brightness are NOT here — they ride the
 * ordinary HSB grid like a cannon's.
 */
export interface ProjectorControl {
  /** -400..400, all axes. */
  size?: number;
  sizex?: number;
  sizey?: number;
  /** 0..100 */
  zoom?: number;
  /** -32768..32768 (16-bit output coordinates). */
  posx?: number;
  posy?: number;
  /** Degrees, -2880..2880 (8 turns). */
  anglez?: number;
  /** Degrees per second, -1440..1440 (4 turns/s). */
  rotoz?: number;
  /** 0..400, 100 = authored speed. */
  anispeed?: number;
  /** 10..200, 100 = authored rate. */
  scanrate?: number;
  /** 0..100 */
  visiblepoints?: number;
  /** Effect slots 1–4: -1 stops, 0..47 picks an effect. */
  fx?: [number, number, number, number];
}

/** Show-level BEYOND commands (`/beyond/general/...`, integer arguments). */
export type ProjectorCueCommand =
  | { cueDown: { page: number; cue: number } }
  | { stopZone: number }
  | { stopAllNow: true };

/**
 * Generic output adapter interface. `sendProjector`/`sendCue` are optional:
 * only BEYOND-backed adapters can honour them, and the HSB `send` path is
 * untouched by their presence.
 */
export interface OutputAdapter {
  send(grid: CannonState[]): void;
  /** Projector-only controls keyed by logical index. Non-projectors are ignored. */
  sendProjector?(controls: Record<number, ProjectorControl>): void;
  sendCue?(command: ProjectorCueCommand): void;
  close(): void;
}

/** A single OSC message: address + one or more arguments (floats unless `ints`). */
export interface OscMessage {
  address: string;
  value: number | number[];
  /** Send the arguments as OSC int32 instead of float32 (PangoScript gateway commands). */
  ints?: boolean;
}

/** Send an OSC message with explicit int typing. */
function sendInts(client: Client, address: string, value: number | number[]): void {
  const msg = new Message(address);
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    msg.append({ type: 'integer', value: Math.round(v) });
  }
  client.send(msg);
}

function sendOsc(client: Client, msg: OscMessage): void {
  if (msg.ints) sendInts(client, msg.address, msg.value);
  else sendFloats(client, msg.address, msg.value);
}

/** Send an OSC message with explicit float typing (single or multi-value). */
function sendFloats(client: Client, address: string, value: number | number[]): void {
  const msg = new Message(address);
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    msg.append({ type: 'float', value: v });
  }
  client.send(msg);
}

// ═══════════════════════════════════════════════════
// BEYOND OSC Output Adapter
// ═══════════════════════════════════════════════════

export interface BeyondOscConfig {
  /** UDP target host (IP or hostname). */
  host: string;
  /** UDP target port (BEYOND OSC receive port, configurable in BEYOND). */
  port: number;
  /**
   * Map of logical grid index → BEYOND projector list index.
   * Only mapped cannons are sent; unmapped indices are skipped.
   */
  projectorMap: Record<number, number>;
  /**
   * Send rate throttle — only send every N frames.
   * At 60fps tick rate, sendEveryNFrames=2 gives 30Hz output.
   * Default: 2 (30Hz).
   */
  sendEveryNFrames?: number;
}

/**
 * Encode a grid snapshot into BEYOND OSC messages.
 * Exported for testing — the adapter calls this internally.
 *
 * BEYOND livecontrol uses zone-level addressing (case-sensitive).
 * Sends 5 messages per changed cannon:
 *   /beyond/zone/{n}/livecontrol/alpha      (255 = full override)
 *   /beyond/zone/{n}/livecontrol/red        (0–255 float)
 *   /beyond/zone/{n}/livecontrol/green      (0–255 float)
 *   /beyond/zone/{n}/livecontrol/blue       (0–255 float)
 *   /beyond/zone/{n}/livecontrol/Brightness (0–100 float)
 */
export function encodeBeyondMessages(
  grid: CannonState[],
  projectorMap: Record<number, number>,
  prevGrid?: CannonState[]
): OscMessage[] {
  const messages: OscMessage[] = [];

  for (let i = 0; i < grid.length; i++) {
    const projIndex = projectorMap[i];
    if (projIndex === undefined) continue;

    const cannon = grid[i];

    // Skip if state hasn't changed since last frame
    if (prevGrid && prevGrid[i]) {
      const prev = prevGrid[i];
      if (cannon.h === prev.h && cannon.s === prev.s && cannon.b === prev.b) continue;
    }

    const prefix = `/beyond/zone/${projIndex}/livecontrol`;

    const rgb = hsbToRgb255(cannon.h, cannon.s, cannon.b);
    messages.push({ address: `${prefix}/alpha`, value: 255 });
    messages.push({ address: `${prefix}/red`, value: rgb.r });
    messages.push({ address: `${prefix}/green`, value: rgb.g });
    messages.push({ address: `${prefix}/blue`, value: rgb.b });
    messages.push({ address: `${prefix}/Brightness`, value: Math.round(cannon.b) });
  }

  return messages;
}

const PROJECTOR_RANGES: Record<Exclude<keyof ProjectorControl, 'fx'>, [number, number]> = {
  size: [-400, 400],
  sizex: [-400, 400],
  sizey: [-400, 400],
  zoom: [0, 100],
  posx: [-32768, 32768],
  posy: [-32768, 32768],
  anglez: [-2880, 2880],
  rotoz: [-1440, 1440],
  anispeed: [0, 400],
  scanrate: [10, 200],
  visiblepoints: [0, 100]
};

function clamp(v: number, [lo, hi]: [number, number]): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Encode projector controls into BEYOND zone livecontrol messages. Only
 * indices present in `projectorMap` are emitted; the caller decides which
 * indices are projectors (see `RoutedOscOutput`).
 */
export function encodeBeyondProjectorMessages(
  controls: Record<number, ProjectorControl>,
  projectorMap: Record<number, number>
): OscMessage[] {
  const messages: OscMessage[] = [];
  for (const [key, control] of Object.entries(controls)) {
    const zone = projectorMap[Number(key)];
    if (zone === undefined || !control) continue;
    const prefix = `/beyond/zone/${zone}/livecontrol`;
    for (const name of Object.keys(PROJECTOR_RANGES) as Array<keyof typeof PROJECTOR_RANGES>) {
      const v = control[name];
      if (v === undefined) continue;
      messages.push({ address: `${prefix}/${name}`, value: clamp(v, PROJECTOR_RANGES[name]) });
    }
    if (control.fx) {
      control.fx.slice(0, 4).forEach((v, i) => {
        messages.push({ address: `${prefix}/fx${i + 1}`, value: clamp(Math.round(v), [-1, 47]) });
      });
    }
  }
  return messages;
}

/** Encode a show-level command into its `/beyond/general/...` message. */
export function encodeBeyondCueMessage(command: ProjectorCueCommand): OscMessage {
  if ('cueDown' in command) {
    return { address: '/beyond/general/CueDown', value: [command.cueDown.page, command.cueDown.cue], ints: true };
  }
  if ('stopZone' in command) {
    return { address: '/beyond/general/StopZone', value: [command.stopZone, 0], ints: true };
  }
  return { address: '/beyond/general/StopAllNow', value: [], ints: true };
}

export class BeyondOscOutput implements OutputAdapter {
  private client: Client | null = null;
  private config: BeyondOscConfig;
  private frameCount = 0;
  private sendInterval: number;
  private prevGrid: CannonState[] | undefined;

  constructor(config: BeyondOscConfig) {
    this.config = config;
    this.sendInterval = config.sendEveryNFrames ?? 2;
  }

  /** Initialize the UDP client. Call before receiver.start(). */
  connect(): void {
    this.client = new Client(this.config.host, this.config.port);
  }

  send(grid: CannonState[]): void {
    this.frameCount++;
    if (this.frameCount % this.sendInterval !== 0) return;
    if (!this.client) return;

    const messages = encodeBeyondMessages(grid, this.config.projectorMap, this.prevGrid);

    // Snapshot current state for next-frame diff
    this.prevGrid = grid.map(c => ({ h: c.h, s: c.s, b: c.b }));

    if (messages.length === 0) return;

    if (DEBUG_OSC) {
      const sample = messages.slice(0, 2);
      const lines = sample.map(m => {
        const v = Array.isArray(m.value) ? m.value.join(', ') : m.value;
        return `    ${m.address} = ${v}`;
      });
      console.log(`  [OSC→BEYOND] frame ${this.frameCount} | ${messages.length} msgs (rgb) to ${this.config.host}:${this.config.port}`);
      for (const line of lines) console.log(line);
      if (messages.length > 2) console.log(`    ... +${messages.length - 2} more`);
    }
    for (const msg of messages) {
      sendFloats(this.client, msg.address, msg.value);
    }
  }

  sendProjector(controls: Record<number, ProjectorControl>): void {
    if (!this.client) return;
    const messages = encodeBeyondProjectorMessages(controls, this.config.projectorMap);
    if (DEBUG_OSC && messages.length) {
      console.log(`  [OSC→BEYOND] projector | ${messages.length} msgs to ${this.config.host}:${this.config.port}`);
    }
    for (const msg of messages) sendOsc(this.client, msg);
  }

  sendCue(command: ProjectorCueCommand): void {
    if (!this.client) return;
    const msg = encodeBeyondCueMessage(command);
    if (DEBUG_OSC) console.log(`  [OSC→BEYOND] ${msg.address} ${Array.isArray(msg.value) ? msg.value.join(' ') : msg.value}`);
    sendOsc(this.client, msg);
  }

  close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}

// ═══════════════════════════════════════════════════
// FB4 OSC Output Adapter
// ═══════════════════════════════════════════════════

export interface FB4OscConfig {
  /** UDP target host (FB4 device IP). */
  host: string;
  /** UDP target port (FB4 listens on 8000). Default: 8000. */
  port?: number;
  /**
   * Map of logical grid index → 5-digit FB4 serial string.
   * Only mapped cannons are sent; unmapped indices are skipped.
   */
  serialMap: Record<number, string>;
  /** Send rate throttle. Default: 2 (30Hz at 60fps). */
  sendEveryNFrames?: number;
}

/**
 * Encode a grid snapshot into FB4 OSC messages.
 * Exported for testing.
 *
 * FB4 uses serial-number-based addresses:
 *   /FB4-{serial}/color_red   (0–100)
 *   /FB4-{serial}/color_green (0–100)
 *   /FB4-{serial}/color_blue  (0–100)
 */
export function encodeFB4Messages(
  grid: CannonState[],
  serialMap: Record<number, string>,
  prevGrid?: CannonState[]
): OscMessage[] {
  const messages: OscMessage[] = [];

  for (let i = 0; i < grid.length; i++) {
    const serial = serialMap[i];
    if (serial === undefined) continue;

    const cannon = grid[i];

    if (prevGrid && prevGrid[i]) {
      const prev = prevGrid[i];
      if (cannon.h === prev.h && cannon.s === prev.s && cannon.b === prev.b) continue;
    }

    const rgb = hsbToRgb100(cannon.h, cannon.s, cannon.b);

    messages.push({ address: `/FB4-${serial}/color_red`, value: rgb.r });
    messages.push({ address: `/FB4-${serial}/color_green`, value: rgb.g });
    messages.push({ address: `/FB4-${serial}/color_blue`, value: rgb.b });
  }

  return messages;
}

export class FB4OscOutput implements OutputAdapter {
  private client: Client | null = null;
  private config: Required<Pick<FB4OscConfig, 'host' | 'port' | 'serialMap'>> & Pick<FB4OscConfig, 'sendEveryNFrames'>;
  private frameCount = 0;
  private sendInterval: number;
  private prevGrid: CannonState[] | undefined;

  constructor(config: FB4OscConfig) {
    this.config = {
      ...config,
      port: config.port ?? 8000
    };
    this.sendInterval = config.sendEveryNFrames ?? 2;
  }

  connect(): void {
    this.client = new Client(this.config.host, this.config.port);
  }

  send(grid: CannonState[]): void {
    this.frameCount++;
    if (this.frameCount % this.sendInterval !== 0) return;
    if (!this.client) return;

    const messages = encodeFB4Messages(grid, this.config.serialMap, this.prevGrid);
    this.prevGrid = grid.map(c => ({ h: c.h, s: c.s, b: c.b }));

    if (messages.length === 0) return;

    if (DEBUG_OSC) {
      const sample = messages.slice(0, 3);
      const lines = sample.map(m => `    ${m.address} = ${m.value}`);
      console.log(`  [OSC→FB4] frame ${this.frameCount} | ${messages.length} msgs to ${this.config.host}:${this.config.port}`);
      for (const line of lines) console.log(line);
      if (messages.length > 3) console.log(`    ... +${messages.length - 3} more`);
    }
    for (const msg of messages) {
      sendFloats(this.client, msg.address, msg.value);
    }
  }

  close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}

// ═══════════════════════════════════════════════════
// Routed OSC Output — dispatches by per-cannon routing config
// ═══════════════════════════════════════════════════

/**
 * Declares a named OSC target (a BEYOND instance or FB4 device).
 */
export interface OscTarget {
  type: 'beyond' | 'fb4';
  host: string;
  port: number;
}

/**
 * Maps a single logical cannon to its physical target.
 */
export interface CannonRoute {
  /** Logical grid index. */
  logical: number;
  /** Name of the target in the targets map. */
  target: string;
  /** Grid coordinates for debugging. */
  row?: number;
  col?: number;
  /** Human-readable label. */
  label?: string;
  /** BEYOND projector list index (required when target type is 'beyond'). */
  projectorIndex?: number;
  /** Cannon (default) or projector. Only projectors receive `sendProjector` controls. */
  kind?: FixtureKind;
  /** FB4 5-digit serial (required when target type is 'fb4'). */
  fb4Serial?: string;
  /** If true, this cannon is intentionally disabled in software. */
  safeDisabled?: boolean;
}

/**
 * Full routing configuration loaded from a JSON file.
 */
export interface RoutingConfig {
  targets: Record<string, OscTarget>;
  cannons: CannonRoute[];
  /** Global send rate (Hz). Default: 30. */
  flushHz?: number;
}

/**
 * Creates an OutputAdapter from a routing config.
 * Internally builds BEYOND and FB4 adapters for each target
 * and dispatches per-cannon state to the right adapter.
 */
export function createRoutedOutput(config: RoutingConfig): RoutedOscOutput {
  return new RoutedOscOutput(config);
}

export class RoutedOscOutput implements OutputAdapter {
  private adapters: Map<string, BeyondOscOutput | FB4OscOutput> = new Map();
  private beyondAdapters: BeyondOscOutput[] = [];
  private projectorIndices = new Set<number>();
  private frameCount = 0;
  private sendInterval: number;

  constructor(config: RoutingConfig) {
    const flushHz = config.flushHz ?? 30;
    this.sendInterval = Math.max(1, Math.round(60 / flushHz));

    const beyondMaps: Record<string, Record<number, number>> = {};
    const fb4Maps: Record<string, Record<number, string>> = {};

    for (const cannon of config.cannons) {
      if (cannon.safeDisabled) continue;
      const target = config.targets[cannon.target];
      if (!target) continue;
      if (cannon.kind === 'projector') this.projectorIndices.add(cannon.logical);

      if (target.type === 'beyond' && cannon.projectorIndex !== undefined) {
        if (!beyondMaps[cannon.target]) beyondMaps[cannon.target] = {};
        beyondMaps[cannon.target][cannon.logical] = cannon.projectorIndex;
      } else if (target.type === 'fb4' && cannon.fb4Serial !== undefined) {
        if (!fb4Maps[cannon.target]) fb4Maps[cannon.target] = {};
        fb4Maps[cannon.target][cannon.logical] = cannon.fb4Serial;
      }
    }

    for (const [name, projectorMap] of Object.entries(beyondMaps)) {
      const target = config.targets[name];
      const adapter = new BeyondOscOutput({
        host: target.host,
        port: target.port,
        projectorMap,
        sendEveryNFrames: 1
      });
      this.adapters.set(name, adapter);
      this.beyondAdapters.push(adapter);
    }

    for (const [name, serialMap] of Object.entries(fb4Maps)) {
      const target = config.targets[name];
      this.adapters.set(name, new FB4OscOutput({
        host: target.host,
        port: target.port,
        serialMap,
        sendEveryNFrames: 1
      }));
    }
  }

  /** Initialize all sub-adapter UDP clients. */
  connect(): void {
    for (const adapter of this.adapters.values()) {
      adapter.connect();
    }
  }

  send(grid: CannonState[]): void {
    this.frameCount++;
    if (this.frameCount % this.sendInterval !== 0) return;

    for (const adapter of this.adapters.values()) {
      adapter.send(grid);
    }
  }

  /** Projector controls go only to BEYOND adapters, and only for `kind: 'projector'` routes. */
  sendProjector(controls: Record<number, ProjectorControl>): void {
    const filtered: Record<number, ProjectorControl> = {};
    for (const [key, control] of Object.entries(controls)) {
      const idx = Number(key);
      if (this.projectorIndices.has(idx)) filtered[idx] = control;
    }
    if (Object.keys(filtered).length === 0) return;
    for (const adapter of this.beyondAdapters) adapter.sendProjector(filtered);
  }

  sendCue(command: ProjectorCueCommand): void {
    for (const adapter of this.beyondAdapters) adapter.sendCue(command);
  }

  /** Logical indices routed as projectors. */
  get projectorLogicals(): number[] {
    return [...this.projectorIndices].sort((a, b) => a - b);
  }

  close(): void {
    for (const adapter of this.adapters.values()) {
      adapter.close();
    }
    this.adapters.clear();
    this.beyondAdapters = [];
  }

  /** Returns the list of active target names for inspection. */
  get targetNames(): string[] {
    return [...this.adapters.keys()];
  }
}
