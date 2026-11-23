import type { ShowWhen } from '@wavegrid/animations';
import fs from 'fs';
import path from 'path';

import { projectDir, type StorePaths, writeFileAtomic } from './paths';
import { isProjectName } from './projects';

export const WAVEGRID_RUNTIME_VERSION = '0.5.0';
export const PLUGIN_MAX_FILES = 200;
export const PLUGIN_MAX_FILE_BYTES = 1024 * 1024;
export const PLUGIN_MAX_BYTES = 5 * 1024 * 1024;
export const PLUGIN_MAX_DEPTH = 16;

export interface ProjectPluginRef { path: string }
export interface PluginTab {
  id: string;
  label: string;
  showWhen: ShowWhen;
  cards: { title: string; controls: unknown[] }[];
  pattern?: string;
}
export interface ProjectPlugin {
  id: string;
  name: string;
  version: string;
  tabs: PluginTab[];
  presets?: unknown;
}
export interface PortablePlugin extends ProjectPluginRef { files: Record<string, string> }
export interface PluginSnapshot extends PortablePlugin { plugin: ProjectPlugin }

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function relativePath(value: unknown, allowHidden = false): string | null {
  if (typeof value !== 'string' || !value || path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) || /[\\:\0]/.test(value)) return null;
  const parts = value.split('/');
  if (parts.includes('..')) return null;
  const normalized = parts.filter(part => part && part !== '.');
  if (!normalized.length || (!allowHidden && normalized.some(part => part.startsWith('.')))) return null;
  return normalized.join('/');
}

export function pluginRefProblems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ['"plugins" must be a list'];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((ref, i) => {
    const normalized = object(ref) ? relativePath(ref.path, true) : null;
    if (!normalized) errors.push(`plugins[${i}].path must name a relative subfolder without parent components`);
    else if (seen.has(normalized)) errors.push(`plugins[${i}] repeats path "${(ref as ProjectPluginRef).path}"`);
    else if ([...seen].some(other => other.startsWith(normalized + '/') || normalized.startsWith(other + '/'))) {
      errors.push(`plugins[${i}] overlaps another plugin folder`);
    }
    else seen.add(normalized);
  });
  return errors;
}

function assertPath(value: unknown): asserts value is string {
  if (!relativePath(value)) throw new Error(`Unsafe plugin path: ${String(value)}`);
}

/** Check each component, not only the leaf: a parent symlink can escape too. */
export function pluginFile(root: string, relative: string, allowHidden = false): string {
  const normalized = relativePath(relative, allowHidden);
  if (!normalized) throw new Error(`Unsafe plugin path: ${relative}`);
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error(`Not a regular plugin folder: ${root}`);
  let file = root;
  for (const component of normalized.split('/')) {
    file = path.join(file, component);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Plugin symlink: ${relative}`);
  }
  return file;
}

function snapshotFolder(root: string): Record<string, string> {
  const files: Record<string, string> = Object.create(null);
  let bytes = 0;
  let count = 0;
  function walk(relative: string): void {
    if (relative.split('/').length > PLUGIN_MAX_DEPTH) throw new Error(`Plugin exceeds directory depth ${PLUGIN_MAX_DEPTH}`);
    const folder = relative ? pluginFile(root, relative) : root;
    if (fs.lstatSync(folder).isSymbolicLink() || !fs.lstatSync(folder).isDirectory()) throw new Error(`Not a regular plugin folder: ${folder}`);
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Plugin symlink: ${entry.name}`);
      if (entry.name.startsWith('.')) continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      assertPath(name);
      if (entry.isDirectory()) walk(name);
      else {
        if (!entry.isFile()) throw new Error(`Plugin entry is not a regular file: ${name}`);
        const file = pluginFile(root, name);
        const size = fs.statSync(file).size;
        if (++count > PLUGIN_MAX_FILES || size > PLUGIN_MAX_FILE_BYTES || (bytes += size) > PLUGIN_MAX_BYTES) {
          throw new Error(`Plugin exceeds file limits (${PLUGIN_MAX_FILES} files, ${PLUGIN_MAX_FILE_BYTES} bytes/file, ${PLUGIN_MAX_BYTES} bytes/plugin)`);
        }
        files[name] = fs.readFileSync(file).toString('base64');
      }
    }
  }
  walk('');
  return files;
}

