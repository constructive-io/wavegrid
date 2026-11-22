import { resolveLayout, type WavegridConfig } from '@wavegrid/layout';
import path from 'path';

import { deleteLightMap, isLightMapName, listLightMaps, readLightMap, saveLightMap, setActiveLightMap } from './light-maps';
import {
  projectDevicesFile,
  projectDir,
  projectStateDir,
  readJsonFile,
  type StorePaths,
  writeFileAtomic
} from './paths';
import { type PortableDevice } from './portable';
import { createProject, getProjectConfig, hasProject, isProjectName, type ProjectConfig } from './projects';
import { type DeviceRecord } from './registry';
import { generateSecrets, readSecrets } from './secrets';

/** File extension for a Wavegrid project file. */
export const PROJECT_FILE_EXTENSION = '.wavegrid';

/** A named light map as it is stored in a project file. */
export interface ProjectFileLightMap {
  name: string;
  numCannons: number;
  gridColumns: number;
  physicalLights: number[];
}

/** A saved Look (GracePaint state) as the brain stores it in `state/looks.json`. */
export interface ProjectFileLook {
  id: string;
  name: string;
  params: Record<string, unknown>;
  createdAt?: number;
}

/**
 * A Wavegrid project file (`<name>.wavegrid`, JSON): everything that defines
 * one installation, so a venue's setup lives in its own file (or its own
 * repository) instead of as presets and examples in this one.
 *
 * It holds what an author edits — layout (a preset, a generator, or explicit
 * `fixtures`), run settings, OSC targets and unified routing, named light
 * maps, Looks and the device plan. It never holds secrets, UI users, access
 * keys, machine identity or runtime state, so it is safe to commit and share.
 *
 * Readers ignore fields they do not know, and opening then saving keeps them,
 * so newer sections survive a round trip through an older Wavegrid.
 */
export interface ProjectFile {
  wavegrid: 'project';
  version: 1;
  /** Project name in the store. Letters, numbers, ".", "_" or "-". */
  name: string;
  description?: string;
  config: ProjectConfig;
  lightMaps?: ProjectFileLightMap[];
  looks?: ProjectFileLook[];
  /** Planned devices: names and shards. Addresses and lastSeen never travel. */
  devices?: PortableDevice[];
  [extra: string]: unknown;
}

const KNOWN_KEYS = new Set(['wavegrid', 'version', 'name', 'description', 'config', 'lightMaps', 'looks', 'devices']);

/** Where a store project came from: the file it was opened from or last saved to. */
export interface ProjectFileLink {
  path: string;
  /** Top-level fields this version does not understand, written back on save. */
  extra: Record<string, unknown>;
}

function linkFile(paths: StorePaths, project: string): string {
  return path.join(projectDir(paths, project), 'project-file.json');
}

function looksFile(paths: StorePaths, project: string): string {
  return path.join(projectStateDir(paths, project), 'looks.json');
}

export function getProjectFileLink(paths: StorePaths, project: string): ProjectFileLink | null {
  return readJsonFile<ProjectFileLink>(linkFile(paths, project));
}

