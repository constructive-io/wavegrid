import fs from 'fs';
import os from 'os';
import path from 'path';

import { openStore, projectSecretsFile } from '../src';

function tmpBase(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wg-store-'));
}

describe('SettingsStore projects', () => {
  it('creates, lists, activates and switches projects', () => {
    const store = openStore({ baseDir: tmpBase() });
    expect(store.listProjects()).toEqual([]);
    expect(store.getActiveProject()).toBeNull();

    store.createProject('ring-6', { layout: { preset: 'ring-6' } });
    store.createProject('warehouse', { layout: { preset: 'grid-7x7' } });

    expect(store.listProjects()).toEqual(['ring-6', 'warehouse']);
    // first project becomes active
    expect(store.getActiveProject()).toBe('ring-6');

    store.setActiveProject('warehouse');
    expect(store.getActiveProject()).toBe('warehouse');
    expect(store.getProjectConfig('warehouse')).toEqual({ layout: { preset: 'grid-7x7' } });
  });

  it('writes the active config to the confstash user-layer file', () => {
    const base = tmpBase();
    const store = openStore({ baseDir: base });
    store.createProject('ring-6', { layout: { preset: 'ring-6' }, mode: 'simple' });

    const raw = fs.readFileSync(store.paths.activeConfigFile, 'utf8');
    expect(JSON.parse(raw)).toEqual({ layout: { preset: 'ring-6' }, mode: 'simple' });
  });

  it('rejects invalid project names', () => {
    const store = openStore({ baseDir: tmpBase() });
    expect(() => store.createProject('bad name!', {})).toThrow(/Invalid project name/);
  });

  it('deleting the active project promotes another', () => {
    const store = openStore({ baseDir: tmpBase() });
    store.createProject('a', {});
    store.createProject('b', {});
    expect(store.getActiveProject()).toBe('a');
    store.deleteProject('a');
    expect(store.getActiveProject()).toBe('b');
    expect(store.listProjects()).toEqual(['b']);
  });

  it('deleting a project removes its secrets too', () => {
    const store = openStore({ baseDir: tmpBase() });
    store.createProject('p', {});
    store.generateSecrets('p');
    const file = projectSecretsFile(store.paths, 'p');
    expect(fs.existsSync(file)).toBe(true);
    store.deleteProject('p');
    expect(fs.existsSync(file)).toBe(false);
  });
});

describe('SettingsStore secrets', () => {
  it('generates once, keeps existing, and forces on demand', () => {
    const store = openStore({ baseDir: tmpBase() });
    store.createProject('p', {});

    const first = store.generateSecrets('p');
    expect(first.generated.sort()).toEqual(['jwtSecret', 'receiverKey']);

    const jwt = store.requireSecret('p', 'jwtSecret');
    const again = store.generateSecrets('p');
    expect(again.generated).toEqual([]);
    expect(again.kept.sort()).toEqual(['jwtSecret', 'receiverKey']);
    // unchanged
    expect(store.requireSecret('p', 'jwtSecret')).toBe(jwt);

    const forced = store.generateSecrets('p', { force: true });
    expect(forced.generated.sort()).toEqual(['jwtSecret', 'receiverKey']);
    expect(store.requireSecret('p', 'jwtSecret')).not.toBe(jwt);
  });

  it('requireSecret throws an actionable error when missing', () => {
    const store = openStore({ baseDir: tmpBase() });
    store.createProject('p', {});
    expect(() => store.requireSecret('p', 'jwtSecret')).toThrow(/Run `wavegrid secrets init`/);
  });

  it('requiredSecrets reports set/unset', () => {
    const store = openStore({ baseDir: tmpBase() });
    store.createProject('p', {});
    expect(store.requiredSecrets('p').every((s) => !s.set)).toBe(true);
    store.generateSecrets('p');
    expect(store.requiredSecrets('p').every((s) => s.set)).toBe(true);
  });

  it('writes the secrets file with 0600 permissions', () => {
    const base = tmpBase();
    const store = openStore({ baseDir: base });
    store.createProject('p', {});
    store.generateSecrets('p');
    const file = path.join(store.paths.config, 'secrets', 'p.json');
    const mode = fs.statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe('SettingsStore users', () => {
  it('adds, verifies, lists and removes users with hashed passwords', () => {
    const store = openStore({ baseDir: tmpBase() });
    store.createProject('p', {});

    store.addUser('p', 'dan', 'hunter2');
    expect(store.listUsers('p')).toEqual(['dan']);
    expect(store.verifyUser('p', 'dan', 'hunter2')).toBe(true);
    expect(store.verifyUser('p', 'dan', 'wrong')).toBe(false);
    expect(store.verifyUser('p', 'nobody', 'x')).toBe(false);

    // password is not stored in plaintext
    const file = path.join(store.paths.data, 'projects', 'p', 'users.json');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('hunter2');

    expect(store.removeUser('p', 'dan')).toBe(true);
    expect(store.listUsers('p')).toEqual([]);
  });
});