function showWhen(value: unknown): value is ShowWhen {
  if (value === 'always' || value === 'never') return true;
  if (!object(value)) return false;
  return Object.keys(value).every(key => ['fixtureKind', 'topology', 'minFixtures', 'layoutId'].includes(key)) &&
    (value.fixtureKind === undefined || value.fixtureKind === 'cannon' || value.fixtureKind === 'projector') &&
    (value.topology === undefined || typeof value.topology === 'string') &&
    (value.minFixtures === undefined || (typeof value.minFixtures === 'number' && Number.isFinite(value.minFixtures))) &&
    (value.layoutId === undefined || typeof value.layoutId === 'string' ||
      (Array.isArray(value.layoutId) && value.layoutId.every(id => typeof id === 'string')));
}

function versionParts(value: unknown): number[] {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('wavegrid minimum must be x.y.z');
  return value.split('.').map(Number);
}

export function validatePlugin(ref: PortablePlugin): PluginSnapshot {
  if (!relativePath(ref.path, true)) throw new Error(`Unsafe plugin path: ${ref.path}`);
  if (!object(ref.files)) throw new Error('Plugin files must be an object');
  const names = Object.keys(ref.files);
  if (names.length > PLUGIN_MAX_FILES) throw new Error('Plugin exceeds file count limit');
  let bytes = 0;
  for (const name of names) {
    assertPath(name);
    if (relativePath(name) !== name) throw new Error(`Non-canonical plugin file: ${name}`);
    const encoded = ref.files[name];
    if (name.split('/').length > PLUGIN_MAX_DEPTH + 1) throw new Error('Plugin exceeds directory depth limit');
    if (typeof encoded !== 'string' || encoded.length > Math.ceil(PLUGIN_MAX_FILE_BYTES / 3) * 4 ||
      Buffer.from(encoded, 'base64').toString('base64') !== encoded) throw new Error(`Invalid base64 plugin file: ${name}`);
    const size = Buffer.byteLength(encoded, 'base64');
    if (size > PLUGIN_MAX_FILE_BYTES || (bytes += size) > PLUGIN_MAX_BYTES) throw new Error('Plugin exceeds byte limits');
    if (names.some(other => other.startsWith(name + '/'))) throw new Error(`Plugin file/folder conflict: ${name}`);
  }
  const requireFile = (name: unknown): string => {
    assertPath(name);
    const normalized = relativePath(name)!;
    if (!Object.prototype.hasOwnProperty.call(ref.files, normalized)) throw new Error(`Missing plugin file: ${name}`);
    return normalized;
  };
  const json = (name: unknown): unknown => JSON.parse(Buffer.from(ref.files[requireFile(name)], 'base64').toString('utf8'));
  const manifest = json('plugin.json');
  if (!object(manifest)) throw new Error('plugin.json must be an object');
  const problems: string[] = [];
  function attempt<T>(where: string, run: () => T): T | undefined {
    try { return run(); } catch (e) { problems.push(`${where}: ${(e as Error).message}`); return undefined; }
  }
  if (!isProjectName(manifest.id)) problems.push('plugin.json id must follow the project-name rule');
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) problems.push('plugin.json needs a name');
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) problems.push('plugin.json needs a version');
  if (manifest.apiVersion !== 1) problems.push(`Unsupported plugin apiVersion ${String(manifest.apiVersion)}`);
  if (manifest.wavegrid !== undefined) attempt('wavegrid', () => {
    const min = versionParts(manifest.wavegrid), running = versionParts(WAVEGRID_RUNTIME_VERSION);
    const diff = min.map((part, i) => part - running[i]).find(n => n !== 0) ?? 0;
    if (diff > 0) throw new Error(`Plugin requires Wavegrid ${manifest.wavegrid}; running ${WAVEGRID_RUNTIME_VERSION}`);
  });
  const pattern = manifest.pattern === undefined ? undefined : attempt('pattern', () => requireFile(manifest.pattern));
  if (manifest.tabs !== undefined && !Array.isArray(manifest.tabs)) problems.push('Plugin tabs must be a list');
  const ids = new Set<string>();
  const tabs: PluginTab[] = [];
  for (const file of Array.isArray(manifest.tabs) ? manifest.tabs : []) {
    const tab = attempt(String(file), (): PluginTab => {
      const tab = json(file);
      if (!object(tab) || typeof tab.id !== 'string' || !tab.id.trim() || typeof tab.label !== 'string' || !tab.label.trim()) throw new Error('Tab needs id and label');
      if (ids.has(tab.id)) throw new Error(`Duplicate tab id: ${tab.id}`);
      ids.add(tab.id);
      const condition = tab.showWhen === undefined ? 'always' : tab.showWhen;
      if (!showWhen(condition)) throw new Error(`Invalid showWhen for tab ${tab.id}`);
      if (!Array.isArray(tab.cards) || !tab.cards.every(card => object(card) && typeof card.title === 'string' && Array.isArray(card.controls))) {
        throw new Error(`Tab ${tab.id} cards need title and controls array`);
      }
      return { id: tab.id, label: tab.label, showWhen: condition, cards: tab.cards as PluginTab['cards'],
        ...(tab.pattern !== undefined || pattern !== undefined ? { pattern: tab.pattern === undefined ? pattern : requireFile(tab.pattern) } : {}) };
    });
    if (tab) tabs.push(tab);
  }
  const presets = manifest.presets === undefined ? undefined : attempt('presets', () => json(manifest.presets));
  if (problems.length) throw new Error(problems.join('; '));
  const plugin: ProjectPlugin = { id: manifest.id as string, name: manifest.name as string, version: manifest.version as string, tabs };
  if (manifest.presets !== undefined) plugin.presets = presets;
  return { path: ref.path, files: ref.files, plugin };
}

