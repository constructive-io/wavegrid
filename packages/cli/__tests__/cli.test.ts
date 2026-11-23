import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { parseArgs, run } from '../src/cli';
import { buildConfig, CONFIG_FILENAME, serializeConfig } from '../src/config-file';
import { runStart, servicesForMode } from '../src/commands/start';
import { getStore } from '../src/project';

describe('parseArgs', () => {
  it('extracts the command and flags', () => {
    const { command, flags } = parseArgs(['init', '--preset', 'ring-6', '--yes']);
    expect(command).toBe('init');
    expect(flags.preset).toBe('ring-6');
    expect(flags.yes).toBe(true);
  });

  it('coerces numeric and boolean values', () => {
    const { flags } = parseArgs(['start', '--count', '25', '--flag', 'false']);
    expect(flags.count).toBe(25);
    expect(flags.flag).toBe(false);
  });

  it('expands short flag clusters', () => {
    const { flags } = parseArgs(['-hv']);
    expect(flags.h).toBe(true);
    expect(flags.v).toBe(true);
  });
});

describe('servicesForMode', () => {
  it('runs server + receiver in-process for simple mode', () => {
    expect(servicesForMode('simple').map((s) => s.label)).toEqual(['server', 'receiver']);
  });

  it('flags the receiver as sharded for distributed mode', () => {
    expect(servicesForMode('distributed').map((s) => s.label)).toEqual(['server', 'receiver (shard)']);
  });
});

test('stations remove --help prints usage without removing a station', async () => {
  const previous = process.env.APPSTASH_BASE_DIR;
  const root = mkdtempSync(join(tmpdir(), 'wg-stations-help-'));
  process.env.APPSTASH_BASE_DIR = root;
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const store = getStore();
    store.createProject('demo', { layout: { preset: 'ring-6' } });
    await run(['stations', 'add', 'north', '0', '--project', 'demo']);
    const config = store.getProjectConfig('demo');
    await run(['stations', 'remove', 'north', '--project', 'demo', '--help']);
    expect(store.getProjectConfig('demo')).toEqual(config);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/Usage: wavegrid stations/));
  } finally {
    log.mockRestore();
    if (previous === undefined) delete process.env.APPSTASH_BASE_DIR;
    else process.env.APPSTASH_BASE_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

function scratchDir(preset: string): string {
  const root = mkdtempSync(join(tmpdir(), 'wg-ws-'));
  writeFileSync(join(root, CONFIG_FILENAME), serializeConfig(buildConfig({ shape: 'preset', preset, mode: 'auto' })));
  const cwd = join(root, 'nested');
  mkdirSync(cwd, { recursive: true });
  return cwd;
}

describe('runStart (dry-run)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.WAVEGRID_LAYOUT;
    delete process.env.WAVEGRID_MODE;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('selects simple mode under the threshold', async () => {
    const cwd = scratchDir('ring-6');
    const result = await runStart({ cwd, dryRun: true });
    expect(result.runMode).toBe('simple');
    expect(result.services.map((s) => s.label)).toEqual(['server', 'receiver']);
  });

  it('selects distributed mode above the threshold', async () => {
    const cwd = scratchDir('grid-7x7');
    const result = await runStart({ cwd, dryRun: true });
    expect(result.runMode).toBe('distributed');
    expect(result.services.map((s) => s.label)).toEqual(['server', 'receiver (shard)']);
  });

  it('discovers config by walking up from a nested cwd', async () => {
    const cwd = scratchDir('ring-6');
    const result = await runStart({ cwd, dryRun: true });
    expect(result.runMode).toBe('simple');
  });
});
