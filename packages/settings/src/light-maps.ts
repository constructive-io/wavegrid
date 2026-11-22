import { identityMap, normalizeLightMap } from '@wavegrid/layout';
import fs from 'fs';
import path from 'path';

import {
  projectDir,
  projectStateDir,
  readJsonFile,
  type StorePaths,
  writeFileAtomic
} from './paths';
import { getProjectConfig, saveProjectConfig } from './projects';

/**
 * A named light map in a project's library. The physical map is a permutation
 * `physicalLights[logical] = physical`; identity needs no stored map at all.
 * These are pure correction data — no device identity, no secrets — so they are
 * safe to export, sync, and share between laptops.
 */
export interface StoredLightMap {
  version: 1;
  name: string;
  numCannons: number;
  gridColumns: number;
  physicalLights: number[];
  updatedAt: string;
}

export interface LightMapSummary {
  name: string;
  numCannons: number;
  updatedAt: string;
  /** True when this is the project's active map (config.activeLightMap). */
  active: boolean;
}

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/;

export function isLightMapName(name: unknown): name is string {
  return typeof name === 'string' && NAME_RE.test(name);
}

function assertName(name: string): void {
  if (!isLightMapName(name)) {
    throw new Error(`Invalid light-map name "${name}". Use letters, numbers, space, ".", "_" or "-".`);
  }
}

function mapsDir(paths: StorePaths, project: string): string {
  return path.join(projectDir(paths, project), 'maps');
}

function mapFile(paths: StorePaths, project: string, name: string): string {
  return path.join(mapsDir(paths, project), `${name}.json`);
}

/** The runtime light-map file (materialized active map) the server + receiver read. */
function stateLightMapFile(paths: StorePaths, project: string): string {
  return path.join(projectStateDir(paths, project), 'light-map.json');
}

export function getActiveLightMap(paths: StorePaths, project: string): string | null {
  return getProjectConfig(paths, project)?.activeLightMap ?? null;
}

export function listLightMaps(paths: StorePaths, project: string): LightMapSummary[] {
  const dir = mapsDir(paths, project);
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const active = getActiveLightMap(paths, project);
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJsonFile<StoredLightMap>(path.join(dir, f)))
    .filter((m): m is StoredLightMap => m != null)
    .map((m) => ({
      name: m.name,
      numCannons: m.numCannons,
      updatedAt: m.updatedAt,
      active: m.name === active
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readLightMap(paths: StorePaths, project: string, name: string): StoredLightMap | null {
  return readJsonFile<StoredLightMap>(mapFile(paths, project, name));
}

/**
 * Create or overwrite a named map with a normalized permutation and a fresh
 * `updatedAt`. Re-materializes the runtime file when this map is the active one.
 */
export function saveLightMap(
  paths: StorePaths,
  project: string,
  name: string,
  data: { numCannons: number; gridColumns: number; physicalLights: readonly number[] }
): StoredLightMap {
  assertName(name);
  const stored: StoredLightMap = {
    version: 1,
    name,
    numCannons: data.numCannons,
    gridColumns: data.gridColumns,
    physicalLights: normalizeLightMap(data.physicalLights, data.numCannons),
    updatedAt: new Date().toISOString()
  };
  writeFileAtomic(mapFile(paths, project, name), JSON.stringify(stored, null, 2) + '\n');
  if (getActiveLightMap(paths, project) === name) materialize(paths, project);
  return stored;
}

/** Delete a named map. If it was active, the project falls back to identity. */
export function deleteLightMap(paths: StorePaths, project: string, name: string): boolean {
  const file = mapFile(paths, project, name);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file, { force: true });
  if (getActiveLightMap(paths, project) === name) setActiveLightMap(paths, project, null);
  return true;
}

/**
 * Set the active map (or `null` for identity / no correction) and materialize
 * it into the runtime `light-map.json`. Identity removes the file entirely so a
 * healthy rig carries no correction artifact.
 */
export function setActiveLightMap(paths: StorePaths, project: string, name: string | null): void {
  if (name != null && readLightMap(paths, project, name) == null) {
    throw new Error(`Unknown light map "${name}" for project "${project}".`);
  }
  const config = getProjectConfig(paths, project) ?? {};
  saveProjectConfig(paths, project, { ...config, activeLightMap: name });
  materialize(paths, project);
}

/** Copy the active named map's permutation into the runtime file (or remove it for identity). */
function materialize(paths: StorePaths, project: string): void {
  const file = stateLightMapFile(paths, project);
  const active = getActiveLightMap(paths, project);
  const map = active ? readLightMap(paths, project, active) : null;
  if (!map || isIdentity(map.physicalLights)) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* nothing to remove */
    }
    return;
  }
  writeFileAtomic(
    file,
    JSON.stringify(
      {
        version: 1,
        numCannons: map.numCannons,
        gridColumns: map.gridColumns,
        physicalLights: map.physicalLights,
        updatedAt: map.updatedAt
      },
      null,
      2
    ) + '\n'
  );
}

function isIdentity(physicalLights: readonly number[]): boolean {
  const id = identityMap(physicalLights.length);
  return physicalLights.every((v, i) => v === id[i]);
}
