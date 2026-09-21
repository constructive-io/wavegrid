import type { WavegridConfig } from '@wavegrid/layout';
import fs from 'fs';

import {
  projectConfigFile,
  projectDir,
  projectSecretsFile,
  readJsonFile,
  type StorePaths,
  writeFileAtomic
} from './paths';

/** A project stores a (possibly partial) config; confstash fills the rest from defaults. */
export type ProjectConfig = Partial<WavegridConfig>;

interface Registry {
  active: string | null;
  projects: string[];
}

function readRegistry(paths: StorePaths): Registry {
  return readJsonFile<Registry>(paths.registryFile) ?? { active: null, projects: [] };
}

function writeRegistry(paths: StorePaths, reg: Registry): void {
  writeFileAtomic(paths.registryFile, JSON.stringify(reg, null, 2) + '\n');
}

export function listProjects(paths: StorePaths): string[] {
  return readRegistry(paths).projects.slice().sort();
}

export function hasProject(paths: StorePaths, name: string): boolean {
  return readRegistry(paths).projects.includes(name);
}

export function getActiveProject(paths: StorePaths): string | null {
  return readRegistry(paths).active;
}

export function getProjectConfig(paths: StorePaths, name: string): ProjectConfig | null {
  return readJsonFile<ProjectConfig>(projectConfigFile(paths, name));
}

function serialize(config: ProjectConfig): string {
  return JSON.stringify(config, null, 2) + '\n';
}

/** Keep the confstash `user` layer (config/config.json) in sync with the active project. */
function syncActiveConfigFile(paths: StorePaths, active: string | null): void {
  if (active == null) {
    try {
      fs.rmSync(paths.activeConfigFile, { force: true });
    } catch {
      /* nothing to remove */
    }
    return;
  }
  const config = getProjectConfig(paths, active) ?? {};
  writeFileAtomic(paths.activeConfigFile, serialize(config));
}

export function saveProjectConfig(paths: StorePaths, name: string, config: ProjectConfig): void {
  writeFileAtomic(projectConfigFile(paths, name), serialize(config));
  if (getActiveProject(paths) === name) syncActiveConfigFile(paths, name);
}

export interface CreateProjectOptions {
  /** Make this the active project. Default: true when it is the first project. */
  activate?: boolean;
}

export function createProject(
  paths: StorePaths,
  name: string,
  config: ProjectConfig,
  opts: CreateProjectOptions = {}
): void {
  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid project name "${name}". Use letters, numbers, ".", "_" or "-".`);
  }
  const reg = readRegistry(paths);
  if (!reg.projects.includes(name)) reg.projects.push(name);
  writeFileAtomic(projectConfigFile(paths, name), serialize(config));
  const activate = opts.activate ?? reg.active == null;
  if (activate) reg.active = name;
  writeRegistry(paths, reg);
  if (reg.active === name) syncActiveConfigFile(paths, name);
}

export function setActiveProject(paths: StorePaths, name: string): void {
  const reg = readRegistry(paths);
  if (!reg.projects.includes(name)) {
    throw new Error(`Unknown project "${name}". Known: ${reg.projects.join(', ') || '(none)'}.`);
  }
  reg.active = name;
  writeRegistry(paths, reg);
  syncActiveConfigFile(paths, name);
}

export function deleteProject(paths: StorePaths, name: string): boolean {
  const reg = readRegistry(paths);
  if (!reg.projects.includes(name)) return false;
  reg.projects = reg.projects.filter((p) => p !== name);
  if (reg.active === name) reg.active = reg.projects[0] ?? null;
  writeRegistry(paths, reg);
  try {
    fs.rmSync(projectDir(paths, name), { recursive: true, force: true });
    fs.rmSync(projectSecretsFile(paths, name), { force: true });
  } catch {
    /* best effort */
  }
  syncActiveConfigFile(paths, reg.active);
  return true;
}
