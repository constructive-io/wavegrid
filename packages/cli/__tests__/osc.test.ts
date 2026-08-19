import type { Inquirerer } from 'inquirerer';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { runOscSetup } from '../src/commands/osc';
import { getStore } from '../src/project';

function isolate(): void {
  process.env.APPSTASH_BASE_DIR = mkdtempSync(join(tmpdir(), 'wg-osc-'));
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

describe('runOscSetup', () => {
  it('sets a BEYOND target from flags (no TTY), defaulting port + grid order', async () => {
    isolate();
    const store = getStore();
    store.createProject('ring-demo', { layout: { preset: 'ring-6' } });

    await runOscSetup('beyond', { host: '192.168.1.50' });

    expect(store.getProjectConfig('ring-demo')?.osc).toEqual({
      beyond: { host: '192.168.1.50', port: 8000, gridOrder: 'row' }
    });
  });

  it('honors explicit port + grid order', async () => {
    isolate();
    const store = getStore();
    store.createProject('p', { layout: { preset: 'ring-6' } });

    await runOscSetup('beyond', { host: '10.0.0.9', port: 9000, 'grid-order': 'column' });

    expect(store.getProjectConfig('p')?.osc).toEqual({
      beyond: { host: '10.0.0.9', port: 9000, gridOrder: 'column' }
    });
  });

  it('sets an FB4 target and replaces any prior target', async () => {
    isolate();
    const store = getStore();
    store.createProject('p', { layout: { preset: 'ring-6' }, osc: { beyond: { host: 'x', port: 1, gridOrder: 'row' } } });

    await runOscSetup('fb4', { host: '1.2.3.4' });

    expect(store.getProjectConfig('p')?.osc).toEqual({ fb4: { host: '1.2.3.4', port: 8000 } });
  });

  it('clears the target', async () => {
    isolate();
    const store = getStore();
    store.createProject('p', { layout: { preset: 'ring-6' }, osc: { fb4: { host: '1.2.3.4', port: 8000 } } });

    await runOscSetup('clear', {});

    expect(store.getProjectConfig('p')?.osc).toEqual({});
  });

  it('no-TTY without a host prints usage and exits 1', async () => {
    isolate();
    getStore().createProject('p', { layout: { preset: 'ring-6' } });
    process.exitCode = 0;
    await runOscSetup('beyond', {});
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('bare no-TTY prints usage without failing (exit 0)', async () => {
    isolate();
    getStore().createProject('p', { layout: { preset: 'ring-6' } });
    process.exitCode = 0;
    await runOscSetup(undefined, {});
    expect(process.exitCode).toBe(0);
  });

  it('interactive wizard walks through BEYOND setup', async () => {
    isolate();
    const store = getStore();
    store.createProject('ring-demo', { layout: { preset: 'ring-6' } });

    await runOscSetup(
      undefined,
      {},
      scriptedPrompter({ kind: 'beyond', host: '192.168.1.77', port: 7001, gridOrder: 'row' })
    );

    expect(store.getProjectConfig('ring-demo')?.osc).toEqual({
      beyond: { host: '192.168.1.77', port: 7001, gridOrder: 'row' }
    });
  });

  it('interactive wizard "none" clears the target', async () => {
    isolate();
    const store = getStore();
    store.createProject('p', { layout: { preset: 'ring-6' }, osc: { fb4: { host: 'a', port: 8000 } } });

    await runOscSetup(undefined, {}, scriptedPrompter({ kind: 'none' }));

    expect(store.getProjectConfig('p')?.osc).toEqual({});
  });
});