function validateAll(refs: PortablePlugin[]): PluginSnapshot[] {
  const errors: string[] = pluginRefProblems(refs);
  const ids = new Set<string>();
  const snapshots: PluginSnapshot[] = [];
  for (const ref of refs) {
    try {
      const snapshot = validatePlugin(ref);
      if (ids.has(snapshot.plugin.id)) throw new Error(`Duplicate plugin id: ${snapshot.plugin.id}`);
      ids.add(snapshot.plugin.id);
      snapshots.push(snapshot);
    } catch (e) { errors.push(`${ref?.path}: ${(e as Error).message}`); }
  }
  if (errors.length) throw new Error(`Invalid project plugins:\n  - ${errors.join('\n  - ')}`);
  return snapshots;
}

export function readProjectPlugins(folder: string, refs: ProjectPluginRef[]): PluginSnapshot[] {
  const errors: string[] = [];
  const portable: PortablePlugin[] = [];
  for (const ref of refs) {
    try { portable.push({ path: ref.path, files: snapshotFolder(pluginFile(folder, ref.path, true)) }); }
    catch (e) { errors.push(`${ref.path}: ${(e as Error).message}`); }
  }
  let snapshots: PluginSnapshot[] = [];
  try { snapshots = validateAll(portable); } catch (e) { errors.push((e as Error).message); }
  if (errors.length) throw new Error(`Invalid project plugins:\n  - ${errors.join('\n  - ')}`);
  return snapshots;
}

export function validatePortablePlugins(raw: unknown): PluginSnapshot[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('Bundle plugins must be a list');
  return validateAll(raw);
}

export function projectPluginsDir(paths: StorePaths, project: string): string {
  if (!isProjectName(project)) throw new Error('Invalid project name');
  return path.join(projectDir(paths, project), 'plugins');
}

