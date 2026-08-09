import { verifyJwt } from '@wavegrid/server';
import { openStore } from '@wavegrid/settings';

import { embeddedUrl, operatorToken } from '../src/main/operator-session';

const PROJECT = 'desk-auth';

beforeAll(() => {
  const store = openStore();
  store.createProject(PROJECT, { preset: 'ring-6' });
  store.generateSecrets(PROJECT);
});

describe('desktop operator session', () => {
  it('mints a token the server accepts, bound to a revocable session', () => {
    const store = openStore();
    store.addUser(PROJECT, 'dan', 'hunter2', 'admin');

    const token = operatorToken(PROJECT);
    expect(token).not.toBeNull();

    const payload = verifyJwt(token!);
    expect(payload?.sub).toBe('dan');
    expect(payload?.role).toBe('admin');
    // Visible in Access → Sessions, so it can be revoked like any other login.
    const session = store.listSessions(PROJECT).find((s) => s.id === payload?.sid);
    expect(session?.userAgent).toContain('wavegrid-desktop');
  });

  it('prefers an admin over an operator account', () => {
    const store = openStore();
    store.addUser(PROJECT, 'guest-op', 'hunter2', 'operator');
    expect(verifyJwt(operatorToken(PROJECT)!)?.sub).toBe('dan');
  });

  it('falls back to the login screen when the project has no accounts', () => {
    const store = openStore();
    store.createProject('no-users', { preset: 'ring-6' });
    store.generateSecrets('no-users');
    expect(operatorToken('no-users')).toBeNull();
    expect(embeddedUrl('http://127.0.0.1:3000', 'no-users')).toBe('http://127.0.0.1:3000');
  });

  it('hands the token off in the fragment, never the query', () => {
    const url = embeddedUrl('http://127.0.0.1:3000', PROJECT);
    expect(url.startsWith('http://127.0.0.1:3000#wg_token=')).toBe(true);
    expect(url).not.toContain('?');
  });
});
