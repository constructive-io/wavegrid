import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadProjectPlugins, openStore, parseBundle, parseProjectFile, PLUGIN_MAX_FILE_BYTES, WAVEGRID_RUNTIME_VERSION } from '../src';
import { projectDir } from '../src/paths';
import { validatePlugin } from '../src/plugins';

const roots: string[] = [];
function temp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-plugins-'));
  roots.push(dir);
  return dir;
}
function json(file: string, value: unknown): void { fs.writeFileSync(file, JSON.stringify(value)); }
function fixture() {
  const folder = temp(), store = openStore({ baseDir: temp() });
  const plugin = path.join(folder, 'show');
  fs.mkdirSync(plugin);
  const manifest = { id: 'show', name: 'Show', version: '1.0.0', apiVersion: 1, pattern: 'pattern.js', tabs: ['tab.json'], presets: 'presets.json' };
  json(path.join(plugin, 'plugin.json'), manifest);
  json(path.join(plugin, 'tab.json'), { id: 'paint', label: 'Paint', cards: [{ title: 'Color', controls: [{ type: 'toggle', param: 'enabled', default: true }] }] });
  json(path.join(plugin, 'presets.json'), { colors: ['red'] });
  fs.writeFileSync(path.join(plugin, 'pattern.js'), 'throw new Error("must never execute on host");');
  fs.writeFileSync(path.join(plugin, 'image.png'), Buffer.from([0, 255, 1, 128]));
  fs.writeFileSync(path.join(plugin, '.secret'), 'do not copy');
  const file = path.join(folder, 'venue.wavegrid');
  const doc = { wavegrid: 'project' as const, version: 1 as const, name: 'venue', config: {}, plugins: [{ path: 'show' }] };
  json(file, doc);
  return { folder, plugin, store, file, doc, manifest, copy: path.join(projectDir(store.paths, 'venue'), 'plugins', 'show') };
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('project plugins', () => {
  it.each([false, true])('accepts view-only and combined tabs (cards: %s)', withCards => {
    const f = fixture();
    fs.writeFileSync(path.join(f.plugin, 'view.html'), '<h1>View</h1>');
    json(path.join(f.plugin, 'tab.json'), { id: 'view', label: 'View', view: 'view.html', paint: true,
      ...(withCards ? { cards: [{ title: 'Empty', controls: [] }] } : {}) });
    f.store.openProjectFile(f.file, f.doc);
    expect(loadProjectPlugins(f.store.paths, 'venue').plugins[0].tabs[0]).toMatchObject({
      view: 'view.html', paint: true, cards: withCards ? [{ title: 'Empty', controls: [] }] : []
    });
  });

  it.each([
    { view: '../escape.html' }, { view: '/absolute.html' }, { view: 'missing.html' }, { view: 1 },
    { paint: 'true', cards: [] }, {}, { cards: null }
  ])('rejects invalid view tab metadata before writes: %j', changes => {
    const f = fixture();
    json(path.join(f.plugin, 'tab.json'), { id: 'view', label: 'View', ...changes });
    expect(() => f.store.openProjectFile(f.file, f.doc)).toThrow();
    expect(f.store.hasProject('venue')).toBe(false);
  });

  it.each(['/absolute', '../escape', 'show/../../escape', 'C:\\escape', 'show\\..\\escape', 'show/../other', ''])('rejects unsafe ref %s', ref => {
    expect(() => parseProjectFile({ wavegrid: 'project', version: 1, name: 'venue', config: {}, plugins: [{ path: ref }] })).toThrow(/plugins/);
  });

  it('rejects duplicate/overlapping paths and preserves the source array verbatim', () => {
    const { doc } = fixture();
    expect(parseProjectFile(doc).plugins).toBe(doc.plugins);
    expect(() => parseProjectFile({ ...doc, plugins: [{ path: 'show' }, { path: 'show' }] })).toThrow(/repeats/);
    expect(() => parseProjectFile({ ...doc, plugins: [{ path: './show/' }, { path: 'show' }] })).toThrow(/repeats/);
    expect(() => parseProjectFile({ ...doc, plugins: [{ path: 'show' }, { path: 'show/sub' }] })).toThrow(/overlaps/);
    expect(() => parseProjectFile({ ...doc, plugins: null })).toThrow(/plugins/);
  });

  it('copies regular files, defaults conditions/patterns, and replaces/removes earlier copies', () => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    expect(fs.readFileSync(path.join(f.copy, 'image.png'))).toEqual(Buffer.from([0, 255, 1, 128]));
    expect(fs.existsSync(path.join(f.copy, '.secret'))).toBe(false);
    expect(loadProjectPlugins(f.store.paths, 'venue')).toEqual({ errors: [], plugins: [{
      id: 'show', name: 'Show', version: '1.0.0', presets: { colors: ['red'] },
      presetsFile: 'presets.json',
      tabs: [{ id: 'paint', label: 'Paint', showWhen: 'always', pattern: 'pattern.js', cards: [{ title: 'Color', controls: [{ type: 'toggle', param: 'enabled', default: true }] }] }]
    }] });
    fs.writeFileSync(path.join(f.copy, 'stale.js'), 'stale');
    f.store.openProjectFile(f.file, f.doc);
    expect(fs.existsSync(path.join(f.copy, 'stale.js'))).toBe(false);
    f.store.openProjectFile(f.file, { ...f.doc, plugins: [] });
    expect(fs.existsSync(f.copy)).toBe(false);
    expect(loadProjectPlugins(f.store.paths, 'venue')).toEqual({ plugins: [], errors: [] });
  });

  it('aggregates broken plugins before writing any project state', () => {
    const f = fixture();
    json(path.join(f.plugin, 'plugin.json'), { ...f.manifest, apiVersion: 99 });
    expect(() => f.store.openProjectFile(f.file, { ...f.doc, plugins: [...f.doc.plugins, { path: 'missing' }] })).toThrow(/missing[\s\S]*apiVersion/);
    expect(f.store.hasProject('venue')).toBe(false);
  });

  it.each([
    { apiVersion: 2 }, { wavegrid: '999.0.0' }, { wavegrid: '^0.5.0' },
    { id: '../escape' }, { tabs: ['../tab.json'] }, { pattern: '/tmp/pattern.js' },
    { presets: 'missing.json' }, { tabs: ['missing.json'] }
  ])('rejects invalid manifest fields %j without modifying an existing project', changes => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    const before = fs.readFileSync(path.join(f.copy, 'plugin.json'), 'utf8');
    json(path.join(f.plugin, 'plugin.json'), { ...f.manifest, ...changes });
    expect(() => f.store.openProjectFile(f.file, f.doc)).toThrow(/plugins/);
    expect(fs.readFileSync(path.join(f.copy, 'plugin.json'), 'utf8')).toBe(before);
  });

  it('compares the running version numerically and rejects duplicate plugin ids', () => {
    const f = fixture();
    json(path.join(f.plugin, 'plugin.json'), { ...f.manifest, wavegrid: WAVEGRID_RUNTIME_VERSION });
    f.store.openProjectFile(f.file, f.doc);
    json(path.join(f.plugin, 'plugin.json'), { ...f.manifest, wavegrid: '0.10.0' });
    expect(() => f.store.openProjectFile(f.file, f.doc)).toThrow(/requires Wavegrid/);
    json(path.join(f.plugin, 'plugin.json'), { ...f.manifest, wavegrid: '0.4.99' });
    fs.cpSync(f.plugin, path.join(f.folder, 'duplicate'), { recursive: true });
    expect(() => f.store.openProjectFile(f.file, { ...f.doc, plugins: [...f.doc.plugins, { path: 'duplicate' }] })).toThrow(/Duplicate plugin id/);
  });

  it('lists independent manifest and file problems together', () => {
    const f = fixture();
    json(path.join(f.plugin, 'plugin.json'), { ...f.manifest, apiVersion: 2, pattern: 'missing.js', presets: 'absent.json' });
    json(path.join(f.plugin, 'tab.json'), { id: 'paint', label: 'Paint', cards: [], showWhen: 'sometimes' });
    let message = '';
    try { f.store.openProjectFile(f.file, f.doc); } catch (e) { message = (e as Error).message; }
    for (const problem of ['apiVersion', 'missing.js', 'showWhen', 'absent.json']) expect(message).toContain(problem);
    expect(f.store.hasProject('venue')).toBe(false);
  });

  it.each([
    { type: 'unknown' }, { type: 'slider', param: 'bad-key', min: 0, max: 1, default: 0 },
    ...['__proto__', 'constructor', 'prototype'].map(param => ({ type: 'toggle', param, default: true }))
  ])('rejects invalid controls at open before writing: %j', control => {
    const f = fixture();
    json(path.join(f.plugin, 'tab.json'), { id: 'paint', label: 'Paint', cards: [{ title: 'Bad', controls: [control] }] });
    expect(() => f.store.openProjectFile(f.file, f.doc)).toThrow(/Invalid control/);
    expect(f.store.hasProject('venue')).toBe(false);
  });

  it.each([
    { showWhen: 'sometimes' }, { showWhen: { minFixtures: 'many' } }, { showWhen: { fixtureKind: 'laser' } },
    { cards: {} }, { cards: [{ title: 'Bad', controls: {} }] }, { pattern: '../escape.js' }
  ])('validates tabs: %j', fields => {
    const f = fixture();
    json(path.join(f.plugin, 'tab.json'), { id: 'paint', label: 'Paint', cards: [], ...fields });
    expect(() => f.store.openProjectFile(f.file, f.doc)).toThrow(/plugins/);
  });

  it('keeps tab-specific patterns and showWhen intact', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.plugin, 'override.js'), '({render(){}})');
    const showWhen = { fixtureKind: 'projector', topology: 'rings', minFixtures: 2, layoutId: ['one', 'two'] };
    json(path.join(f.plugin, 'tab.json'), { id: 'paint', label: 'Paint', showWhen, pattern: 'override.js', cards: [] });
    f.store.openProjectFile(f.file, f.doc);
    expect(loadProjectPlugins(f.store.paths, 'venue').plugins[0].tabs[0]).toMatchObject({ pattern: 'override.js', showWhen });
  });

  it('accepts relative path spelling without rewriting the project plugin array', () => {
    const f = fixture();
    f.doc.plugins[0].path = './show/';
    json(path.join(f.plugin, 'plugin.json'), { ...f.manifest, pattern: './pattern.js', tabs: ['./tab.json'] });
    f.store.openProjectFile(f.file, f.doc);
    expect(f.store.saveProjectFile('venue').document.plugins).toEqual([{ path: './show/' }]);
    expect(loadProjectPlugins(f.store.paths, 'venue')).toMatchObject({ errors: [], plugins: [{ tabs: [{ pattern: 'pattern.js' }] }] });
  });

  it('accepts plugin ids under the full project-name rule, including leading dots', () => {
    const f = fixture();
    json(path.join(f.plugin, 'plugin.json'), { ...f.manifest, id: '.show' });
    f.store.openProjectFile(f.file, f.doc);
    expect(loadProjectPlugins(f.store.paths, 'venue')).toMatchObject({ errors: [], plugins: [{ id: '.show' }] });
  });

  (process.platform === 'win32' ? it.skip : it)('rejects file and directory symlinks, including hidden symlinks', () => {
    const f = fixture();
    for (const name of ['link.js', '.hidden']) {
      fs.symlinkSync(f.file, path.join(f.plugin, name));
      expect(() => f.store.openProjectFile(f.file, f.doc)).toThrow(/symlink/);
      fs.unlinkSync(path.join(f.plugin, name));
    }
    fs.symlinkSync(f.plugin, path.join(f.folder, 'alias'));
    expect(() => f.store.openProjectFile(f.file, { ...f.doc, plugins: [{ path: 'alias' }] })).toThrow(/symlink/);
  });

  it.each(['file', 'total', 'count'])('enforces the %s limit before writing', which => {
    const f = fixture();
    const count = which === 'count' ? 201 : which === 'total' ? 6 : 1;
    for (let i = 0; i < count; i++) fs.writeFileSync(path.join(f.plugin, `asset-${i}`), Buffer.alloc(which === 'count' ? 0 : PLUGIN_MAX_FILE_BYTES + (which === 'file' ? 1 : 0)));
    expect(() => f.store.openProjectFile(f.file, f.doc)).toThrow(/limits/);
    expect(f.store.hasProject('venue')).toBe(false);
  });

  it('save-as copies store files, while saves in the source folder leave external files alone', () => {
    const f = fixture();
    Object.assign(f.doc.plugins[0], { authorNote: 'preserve entry verbatim' });
    f.store.openProjectFile(f.file, f.doc);
    fs.writeFileSync(path.join(f.plugin, 'pattern.js'), 'external edit');
    f.store.saveProjectFile('venue');
    expect(fs.readFileSync(path.join(f.plugin, 'pattern.js'), 'utf8')).toBe('external edit');
    const target = path.join(temp(), 'copy.wavegrid');
    const saved = f.store.saveProjectFile('venue', { file: target });
    expect(saved.document.plugins).toEqual(f.doc.plugins);
    expect(fs.readFileSync(path.join(path.dirname(target), 'show', 'pattern.js'), 'utf8')).toContain('must never execute');
    const reopened = openStore({ baseDir: temp() });
    reopened.openProjectFile(target, JSON.parse(fs.readFileSync(target, 'utf8')));
    expect(loadProjectPlugins(reopened.paths, 'venue').errors).toEqual([]);
  });

  it('checks every save-as destination before writing and preserves nonempty folders by default', () => {
    const f = fixture();
    const second = path.join(f.folder, 'second');
    fs.mkdirSync(second);
    json(path.join(second, 'plugin.json'), { id: 'second', name: 'Second', version: '1.0.0', apiVersion: 1 });
    f.doc.plugins.push({ path: 'second' });
    f.store.openProjectFile(f.file, f.doc);
    const target = temp(), file = path.join(target, 'copy.wavegrid');
    const git = path.join(target, 'second', '.git');
    fs.mkdirSync(git, { recursive: true });
    fs.writeFileSync(path.join(git, 'config'), 'repository config');
    fs.writeFileSync(file, 'existing project document');
    expect(() => f.store.saveProjectFile('venue', { file })).toThrow(/not empty.*overwrite: true/);
    expect(fs.existsSync(path.join(target, 'show'))).toBe(false);
    expect(fs.readFileSync(path.join(git, 'config'), 'utf8')).toBe('repository config');
    expect(fs.readFileSync(file, 'utf8')).toBe('existing project document');
    expect(JSON.parse(fs.readFileSync(path.join(projectDir(f.store.paths, 'venue'), 'project-file.json'), 'utf8')).path).toBe(f.file);
  });

  it('copies into an existing empty plugin destination folder', () => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    const target = temp();
    fs.mkdirSync(path.join(target, 'show'));
    f.store.saveProjectFile('venue', { file: path.join(target, 'copy.wavegrid') });
    expect(JSON.parse(fs.readFileSync(path.join(target, 'show', 'plugin.json'), 'utf8'))).toEqual(f.manifest);
  });

  it('overwrites only plugin files when requested and retains unrelated files and .git', () => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    const target = temp(), plugin = path.join(target, 'show');
    fs.mkdirSync(path.join(plugin, '.git'), { recursive: true });
    fs.writeFileSync(path.join(plugin, '.git', 'config'), 'repository config');
    fs.writeFileSync(path.join(plugin, 'notes.txt'), 'user notes');
    fs.writeFileSync(path.join(plugin, 'pattern.js'), 'old pattern');
    f.store.saveProjectFile('venue', { file: path.join(target, 'copy.wavegrid'), overwrite: true });
    expect(fs.readFileSync(path.join(plugin, 'pattern.js'), 'utf8')).toContain('must never execute');
    expect(fs.readFileSync(path.join(plugin, 'notes.txt'), 'utf8')).toBe('user notes');
    expect(fs.readFileSync(path.join(plugin, '.git', 'config'), 'utf8')).toBe('repository config');
  });

  (process.platform === 'win32' ? it.skip : it)('rejects a destination file symlink even when overwriting', () => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    const target = temp(), plugin = path.join(target, 'show');
    fs.mkdirSync(plugin);
    fs.symlinkSync(path.join(f.plugin, 'pattern.js'), path.join(plugin, 'pattern.js'));
    expect(() => f.store.saveProjectFile('venue', { file: path.join(target, 'copy.wavegrid'), overwrite: true })).toThrow(/symlink/);
    expect(fs.readdirSync(plugin)).toEqual(['pattern.js']);
    expect(fs.existsSync(path.join(target, 'copy.wavegrid'))).toBe(false);
  });

  (process.platform === 'win32' ? it.skip : it)('refuses save-as through a symlink destination parent', () => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    const target = temp(), outside = temp();
    fs.symlinkSync(outside, path.join(target, 'linked'));
    expect(() => f.store.saveProjectFile('venue', { file: path.join(target, 'linked', 'venue.wavegrid') })).toThrow(/symlink/);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('round-trips plugin files in bundles and still imports older bundles without them', () => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    const bundle = JSON.parse(JSON.stringify(f.store.exportProject('venue')));
    expect(bundle.plugins[0].files['image.png']).toBe(Buffer.from([0, 255, 1, 128]).toString('base64'));
    const target = openStore({ baseDir: temp() });
    target.importProject(bundle);
    expect(loadProjectPlugins(target.paths, 'venue')).toEqual(loadProjectPlugins(f.store.paths, 'venue'));
    expect(target.buildProjectFile('venue').document.plugins).toEqual(f.doc.plugins);
    delete bundle.plugins;
    target.importProject(bundle, { overwrite: true });
    expect(loadProjectPlugins(target.paths, 'venue')).toEqual({ plugins: [], errors: [] });
  });

  it('saves a first imported plugin beside the linked project before reopening', () => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    const target = openStore({ baseDir: temp() });
    const file = path.join(temp(), 'venue.wavegrid');
    const doc: typeof f.doc = { ...f.doc, plugins: [] };
    json(file, doc);
    target.openProjectFile(file, doc);
    target.importProject(f.store.exportProject('venue'), { overwrite: true });
    target.saveProjectFile('venue');
    expect(fs.existsSync(path.join(path.dirname(file), 'show', 'plugin.json'))).toBe(true);
    const reopened = openStore({ baseDir: temp() });
    reopened.openProjectFile(file, JSON.parse(fs.readFileSync(file, 'utf8')));
    expect(loadProjectPlugins(reopened.paths, 'venue')).toEqual(loadProjectPlugins(target.paths, 'venue'));
  });

  it.each([false, true])('writes newly imported plugin folders but preserves existing source folders (overwrite: %s)', overwrite => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    const bundle = f.store.exportProject('venue');
    bundle.plugins!.push({ path: 'added', files: { ...bundle.plugins![0].files,
      'plugin.json': Buffer.from(JSON.stringify({ ...f.manifest, id: 'added' })).toString('base64') } });
    fs.writeFileSync(path.join(f.plugin, 'pattern.js'), 'external edit');
    f.store.importProject(bundle, { overwrite: true });
    f.store.saveProjectFile('venue', { overwrite });
    expect(fs.readFileSync(path.join(f.plugin, 'pattern.js'), 'utf8')).toBe('external edit');
    expect(fs.readFileSync(path.join(f.folder, 'added', 'pattern.js'), 'utf8')).toContain('must never execute');
    const reopened = openStore({ baseDir: temp() });
    reopened.openProjectFile(f.file, JSON.parse(fs.readFileSync(f.file, 'utf8')));
    expect(loadProjectPlugins(reopened.paths, 'venue').errors).toEqual([]);
    expect(loadProjectPlugins(reopened.paths, 'venue').plugins.map(plugin => plugin.id)).toEqual(['show', 'added']);
  });

  it('rejects malicious bundle paths/base64 and invalidates broken store copies without crashing', () => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    const bundle = f.store.exportProject('venue');
    const files = bundle.plugins![0].files;
    expect(() => parseBundle({ ...bundle, plugins: [{ path: 'show', files: { ...files, '../outside': '' } }] })).toThrow(/Unsafe/);
    const target = openStore({ baseDir: temp() });
    expect(() => target.importProject({ ...bundle, plugins: [{ path: 'show', files: { ...files, '../outside': '' } }] })).toThrow(/Unsafe/);
    expect(target.hasProject('venue')).toBe(false);
    expect(() => validatePlugin({ path: 'show', files: { ...files, bad: '!!!!' } })).toThrow(/base64/);
    json(path.join(f.copy, 'plugin.json'), { ...f.manifest, apiVersion: 3 });
    expect(loadProjectPlugins(f.store.paths, 'venue')).toMatchObject({ plugins: [], errors: [expect.stringContaining('apiVersion')] });
    expect(() => f.store.exportProject('venue')).toThrow(/Cannot export plugins/);
    fs.writeFileSync(path.join(projectDir(f.store.paths, 'venue'), 'plugins.json'), '{');
    expect(loadProjectPlugins(f.store.paths, 'venue').errors).toHaveLength(1);
  });

  it('reports missing store files and a missing index as errors', () => {
    const f = fixture();
    f.store.openProjectFile(f.file, f.doc);
    fs.unlinkSync(path.join(f.copy, 'tab.json'));
    expect(loadProjectPlugins(f.store.paths, 'venue').errors[0]).toContain('Missing plugin file');
    fs.unlinkSync(path.join(projectDir(f.store.paths, 'venue'), 'plugins.json'));
    expect(loadProjectPlugins(f.store.paths, 'venue')).toEqual({ plugins: [], errors: ['Missing plugin index'] });
  });
});