function indexFile(paths: StorePaths, project: string): string {
  return path.join(projectDir(paths, project), 'plugins.json');
}

function pluginDirectory(paths: StorePaths, project: string, id: string): string {
  if (!isProjectName(id)) throw new Error('Invalid plugin id');
  const root = projectPluginsDir(paths, project);
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Plugin directory symlink');
  const folder = path.join(root, id);
  if (fs.lstatSync(folder).isSymbolicLink()) throw new Error('Plugin directory symlink');
  return folder;
}

export function writePluginFolder(folder: string, files: Record<string, string>): void {
  for (let ancestor = path.resolve(folder); ; ancestor = path.dirname(ancestor)) {
    if (fs.existsSync(ancestor) && fs.lstatSync(ancestor).isSymbolicLink()) throw new Error(`Plugin destination symlink: ${ancestor}`);
    if (path.dirname(ancestor) === ancestor) break;
  }
  // Recreate the destination rather than following pre-existing child symlinks.
  fs.rmSync(folder, { force: true, recursive: true });
  fs.mkdirSync(folder, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    assertPath(name);
    const file = path.join(folder, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(contents, 'base64'));
  }
}

export function replaceProjectPlugins(paths: StorePaths, project: string, snapshots: PluginSnapshot[]): void {
  const root = projectPluginsDir(paths, project);
  for (let ancestor = path.dirname(root); ; ancestor = path.dirname(ancestor)) {
    if (fs.existsSync(ancestor) && fs.lstatSync(ancestor).isSymbolicLink()) throw new Error(`Plugin destination symlink: ${ancestor}`);
    if (path.dirname(ancestor) === ancestor) break;
  }
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  for (const snapshot of snapshots) writePluginFolder(path.join(root, snapshot.plugin.id), snapshot.files);
  writeFileAtomic(indexFile(paths, project), JSON.stringify(snapshots.map(s => ({ path: s.path, id: s.plugin.id })), null, 2) + '\n');
}

export function storedPluginSnapshots(paths: StorePaths, project: string): { snapshots: PluginSnapshot[]; errors: string[] } {
  const snapshots: PluginSnapshot[] = [], errors: string[] = [];
  try {
    const index = indexFile(paths, project);
    if (!fs.existsSync(index)) {
      const root = projectPluginsDir(paths, project);
      if (fs.existsSync(root) && fs.readdirSync(root).length) throw new Error('Missing plugin index');
      return { snapshots, errors };
    }
    const refs: unknown = JSON.parse(fs.readFileSync(index, 'utf8'));
    if (!Array.isArray(refs)) throw new Error('Invalid plugin index');
    const ids = new Set<string>();
    for (const ref of refs) {
      try {
        if (!object(ref) || !isProjectName(ref.id) || !relativePath(ref.path, true)) throw new Error('Invalid plugin index entry');
        const files = snapshotFolder(pluginDirectory(paths, project, ref.id));
        const snapshot = validatePlugin({ path: ref.path as string, files });
        if (snapshot.plugin.id !== ref.id || ids.has(ref.id)) throw new Error(`Invalid or duplicate plugin id: ${ref.id}`);
        ids.add(ref.id);
        snapshots.push(snapshot);
      } catch (e) { errors.push(`${object(ref) ? ref.id : 'plugin'}: ${(e as Error).message}`); }
    }
  } catch (e) { errors.push((e as Error).message); }
  return { snapshots, errors };
}

export function loadProjectPlugins(paths: StorePaths, project: string): { plugins: ProjectPlugin[]; errors: string[] } {
  const { snapshots, errors } = storedPluginSnapshots(paths, project);
  return { plugins: snapshots.map(s => s.plugin), errors };
}

export function readProjectPluginFile(paths: StorePaths, project: string, id: string, file: string): Buffer | null {
  try {
    if (!isProjectName(id)) return null;
    const target = pluginFile(pluginDirectory(paths, project, id), file);
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size > PLUGIN_MAX_FILE_BYTES) return null;
    return fs.readFileSync(target);
  } catch { return null; }
}