function writeLink(paths: StorePaths, project: string, link: ProjectFileLink): void {
  writeFileAtomic(linkFile(paths, project), JSON.stringify(link, null, 2) + '\n');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** True when `raw` claims to be a project file (as opposed to an export bundle). */
export function isProjectFile(raw: unknown): boolean {
  return isObject(raw) && raw.wavegrid === 'project';
}

/**
 * Validate an untrusted object as a project file. Throws one error listing
 * every problem, including a layout that does not resolve, so a bad file is
 * rejected before anything is written to the store.
 */
export function parseProjectFile(raw: unknown): ProjectFile {
  if (!isObject(raw) || raw.wavegrid !== 'project') {
    throw new Error('Not a Wavegrid project file (expected {"wavegrid":"project","version":1}).');
  }
  if (raw.version !== 1) {
    throw new Error(`Unsupported project file version ${String(raw.version)} — this Wavegrid reads version 1.`);
  }
  const problems: string[] = [];
  if (!isProjectName(raw.name)) {
    problems.push('"name" must be letters, numbers, ".", "_" or "-" (and not "." or "..")');
  }
  if (raw.description != null && typeof raw.description !== 'string') problems.push('"description" must be a string');
  if (!isObject(raw.config)) {
    problems.push('"config" must be an object');
  } else if (raw.config.layout != null) {
    try {
      resolveLayout(raw.config.layout as WavegridConfig['layout']);
    } catch (e) {
      problems.push(`config.layout: ${(e as Error).message}`);
    }
  }
  if (raw.lightMaps != null) {
    if (!Array.isArray(raw.lightMaps)) problems.push('"lightMaps" must be a list');
    else {
      const seen = new Set<string>();
      raw.lightMaps.forEach((m, i) => {
        if (!isObject(m) || !Array.isArray(m.physicalLights) ||
          !Number.isInteger(m.numCannons) || (m.numCannons as number) < 1 || typeof m.gridColumns !== 'number') {
          problems.push(`lightMaps[${i}] needs name, numCannons (>= 1), gridColumns and physicalLights`);
        } else if (!isLightMapName(m.name)) {
          problems.push(`lightMaps[${i}] name must start with a letter or number and use letters, numbers, space, ".", "_" or "-"`);
        } else if (seen.has(m.name)) {
          problems.push(`lightMaps[${i}] repeats the name "${m.name}"`);
        } else {
          seen.add(m.name);
        }
      });
    }
  }
  if (raw.looks != null) {
    if (!Array.isArray(raw.looks)) problems.push('"looks" must be a list');
    else raw.looks.forEach((l, i) => {
      if (!isObject(l) || typeof l.id !== 'string' || typeof l.name !== 'string' || !isObject(l.params)) {
        problems.push(`looks[${i}] needs id, name and params`);
      }
    });
  }
  if (raw.devices != null) {
    if (!Array.isArray(raw.devices)) problems.push('"devices" must be a list');
    else raw.devices.forEach((d, i) => {
      if (!isObject(d) || typeof d.id !== 'string' || typeof d.name !== 'string') {
        problems.push(`devices[${i}] needs id and name`);
      }
    });
  }
  if (problems.length > 0) {
    throw new Error(`Invalid project file:\n  - ${problems.join('\n  - ')}`);
  }
  return raw as unknown as ProjectFile;
}

export interface BuildProjectFileResult {
  document: ProjectFile;
  /** Settings that point at files on this machine and were left out. */
  warnings: string[];
}

/** The project's portable config: paths to files on this machine are dropped. */
function portableConfig(config: ProjectConfig, warnings: string[]): ProjectConfig {
  const out: ProjectConfig = JSON.parse(JSON.stringify(config)) as ProjectConfig;
  if (out.osc?.routingConfig) {
    warnings.push(
      `osc.routingConfig (${out.osc.routingConfig}) is a file on this machine and was left out — ` +
        'adopt it with `wavegrid projects routing import <file>` so the routing travels in the project file.'
    );
    delete out.osc.routingConfig;
  }
  if (out.receiver?.lightMap) {
    warnings.push(`receiver.lightMap (${out.receiver.lightMap}) is a file on this machine and was left out.`);
    delete out.receiver.lightMap;
  }
  return out;
}

/** Build the project file for a store project, keeping any fields it was opened with. */
export function buildProjectFile(paths: StorePaths, project: string): BuildProjectFileResult {
  if (!hasProject(paths, project)) throw new Error(`Unknown project "${project}".`);
  const warnings: string[] = [];
  const link = getProjectFileLink(paths, project);

  const document: ProjectFile = {
    ...(link?.extra ?? {}),
    wavegrid: 'project',
    version: 1,
    name: project,
    config: portableConfig(getProjectConfig(paths, project) ?? {}, warnings)
  };

  const lightMaps = listLightMaps(paths, project)
    .map((s) => readLightMap(paths, project, s.name))
    .filter((m): m is NonNullable<typeof m> => m != null)
    .map((m) => ({ name: m.name, numCannons: m.numCannons, gridColumns: m.gridColumns, physicalLights: m.physicalLights }));
  if (lightMaps.length > 0) document.lightMaps = lightMaps;

  const looks = readJsonFile<{ looks?: ProjectFileLook[] }>(looksFile(paths, project))?.looks ?? [];
  if (looks.length > 0) document.looks = looks;

  const devices = (readJsonFile<{ devices: DeviceRecord[] }>(projectDevicesFile(paths, project))?.devices ?? []).map(
    (d): PortableDevice => ({
      id: d.id,
      name: d.name,
      hostname: d.hostname,
      layout: d.layout,
      mode: d.mode,
      shard: d.shard ?? null
    })
  );
  if (devices.length > 0) document.devices = devices;

  return { document, warnings };
}

export interface SaveProjectFileOptions {
  /** Where to write. Default: the file the project was opened from or last saved to. */
  file?: string;
}

export interface SaveProjectFileResult extends BuildProjectFileResult {
  file: string;
}

/** Write a store project to its project file and remember the path for the next save. */
export function saveProjectFile(paths: StorePaths, project: string, opts: SaveProjectFileOptions = {}): SaveProjectFileResult {
  const link = getProjectFileLink(paths, project);
  const target = opts.file ?? link?.path;
  if (!target) {
    throw new Error(`Project "${project}" has no project file yet — pass a path to save it to.`);
  }
  const file = path.resolve(target);
  const result = buildProjectFile(paths, project);
  writeFileAtomic(file, JSON.stringify(result.document, null, 2) + '\n');
  writeLink(paths, project, { path: file, extra: link?.extra ?? {} });
  return { ...result, file };
}

export interface OpenProjectFileOptions {
  /** Store the project under this name instead of the file's `name`. */
  name?: string;
  /** Make the project active. */
  activate?: boolean;
  /**
   * Replace an existing project that came from a different file (or none).
   * Re-opening the file a project is already linked to always refreshes it.
   */
  overwrite?: boolean;
}

export interface OpenProjectFileResult {
  project: string;
  file: string;
  /** False when an existing project was refreshed from the file. */
  created: boolean;
  /** True when the project had no secrets yet and fresh ones were generated. */
  generatedSecrets: boolean;
  lightMapCount: number;
  lookCount: number;
  deviceCount: number;
  /** True when a refresh kept this machine's OSC target because the file had none. */
  keptLocalOsc: boolean;
}

/**
 * A file with no `osc` block says nothing about the hardware next to this
 * machine, so a refresh keeps the OSC target configured here (as
 * `importProject` does). A file that has one replaces it whole.
 */
function keepMachineLocal(
  incoming: ProjectConfig,
  local: ProjectConfig | null
): { config: ProjectConfig; keptLocalOsc: boolean } {
  if (!local) return { config: incoming, keptLocalOsc: false };
  const config: ProjectConfig = { ...incoming };
  let keptLocalOsc = false;
  if (config.osc == null && local.osc && Object.keys(local.osc).length > 0) {
    config.osc = local.osc;
    keptLocalOsc = true;
  }
  return { config, keptLocalOsc };
}

/**
 * Load a project file into the store. The file is the source of truth for
 * what it holds: config, light maps, Looks and planned devices are replaced
 * from it. What it never holds stays as this machine has it — secrets, users,
 * access keys, and each device's last address. A project with no secrets gets
 * fresh ones, as `wavegrid init` would.
 */
export function openProjectFile(
  paths: StorePaths,
  file: string,
  raw: unknown,
  opts: OpenProjectFileOptions = {}
): OpenProjectFileResult {
  const doc = parseProjectFile(raw);
  const resolved = path.resolve(file);
  const project = opts.name ?? doc.name;
  if (!isProjectName(project)) {
    throw new Error(`Invalid project name "${project}". Use letters, numbers, ".", "_" or "-".`);
  }
  const exists = hasProject(paths, project);
  if (exists && !opts.overwrite && getProjectFileLink(paths, project)?.path !== resolved) {
    throw new Error(
      `Project "${project}" already exists and was not opened from ${resolved} — ` +
        'pass overwrite to replace it, or open it under a new name.'
    );
  }

  const { config, keptLocalOsc } = keepMachineLocal(doc.config, exists ? getProjectConfig(paths, project) : null);
  createProject(paths, project, config, { activate: opts.activate });

  const maps = doc.lightMaps ?? [];
  const keep = new Set(maps.map((m) => m.name));
  for (const old of listLightMaps(paths, project)) {
    if (!keep.has(old.name)) deleteLightMap(paths, project, old.name);
  }
  for (const m of maps) saveLightMap(paths, project, m.name, m);
  const active = doc.config.activeLightMap ?? null;
  setActiveLightMap(paths, project, active && keep.has(active) ? active : null);

  // A missing section means an empty one: buildProjectFile leaves empty lists out.
  writeFileAtomic(looksFile(paths, project), JSON.stringify({ looks: doc.looks ?? [] }, null, 2) + '\n');

  {
    const known = new Map(
      (readJsonFile<{ devices: DeviceRecord[] }>(projectDevicesFile(paths, project))?.devices ?? []).map((d) => [d.id, d])
    );
    const devices: DeviceRecord[] = (doc.devices ?? []).map((d) => {
      const live = known.get(d.id);
      return {
        id: d.id,
        name: d.name,
        hostname: d.hostname,
        ...(live?.address ? { address: live.address } : {}),
        ...(live?.lastSeen ? { lastSeen: live.lastSeen } : {}),
        layout: d.layout,
        mode: d.mode,
        shard: d.shard ?? null
      };
    });
    writeFileAtomic(projectDevicesFile(paths, project), JSON.stringify({ version: 1, devices }, null, 2) + '\n');
  }

  const secrets = readSecrets(paths, project);
  const generatedSecrets = !secrets.receiverKey || !secrets.jwtSecret;
  if (generatedSecrets) generateSecrets(paths, project);

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (!KNOWN_KEYS.has(k) || k === 'description') extra[k] = v;
  }
  writeLink(paths, project, { path: resolved, extra });

  return {
    project,
    file: resolved,
    created: !exists,
    generatedSecrets,
    keptLocalOsc,
    lightMapCount: maps.length,
    lookCount: doc.looks?.length ?? 0,
    deviceCount: doc.devices?.length ?? 0
  };
}
