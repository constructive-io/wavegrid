import {
  clearCredentials,
  type CredentialStore,
  readLastUser,
  readToken,
  saveCredentials
} from '../src/lib/auth-storage';
import { endSessionOnServer } from '../src/lib/use-auth';

/** An in-memory stand-in for `localStorage`. */
function fakeStore(initial: Record<string, string> = {}): CredentialStore & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    }
  };
}

describe('credential storage', () => {
  it('keeps the token and the username for the next sign-in', () => {
    const store = fakeStore();
    saveCredentials('ada', 'tok-1', store);
    expect(readToken(store)).toBe('tok-1');
    expect(readLastUser(store)).toBe('ada');
  });

  it('drops the token on sign-out but still prefills who was here', () => {
    const store = fakeStore({ wg_token: 'tok-1', wg_user: 'ada', wg_last_user: 'ada' });
    clearCredentials(store);
    expect(readToken(store)).toBeNull();
    expect(store.data.wg_user).toBeUndefined();
    expect(readLastUser(store)).toBe('ada');
  });

  it('survives a store that is not there (SSR / no window)', () => {
    expect(() => clearCredentials(null)).not.toThrow();
    expect(readToken(null)).toBeNull();
    expect(readLastUser(null)).toBe('');
  });
});

describe('endSessionOnServer', () => {
  it('tells the brain to revoke this session, with the bearer token', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const post = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return { ok: true } as Response;
    }) as unknown as typeof fetch;

    await endSessionOnServer('tok-1', post);
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe('/api/logout');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('never throws when the network is gone — signing out still has to land', async () => {
    const post = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(endSessionOnServer('tok-1', post)).resolves.toBeUndefined();
  });
});
