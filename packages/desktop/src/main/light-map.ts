import fs from 'node:fs';
import path from 'node:path';

import {
  availableStrategies,
  isIdentityMap,
  normalizeLightMap as normalizePermutation,
  resolveLayout
} from '@wavegrid/layout';
import type { ProjectConfig } from '@wavegrid/settings';

import type { FixtureRow, LightMapView } from '@/types/ipc';

/** The on-disk light-map shape. Identical to the server's `/api/light-map`
 *  format — desktop reads and writes the SAME file, never a second store. */
export interface LightMapConfig {
  version: 1;
  numCannons: number;
  gridColumns: number;
  physicalLights: number[];
  updatedAt?: string;
}

/**
 * Normalize a (possibly partial or corrupt) light map into a valid one:
 * `physicalLights[logical] = physical`, a permutation of `0..numCannons-1`.
 * Delegates to `@wavegrid/layout`'s canonical `normalizeLightMap` (dedup,
 * range-check, identity back-fill) so the desktop editor, the server
 * `/api/light-map`, and the receiver all agree on every mapping.
 */
export function normalizeLightMap(
  input: Partial<LightMapConfig> | null,
  dims: { numCannons: number; gridColumns: number }
): LightMapConfig {
  const numCannons = input?.numCannons ?? dims.numCannons;
  const gridColumns = input?.gridColumns ?? dims.gridColumns;
  const physicalLights = normalizePermutation(input?.physicalLights, numCannons);
  return { version: 1, numCannons, gridColumns, physicalLights, updatedAt: input?.updatedAt };
}

/** Human-readable OSC destination for the debugger's per-fixture rows. */
export function describeOscTarget(config: ProjectConfig | null): string {
  const osc = config?.osc;
  if (osc?.beyond) return `BEYOND @ ${osc.beyond.host}:${osc.beyond.port}`;
  if (osc?.fb4) return `FB4 @ ${osc.fb4.host}:${osc.fb4.port}`;
  if (osc?.routingConfig) return `routing: ${path.basename(osc.routingConfig)}`;
  return 'console (no OSC target)';
}

/** A fixture's position, phrased for its topology. */
function describePosition(fixture: {
  row: number;
  col: number;
  angle: number;
  ring: number;
}): string {
  if (fixture.row >= 0 && fixture.col >= 0) {
    return `row ${fixture.row + 1}, col ${fixture.col + 1}`;
  }
  const deg = Math.round(((fixture.angle * 180) / Math.PI + 360) % 360);
  const ringPart = fixture.ring > 0 ? `ring ${fixture.ring} · ` : '';
  return `${ringPart}${deg}°`;
}

/**
 * Build the full debugger view for a project: one row per fixture explaining
 * the mapping chain — animation logical index → physical light → position →
 * which device drives it (shard) → where it's emitted (OSC). Pure over its
 * inputs; the IPC layer supplies config, devices, and the stored map.
 */
export function buildLightMapView(args: {
  project: string;
  config: ProjectConfig | null;
  devices: { name: string; shard?: { start: number; end: number } | null }[];
  stored: Partial<LightMapConfig> | null;
  maps?: LightMapView['maps'];
  activeMap?: string | null;
}): LightMapView {
  const { project, config, devices, stored, maps = [], activeMap = null } = args;
  const layout = resolveLayout(config?.layout ?? { preset: 'grid-7x7' });
  const dims = { numCannons: layout.count, gridColumns: layout.cols };
  const map = normalizeLightMap(stored, dims);
  const oscTarget = describeOscTarget(config);

  const ownerFor = (logical: number): { name: string; localIndex: number } | null => {
    for (const d of devices) {
      if (d.shard && logical >= d.shard.start && logical <= d.shard.end) {
        // Output re-bases to 0 within the owning device's shard — the
        // "second device starts from zero" number the operator asked about.
        return { name: d.name, localIndex: logical - d.shard.start };
      }
    }
    return null;
  };

  const rows: FixtureRow[] = layout.fixtures.map((fixture) => {
    const physical = map.physicalLights[fixture.index] ?? fixture.index;
    const owner = ownerFor(fixture.index);
    return {
      logical: fixture.index,
      physical,
      label: fixture.label,
      kind: fixture.kind ?? 'cannon',
      position: describePosition(fixture),
      u: fixture.u,
      v: fixture.v,
      shardOwner: owner?.name ?? null,
      localIndex: owner?.localIndex ?? null,
      oscTarget,
      corrected: physical !== fixture.index
    };
  });

  return {
    project,
    layoutName: layout.name,
    topology: layout.topology,
    numCannons: layout.count,
    gridColumns: layout.cols,
    physicalLights: map.physicalLights,
    rows,
    identity: isIdentityMap(map.physicalLights),
    strategies: availableStrategies(layout).map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description
    })),
    maps,
    activeMap
  };
}

function lightMapPath(stateDir: string): string {
  return path.join(stateDir, 'light-map.json');
}

/** Read + normalize the stored map for a project (never throws on missing/corrupt). */
export function readLightMap(
  stateDir: string,
  dims: { numCannons: number; gridColumns: number }
): LightMapConfig {
  try {
    const raw = fs.readFileSync(lightMapPath(stateDir), 'utf8');
    return normalizeLightMap(JSON.parse(raw) as Partial<LightMapConfig>, dims);
  } catch {
    return normalizeLightMap(null, dims);
  }
}

/** Normalize + persist a new physical mapping to the same file the server uses. */
export function writeLightMap(
  stateDir: string,
  dims: { numCannons: number; gridColumns: number },
  physicalLights: number[]
): LightMapConfig {
  const cfg = normalizeLightMap(
    { version: 1, numCannons: dims.numCannons, gridColumns: dims.gridColumns, physicalLights },
    dims
  );
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    lightMapPath(stateDir),
    JSON.stringify({ ...cfg, updatedAt: new Date().toISOString() }, null, 2)
  );
  return cfg;
}
