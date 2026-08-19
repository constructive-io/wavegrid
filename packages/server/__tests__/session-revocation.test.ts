import { loadWavegridConfig } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';

import { startServer, type ServerHandle } from '../src/server';

/**
 * Revocation has to bite on the live socket, not just on the next request: an
 * operator booting a phone off the show watched it keep painting lasers.
 */
interface Client {
  ws: WebSocket;
  /** Resolves with the close code once the brain drops us. */
  closed: Promise<{ code: number; reason: string }>;
}

/** Every client opened here, so none is left holding the event loop open. */
const opened: WebSocket[] = [];

function connect(port: number, token: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`);
    opened.push(ws);
    const closed = new Promise<{ code: number; reason: string }>((r) => {
      ws.on('close', (code, reason) => r({ code, reason: reason.toString() }));
    });
    ws.on('open', () => resolve({ ws, closed }));
    ws.on('error', reject);
  });
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(() => r(), ms));

/** The close event, or null if the socket is still up after `ms`. */
async function closeWithin(
  client: Client,
  ms: number
): Promise<{ code: number; reason: string } | null> {
  const timeout = wait(ms).then((): null => null);
  return Promise.race([client.closed, timeout]);
}

describe('session revocation', () => {
  const saved = { ...process.env };
  let handle: ServerHandle;
  let port: number;
  let base: string;

  async function login(username: string, password: string): Promise<string> {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const body = await res.json();
    expect(body.token).toBeTruthy();
    return body.token as string;
  }

  beforeAll(async () => {
    const store = mkdtempSync(join(tmpdir(), 'wg-revoke-store-'));
    const state = mkdtempSync(join(tmpdir(), 'wg-revoke-state-'));
    process.env.APPSTASH_BASE_DIR = store;
    process.env.WAVEGRID_PROJECT = 'demo';
    process.env.WG_STATE_DIR = state;
    process.env.WG_JWT_SECRET = 'revoke-test-secret';
    // The heartbeat carries the revocation sweep; keep it short so the
    // out-of-process case doesn't wait out a show-tuned 15s.
    process.env.WG_HEARTBEAT_MS = '50';
    delete process.env.WAVEGRID_LAYOUT;
    delete process.env.WAVEGRID_MODE;
    delete process.env.LIGHT_MAP_CONFIG;

    const s = openStore();
    s.createProject('demo', {
      layout: { preset: 'grid-7x7' },
      server: { host: '127.0.0.1', port: 0 }
    });
    s.setActiveProject('demo');
    s.addUser('demo', 'boss', 'bosspw'); // first user → admin
    s.addUser('demo', 'alice', 'alicepw');
    s.addUser('demo', 'bob', 'bobpw');

    handle = startServer(loadWavegridConfig(), { uiDir: null, advertise: false });
    await handle.ready;
    const addr = handle.server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    for (const ws of opened) ws.terminate();
    handle.stop();
    process.env = { ...saved };
  });

  it('drops the revoked user’s live socket and leaves everyone else connected', async () => {
    const [adminToken, aliceToken, bobToken] = await Promise.all([
      login('boss', 'bosspw'),
      login('alice', 'alicepw'),
      login('bob', 'bobpw')
    ]);
    const alice = await connect(port, aliceToken);
    const bob = await connect(port, bobToken);

    const aliceSession = openStore()
      .listSessions('demo')
      .find((s) => s.username === 'alice');
    expect(aliceSession).toBeDefined();

    const res = await fetch(`${base}/api/admin/sessions/${aliceSession!.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(200);

    const closed = await closeWithin(alice, 2000);
    expect(closed?.code).toBe(4001);
    expect(closed?.reason).toBe('session revoked');
    expect(await closeWithin(bob, 200)).toBeNull();

    // Her token is finished for HTTP too, and can't open a new socket.
    const me = await fetch(`${base}/api/me`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    expect(me.status).toBe(401);
    await expect(connect(port, aliceToken)).rejects.toThrow(/401/);

    // Bob is untouched: still authenticated on HTTP, still driving the show.
    const bobMe = await fetch(`${base}/api/me`, {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    expect(bobMe.status).toBe(200);
    bob.ws.close();
  });

  it('drops a socket when the session is revoked out-of-process (desktop app)', async () => {
    const token = await login('bob', 'bobpw');
    const client = await connect(port, token);

    // The desktop app revokes by writing the same store — no HTTP call to hook.
    expect(openStore().revokeUserSessions('demo', 'bob')).toBeGreaterThan(0);

    const closed = await closeWithin(client, 2000);
    expect(closed?.code).toBe(4001);
  });

  it('signing out ends the session, so the token is dead everywhere', async () => {
    const token = await login('alice', 'alicepw');
    const client = await connect(port, token);

    const res = await fetch(`${base}/api/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status).toBe(200);

    expect(openStore().listSessions('demo').some((s) => s.username === 'alice')).toBe(false);
    expect((await closeWithin(client, 2000))?.code).toBe(4001);
    const me = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(me.status).toBe(401);
  });
});
