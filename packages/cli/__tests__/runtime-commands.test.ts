import { openStore } from '@wavegrid/settings';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { applyAssignedShard, applyShardFlag, parseShardRange } from '../src/commands/runtime';
import { resolveUpstream, runReceiver } from '../src/commands/receiver';
import { runServer } from '../src/commands/server';
import { buildConfig, CONFIG_FILENAME, serializeConfig } from '../src/config-file';

function scratchDir(preset: string, port?: number): string {
  const root = mkdtempSync(join(tmpdir(), 'wg-rt-'));
  const cfg = buildConfig({ shape: 'preset', preset, mode: 'auto', ...(port ? { serverPort: port } : {}) });
  writeFileSync(join(root, CONFIG_FILENAME), serializeConfig(cfg));
  return root;
}

describe('applyShardFlag', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('accepts a start-end range', () => {
    expect(applyShardFlag('0-24')).toBe(true);
    expect(process.env.SHARD_START).toBe('0');
    expect(process.env.SHARD_END).toBe('24');
  });

  it('accepts a bare single cannon', () => {
    expect(applyShardFlag(5)).toBe(true);
    expect(process.env.SHARD_START).toBe('5');
    expect(process.env.SHARD_END).toBe('5');
  });

  it('no-ops (true) when unset', () => {
    expect(applyShardFlag(undefined)).toBe(true);
    expect(process.env.SHARD_START).toBeUndefined();
  });

  it('rejects a reversed or malformed range', () => {
    expect(applyShardFlag('24-0')).toBe(false);
    expect(applyShardFlag('abc')).toBe(false);
  });

  it('treats `all` as no restriction (does not set env)', () => {
    expect(applyShardFlag('all')).toBe(true);
    expect(process.env.SHARD_START).toBeUndefined();
  });
});

describe('parseShardRange', () => {
  it('parses ranges, single indices, and clear-words', () => {
    expect(parseShardRange('0-24')).toEqual({ start: 0, end: 24 });
    expect(parseShardRange('7')).toEqual({ start: 7, end: 7 });
    expect(parseShardRange('all')).toBeNull();
    expect(parseShardRange('none')).toBeNull();
    expect(parseShardRange('')).toBeNull();
    expect(parseShardRange('24-0')).toBe('invalid');
    expect(parseShardRange('nope')).toBe('invalid');
  });
});

describe('applyAssignedShard', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function storeWithDevice(shard: { start: number; end: number } | null) {
    const store = openStore({ baseDir: mkdtempSync(join(tmpdir(), 'wg-assign-')) });
    store.registerDevice('demo', { id: 'dev-1', name: 'stage-left' });
    if (shard) store.assignShard('demo', 'dev-1', shard);
    return store;
  }

  it('applies this device\'s assigned shard when no explicit shard is set', () => {
    delete process.env.SHARD_START;
    delete process.env.SHARD_END;
    applyAssignedShard(storeWithDevice({ start: 0, end: 24 }), 'demo', 'dev-1');
    expect(process.env.SHARD_START).toBe('0');
    expect(process.env.SHARD_END).toBe('24');
  });

  it('does not override an explicit --shard (env already set)', () => {
    process.env.SHARD_START = '10';
    process.env.SHARD_END = '20';
    applyAssignedShard(storeWithDevice({ start: 0, end: 5 }), 'demo', 'dev-1');
    expect(process.env.SHARD_START).toBe('10');
    expect(process.env.SHARD_END).toBe('20');
  });

  it('is a no-op when the device has no assigned shard', () => {
    delete process.env.SHARD_START;
    applyAssignedShard(storeWithDevice(null), 'demo', 'dev-1');
    expect(process.env.SHARD_START).toBeUndefined();
  });
});

describe('runServer (dry-run)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.WAVEGRID_LAYOUT;
    delete process.env.WAVEGRID_MODE;
    delete process.env.WAVEGRID_PORT;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('resolves the configured port without starting anything', async () => {
    const cwd = scratchDir('ring-6', 3333);
    const result = await runServer({ cwd, dryRun: true });
    expect(result.port).toBe(3333);
    expect(typeof result.stop).toBe('function');
  });
});

describe('runReceiver (dry-run)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.WAVEGRID_LAYOUT;
    delete process.env.WAVEGRID_MODE;
    delete process.env.SIMULATOR_URL;
    delete process.env.SHARD_START;
    delete process.env.SHARD_END;
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.env = { ...saved };
    process.exitCode = undefined;
  });

  it('applies --server and --shard', async () => {
    const cwd = scratchDir('grid-7x7');
    const result = await runReceiver({
      cwd,
      dryRun: true,
      flags: { server: 'ws://192.168.1.42:3333', shard: '0-24' }
    });
    expect(result.server).toBe('ws://192.168.1.42:3333');
    expect(process.env.SHARD_START).toBe('0');
    expect(process.env.SHARD_END).toBe('24');
  });

  it('rejects a malformed --shard with a non-zero exit code', async () => {
    const cwd = scratchDir('ring-6');
    await runReceiver({ cwd, dryRun: true, flags: { shard: '99-1' } });
    expect(process.exitCode).toBe(1);
  });

  it('uses the configured brain when no flag is supplied', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wg-rt-'));
    const cfg = buildConfig({ shape: 'preset', preset: 'ring-6', mode: 'auto' });
    cfg.receiver = { alpha: 0.06, fallbackDelay: 3000, server: 'wss://grace.hipzap.com' };
    writeFileSync(join(cwd, CONFIG_FILENAME), serializeConfig(cfg));
    const result = await runReceiver({ cwd, dryRun: true, flags: { discover: false } });
    expect(result.server).toBe('wss://grace.hipzap.com');
  });

  it('lets an explicit flag override the configured brain', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wg-rt-'));
    const cfg = buildConfig({ shape: 'preset', preset: 'ring-6', mode: 'auto' });
    cfg.receiver = { alpha: 0.06, fallbackDelay: 3000, server: 'wss://grace.hipzap.com' };
    writeFileSync(join(cwd, CONFIG_FILENAME), serializeConfig(cfg));
    const result = await runReceiver({
      cwd,
      dryRun: true,
      flags: { discover: false, server: 'ws://127.0.0.1:3000' }
    });
    expect(result.server).toBe('ws://127.0.0.1:3000');
  });
});

describe('resolveUpstream', () => {
  it('prefers an explicit flag over the configured brain', async () => {
    const discover = jest.fn(async () => 'ws://discovered:3000');
    await expect(resolveUpstream('ws://flag:3000', 'ws://configured:3000', discover)).resolves.toBe('ws://flag:3000');
    expect(discover).not.toHaveBeenCalled();
  });

  it('prefers the configured brain without discovery', async () => {
    const discover = jest.fn(async () => 'ws://discovered:3000');
    await expect(resolveUpstream(undefined, 'ws://configured:3000', discover)).resolves.toBe('ws://configured:3000');
    expect(discover).not.toHaveBeenCalled();
  });

  it('uses the discovered brain when no flag or config is set', async () => {
    const discover = jest.fn(async () => 'ws://discovered:3000');
    await expect(resolveUpstream(undefined, undefined, discover)).resolves.toBe('ws://discovered:3000');
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when no upstream is available', async () => {
    const discover = jest.fn(async (): Promise<string | undefined> => undefined);
    await expect(resolveUpstream(undefined, undefined, discover)).resolves.toBeUndefined();
    expect(discover).toHaveBeenCalledTimes(1);
  });
});
