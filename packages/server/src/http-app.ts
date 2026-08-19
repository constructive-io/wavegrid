/**
 * The brain's HTTP surface. One origin/port serves the static UI, the small
 * JSON API the UI needs, and (via the server's upgrade handler) the WebSocket.
 * This is what collapses the old two-service (Next UI + wavegrid server) split
 * — same-origin means no `ui.port` / `simulatorUrl` to keep in sync.
 */
import { type ResolvedConfig } from '@wavegrid/layout';
import { DEFAULT_SESSION_TTL_MS, openStore, type UserRole } from '@wavegrid/settings';
import * as fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { extname, join, normalize, resolve } from 'path';

import { signJwt, verifyJwt } from './jwt';

export interface HttpAppOptions {
  /** Directory of the built UI (Vite `dist`). Static serving is skipped if unset/missing. */
  uiDir?: string | null;
  /**
   * Called after sessions were revoked through the API, so the embedding server
   * can drop the sockets those sessions are still holding open instead of
   * waiting for its next sweep.
   */
  onSessionsRevoked?: () => void;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => resolvePromise(data));
    req.on('error', reject);
  });
}

/** Which project the brain serves: explicit env wins, else the store's active project. */
function activeProject(): string | null {
  const store = openStore();
  return process.env.WAVEGRID_PROJECT ?? store.getActiveProject();
}

/** Best-effort client IP, honouring a reverse proxy's x-forwarded-for. */
function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

/** A device other than this machine that has loaded something from the brain. */
export interface LanVisitor {
  address: string;
  userAgent: string;
  firstSeen: number;
  lastSeen: number;
  requests: number;
}

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
const MAX_VISITORS = 20;
const visitors = new Map<string, LanVisitor>();

/**
 * Devices that actually reached the brain over the network. This is the only
 * *positive* proof that a LAN URL works: a self-probe says the socket is open
 * on this machine, but a venue's wifi can still isolate clients from each
 * other, and nothing on this laptop can observe that from the inside.
 */
