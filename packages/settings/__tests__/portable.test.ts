import fs from 'fs';
import os from 'os';
import path from 'path';

import { openStore, parseBundle } from '../src';

function tmpBase(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wg-portable-'));
}

function seedProject(baseDir: string, name = 'ring-demo') {
  const store = openStore({ baseDir });
  store.createProject(name, { layout: { preset: 'nova' } } as never);
  store.generateSecrets(name);
  store.addUser(name, 'admin', 'wavegrid123');
  store.registerDevice(name, {
    id: 'dev-1',
    name: 'front-of-house',
    hostname: 'laptop-a',
    address: '192.168.1.10',
    layout: 'nova',
    mode: 'distributed',
    shard: { start: 0, end: 2 }
  });
  return store;
}

describe('portable project export', () => {
  it('carries config + device-scoped configs + users, but never IPs or machine identity', () => {
    const store = seedProject(tmpBase());
    const bundle = store.exportProject('ring-demo');

    expect(bundle.wavegrid).toBe('project-export');
    expect(bundle.config).toBeTruthy();
    expect(bundle.devices).toHaveLength(1);
    const dev = bundle.devices[0];
    expect(dev.name).toBe('front-of-house');
    expect(dev.shard).toEqual({ start: 0, end: 2 });
    // Runtime facts are stripped.
    expect((dev as unknown as Record<string, unknown>).address).toBeUndefined();
    expect((dev as unknown as Record<string, unknown>).lastSeen).toBeUndefined();
    // Users travel (hashed), secrets do not by default.
    expect(bundle.users?.map(u => u.username)).toEqual(['admin']);
    expect(bundle.secrets).toBeUndefined();
  });

  it('includes secrets only when explicitly requested', () => {
    const store = seedProject(tmpBase());
    const withSecrets = store.exportProject('ring-demo', { includeSecrets: true });
    expect(withSecrets.secrets?.receiverKey).toBeTruthy();
    expect(withSecrets.secrets?.jwtSecret).toBeTruthy();
  });

  it('can omit users', () => {
    const store = seedProject(tmpBase());
    expect(store.exportProject('ring-demo', { includeUsers: false }).users).toBeUndefined();
  });
});

describe('portable project import (round-trip)', () => {
  it('restores config, devices, and users on a fresh machine, generating fresh secrets', () => {
    const src = seedProject(tmpBase());
    const bundle = src.exportProject('ring-demo'); // no secrets

    const dst = openStore({ baseDir: tmpBase() });
    const result = dst.importProject(bundle, { activate: true });

    expect(result.project).toBe('ring-demo');
    expect(result.deviceCount).toBe(1);
    expect(result.userCount).toBe(1);
    expect(result.generatedSecrets).toBe(true); // no secrets in bundle → fresh ones

    expect(dst.hasProject('ring-demo')).toBe(true);
    expect(dst.getActiveProject()).toBe('ring-demo');
    expect(dst.listDevices('ring-demo')[0].name).toBe('front-of-house');
    // Imported user hash is preserved → login works without re-adding.
    expect(dst.verifyUser('ring-demo', 'admin', 'wavegrid123')).toBe(true);
    // Fresh secrets exist and are NOT the source's.
    expect(dst.readSecrets('ring-demo').receiverKey).toBeTruthy();
    expect(dst.readSecrets('ring-demo').receiverKey).not.toBe(src.readSecrets('ring-demo').receiverKey);
  });

  it('carries the same shared secrets when exported with includeSecrets (same-brain join)', () => {
    const src = seedProject(tmpBase());
    const bundle = src.exportProject('ring-demo', { includeSecrets: true });

    const dst = openStore({ baseDir: tmpBase() });
    const result = dst.importProject(bundle);
    expect(result.generatedSecrets).toBe(false);
    expect(dst.readSecrets('ring-demo').receiverKey).toBe(src.readSecrets('ring-demo').receiverKey);
  });

  it('does not import machine-local device identity (each machine keeps its own)', () => {
    const src = seedProject(tmpBase());
    const srcDeviceId = src.getDevice().id;
    const bundle = src.exportProject('ring-demo', { includeSecrets: true });
    expect((bundle as unknown as Record<string, unknown>).device).toBeUndefined();

    const dstBase = tmpBase();
    const dst = openStore({ baseDir: dstBase });
    const dstDeviceId = dst.getDevice().id; // generated locally, independent
    dst.importProject(bundle);
    // Import didn't overwrite the local identity.
    expect(dst.getDevice().id).toBe(dstDeviceId);
    expect(dst.getDevice().id).not.toBe(srcDeviceId);
  });

  it('refuses to import over an existing project unless overwrite is set', () => {
    const base = tmpBase();
    const src = seedProject(base);
    const bundle = src.exportProject('ring-demo');
    expect(() => src.importProject(bundle)).toThrow(/already exists/i);
    expect(() => src.importProject(bundle, { overwrite: true })).not.toThrow();
  });

  it('overwrite keeps the local OSC target when the bundle has none', () => {
    const base = tmpBase();
    const local = seedProject(base);
    local.saveProjectConfig('ring-demo', {
      layout: { preset: 'nova' },
      osc: { beyond: { host: '10.0.0.5', port: 8000, gridOrder: 'row' } }
    } as never);

    const bundle = seedProject(tmpBase()).exportProject('ring-demo');
    bundle.config = { layout: { preset: 'grace-cathedral' } } as never;

    const result = local.importProject(bundle, { overwrite: true });
    expect(result.keptLocalOsc).toBe(true);
    const cfg = local.getProjectConfig('ring-demo')!;
    expect(cfg.layout).toEqual({ preset: 'grace-cathedral' });
    expect(cfg.osc?.beyond?.host).toBe('10.0.0.5');
  });

  it('overwrite takes the bundle’s OSC target when it has one', () => {
    const base = tmpBase();
    const local = seedProject(base);
    local.saveProjectConfig('ring-demo', {
      layout: { preset: 'nova' },
      osc: { beyond: { host: '10.0.0.5', port: 8000, gridOrder: 'row' } }
    } as never);

    const bundle = seedProject(tmpBase()).exportProject('ring-demo');
    bundle.config = { layout: { preset: 'nova' }, osc: { beyond: { host: '10.0.0.9', port: 8000, gridOrder: 'row' } } } as never;

    const result = local.importProject(bundle, { overwrite: true });
    expect(result.keptLocalOsc).toBe(false);
    expect(local.getProjectConfig('ring-demo')!.osc?.beyond?.host).toBe('10.0.0.9');
  });

  it('can import under a new name', () => {
    const src = seedProject(tmpBase());
    const bundle = src.exportProject('ring-demo');
    const dst = openStore({ baseDir: tmpBase() });
    const result = dst.importProject(bundle, { name: 'copy' });
    expect(result.project).toBe('copy');
    expect(dst.hasProject('copy')).toBe(true);
  });

  it('rejects a non-Wavegrid file', () => {
    expect(() => parseBundle({ hello: 'world' })).toThrow(/project export/i);
    expect(() => parseBundle({ wavegrid: 'project-export', version: 1 })).toThrow(/missing project/i);
  });
});
