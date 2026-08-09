import {
  connectionLabel,
  diagnoseConnection,
  OPEN_CONNECTION,
  type Probe,
  retryDelay
} from '../src/lib/connection';

/** A probe returning a fixed status per path, or throwing for "unreachable". */
function probeWith(map: Record<string, number | 'throw'>): Probe {
  return async (path) => {
    const v = map[path];
    if (v === undefined || v === 'throw') throw new Error('fetch failed');
    return { ok: v >= 200 && v < 300, status: v };
  };
}

describe('diagnoseConnection', () => {
  it('blames the server when the origin cannot be reached at all', async () => {
    const { cause, detail } = await diagnoseConnection(probeWith({}), 1006, 'tok');
    expect(cause).toBe('serverUnreachable');
    expect(detail).toMatch(/reach the server/i);
  });

  it('blames the server when /api/config answers with an error', async () => {
    const { cause, detail } = await diagnoseConnection(probeWith({ '/api/config': 503 }), 1006, 'tok');
    expect(cause).toBe('serverUnreachable');
    expect(detail).toContain('503');
  });

  it('reports an expired or revoked session when the server is up but /api/me 401s', async () => {
    const { cause, detail } = await diagnoseConnection(
      probeWith({ '/api/config': 200, '/api/me': 401 }),
      1006,
      'tok'
    );
    expect(cause).toBe('sessionExpired');
    expect(detail).toMatch(/sign in again/i);
  });

  it('reports not-signed-in when there is no token at all', async () => {
    const { cause } = await diagnoseConnection(probeWith({ '/api/config': 200 }), 1006, null);
    expect(cause).toBe('sessionExpired');
  });

  it('reports a rejected socket when the server is up and the token is good', async () => {
    const { cause, detail } = await diagnoseConnection(
      probeWith({ '/api/config': 200, '/api/me': 200 }),
      1006,
      'tok'
    );
    expect(cause).toBe('rejected');
    expect(detail).toMatch(/JWT secret/i);
  });

  it('treats a clean close as a restart rather than a rejection', async () => {
    const { cause } = await diagnoseConnection(
      probeWith({ '/api/config': 200, '/api/me': 200 }),
      1000,
      'tok'
    );
    expect(cause).toBe('closed');
  });
});

describe('retryDelay', () => {
  it('backs off from half a second and caps at ten', () => {
    expect(retryDelay(1)).toBe(500);
    expect(retryDelay(2)).toBe(1000);
    expect(retryDelay(3)).toBe(2000);
    expect(retryDelay(20)).toBe(10_000);
  });
});

describe('connectionLabel', () => {
  it('distinguishes a first connect from a reconnect', () => {
    expect(connectionLabel({ ...OPEN_CONNECTION, state: 'connecting' })).toBe('Connecting…');
    expect(connectionLabel({ ...OPEN_CONNECTION, state: 'connecting', attempts: 2 })).toBe('Reconnecting…');
    expect(connectionLabel(OPEN_CONNECTION)).toBe('Connected');
  });

  it('shows the diagnosed reason once there is one', () => {
    expect(
      connectionLabel({ state: 'down', cause: 'serverUnreachable', detail: 'Show is stopped.', code: 1006, attempts: 1 })
    ).toBe('Show is stopped.');
    expect(connectionLabel({ state: 'down', cause: 'unknown', detail: '', code: 1006, attempts: 1 })).toBe(
      'Disconnected'
    );
  });
});
