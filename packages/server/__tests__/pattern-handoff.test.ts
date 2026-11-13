import { loadWavegridConfig } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';

import { signJwt } from '../src/jwt';
import { startServer, type ServerHandle } from '../src/server';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CODE = '({ render: function (ctx) { for (var i = 0; i < ctx.count; i++) ctx.set(i, 200, 100, ctx.p.level || 50); } })';

interface Client {
  ws: WebSocket;
  messages: Record<string, unknown>[];
  send: (msg: Record<string, unknown>) => void;
}

function connect(port: number, token: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`);
    const client: Client = { ws, messages: [], send: (msg) => ws.send(JSON.stringify(msg)) };
    ws.on('message', (raw) => client.messages.push(JSON.parse(raw.toString())));
    ws.once('open', () => resolve(client));
    ws.once('error', reject);
  });
}

const lastPatternState = (c: Client) => [...c.messages].reverse().find((m) => m.type === 'pattern_state');

describe('pattern hand-off', () => {
  const saved = { ...process.env };
  let handle: ServerHandle;
  let port: number;
  let token: string;

  beforeAll(async () => {
    process.env.APPSTASH_BASE_DIR = mkdtempSync(join(tmpdir(), 'wg-pat-store-'));
    process.env.WAVEGRID_PROJECT = 'palace';
    process.env.WG_STATE_DIR = mkdtempSync(join(tmpdir(), 'wg-pat-state-'));
    process.env.WG_JWT_SECRET = 'test-secret';
    delete process.env.WAVEGRID_LAYOUT;
    delete process.env.WAVEGRID_MODE;
    const store = openStore();
    store.createProject('palace', { layout: { preset: 'interleaved-12x2' }, server: { host: '127.0.0.1', port: 0 } });
    store.setActiveProject('palace');
    const session = store.createSession('palace', { username: 'ben', role: 'operator', ttlMs: 60_000 });
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

  it('a client connecting mid-pattern is sent the running pattern with its current params', async () => {
    const ui = await connect(port, token);
    ui.send({ type: 'evalPattern', code: CODE, params: { level: 40 } });
    await wait(100);
    ui.send({ type: 'setPatternParam', name: 'level', value: 70 });
    await wait(100);
    const late = await connect(port, token);
    await wait(150);
    const evalMsg = late.messages.find((m) => m.type === 'command' && m.action === 'evalPattern');
    expect(evalMsg).toMatchObject({ code: CODE, params: { level: 70 } });
    ui.ws.close();
    late.ws.close();
  });

  it('a plain cannon paint stops the brain pattern, as it does on the receiver', async () => {
    const ui = await connect(port, token);
    ui.send({ type: 'evalPattern', code: CODE, params: {} });
    await wait(200);
    expect(lastPatternState(ui)).toMatchObject({ active: true });
    ui.send({ type: 'cannon', index: 0, h: 0, s: 100, b: 100 });
    await wait(200);
    expect(lastPatternState(ui)).toMatchObject({ active: false });
    const late = await connect(port, token);
    await wait(150);
    expect(late.messages.some((m) => m.type === 'command' && m.action === 'evalPattern')).toBe(false);
    ui.ws.close();
    late.ws.close();
  });
});
