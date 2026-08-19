import { loadWavegridConfig } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';

import { signJwt } from '../src/jwt';
import { startServer, type ServerHandle } from '../src/server';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(port: number, token: string): Promise<{ ws: WebSocket; states: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`);
    let states = 0;
    ws.on('message', (raw) => {
      try {
        if ((JSON.parse(raw.toString()) as { type?: string }).type === 'state') states++;
      } catch {
        // Ignore malformed test traffic.
      }
    });
    ws.once('open', () => resolve({ ws, get states() { return states; } }));
    ws.once('error', reject);
  });
}

describe('WebSocket hub resilience', () => {
  const saved = { ...process.env };
  let handle: ServerHandle;
  let port: number;

  beforeAll(async () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'wg-ws-store-'));
    const stateDir = mkdtempSync(join(tmpdir(), 'wg-ws-state-'));
    process.env.APPSTASH_BASE_DIR = storeDir;
    process.env.WAVEGRID_PROJECT = 'demo';
    process.env.WG_STATE_DIR = stateDir;
    process.env.WG_JWT_SECRET = 'test-secret';
    process.env.WG_HEARTBEAT_MS = '40';
    delete process.env.WAVEGRID_LAYOUT;
    delete process.env.WAVEGRID_MODE;

    const store = openStore();
    store.createProject('demo', { layout: { preset: 'grid-7x7' }, server: { host: '127.0.0.1', port: 0 } });
    store.setActiveProject('demo');

    handle = startServer(loadWavegridConfig(), { uiDir: null, advertise: false });
    await handle.ready;
    const address = handle.server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  afterAll(() => {
    handle.stop();
    process.env = { ...saved };
  });

  function tokenFor(sid: string, username: string): string {
    return signJwt(username, { sid, role: 'operator', ttlSec: 3600 });
  }

  function createSession(username: string) {
    return openStore().createSession('demo', {
      username,
      role: 'operator',
      ttlMs: 60_000
    });
  }

  it('continues the fanout after one server-side send fails', async () => {
    const firstSession = createSession('first');
    const secondSession = createSession('second');
    const first = await connect(port, tokenFor(firstSession.id, firstSession.username));
    const second = await connect(port, tokenFor(secondSession.id, secondSession.username));
    await wait(30);

    const originalSend = WebSocket.prototype.send;
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown) => uncaught.push(error);
    let victim: WebSocket | null = null;
    process.on('uncaughtException', onUncaught);
    Object.defineProperty(WebSocket.prototype, 'send', {
      configurable: true,
      writable: true,
      value: function(this: WebSocket, ...args: Parameters<typeof originalSend>) {
        victim ??= this;
        if (this === victim) throw new Error('simulated broken peer');
        return Reflect.apply(originalSend, this, args);
      }
    });
    try {
      await wait(100);
      expect(second.states).toBeGreaterThan(0);
      expect(uncaught).toEqual([]);
    } finally {
      Object.defineProperty(WebSocket.prototype, 'send', {
        configurable: true,
        writable: true,
        value: originalSend
      });
      process.removeListener('uncaughtException', onUncaught);
      first.ws.close();
      second.ws.close();
    }
  });

  it('closes only a revoked session while other clients keep receiving state', async () => {
    const revoked = createSession('revoked');
    const survivor = createSession('survivor');
    const revokedClient = await connect(port, tokenFor(revoked.id, revoked.username));
    const survivorClient = await connect(port, tokenFor(survivor.id, survivor.username));
    const closed = new Promise<number>((resolve) => revokedClient.ws.once('close', (code) => resolve(code)));

    openStore().revokeSession('demo', revoked.id);
    expect(await closed).toBe(4001);
    await wait(80);
    expect(survivorClient.states).toBeGreaterThan(0);
    survivorClient.ws.close();
  });

  it('rejects a token whose session was revoked before reconnecting', async () => {
    const session = createSession('reconnect');
    const token = tokenFor(session.id, session.username);
    openStore().revokeSession('demo', session.id);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`);
    const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
    ws.on('error', () => {
      // Browsers surface the rejected upgrade as a generic socket error.
    });

    expect(await closed).toBe(1006);
  });
});
