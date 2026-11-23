import { loadProjectPlugins, parseProjectFile, readProjectPluginFile } from '@wavegrid/settings';
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import vm from 'vm';

import { run } from '../src/cli';
import { runPluginsNew } from '../src/commands/plugins';
import { getStore } from '../src/project';

const saved = { ...process.env };
let root: string, file: string;
const original = { wavegrid: 'project', version: 1, name: 'venue', description: 'Keep me',
  config: { layout: { preset: 'ring-6' } },
  looks: [{ id: 'saved', name: 'Existing Look', params: { hue: 42 }, createdAt: 123 }],
  future: { nested: ['unchanged'] } };
const document = () => JSON.parse(readFileSync(file, 'utf8'));
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wg-plugin-new-'));
  process.env.APPSTASH_BASE_DIR = join(root, 'store');
  delete process.env.WAVEGRID_PROJECT;
  file = join(root, 'venue.wavegrid');
  writeFileSync(file, JSON.stringify(original));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  process.exitCode = undefined;
});
afterEach(() => {
  process.env = { ...saved };
  process.exitCode = undefined;
  jest.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

it.each([{}, { view: true }, { audio: 'grace' }, { view: true, audio: 'grace' }])('scaffolds, loads and round-trips %j', options => {
  runPluginsNew({ project: file, ...options }, 'demo');
  expect(process.exitCode).toBeUndefined();
  const raw = document();
  expect(raw).toEqual({ ...original, plugins: [{ path: 'plugins/demo' }] });
  expect(parseProjectFile(raw).plugins).toEqual(raw.plugins);
  const store = getStore();
  store.openProjectFile(file, raw, { activate: true });
  const loaded = loadProjectPlugins(store.paths, 'venue');
  expect(loaded.errors).toEqual([]);
  expect(loaded.plugins[0]).toMatchObject({ id: 'demo', tabs: [{ id: 'main', pattern: 'pattern.js' }] });
  const tab = loaded.plugins[0].tabs[0];
  expect(tab.view).toBe(options.view ? 'view/index.html' : undefined);
  expect(tab.audio).toEqual(options.audio ? { mode: 'grace', params: { hueShift: 'hueShift', satShift: 'satShift' } } : undefined);
  const source = readProjectPluginFile(store.paths, 'venue', 'demo', 'pattern.js')!.toString();
  const pattern = vm.runInNewContext(source);
  const set = jest.fn();
  pattern.render({ count: 2, p: { hue: 20, hueShift: 30, satShift: -10 }, set });
  expect(set.mock.calls).toEqual([[0, 50, 75, 70], [1, 50, 75, 70]]);
  store.saveProjectFile('venue');
  expect(document()).toMatchObject(raw);
});

it('dispatches the command and retains existing plugin references', async () => {
  await run(['plugins', 'new', 'first', '--project', file]);
  await run(['plugins', 'new', 'second', '--project', file, '--view', '--audio', 'grace']);
  expect(process.exitCode).toBeUndefined();
  expect(document().plugins).toEqual([{ path: 'plugins/first' }, { path: 'plugins/second' }]);
  getStore().openProjectFile(file, document());
  expect(loadProjectPlugins(getStore().paths, 'venue').plugins.map(plugin => plugin.id)).toEqual(['first', 'second']);
});

it('uses the active project linked file when --project is omitted', () => {
  getStore().openProjectFile(file, original, { activate: true });
  runPluginsNew({}, 'demo');
  expect(process.exitCode).toBeUndefined();
  expect(document().plugins).toEqual([{ path: 'plugins/demo' }]);
});

it.each([undefined, '', '.', '..', '../escape', '/absolute', 'a/b', 'has space', 'has"quote'])('rejects id %j without modifying the project', id => {
  const before = readFileSync(file, 'utf8');
  runPluginsNew({ project: file }, id);
  expect(process.exitCode).toBe(1);
  expect(readFileSync(file, 'utf8')).toBe(before);
  expect(existsSync(join(root, 'plugins'))).toBe(false);
});

it.each([{ project: true }, { audio: 'energy' }, { audio: true }, { view: 'yes' }])('rejects invalid options %j', flags => {
  runPluginsNew({ project: file, ...flags }, 'demo');
  expect(process.exitCode).toBe(1);
  expect(document()).toEqual(original);
  expect(existsSync(join(root, 'plugins'))).toBe(false);
});

it('requires a linked or explicit project file', () => {
  runPluginsNew({}, 'demo');
  expect(process.exitCode).toBe(1);
  const store = getStore();
  store.createProject('unlinked', {});
  store.setActiveProject('unlinked');
  runPluginsNew({}, 'demo');
  expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('no linked file'));
  expect(existsSync(join(root, 'plugins'))).toBe(false);
});

it('refuses an existing empty folder', () => {
  mkdirSync(join(root, 'plugins/demo'), { recursive: true });
  runPluginsNew({ project: file }, 'demo');
  expect(process.exitCode).toBe(1);
  expect(document()).toEqual(original);
  expect(existsSync(join(root, 'plugins/demo/plugin.json'))).toBe(false);
});

it('refuses to overwrite or register the same plugin again', () => {
  runPluginsNew({ project: file }, 'demo');
  const before = readFileSync(file, 'utf8');
  writeFileSync(join(root, 'plugins/demo/pattern.js'), 'keep this');
  runPluginsNew({ project: file, view: true }, 'demo');
  expect(process.exitCode).toBe(1);
  expect(readFileSync(file, 'utf8')).toBe(before);
  expect(readFileSync(join(root, 'plugins/demo/pattern.js'), 'utf8')).toBe('keep this');
});

it('refuses a duplicate manifest id even at a different existing path', () => {
  runPluginsNew({ project: file }, 'first');
  const manifest = join(root, 'plugins/first/plugin.json');
  const raw = JSON.parse(readFileSync(manifest, 'utf8'));
  writeFileSync(manifest, JSON.stringify({ ...raw, id: 'second' }));
  const before = readFileSync(file, 'utf8');
  runPluginsNew({ project: file }, 'second');
  expect(process.exitCode).toBe(1);
  expect(readFileSync(file, 'utf8')).toBe(before);
  expect(existsSync(join(root, 'plugins/second'))).toBe(false);
});

it('rejects an invalid project before creating files', () => {
  writeFileSync(file, JSON.stringify({ ...original, plugins: ['wrong'] }));
  runPluginsNew({ project: file }, 'demo');
  expect(process.exitCode).toBe(1);
  expect(existsSync(join(root, 'plugins'))).toBe(false);
});

it('removes the new folder if the atomic project update fails', () => {
  const before = readFileSync(file, 'utf8');
  jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('disk error'); });
  runPluginsNew({ project: file }, 'demo');
  expect(process.exitCode).toBe(1);
  expect(readFileSync(file, 'utf8')).toBe(before);
  expect(existsSync(join(root, 'plugins/demo'))).toBe(false);
});

