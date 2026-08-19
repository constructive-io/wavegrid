/**
 * Hand-driven OSC, for debugging what actually reaches Pangolin.
 *
 * The adapters in this package send a whole grid, 30 times a second, which is
 * exactly wrong for answering "did BEYOND get anything at all?" and "which zone
 * is fixture 7?". These are the one-shot primitives: send a single message,
 * light one fixture at a time, and listen to a port to see the stream as the
 * hardware would see it.
 *
 * Output only ever goes where it is aimed — nothing here discovers or
 * broadcasts to hardware on its own.
 */
import { Client, Message, Server } from 'node-osc';

import type { CannonState } from './osc-adapters';

/** A typed OSC argument. The adapters here send floats, so that is the default
 *  for anything numeric: an int where the receiver expects a float tends to be
 *  dropped without complaint, which is miserable to debug. */
export interface OscArg {
  type: 'float' | 'integer' | 'string';
  value: number | string;
}

/**
 * Parse a command-line token into a typed OSC argument.
 *
 *   `255`      → float 255      (BEYOND/FB4 want floats)
 *   `i:3`      → integer 3
 *   `f:0.5`    → float 0.5
 *   `s:hello`  → string
 *   `hello`    → string
 */
export function parseOscArg(token: string): OscArg {
  const typed = /^([ifs]):(.*)$/.exec(token);
  const raw = typed ? typed[2] : token;
  const tag = typed?.[1];

  if (tag === 's') return { type: 'string', value: raw };
  if (tag === 'i') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Not a number: ${token}`);
    return { type: 'integer', value: Math.round(n) };
  }
  if (tag === 'f') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Not a number: ${token}`);
    return { type: 'float', value: n };
  }
  const n = Number(raw);
  if (raw.trim() !== '' && Number.isFinite(n)) return { type: 'float', value: n };
  return { type: 'string', value: raw };
}

/**
 * Expand an index spec into indices: `0-11`, `0,3,7`, `5`, or a mix.
 * Used for "which zones / fixtures should the probe walk".
 */
export function parseIndexRange(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const piece = part.trim();
    if (piece === '') continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(piece);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      const step = from <= to ? 1 : -1;
      for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(i);
      continue;
    }
    const n = Number(piece);
    if (!Number.isInteger(n) || n < 0) throw new Error(`Not an index or range: ${piece}`);
    out.push(n);
  }
  if (out.length === 0) throw new Error(`No indices in "${spec}"`);
  return out;
}

/** A grid with exactly one fixture lit — the probe's frame. Passing `lit: null`
 *  gives the blackout frame the probe finishes on. */
export function probeGrid(count: number, lit: number | null, color: CannonState): CannonState[] {
  const dark: CannonState = { h: color.h, s: color.s, b: 0 };
  return Array.from({ length: count }, (_, i) => (i === lit ? { ...color } : { ...dark }));
}

/** Send one OSC message and close the socket. */
export async function sendOscMessage(
  host: string,
  port: number,
  address: string,
  args: OscArg[]
): Promise<void> {
  const client = new Client(host, port);
  const msg = new Message(address);
  for (const arg of args) msg.append(arg);
  try {
    await client.send(msg);
  } finally {
    await client.close();
  }
}

export interface OscListener {
  close: () => Promise<void>;
}

/** What a received message carries: address, arguments, and who sent it. */
export interface ReceivedOsc {
  address: string;
  args: unknown[];
  from: string;
}

/**
 * Listen on a UDP port and report every OSC message that arrives. Point the
 * receiver's OSC target at this to see the exact stream wavegrid emits, or bind
 * the port BEYOND replies on to see what it says back.
 */
export async function listenForOsc(
  port: number,
  host: string,
  onMessage: (msg: ReceivedOsc) => void
): Promise<OscListener> {
  const server = new Server(port, host);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  server.on('message', (msg: unknown[], rinfo: { address: string; port: number }) => {
    const [address, ...args] = msg;
    onMessage({ address: String(address), args, from: `${rinfo.address}:${rinfo.port}` });
  });
  return { close: () => Promise.resolve(server.close()) };
}
