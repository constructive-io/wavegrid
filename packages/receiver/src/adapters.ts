/**
 * Adapter interfaces for the Illuminate Receiver.
 *
 * The Receiver is a pure state engine — it doesn't know or care where
 * input comes from or where output goes. These adapters make both sides
 * pluggable so the module can be published today and connected to any
 * hardware/protocol later by instantiating the right adapter class.
 */

import type { ProjectorControl, ProjectorCueCommand } from '@wavegrid/osc';
import { EventEmitter } from 'events';

import { CannonState } from './filter';

// ═══════════════════════════════════════════════════
// Output Adapter (where filtered state goes)
// ═══════════════════════════════════════════════════

/**
 * Translates a logical grid index (0–48) to a hardware address string.
 * Examples:
 *   (index) => `/beyond/laser/${index + 1}`
 *   (index) => `dmx/fixture/${index * 3}`
 */
export type AddressMapping = (index: number) => string;

/**
 * Generic output adapter interface.
 * Implement this to send filtered grid state to any target:
 * OSC/BEYOND, DMX, Art-Net, MQTT, HTTP, file, etc.
 */
export interface OutputAdapter {
  /** Called every tick (~60fps) with the full filtered grid state. */
  send(grid: CannonState[]): void;
  /** Projector-only controls (BEYOND zone livecontrol), keyed by shard-local index. Optional. */
  sendProjector?(controls: Record<number, ProjectorControl>): void;
  /** Show-level BEYOND cue command. Optional. */
  sendCue?(command: ProjectorCueCommand): void;
  /** Clean up resources (close sockets, etc). */
  close(): void;
}

/**
 * Configuration shared by all output adapters that use address mapping.
 */
export interface MappedOutputConfig {
  /** Translate grid index → hardware address. */
  mapping?: AddressMapping;
}

// ═══════════════════════════════════════════════════
// Input Adapter (where state comes from)
// ═══════════════════════════════════════════════════

/**
 * Generic input adapter interface.
 * Implement this to receive commands from any source:
 * WebSocket, MQTT, HTTP polling, serial, etc.
 *
 * Emits:
 *   'command' (cmd: CommandMessage) — command received
 *   'connected' — upstream connection established
 *   'disconnected' — upstream connection lost
 */
export interface InputAdapter {
  /** Start receiving state. */
  connect(): void;
  /** Stop receiving and clean up. */
  disconnect(): void;
  /** Register event listener. */
  on(event: 'state', listener: (grid: CannonState[]) => void): this;
  on(event: 'command', listener: (cmd: any) => void): this;
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
  /** Remove event listener. */
  off(event: string, listener: (...args: unknown[]) => void): this;
}

// ═══════════════════════════════════════════════════
// Built-in Output Adapters
// ═══════════════════════════════════════════════════

/**
 * Console output adapter — logs state periodically for dev/debug.
 * Use this when no hardware is connected.
 */
export class ConsoleOutput implements OutputAdapter {
  private frameCount = 0;
  private logInterval: number;

  constructor(opts: { logEveryNFrames?: number } = {}) {
    this.logInterval = opts.logEveryNFrames ?? 60;
  }

  send(grid: CannonState[]): void {
    this.frameCount++;
    if (this.frameCount % this.logInterval === 0) {
      const sample = grid[0];
      process.stdout.write(
        `\r  ◈ frame ${this.frameCount}  sample[0]: h=${sample.h.toFixed(1)} s=${sample.s.toFixed(1)} b=${sample.b.toFixed(1)}  `
      );
    }
  }

  close(): void {
    console.log('\n  ◈ Console output closed');
  }
}

/**
 * Callback output adapter — calls a user-provided function each tick.
 * Useful for custom integrations, testing, or piping to another system.
 */
export class CallbackOutput implements OutputAdapter {
  private fn: (grid: CannonState[]) => void;

  constructor(fn: (grid: CannonState[]) => void) {
    this.fn = fn;
  }

  send(grid: CannonState[]): void {
    this.fn(grid);
  }

  close(): void {
    // nothing to clean up
  }
}

