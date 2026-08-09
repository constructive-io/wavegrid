import type { Inquirerer } from 'inquirerer';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { runConfigSet } from '../src/commands/config-set';
import { getStore } from '../src/project';

function isolate(): void {
  process.env.APPSTASH_BASE_DIR = mkdtempSync(join(tmpdir(), 'wg-cfgset-'));
}

/** A prompter stub that answers each question from a scripted map by name. */
function scriptedPrompter(answers: Record<string, unknown>): Inquirerer {
  return {
    prompt: async (_argv: unknown, questions: Array<{ name: string }>) => {
      const out: Record<string, unknown> = {};
      for (const q of questions) out[q.name] = answers[q.name];
      return out;
    }
  } as unknown as Inquirerer;
}

const saved = { ...process.env };
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...saved };
  jest.restoreAllMocks();
});

describe('runConfigSet', () => {
  it('changes the stored layout preset for the active project', async () => {
    isolate();
    const store = getStore();
    store.createProject('ring-demo', { layout: { preset: 'grid-7x7' } });

    await runConfigSet('layout', 'ring-6', {});

    expect(store.getProjectConfig('ring-demo')?.layout).toEqual({ preset: 'ring-6' });
  });

  it('sets the server port and preserves the host', async () => {
    isolate();
    const store = getStore();
    store.createProject('p', { layout: { preset: 'ring-6' }, server: { host: '10.0.0.1', port: 5000 } });

    await runConfigSet('port', '3000', {});

    expect(store.getProjectConfig('p')?.server).toEqual({ host: '10.0.0.1', port: 3000 });
  });

  it('accepts shorthand for a custom shape', async () => {
    isolate();
    const store = getStore();
    store.createProject('p', { layout: { preset: 'grid-7x7' } });

    await runConfigSet('layout', 'annulus:25@0.4', {});

    expect(store.getProjectConfig('p')?.layout).toEqual({ kind: 'annulus', count: 25, innerRadius: 0.4 });
  });

  it('rejects an unknown layout without writing', async () => {
    isolate();
    const store = getStore();
    store.createProject('p', { layout: { preset: 'ring-6' } });

    await expect(runConfigSet('layout', 'nope', {})).rejects.toThrow(/Unknown layout/);
    expect(store.getProjectConfig('p')?.layout).toEqual({ preset: 'ring-6' });
  });

  it('rejects a non-integer port', async () => {
    isolate();
    getStore().createProject('p', { layout: { preset: 'ring-6' } });
    await expect(runConfigSet('port', 'abc', {})).rejects.toThrow(/integer/);
  });

  it('errors (exit 1) on an unknown key', async () => {
    isolate();
    getStore().createProject('p', { layout: { preset: 'ring-6' } });
    process.exitCode = 0;
    await runConfigSet('bogus', 'x', {});
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('errors (exit 1, no crash) when the key is missing and there is no TTY', async () => {
    isolate();
    getStore().createProject('p', { layout: { preset: 'ring-6' } });
    process.exitCode = 0;
    await runConfigSet(undefined, undefined, {});
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('prompts for the key and value when neither is given (interactive)', async () => {
    isolate();
    const store = getStore();
    store.createProject('ring-demo', { layout: { preset: 'grid-7x7' } });

    await runConfigSet(undefined, undefined, {}, scriptedPrompter({ key: 'layout', value: 'ring-6' }));

    expect(store.getProjectConfig('ring-demo')?.layout).toEqual({ preset: 'ring-6' });
  });

  it('prompts for just the value when the key is given (interactive)', async () => {
    isolate();
    const store = getStore();
    store.createProject('ring-demo', { layout: { preset: 'ring-6' } });

    await runConfigSet('port', undefined, {}, scriptedPrompter({ value: 4455 }));

    expect(store.getProjectConfig('ring-demo')?.server?.port).toBe(4455);
  });

  it('toggles config sync off and back on, preserving the secrets gate', async () => {
    isolate();
    const store = getStore();
    store.createProject('p', { layout: { preset: 'ring-6' }, sync: { enabled: true, secrets: true } });

    await runConfigSet('sync', 'false', {});
    expect(store.getProjectConfig('p')?.sync).toEqual({ enabled: false, secrets: true });

    await runConfigSet('sync', 'on', {});
    expect(store.getProjectConfig('p')?.sync).toEqual({ enabled: true, secrets: true });
  });

  it('rejects a non-boolean sync value', async () => {
    isolate();
    getStore().createProject('p', { layout: { preset: 'ring-6' } });
    await expect(runConfigSet('sync', 'maybe', {})).rejects.toThrow(/true or false/);
  });
});
