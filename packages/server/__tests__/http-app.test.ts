import { loadWavegridConfig } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import * as http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';

import { createHttpApp } from '../src/http-app';

/** Boot the handler on an ephemeral port and return its base URL + a closer. */
async function boot(uiDir: string | null) {
  const resolved = loadWavegridConfig();
  const handle = createHttpApp(resolved, { uiDir });
  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    layout: resolved.layout,
    close: () => new Promise<void>((r) => server.close(() => r()))
  };
}

describe('createHttpApp', () => {
  const saved = { ...process.env };
  let base: string;
  let close: () => Promise<void>;
  let layout: { count: number };

  beforeAll(async () => {
    const store = mkdtempSync(join(tmpdir(), 'wg-http-store-'));
    const state = mkdtempSync(join(tmpdir(), 'wg-http-state-'));
    const ui = mkdtempSync(join(tmpdir(), 'wg-http-ui-'));

    process.env.APPSTASH_BASE_DIR = store;
    process.env.WAVEGRID_PROJECT = 'demo';
    process.env.WG_STATE_DIR = state;
    process.env.WG_JWT_SECRET = 'test-secret';
    delete process.env.WAVEGRID_LAYOUT;
    delete process.env.WAVEGRID_MODE;
    delete process.env.LIGHT_MAP_CONFIG;

    const s = openStore();
    s.createProject('demo', { layout: { preset: 'grid-7x7' } });
    s.setActiveProject('demo');
    s.addUser('demo', 'admin', 'secretpw'); // first user → admin
    s.addUser('demo', 'op', 'operatorpw'); // second → operator

    mkdirSync(join(ui, 'assets'), { recursive: true });
    writeFileSync(join(ui, 'index.html'), '<!doctype html><div id="root"></div>');
    writeFileSync(join(ui, 'assets', 'app.js'), 'console.log("hi")');

    ({ base, close, layout } = await boot(ui));
  });

  afterAll(async () => {
    await close();
    process.env = { ...saved };
  });

  it('GET /api/config reports a same-origin ws URL + the resolved layout', async () => {
    const res = await fetch(`${base}/api/config`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulatorUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
    expect(body.numCannons).toBe(layout.count);
    expect(body.layout).toBeDefined();
    expect(body.plugins).toEqual([]);
  });

  it('serves index.html at / and for extensionless SPA routes', async () => {
    for (const path of ['/', '/some/deep/route']) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('id="root"');
    }
  });

  it('serves static assets with the right content-type', async () => {
    const res = await fetch(`${base}/assets/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(await res.text()).toContain('hi');
  });

  it('rejects bad credentials and accepts good ones', async () => {
    const bad = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'nope' })
    });
    expect(bad.status).toBe(401);

    const good = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secretpw' })
    });
    expect(good.status).toBe(200);
    const body = await good.json();
    expect(body.ok).toBe(true);
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.role).toBe('admin');
    expect(typeof body.expiresAt).toBe('number');
  });

  /** Helper: log in and return the JWT. */
  async function login(username: string, password: string): Promise<{ token: string; role: string }> {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const body = await res.json();
    return { token: body.token, role: body.role };
  }

  /** Helper: attempt a login and return only the status code. */
  async function loginStatus(username: string, password: string): Promise<number> {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return res.status;
  }

  it('login records a session an admin can list and revoke', async () => {
    const admin = await login('admin', 'secretpw');
    await login('op', 'operatorpw'); // operator session exists too

    const list = await fetch(`${base}/api/admin/sessions`, {
      headers: { authorization: `Bearer ${admin.token}` }
    });
    expect(list.status).toBe(200);
    const { sessions } = await list.json();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.some((s: { username: string }) => s.username === 'op')).toBe(true);

    const opSession = sessions.find((s: { username: string }) => s.username === 'op');
    const del = await fetch(`${base}/api/admin/sessions/${opSession.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${admin.token}` }
    });
    expect(del.status).toBe(200);
  });

  it('rejects admin endpoints for operators and anonymous callers', async () => {
    const op = await login('op', 'operatorpw');
    expect(op.role).toBe('operator');

    const forbidden = await fetch(`${base}/api/admin/sessions`, {
      headers: { authorization: `Bearer ${op.token}` }
    });
    expect(forbidden.status).toBe(403);

    const anon = await fetch(`${base}/api/admin/sessions`);
    expect(anon.status).toBe(401);
  });

  it('admin can list users with roles, add operators, promote and demote', async () => {
    const admin = await login('admin', 'secretpw');
    const authz = { authorization: `Bearer ${admin.token}` };

    const created = await fetch(`${base}/api/admin/users`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'charlie', password: 'pw123456', role: 'operator' })
    });
    expect(created.status).toBe(200);
    const { users } = await created.json();
    expect(users.find((u: { username: string }) => u.username === 'charlie').role).toBe('operator');

    const promoted = await fetch(`${base}/api/admin/users/charlie/role`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin' })
    });
    expect(promoted.status).toBe(200);

    const meRes = await fetch(`${base}/api/me`, { headers: authz });
    expect(meRes.status).toBe(200);
    expect((await meRes.json()).role).toBe('admin');

    const del = await fetch(`${base}/api/admin/users/charlie`, {
      method: 'DELETE',
      headers: authz
    });
    expect(del.status).toBe(200);
  });

  /** Helper: mint an access key as the admin, returning its cleartext. */
  async function mintKey(
    authz: Record<string, string>,
    name: string,
    role?: string
  ): Promise<string> {
    const res = await fetch(`${base}/api/admin/keys`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name, role })
    });
    expect(res.status).toBe(200);
    return (await res.json()).passphrase;
  }

  it('admin mints access keys; a holder logs in as the key with its role', async () => {
    const admin = await login('admin', 'secretpw');
    const authz = { authorization: `Bearer ${admin.token}` };

    // None by default.
    const initial = await (await fetch(`${base}/api/admin/keys`, { headers: authz })).json();
    expect(initial.keys).toEqual([]);

    const passphrase = await mintKey(authz, 'friday-guests');
    expect(passphrase).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);

    // The passphrase alone logs in, whatever username is typed, as the key's
    // own identity and role.
    const holder = await login('whoever', passphrase);
    expect(holder.role).toBe('operator');
    const me = await (
      await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${holder.token}` } })
    ).json();
    expect(me.username).toBe('friday-guests');

    // An operator key can't administer.
    const forbidden = await fetch(`${base}/api/admin/keys`, {
      headers: { authorization: `Bearer ${holder.token}` }
    });
    expect(forbidden.status).toBe(403);

    await fetch(`${base}/api/admin/keys/friday-guests`, { method: 'DELETE', headers: authz });
  });

  it('manages many keys independently — disable, revoke one, revoke all', async () => {
    const admin = await login('admin', 'secretpw');
    const authz = { authorization: `Bearer ${admin.token}` };

    const crew = await mintKey(authz, 'crew');
    const ipad = await mintKey(authz, 'dan-ipad');

    const { keys } = await (await fetch(`${base}/api/admin/keys`, { headers: authz })).json();
    expect(keys.map((k: { name: string }) => k.name)).toEqual(['crew', 'dan-ipad']);

    // Disabling one leaves the other working.
    const off = await fetch(`${base}/api/admin/keys/crew/enabled`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    });
    expect(off.status).toBe(200);
    expect(await loginStatus('whoever', crew)).toBe(401);
    expect((await login('whoever', ipad)).role).toBe('operator');

    // Revoking one is independent too.
    const delOne = await fetch(`${base}/api/admin/keys/dan-ipad`, { method: 'DELETE', headers: authz });
    expect(delOne.status).toBe(200);
    expect(await loginStatus('whoever', ipad)).toBe(401);

    // And they can all be dropped at once.
    const delAll = await fetch(`${base}/api/admin/keys`, { method: 'DELETE', headers: authz });
    expect((await delAll.json()).keys).toEqual([]);

    expect(
      (await fetch(`${base}/api/admin/keys/nobody`, { method: 'DELETE', headers: authz })).status
    ).toBe(404);
  });

  it('an admin-role key can administer, and losing the role revokes it', async () => {
    const admin = await login('admin', 'secretpw');
    const authz = { authorization: `Bearer ${admin.token}` };

    const passphrase = await mintKey(authz, 'tech-lead', 'admin');
    const lead = await login('whoever', passphrase);
    expect(lead.role).toBe('admin');
    const leadAuthz = { authorization: `Bearer ${lead.token}` };
    expect((await fetch(`${base}/api/admin/keys`, { headers: leadAuthz })).status).toBe(200);

    // Demoting the key takes effect on the next call — the store is
    // authoritative, so the already-issued token stops granting admin.
    await fetch(`${base}/api/admin/keys/tech-lead/role`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'operator' })
    });
    expect((await fetch(`${base}/api/admin/keys`, { headers: leadAuthz })).status).toBe(403);

    await fetch(`${base}/api/admin/keys/tech-lead`, { method: 'DELETE', headers: authz });
  });

  it('operators cannot manage access keys', async () => {
    const op = await login('op', 'operatorpw');
    const res = await fetch(`${base}/api/admin/keys`, {
      method: 'POST',
      headers: { authorization: `Bearer ${op.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'sneaky', role: 'admin' })
    });
    expect(res.status).toBe(403);
  });

  it('round-trips the light map through per-project state', async () => {
    expect((await fetch(`${base}/api/light-map`)).status).toBe(401);
    const admin = await login('admin', 'secretpw');
    const authz = { authorization: `Bearer ${admin.token}` };
    const initial = await (await fetch(`${base}/api/light-map`, { headers: authz })).json();
    expect(initial.physicalLights).toHaveLength(layout.count);

    const swapped = initial.physicalLights.slice();
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const post = await fetch(`${base}/api/light-map`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ ...initial, physicalLights: swapped })
    });
    expect(post.status).toBe(200);

    const reread = await (await fetch(`${base}/api/light-map`, { headers: authz })).json();
    expect(reread.physicalLights[0]).toBe(swapped[0]);
    expect(reread.physicalLights[1]).toBe(swapped[1]);
    const onDisk = JSON.parse(readFileSync(join(process.env.WG_STATE_DIR!, 'light-map.json'), 'utf8'));
    expect(onDisk.physicalLights[0]).toBe(swapped[0]);
  });

  it('returns JSON 404 for unknown /api routes', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
