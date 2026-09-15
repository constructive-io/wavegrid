import { loadWavegridConfig } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';

import { signJwt } from '../src/jwt';
import { startServer, type ServerHandle } from '../src/server';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PoolMsg {
  type: 'pool';
  active: boolean;
  touches: number;
  sources: Array<{ x: number; y: number; energy: number }>;
  settings: { mode: string; motion: number; spread: number; persistence: number; hold?: boolean };
}

interface Client {
  ws: WebSocket;
  pool: PoolMsg | null;
  paints: Array<{ idx: number; h: number; s: number; b: number }>[];
  commands: string[];
  send: (msg: Record<string, unknown>) => void;
}

function connect(port: number, token: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`);
    const client: Client = {
      ws,
      pool: null,
      paints: [],
      commands: [],
      send: (msg) => ws.send(JSON.stringify(msg))
    };
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'pool') client.pool = msg as PoolMsg;
      if (msg.type === 'command') {
        client.commands.push(msg.action);
        if (msg.action === 'paint') client.paints.push(msg.cells);
      }
    });
    ws.once('open', () => resolve(client));
    ws.once('error', reject);
  });
}

describe('server-owned pool', () => {
  const saved = { ...process.env };
  let handle: ServerHandle;
  let port: number;
  let token: string;

  const maxB = () => Math.max(...handle.grid.map((c) => c.b));
  const maxTargetB = () => Math.max(...handle.grid.map((c) => c.targetB));
  const centre = () => handle.grid[handle.grid.length - 1];

  beforeAll(async () => {
    process.env.APPSTASH_BASE_DIR = mkdtempSync(join(tmpdir(), 'wg-pool-store-'));
    process.env.WAVEGRID_PROJECT = 'grace';
    process.env.WG_STATE_DIR = mkdtempSync(join(tmpdir(), 'wg-pool-state-'));
    process.env.WG_JWT_SECRET = 'test-secret';
    delete process.env.WAVEGRID_LAYOUT;
    delete process.env.WAVEGRID_MODE;

    const store = openStore();
    store.createProject('grace', { layout: { preset: 'grace-cathedral' }, server: { host: '127.0.0.1', port: 0 } });
    store.setActiveProject('grace');
    const session = store.createSession('grace', { username: 'ben', role: 'operator', ttlMs: 60_000 });
    token = signJwt('ben', { sid: session.id, role: 'operator', ttlSec: 3600 });

    handle = startServer(loadWavegridConfig(), { uiDir: null, advertise: false });
    await handle.ready;
    const address = handle.server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  afterAll(() => {
    handle.stop();
    process.env = { ...saved };
  });

  beforeEach(async () => {
    handle.send({ type: 'clear' });
    handle.send({ type: 'pool_settings', mode: 'flow', motion: 0.35, spread: 0.5, persistence: 0.55, hold: false });
    handle.send({ type: 'smoothness', value: 0.3 });
    handle.send({ type: 'attack', value: 1 });
    await wait(50);
  });

  it('a finger on the centre lights the centre cannon and relays paint to receivers', async () => {
    const ui = await connect(port, token);
    const receiver = await connect(port, token);
    ui.send({ type: 'pool_touch', id: 1, phase: 'down', x: 0.5, y: 0.5, color: { hue: 200, sat: 80, bright: 100 } });
    await wait(700);

    expect(centre().b).toBeGreaterThan(10);
    expect(Math.round(centre().h)).toBeCloseTo(200, -1);
    expect(receiver.paints.length).toBeGreaterThan(3);
    const centreIdx = handle.grid.length - 1;
    expect(receiver.paints.some((cells) => cells.some((c) => c.idx === centreIdx && c.b > 0))).toBe(true);
    expect(ui.pool?.active).toBe(true);
    expect(ui.pool?.touches).toBe(1);

    ui.ws.close();
    receiver.ws.close();
  });

  it('keeps the water moving after the iPad disconnects, with its fingers lifted', async () => {
    const ui = await connect(port, token);
    const watcher = await connect(port, token);
    ui.send({ type: 'pool_settings', mode: 'flow', persistence: 1 });
    ui.send({ type: 'pool_touch', id: 7, phase: 'down', x: 0.5, y: 0.5, color: { hue: 30, sat: 90, bright: 100 } });
    await wait(600);
    const lit = centre().b;
    expect(lit).toBeGreaterThan(10);

    ui.ws.close();
    await wait(400);

    expect(watcher.pool?.touches).toBe(0);
    expect(watcher.pool?.active).toBe(true);
    expect(watcher.pool?.sources.length).toBeGreaterThan(0);
    // Long linger: still glowing, dissolving gently rather than snapping off.
    expect(centre().b).toBeGreaterThan(lit * 0.5);
    const before = centre().b;
    await wait(200);
    expect(centre().b).not.toBe(before);
    watcher.ws.close();
  });

  it('clear blacks out the pool and it stays dark', async () => {
    const ui = await connect(port, token);
    ui.send({ type: 'pool_touch', id: 1, phase: 'down', x: 0.5, y: 0.5, color: { hue: 0, sat: 100, bright: 100 } });
    await wait(500);
    expect(maxB()).toBeGreaterThan(10);

    ui.send({ type: 'clear' });
    await wait(100);
    expect(maxTargetB()).toBe(0);
    expect(ui.pool?.active).toBe(false);
    expect(ui.pool?.sources).toEqual([]);
    await wait(400);
    expect(maxTargetB()).toBe(0);
    expect(maxB()).toBe(0);
    ui.ws.close();
  });

  it('animation stop ends the pool; a new touch takes it back', async () => {
    const ui = await connect(port, token);
    ui.send({ type: 'pool_touch', id: 1, phase: 'down', x: 0.5, y: 0.5, color: { hue: 120, sat: 100, bright: 100 } });
    await wait(400);
    expect(maxB()).toBeGreaterThan(5);

    ui.send({ type: 'animation', name: 'stop' });
    await wait(100);
    expect(ui.pool?.active).toBe(false);
    expect(ui.commands).toContain('stop');
    const frozen = handle.grid.map((c) => c.targetB);
    await wait(200);
    // Stop freezes targets exactly like stopping an animation does — no drift.
    expect(handle.grid.map((c) => c.targetB)).toEqual(frozen);

    ui.send({ type: 'pool_touch', id: 2, phase: 'down', x: 0.5, y: 0.5, color: { hue: 120, sat: 100, bright: 100 } });
    await wait(100);
    expect(ui.pool?.active).toBe(true);
    ui.ws.close();
  });

  it('starting an animation supersedes the pool, and a touch supersedes the animation', async () => {
    const ui = await connect(port, token);
    ui.send({ type: 'pool_touch', id: 1, phase: 'down', x: 0.5, y: 0.5, color: { hue: 120, sat: 100, bright: 100 } });
    await wait(300);
    ui.send({ type: 'animation', name: 'rainbow' });
    await wait(150);
    expect(ui.pool?.active).toBe(false);
    expect(ui.pool?.sources).toEqual([]);
    expect(ui.commands).toContain('setAnimation');

    ui.send({ type: 'pool_touch', id: 3, phase: 'down', x: 0.5, y: 0.5, color: { hue: 120, sat: 100, bright: 100 } });
    await wait(150);
    expect(ui.pool?.active).toBe(true);
    // A saved-state round trip shows the animation is really off.
    let settings: { animation: string | null } | null = null;
    const probe = await connect(port, token);
    probe.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'settings') settings = msg;
    });
    await wait(100);
    expect(settings?.animation ?? null).toBeNull();
    probe.ws.close();
    ui.ws.close();
  });

  it('paint (cannon) takes over from the pool without the pool writing over it', async () => {
    const ui = await connect(port, token);
    ui.send({ type: 'pool_touch', id: 1, phase: 'down', x: 0.5, y: 0.5, color: { hue: 120, sat: 100, bright: 100 } });
    await wait(300);
    ui.send({ type: 'cannon', index: 0, h: 10, s: 20, b: 30 });
    await wait(200);
    expect(ui.pool?.active).toBe(false);
    expect(handle.grid[0].targetH).toBe(10);
    expect(handle.grid[0].targetB).toBe(30);
    ui.ws.close();
  });

  it('pool settings are shared, validated and echoed to every UI', async () => {
    const a = await connect(port, token);
    const b = await connect(port, token);
    a.send({ type: 'pool_settings', mode: 'spiral', motion: 2, spread: -1, persistence: 'x' });
    await wait(80);
    expect(b.pool?.settings.mode).toBe('spiral');
    expect(b.pool?.settings.motion).toBe(1);
    expect(b.pool?.settings.spread).toBe(0);
    expect(b.pool?.settings.persistence).toBeCloseTo(0.55);
    expect(b.pool?.settings.hold).toBe(false);
    a.send({ type: 'pool_settings', hold: 'yes' });
    await wait(80);
    expect(b.pool?.settings.hold).toBe(false);
    a.send({ type: 'pool_settings', hold: true });
    await wait(80);
    expect(b.pool?.settings.hold).toBe(true);
    a.ws.close();
    b.ws.close();
  });

  it('fade (smoothness) still filters the pool: a slower alpha rises more slowly', async () => {
    const ui = await connect(port, token);
    handle.send({ type: 'smoothness', value: 0.01 });
    ui.send({ type: 'pool_touch', id: 1, phase: 'down', x: 0.5, y: 0.5, color: { hue: 0, sat: 100, bright: 100 } });
    await wait(300);
    const slow = centre().b;
    expect(centre().targetB).toBeGreaterThan(slow + 5);
    ui.ws.close();
  });
});