export function lanVisitors(): LanVisitor[] {
  return [...visitors.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Forget every recorded visitor — lets an operator re-run the check cleanly. */
export function clearLanVisitors(): void {
  visitors.clear();
}

function recordVisitor(req: IncomingMessage): void {
  const address = clientIp(req);
  if (address === 'unknown' || LOOPBACK.test(address)) return;
  const now = Date.now();
  const existing = visitors.get(address);
  if (existing) {
    existing.lastSeen = now;
    existing.requests += 1;
    return;
  }
  // Bounded: a busy LAN must not grow this map without limit.
  if (visitors.size >= MAX_VISITORS) {
    const oldest = [...visitors.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0];
    if (oldest) visitors.delete(oldest.address);
  }
  visitors.set(address, {
    address,
    userAgent: String(req.headers['user-agent'] ?? 'unknown'),
    firstSeen: now,
    lastSeen: now,
    requests: 1
  });
}

/** Extract the bearer token from an Authorization header or `?token=` query. */
function bearerToken(req: IncomingMessage, url: URL): string | null {
  const auth = req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return url.searchParams.get('token');
}

interface AuthedCaller {
  project: string;
  username: string;
  role: UserRole;
}

/**
 * Authenticate an admin caller for a privileged HTTP endpoint. Requires a valid
 * (unexpired) JWT whose session still exists AND whose identity — a user account
 * or an access key — currently grants `admin` per the store (the store is
 * authoritative, so a stale `role` claim can't grant admin, and disabling the
 * key or demoting the account revokes it on the next call). The shared receiver
 * key is never accepted here. Returns null and writes the appropriate 401/403
 * response on failure.
 */
function requireAdmin(req: IncomingMessage, url: URL, res: ServerResponse): AuthedCaller | null {
  const token = bearerToken(req, url);
  const payload = token ? verifyJwt(token) : null;
  if (!payload) {
    sendJson(res, 401, { ok: false, error: 'Authentication required' });
    return null;
  }
  const project = activeProject();
  if (!project) {
    sendJson(res, 503, { ok: false, error: 'No active project' });
    return null;
  }
  const store = openStore();
  // A session id, when present, must still be live (supports revocation).
  if (payload.sid && !store.getSession(project, payload.sid)) {
    sendJson(res, 401, { ok: false, error: 'Session expired or revoked' });
    return null;
  }
  const role =
    store.getUserRole(project, payload.sub) ?? store.getAccessKeyRole(project, payload.sub);
  if (role !== 'admin') {
    sendJson(res, 403, { ok: false, error: 'Admin privileges required' });
    return null;
  }
  if (payload.sid) store.touchSession(project, payload.sid);
  return { project, username: payload.sub, role };
}

// ── Light-map persistence (per-project state, not a cwd-relative deploy file) ──
interface LightMapConfig {
  version: 1;
  numCannons: number;
  gridColumns: number;
  physicalLights: number[];
  updatedAt?: string;
}

function lightMapFile(): string {
  if (process.env.LIGHT_MAP_CONFIG) return process.env.LIGHT_MAP_CONFIG;
  const stateDir = process.env.WG_STATE_DIR || resolve(process.cwd(), '.state');
  return join(stateDir, 'light-map.json');
}

function identityMap(numCannons: number): number[] {
  return Array.from({ length: numCannons }, (_, index) => index);
}

function normalizeLightMap(
  input: Partial<LightMapConfig> | null,
  dims: { numCannons: number; gridColumns: number }
): LightMapConfig {
  const numCannons = input?.numCannons ?? dims.numCannons;
  const gridColumns = input?.gridColumns ?? dims.gridColumns;
  const fallback = identityMap(numCannons);
  const source = Array.isArray(input?.physicalLights) ? input.physicalLights : fallback;
  const used = new Set<number>();
  const physicalLights = source.slice(0, numCannons).map((value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n >= numCannons || used.has(n)) return -1;
    used.add(n);
    return n;
  });

  for (let index = 0; index < numCannons; index++) {
    if (physicalLights[index] !== undefined && physicalLights[index] >= 0) continue;
    const next = fallback.find((value) => !used.has(value));
    physicalLights[index] = next ?? index;
    used.add(physicalLights[index]);
  }

  return { version: 1, numCannons, gridColumns, physicalLights, updatedAt: input?.updatedAt };
}

/**
 * Build the HTTP request listener. Uses the already-resolved config so the
 * layout/config the embedding process resolved is exactly what the UI sees.
 */
export function createHttpApp(resolved: ResolvedConfig, opts: HttpAppOptions = {}) {
  const layout = resolved.layout;
  const sessionsRevoked = () => opts.onSessionsRevoked?.();
  const uiDir = opts.uiDir && fs.existsSync(opts.uiDir) ? opts.uiDir : null;
  const dims = { numCannons: layout.count, gridColumns: layout.cols };

  function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
    if (!uiDir) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('UI assets not found. Build @wavegrid/ui or set WG_UI_DIR.');
      return;
    }

    // Resolve within uiDir; never escape it. Unknown routes fall back to the SPA shell.
    const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(uiDir, rel);
    if (!filePath.startsWith(uiDir) || pathname === '/' || !extname(filePath)) {
      filePath = join(uiDir, 'index.html');
    }
    if (!fs.existsSync(filePath)) filePath = join(uiDir, 'index.html');

    const headOnly = (req.method || 'GET').toUpperCase() === 'HEAD';
    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      const type = MIME[extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': buf.length });
      res.end(headOnly ? undefined : buf);
    });
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    recordVisitor(req);
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname;
    const method = (req.method || 'GET').toUpperCase();

    // ── GET /api/config ─────────────────────────────────────────────
    if (pathname === '/api/config' && method === 'GET') {
      // Same-origin: the UI's WebSocket connects back to this very server.
      // Honour a reverse proxy's TLS termination via x-forwarded-proto.
      const forwardedProto = req.headers['x-forwarded-proto'];
      const scheme = forwardedProto === 'https' ? 'wss' : 'ws';
      const simulatorUrl = `${scheme}://${host}`;
      sendJson(res, 200, {
        simulatorUrl,
        runMode: resolved.runMode,
        layout,
        numCannons: layout.count,
        gridColumns: layout.cols
      });
      return;
    }

    // ── POST /api/login ─────────────────────────────────────────────
    if (pathname === '/api/login' && method === 'POST') {
      let body: { username?: string; password?: string };
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid request' });
        return;
      }
      const username = body.username;
      const password = body.password;
      if (!username || !password) {
        sendJson(res, 400, { ok: false, error: 'Missing credentials' });
        return;
      }
      const project = activeProject();
      const store = openStore();
      const hasKeys = project ? store.listAccessKeys(project).some((k) => k.enabled) : false;
      if (!project || (store.listUsers(project).length === 0 && !hasKeys)) {
        sendJson(res, 503, { ok: false, error: 'Auth not configured' });
        return;
      }
      // Try a real account first, then the project's access keys. A key is
      // handed around as a passphrase alone, so it matches regardless of the
      // username typed, and logs in as the key's own name and role.
      const user =
        store.authenticate(project, username, password) ??
        store.authenticateAccessKey(project, password);
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'Invalid username or password' });
        return;
      }
      // Record a cheap server-side session and bind the JWT to it, so admins
      // can see who's logged in and revoke it. The socket opened with this
      // token is bound to the same session and dies with it.
      const session = store.createSession(project, {
        username: user.username,
        role: user.role,
        ip: clientIp(req),
        userAgent: String(req.headers['user-agent'] ?? 'unknown'),
        ttlMs: DEFAULT_SESSION_TTL_MS
      });
      const token = signJwt(user.username, {
        sid: session.id,
        role: user.role,
        ttlSec: Math.floor(DEFAULT_SESSION_TTL_MS / 1000)
      });
      sendJson(res, 200, {
        ok: true,
        username: user.username,
        role: user.role,
        token,
        expiresAt: session.expiresAt
      });
      return;
    }

    // ── POST /api/logout — end my own session ───────────────────────
    // Signing out has to reach the server: the token alone stays valid until it
    // expires, and the socket it opened would keep running as that user.
    if (pathname === '/api/logout' && method === 'POST') {
      const token = bearerToken(req, url);
      const payload = token ? verifyJwt(token) : null;
      const project = activeProject();
      if (payload?.sid && project && openStore().revokeSession(project, payload.sid)) {
        sessionsRevoked();
      }
      // Never an error: a client that is throwing its token away is done either
      // way, and telling it otherwise would only strand it signed in.
      sendJson(res, 200, { ok: true });
      return;
    }

    // ── GET /api/me — who am I (any valid token) ────────────────────
    if (pathname === '/api/me' && method === 'GET') {
      const token = bearerToken(req, url);
      const payload = token ? verifyJwt(token) : null;
      const project = activeProject();
      if (!payload || !project) {
        sendJson(res, 401, { ok: false, error: 'Authentication required' });
        return;
      }
      const store = openStore();
      if (payload.sid && !store.getSession(project, payload.sid)) {
        sendJson(res, 401, { ok: false, error: 'Session expired or revoked' });
        return;
      }
      // An access-key holder isn't a stored user — the key itself carries the
      // role, and disabling or deleting it drops the role on the next check.
      const role: UserRole | null =
        store.getUserRole(project, payload.sub) ?? store.getAccessKeyRole(project, payload.sub);
      if (!role) {
        sendJson(res, 401, { ok: false, error: 'Unknown user' });
        return;
      }
      if (payload.sid) store.touchSession(project, payload.sid);
      sendJson(res, 200, { ok: true, username: payload.sub, role });
      return;
    }

    // ── Admin-only session + user management (role-gated) ───────────
    if (pathname === '/api/admin/sessions' && method === 'GET') {
      const caller = requireAdmin(req, url, res);
      if (!caller) return;
      sendJson(res, 200, { ok: true, sessions: openStore().listSessions(caller.project) });
      return;
    }
    {
      const m = pathname.match(/^\/api\/admin\/sessions\/([^/]+)$/);
      if (m && method === 'DELETE') {
        const caller = requireAdmin(req, url, res);
        if (!caller) return;
        const removed = openStore().revokeSession(caller.project, decodeURIComponent(m[1]));
        if (removed) sessionsRevoked();
        sendJson(res, removed ? 200 : 404, { ok: removed });
        return;
      }
    }
    if (pathname === '/api/admin/users' && method === 'GET') {
      const caller = requireAdmin(req, url, res);
      if (!caller) return;
      sendJson(res, 200, { ok: true, users: openStore().listUserInfos(caller.project) });
      return;
    }
    if (pathname === '/api/admin/users' && method === 'POST') {
      const caller = requireAdmin(req, url, res);
      if (!caller) return;
      let body: { username?: string; password?: string; role?: UserRole };
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid request' });
        return;
      }
      if (!body.username || !body.password) {
        sendJson(res, 400, { ok: false, error: 'Missing username or password' });
        return;
      }
      const role: UserRole = body.role === 'admin' ? 'admin' : 'operator';
      try {
        openStore().addUser(caller.project, body.username, body.password, role);
      } catch (e) {
        sendJson(res, 400, { ok: false, error: (e as Error).message });
        return;
      }
      sendJson(res, 200, { ok: true, users: openStore().listUserInfos(caller.project) });
      return;
    }
    {
      const m = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
      if (m && method === 'POST') {
        const caller = requireAdmin(req, url, res);
        if (!caller) return;
        let body: { role?: UserRole };
        try {
          body = JSON.parse((await readBody(req)) || '{}');
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid request' });
          return;
        }
        if (body.role !== 'admin' && body.role !== 'operator') {
          sendJson(res, 400, { ok: false, error: 'role must be "admin" or "operator"' });
          return;
        }
        try {
          openStore().setUserRole(caller.project, decodeURIComponent(m[1]), body.role);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: (e as Error).message });
          return;
        }
        sendJson(res, 200, { ok: true, users: openStore().listUserInfos(caller.project) });
        return;
      }
    }
    {
      const m = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (m && method === 'DELETE') {
        const caller = requireAdmin(req, url, res);
        if (!caller) return;
        const username = decodeURIComponent(m[1]);
        const store = openStore();
        try {
          const removed = store.removeUser(caller.project, username);
          if (removed) {
            store.revokeUserSessions(caller.project, username);
            sessionsRevoked();
          }
          sendJson(res, removed ? 200 : 404, { ok: removed });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: (e as Error).message });
        }
        return;
      }
    }

    // ── Admin-only access keys (role-gated) ─────────────────────────
    if (pathname === '/api/admin/keys' && method === 'GET') {
      const caller = requireAdmin(req, url, res);
      if (!caller) return;
      sendJson(res, 200, { ok: true, keys: openStore().listAccessKeys(caller.project) });
      return;
    }
    if (pathname === '/api/admin/keys' && method === 'POST') {
      const caller = requireAdmin(req, url, res);
      if (!caller) return;
      let body: { name?: string; role?: UserRole };
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid request' });
        return;
      }
      if (!body.name) {
        sendJson(res, 400, { ok: false, error: 'Missing key name' });
        return;
      }
      // The cleartext passphrase is returned exactly once, here, for the admin
      // to copy and hand over; only its hash is persisted.
      const store = openStore();
      try {
        const minted = store.mintAccessKey(
          caller.project,
          body.name,
          body.role === 'admin' ? 'admin' : 'operator'
        );
        sendJson(res, 200, {
          ok: true,
          passphrase: minted.passphrase,
          keys: store.listAccessKeys(caller.project)
        });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: (e as Error).message });
      }
      return;
    }
    if (pathname === '/api/admin/keys' && method === 'DELETE') {
      const caller = requireAdmin(req, url, res);
      if (!caller) return;
      const store = openStore();
      const removed = store.removeAllAccessKeys(caller.project);
      sendJson(res, 200, { ok: true, removed, keys: store.listAccessKeys(caller.project) });
      return;
    }
    {
      const m = pathname.match(/^\/api\/admin\/keys\/([^/]+)\/enabled$/);
      if (m && method === 'POST') {
        const caller = requireAdmin(req, url, res);
        if (!caller) return;
        let body: { enabled?: boolean };
        try {
          body = JSON.parse((await readBody(req)) || '{}');
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid request' });
          return;
        }
        const store = openStore();
        const key = store.setAccessKeyEnabled(
          caller.project,
          decodeURIComponent(m[1]),
          body.enabled === true
        );
        if (!key) {
          sendJson(res, 404, { ok: false, error: 'No such key' });
          return;
        }
        sendJson(res, 200, { ok: true, keys: store.listAccessKeys(caller.project) });
        return;
      }
    }
    {
      const m = pathname.match(/^\/api\/admin\/keys\/([^/]+)\/role$/);
      if (m && method === 'POST') {
        const caller = requireAdmin(req, url, res);
        if (!caller) return;
        let body: { role?: UserRole };
        try {
          body = JSON.parse((await readBody(req)) || '{}');
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid request' });
          return;
        }
        if (body.role !== 'admin' && body.role !== 'operator') {
          sendJson(res, 400, { ok: false, error: 'role must be "admin" or "operator"' });
          return;
        }
        const store = openStore();
        const key = store.setAccessKeyRole(caller.project, decodeURIComponent(m[1]), body.role);
        if (!key) {
          sendJson(res, 404, { ok: false, error: 'No such key' });
          return;
        }
        sendJson(res, 200, { ok: true, keys: store.listAccessKeys(caller.project) });
        return;
      }
    }
    {
      const m = pathname.match(/^\/api\/admin\/keys\/([^/]+)$/);
      if (m && method === 'DELETE') {
        const caller = requireAdmin(req, url, res);
        if (!caller) return;
        const name = decodeURIComponent(m[1]);
        const store = openStore();
        const removed = store.removeAccessKey(caller.project, name);
        // Sessions opened with the key go too — revoking a key shouldn't leave
        // its holders logged in.
        if (removed) store.revokeUserSessions(caller.project, name);
        sendJson(res, removed ? 200 : 404, {
          ok: removed,
          keys: store.listAccessKeys(caller.project)
        });
        return;
      }
    }

    // ── GET/POST /api/light-map ─────────────────────────────────────
    if (pathname === '/api/light-map') {
      const file = lightMapFile();
      if (method === 'GET') {
        let cfg: LightMapConfig;
        try {
          cfg = normalizeLightMap(JSON.parse(fs.readFileSync(file, 'utf8')), dims);
        } catch {
          cfg = normalizeLightMap(null, dims);
        }
        sendJson(res, 200, cfg);
        return;
      }
      if (method === 'POST') {
        let body: Partial<LightMapConfig>;
        try {
          body = JSON.parse((await readBody(req)) || '{}');
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid request' });
          return;
        }
        const cfg = normalizeLightMap(
          {
            version: 1,
            numCannons: Number(body.numCannons) || dims.numCannons,
            gridColumns: Number(body.gridColumns) || dims.gridColumns,
            physicalLights: body.physicalLights,
            updatedAt: new Date().toISOString()
          },
          dims
        );
        fs.mkdirSync(join(file, '..'), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
        sendJson(res, 200, cfg);
        return;
      }
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { ok: false, error: 'Not found' });
      return;
    }

    // ── Everything else: the static SPA ─────────────────────────────
    if (method === 'GET' || method === 'HEAD') {
      serveStatic(req, res, pathname);
      return;
    }

    res.writeHead(405);
    res.end();
  };
}

/**
 * Best-effort locate the built UI assets. `WG_UI_DIR` wins; otherwise resolve
 * the installed `@wavegrid/ui` package and use its `dist/`.
 */
export function resolveUiDir(): string | null {
  if (process.env.WG_UI_DIR) return process.env.WG_UI_DIR;
  try {
    const pkg = require.resolve('@wavegrid/ui/package.json');
    return join(pkg, '..', 'dist');
  } catch {
    return null;
  }
}