/**
 * Multi-output adapter — fans out to multiple output adapters.
 * Use this to send to both console and hardware simultaneously.
 *
 * Example:
 *   new MultiOutput([new ConsoleOutput(), new BeyondOscOutput(config)])
 */
export class MultiOutput implements OutputAdapter {
  private outputs: OutputAdapter[];

  constructor(outputs: OutputAdapter[]) {
    this.outputs = outputs;
  }

  sendProjector(controls: Record<number, ProjectorControl>): void {
    for (const out of this.outputs) out.sendProjector?.(controls);
  }

  sendCue(command: ProjectorCueCommand): void {
    for (const out of this.outputs) out.sendCue?.(command);
  }

  send(grid: CannonState[]): void {
    for (const out of this.outputs) {
      out.send(grid);
    }
  }

  close(): void {
    for (const out of this.outputs) {
      out.close();
    }
  }
}

// ═══════════════════════════════════════════════════
// Built-in Input Adapters
// ═══════════════════════════════════════════════════

/**
 * WebSocket input adapter — connects to an upstream server and
 * receives state snapshots as JSON messages.
 *
 * Expected message format: { type: "state", grid: CannonState[] }
 * This is what the Illuminate simulator broadcasts.
 */
export class WebSocketInput extends EventEmitter implements InputAdapter {
  private url: string;
  private ws: import('ws').WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectInterval: number;
  private _connected = false;
  private _running = false;

  constructor(opts: { url: string; reconnectInterval?: number }) {
    super();
    this.url = opts.url;
    this.reconnectInterval = opts.reconnectInterval ?? 2000;
  }

  get connected(): boolean { return this._connected; }

  /** Send a JSON message upstream (e.g. the receiver's `hello`). No-op if not connected. */
  send(obj: unknown): void {
    if (this.ws && this._connected) {
      try { this.ws.send(JSON.stringify(obj)); } catch { /* best effort */ }
    }
  }

  connect(): void {
    if (this._running) return;
    this._running = true;
    this.doConnect();
  }

  disconnect(): void {
    this._running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  private doConnect() {
    // Dynamic import to avoid issues in environments without ws
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WebSocket } = require('ws') as typeof import('ws');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this._connected = true;
        this.emit('connected');
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'state' && Array.isArray(msg.grid)) {
            this.emit('state', msg.grid as CannonState[]);
          } else if (msg.type === 'command' && msg.action) {
            this.emit('command', msg);
          }
        } catch {
          // ignore malformed messages
        }
      });

      this.ws.on('close', () => {
        this._connected = false;
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        this.scheduleReconnect();
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this._running) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this._running) this.doConnect();
    }, this.reconnectInterval);
  }
}

// ═══════════════════════════════════════════════════
// WebSocket Output Adapter
// ═══════════════════════════════════════════════════

/**
 * WebSocket server output adapter — broadcasts filtered state to
 * all connected downstream clients.
 *
 * Use this to relay the receiver's output to other systems, UIs,
 * or a chain of downstream receivers.
 */
export class WebSocketOutput implements OutputAdapter {
  private wss: import('ws').WebSocketServer | null = null;
  private port: number;
  private mapping: AddressMapping | null;
  private broadcastInterval: number;
  private frameCount = 0;

  constructor(opts: { port: number; mapping?: AddressMapping; broadcastEveryNFrames?: number }) {
    this.port = opts.port;
    this.mapping = opts.mapping ?? null;
    this.broadcastInterval = opts.broadcastEveryNFrames ?? 1;
  }

  /** Start the WebSocket server. Call this before the receiver starts ticking. */
  listen(): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WebSocketServer } = require('ws') as typeof import('ws');
    this.wss = new WebSocketServer({ port: this.port });
    console.log(`  \u25C8 WebSocket output listening on :${this.port}`);
  }

  send(grid: CannonState[]): void {
    if (!this.wss) return;
    this.frameCount++;
    if (this.frameCount % this.broadcastInterval !== 0) return;

    const payload = this.mapping
      ? JSON.stringify({ type: 'state', grid, mapping: grid.map((_, i) => this.mapping!(i)) })
      : JSON.stringify({ type: 'state', grid });

    for (const client of this.wss.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }

  close(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      console.log(`  \u25C8 WebSocket output closed`);
    }
  }
}
