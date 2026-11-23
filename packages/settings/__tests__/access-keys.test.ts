import fs from 'fs';
import os from 'os';
import path from 'path';

import { openStore, type SettingsStore } from '../src';

const PASSPHRASE_FORMAT = /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/;

describe('access keys', () => {
  let baseDir: string;
  let store: SettingsStore;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-keys-'));
    store = openStore({ baseDir });
    store.createProject('show', {
      layout: { preset: '7x7' },
      mode: 'auto'
    } as never);
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('starts with no keys', () => {
    expect(store.listAccessKeys('show')).toEqual([]);
  });

  it('mints a readable passphrase and returns it exactly once', () => {
    const { key, passphrase } = store.mintAccessKey('show', 'friday-guests');

    expect(passphrase).toMatch(PASSPHRASE_FORMAT);
    // Unambiguous alphabet: no 0/O/1/l/I to misread over a loud stage.
    expect(passphrase).not.toMatch(/[01olI]/);
    expect(key).toMatchObject({ name: 'friday-guests', role: 'operator', enabled: true });
    expect(key.lastUsedAt).toBeNull();

    // The cleartext is nowhere in the listing — only the mint call ever had it.
    expect(JSON.stringify(store.listAccessKeys('show'))).not.toContain(passphrase);
  });

  it('persists only a salted hash, never the passphrase', () => {
    const { passphrase } = store.mintAccessKey('show', 'crew');
    const raw = fs.readFileSync(
      path.join(store.paths.data, 'projects', 'show', 'access-keys.json'),
      'utf8'
    );

    expect(raw).not.toContain(passphrase);
    const stored = JSON.parse(raw);
    expect(stored[0].salt).toMatch(/^[0-9a-f]{32}$/);
    expect(stored[0].hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it('authenticates a key as its own named identity', () => {
    const { passphrase } = store.mintAccessKey('show', 'dan-ipad');

    expect(store.authenticateAccessKey('show', passphrase)).toEqual({
      username: 'dan-ipad',
      role: 'operator'
    });
  });

  it('rejects a wrong passphrase', () => {
    store.mintAccessKey('show', 'crew');
    expect(store.authenticateAccessKey('show', 'nope-nope-nope')).toBeNull();
  });

  it('defaults to operator but can mint an admin key deliberately', () => {
    const operator = store.mintAccessKey('show', 'crew');
    const admin = store.mintAccessKey('show', 'tech-lead', 'admin');

    expect(store.authenticateAccessKey('show', operator.passphrase)?.role).toBe('operator');
    expect(store.authenticateAccessKey('show', admin.passphrase)?.role).toBe('admin');
  });

  it('preserves station grants when re-minting and revokes sessions on reassignment or disable', () => {
    const { passphrase } = store.mintAccessKey('show', 'crew', 'operator', 'north');
    expect(store.authenticateAccessKey('show', passphrase)).toEqual({
      username: 'crew', role: 'operator', station: 'north'
    });
    expect(() => store.setAccessKeyRole('show', 'crew', 'admin')).toThrow('cannot grant admin');
    expect(store.mintAccessKey('show', 'crew').key.station).toBe('north');
    const first = store.createSession('show', { username: 'crew', role: 'operator', station: 'north' });
    store.mintAccessKey('show', 'crew', 'operator', 'south');
    expect(store.getSession('show', first.id)).toBeNull();
    const second = store.createSession('show', { username: 'crew', role: 'operator', station: 'south' });
    store.setAccessKeyEnabled('show', 'crew', false);
    expect(store.getSession('show', second.id)).toBeNull();
  });

  it('stamps lastUsedAt on a successful login', () => {
    const { passphrase } = store.mintAccessKey('show', 'crew');
    expect(store.listAccessKeys('show')[0].lastUsedAt).toBeNull();

    store.authenticateAccessKey('show', passphrase);

    expect(store.listAccessKeys('show')[0].lastUsedAt).toBeGreaterThan(0);
  });

  describe('with several keys', () => {
    let crew: string;
    let guests: string;
    let ipad: string;

    beforeEach(() => {
      crew = store.mintAccessKey('show', 'crew').passphrase;
      guests = store.mintAccessKey('show', 'friday-guests').passphrase;
      ipad = store.mintAccessKey('show', 'dan-ipad').passphrase;
    });

    it('keeps them all valid and independently listed', () => {
      expect(store.listAccessKeys('show').map((k) => k.name)).toEqual([
        'crew',
        'friday-guests',
        'dan-ipad'
      ]);
      expect(store.authenticateAccessKey('show', crew)?.username).toBe('crew');
      expect(store.authenticateAccessKey('show', guests)?.username).toBe('friday-guests');
      expect(store.authenticateAccessKey('show', ipad)?.username).toBe('dan-ipad');
    });

    it('revokes one key without disturbing the others', () => {
      expect(store.removeAccessKey('show', 'friday-guests')).toBe(true);

      expect(store.authenticateAccessKey('show', guests)).toBeNull();
      expect(store.authenticateAccessKey('show', crew)?.username).toBe('crew');
      expect(store.authenticateAccessKey('show', ipad)?.username).toBe('dan-ipad');
    });

    it('disables one key without changing its passphrase, then re-enables it', () => {
      store.setAccessKeyEnabled('show', 'crew', false);
      expect(store.authenticateAccessKey('show', crew)).toBeNull();
      expect(store.authenticateAccessKey('show', guests)?.username).toBe('friday-guests');

      store.setAccessKeyEnabled('show', 'crew', true);
      expect(store.authenticateAccessKey('show', crew)?.username).toBe('crew');
    });

    it('revokes every key at once', () => {
      expect(store.removeAllAccessKeys('show')).toBe(3);

      expect(store.listAccessKeys('show')).toEqual([]);
      for (const p of [crew, guests, ipad]) {
        expect(store.authenticateAccessKey('show', p)).toBeNull();
      }
    });

    it('re-minting a name invalidates the old passphrase and keeps createdAt', () => {
      const before = store.listAccessKeys('show').find((k) => k.name === 'crew')!;
      const { passphrase: replacement } = store.mintAccessKey('show', 'crew');

      expect(store.authenticateAccessKey('show', crew)).toBeNull();
      expect(store.authenticateAccessKey('show', replacement)?.username).toBe('crew');

      const after = store.listAccessKeys('show').find((k) => k.name === 'crew')!;
      expect(after.createdAt).toBe(before.createdAt);
      expect(store.listAccessKeys('show')).toHaveLength(3);
    });
  });

  it('changes the role a key grants', () => {
    const { passphrase } = store.mintAccessKey('show', 'crew');
    store.setAccessKeyRole('show', 'crew', 'admin');

    expect(store.authenticateAccessKey('show', passphrase)?.role).toBe('admin');
    expect(store.getAccessKeyRole('show', 'crew')).toBe('admin');
  });

  it('reports no role for a disabled or unknown key', () => {
    store.mintAccessKey('show', 'crew');
    store.setAccessKeyEnabled('show', 'crew', false);

    expect(store.getAccessKeyRole('show', 'crew')).toBeNull();
    expect(store.getAccessKeyRole('show', 'nobody')).toBeNull();
  });

  it('reports missing keys instead of throwing', () => {
    expect(store.setAccessKeyEnabled('show', 'nobody', false)).toBeNull();
    expect(store.setAccessKeyRole('show', 'nobody', 'admin')).toBeNull();
    expect(store.removeAccessKey('show', 'nobody')).toBe(false);
  });

  it('rejects names that would not work as a login identity', () => {
    expect(() => store.mintAccessKey('show', 'Friday Guests')).toThrow(/lowercase/);
    expect(() => store.mintAccessKey('show', '')).toThrow(/lowercase/);
    expect(() => store.mintAccessKey('show', '-leading')).toThrow(/lowercase/);
  });

  it('keeps key names and user accounts in one namespace', () => {
    store.addUser('show', 'dan', 'pw');
    expect(() => store.mintAccessKey('show', 'dan')).toThrow(/already a user account/);

    store.mintAccessKey('show', 'crew');
    expect(() => store.addUser('show', 'crew', 'pw')).toThrow(/already an access key/);
  });

  it('scopes keys to their project', () => {
    store.createProject('other', { layout: { preset: '7x7' }, mode: 'auto' } as never);
    const { passphrase } = store.mintAccessKey('show', 'crew');

    expect(store.authenticateAccessKey('other', passphrase)).toBeNull();
    expect(store.listAccessKeys('other')).toEqual([]);
  });
});
