/**
 * Why the socket is down — the text behind the status dot.
 *
 * A browser reports a rejected WebSocket *handshake* as close code 1006 with no
 * reason, so the close event alone can never tell "the brain isn't listening"
 * apart from "my token was rejected". We probe two plain HTTP endpoints on the
 * same origin to tell them apart: `/api/config` (unauthenticated — is anything
 * serving?) and `/api/me` (is this token still good?).
 */
export type ConnectionState = 'connecting' | 'open' | 'down';

export type ConnectionCause =
  | 'unknown'
  | 'serverUnreachable'
  | 'sessionExpired'
  | 'rejected'
  | 'closed';

export interface ConnectionInfo {
  state: ConnectionState;
  cause: ConnectionCause;
  /** One line an operator can act on. Empty while open. */
  detail: string;
  /** WebSocket close code, when the socket got far enough to report one. */
  code: number | null;
  /** Failed connect attempts since the last successful open. */
  attempts: number;
}

/** The brain closes a socket with this code when its session was revoked. */
export const WS_CLOSE_SESSION_REVOKED = 4001;

/** A close code that means "this token is finished" — never worth retrying. */
export function isSessionEndedCode(code: number | null): boolean {
  return code === WS_CLOSE_SESSION_REVOKED;
}

export const OPEN_CONNECTION: ConnectionInfo = {
  state: 'open',
  cause: 'unknown',
  detail: '',
  code: null,
  attempts: 0
};

/** Fetcher shape, narrow enough to fake in tests. */
export type Probe = (path: string) => Promise<{ ok: boolean; status: number }>;

/**
 * Classify a dead socket by probing the same origin. `code` is the WebSocket
 * close code when there was one (1006 for a rejected/failed handshake).
 */
export async function diagnoseConnection(
  probe: Probe,
  code: number | null,
  token: string | null
): Promise<{ cause: ConnectionCause; detail: string }> {
  // The brain said why it closed, so there is nothing to probe for.
  if (isSessionEndedCode(code)) {
    return {
      cause: 'sessionExpired',
      detail: 'Your session was ended by an administrator — sign in again.'
    };
  }

  let config: { ok: boolean; status: number };
  try {
    config = await probe('/api/config');
  } catch {
    return {
      cause: 'serverUnreachable',
      detail: 'Can’t reach the server — the show may be stopped, or this device is off its network.'
    };
  }
  if (!config.ok) {
    return {
      cause: 'serverUnreachable',
      detail: `The server answered ${config.status} on /api/config — it is starting up or unhealthy.`
    };
  }

  if (token) {
    let me: { ok: boolean; status: number };
    try {
      me = await probe('/api/me');
    } catch {
      return { cause: 'serverUnreachable', detail: 'The server stopped answering mid-check.' };
    }
    if (me.status === 401) {
      return {
        cause: 'sessionExpired',
        detail: 'Your session expired or was revoked — sign in again.'
      };
    }
  } else {
    return { cause: 'sessionExpired', detail: 'Not signed in — sign in to connect.' };
  }

  if (code === 1000 || code === 1001) {
    return { cause: 'closed', detail: 'The server closed the connection — it is probably restarting.' };
  }
  return {
    cause: 'rejected',
    detail: 'The server is up but refused the live connection — its JWT secret may have changed (restart the show, then sign in again).'
  };
}

/** Reconnect backoff: 0.5s doubling to 10s, so a restarting brain is picked up fast. */
export function retryDelay(attempts: number): number {
  return Math.min(500 * 2 ** Math.max(0, attempts - 1), 10_000);
}

/** Short label for the dot's tooltip / the strip next to it. */
export function connectionLabel(info: ConnectionInfo): string {
  if (info.state === 'open') return 'Connected';
  if (info.state === 'connecting') return info.attempts > 0 ? 'Reconnecting…' : 'Connecting…';
  return info.detail || 'Disconnected';
}