it('does not follow a symlinked plugins folder', () => {
  const outside = join(root, 'outside');
  mkdirSync(outside);
  symlinkSync(outside, join(root, 'plugins'), 'junction');
  runPluginsNew({ project: file }, 'demo');
  expect(process.exitCode).toBe(1);
  expect(existsSync(join(outside, 'demo'))).toBe(false);
  expect(document()).toEqual(original);
});

it('wires init, state, params and the shared brush with parent source checks', () => {
  runPluginsNew({ project: file, view: true }, 'demo');
  const html = readFileSync(join(root, 'plugins/demo/view/index.html'), 'utf8');
  const elements = Object.fromEntries(['hue', 'status', 'start', 'stop', 'use-brush', 'set-brush'].map(id => [id, { value: '', textContent: '' }])) as Record<string, any>;
  let receive: (event: unknown) => void;
  const parent = { postMessage: jest.fn() };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)![1], {
    document: { getElementById: (id: string) => elements[id] }, parent,
    window: { addEventListener: (_: string, handler: typeof receive) => { receive = handler; } }
  });
  const event = (data: unknown) => receive({ source: parent, data: { wg: 1, ...data as object } });
  event({ type: 'init', brush: { h: 120, s: 80, b: 65 }, pattern: { running: false, params: { hue: 30 } } });
  expect(elements.hue.value).toBe(30);
  elements['use-brush'].onclick();
  expect(parent.postMessage).toHaveBeenLastCalledWith({ wg: 1, type: 'setParams', params: { hue: 120, saturation: 80, brightness: 65 } }, '*');
  event({ type: 'state', running: true, params: { hue: 90, saturation: 70, brightness: 50 } });
  expect(elements.status.textContent).toBe('Running');
  elements['set-brush'].onclick();
  expect(parent.postMessage).toHaveBeenLastCalledWith({ wg: 1, type: 'setBrush', h: 90, s: 70, b: 50 }, '*');
  event({ type: 'brush', h: 240, s: 100, b: 40 });
  elements['use-brush'].onclick();
  expect(parent.postMessage).toHaveBeenLastCalledWith({ wg: 1, type: 'setParams', params: { hue: 240, saturation: 100, brightness: 40 } }, '*');
  receive({ source: {}, data: { wg: 1, type: 'state', running: false, params: { hue: 1 } } });
  expect(elements.hue.value).toBe(90);
});
