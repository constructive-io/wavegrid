import { getPresetNames, type LayoutSpec, parseLayoutSpec, resolveLayout, type WavegridConfig } from '@wavegrid/layout';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

// confstash discovers `wavegrid.json` (and `.wavegridrc*`) via walk-up search.
export const CONFIG_FILENAME = 'wavegrid.json';

export type ShapeKind = 'preset' | 'grid' | 'ring' | 'filledRing' | 'annulus' | 'rings';

export interface InitAnswers {
  shape: ShapeKind;
  preset?: string;
  cols?: number;
  rows?: number;
  count?: number;
  /** annulus: size of the hole in the middle, 0..1. */
  innerRadius?: number;
  /** rings: fixture counts outermost-first, e.g. "12,8,4,1". */
  ringCounts?: string;
  id?: string;
  name?: string;
  mode: 'auto' | 'simple' | 'distributed';
  simpleModeMax?: number;
  serverPort?: number;
  serverHost?: string;
  uiPort?: number;
}

/**
 * Build a layout spec from init answers. A preset is just an id; custom shapes
 * are a generator kind + params. No shape-specific code — new installations are
 * pure configuration.
 */
export function buildLayoutSpec(a: InitAnswers): LayoutSpec {
  switch (a.shape) {
  case 'preset':
    if (!a.preset) throw new Error('preset shape requires a preset id');
    return { preset: a.preset };
  case 'grid':
    if (a.cols == null || a.rows == null) throw new Error('grid shape requires cols and rows');
    return { kind: 'grid', cols: a.cols, rows: a.rows, id: a.id, name: a.name };
  case 'ring':
    if (a.count == null) throw new Error('ring shape requires count');
    return { kind: 'ring', count: a.count, id: a.id, name: a.name };
  case 'filledRing':
    if (a.count == null) throw new Error('filledRing shape requires count');
    return { kind: 'filledRing', count: a.count, id: a.id, name: a.name };
  case 'annulus': {
    if (a.count == null) throw new Error('annulus shape requires count');
    const inner = a.innerRadius ?? 0.5;
    return { ...parseLayoutSpec(`annulus:${a.count}@${inner}`), id: a.id, name: a.name };
  }
  case 'rings':
    if (!a.ringCounts) throw new Error('rings shape requires ringCounts');
    return { ...parseLayoutSpec(`rings:${a.ringCounts}`), id: a.id, name: a.name };
  default:
    throw new Error(`unknown shape "${String(a.shape)}"`);
  }
}

/** A stored/authored config is a partial — confstash fills the rest from defaults. */
export type ProjectFileConfig = Partial<WavegridConfig> & { layout: LayoutSpec };

/** Assemble a config, omitting values left at their defaults. */
export function buildConfig(a: InitAnswers): ProjectFileConfig {
  const config: ProjectFileConfig = {
    layout: buildLayoutSpec(a),
    mode: a.mode,
    simpleModeMax: a.simpleModeMax ?? 40,
    server: {
      host: a.serverHost ?? '0.0.0.0',
      port: a.serverPort ?? 3000
    },
    ui: {
      port: a.uiPort ?? 3003
    }
  };
  // Validate the spec actually resolves before writing it to disk.
  resolveLayout(config.layout);
  return config;
}

export function serializeConfig(config: Partial<WavegridConfig>): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function knownPresets(): string[] {
  return getPresetNames();
}

/** Walk up from a directory to find the pnpm workspace root. */
export function findRepoRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Walk up from a directory to find an existing wavegrid config file. */
export function findConfigFile(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readConfigFile(path: string): ProjectFileConfig {
  return JSON.parse(readFileSync(path, 'utf8')) as ProjectFileConfig;
}
