import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { runProjectsOpen, runProjectsSave } from '../src/commands/project-file';
import { getStore } from '../src/project';

const saved = { ...process.env };
let logs: string[];
beforeEach(() => {
  process.env.APPSTASH_BASE_DIR = mkdtempSync(join(tmpdir(), 'wg-pf-cli-'));
  logs = [];
  jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.join(' '));
  });
  process.exitCode = undefined;
});
afterEach(() => {
  process.env = { ...saved };
  process.exitCode = undefined;
  jest.restoreAllMocks();
});

describe('projects open / save', () => {
  it('opens a .wavegrid file and saves edits back to it', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'wg-pf-repo-')), 'venue.wavegrid');
    writeFileSync(
      file,
      JSON.stringify({ wavegrid: 'project', version: 1, name: 'venue', config: { layout: { preset: 'ring-6' } } })
    );

    runProjectsOpen({ activate: true }, file);
    expect(process.exitCode).toBeUndefined();
    const store = getStore();
    expect(store.getActiveProject()).toBe('venue');

    store.saveProjectConfig('venue', { layout: { preset: 'grid-7x7' } });
    runProjectsSave({}, undefined);
    expect(process.exitCode).toBeUndefined();
    expect(JSON.parse(readFileSync(file, 'utf8')).config.layout).toEqual({ preset: 'grid-7x7' });
  });

  it('points an export bundle at `projects import`', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'wg-pf-repo-')), 'bundle.json');
    writeFileSync(file, JSON.stringify({ wavegrid: 'project-export', version: 1 }));
    runProjectsOpen({}, file);
    expect(process.exitCode).toBe(1);
    expect(logs.join('\n')).toMatch(/projects import/);
  });

  it('fails without a path', () => {
    runProjectsOpen({}, undefined);
    expect(process.exitCode).toBe(1);
  });
});
