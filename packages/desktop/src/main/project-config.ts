// Pure helpers that translate between the flattened EditableConfig the renderer
// binds to and the stored ProjectConfig (Partial<WavegridConfig>). Kept out of
// ipc.ts so the mapping is unit-checkable and has no Electron/store imports.
import {
  DEFAULT_CONFIG,
  getPresetNames,
  type LayoutSpec,
  parseLayoutSpec,
  resolveLayout,
  type WavegridConfig
} from '@wavegrid/layout';
import type { ProjectConfig } from '@wavegrid/settings';

import type { EditableConfig, LayoutChoice, NewProjectInput } from '@/types/ipc';

export function knownPresets(): string[] {
  return getPresetNames();
}

/** Turn a wizard/editor layout choice into a validated LayoutSpec. Throws (with
 *  a user-facing message) when the choice is incomplete or does not resolve. */
export function buildLayoutSpec(choice: LayoutChoice): LayoutSpec {
  let spec: LayoutSpec;
  if (choice.preset) {
    spec = { preset: choice.preset };
  } else if (choice.kind === 'grid') {
    if (choice.cols == null || choice.rows == null) {
      throw new Error('A grid layout needs both columns and rows.');
    }
    spec = { kind: 'grid', cols: choice.cols, rows: choice.rows };
  } else if (choice.kind === 'ring' || choice.kind === 'filledRing') {
    if (choice.count == null) {
      throw new Error(`A ${choice.kind} layout needs a cannon count.`);
    }
    spec = { kind: choice.kind, count: choice.count };
  } else if (choice.kind === 'annulus') {
    if (choice.count == null) throw new Error('An annulus layout needs a cannon count.');
    spec = { kind: 'annulus', count: choice.count, innerRadius: choice.innerRadius ?? 0.5 };
  } else if (choice.kind === 'rings') {
    if (!choice.ringCounts?.trim()) {
      throw new Error('A rings layout needs cannons per ring, e.g. 12,8,4,1.');
    }
    spec = parseLayoutSpec(`rings:${choice.ringCounts.trim()}`);
  } else {
    throw new Error('Pick a preset or a custom shape for the layout.');
  }
  // Fail fast: the spec must resolve to a real layout before it is persisted.
  resolveLayout(spec);
  return spec;
}

function specToChoice(spec: LayoutSpec | undefined): LayoutChoice {
  if (!spec) return { preset: DEFAULT_CONFIG.layout.preset };
  if (spec.preset) return { preset: spec.preset };
  if (spec.kind === 'rings') {
    // Round-trip the ring list back into the shorthand the editor binds to.
    const counts = [...(spec.rings ?? [])]
      .sort((a, b) => b.radius - a.radius)
      .map(r => r.count)
      .join(',');
    return { kind: 'rings', ringCounts: counts };
  }
  return {
    kind: spec.kind,
    cols: spec.cols,
    rows: spec.rows,
    count: spec.count,
    innerRadius: spec.innerRadius
  };
}

/** Build the ProjectConfig persisted for a brand-new project. Mirrors the CLI's
 *  buildConfig — only non-default surface is written; confstash fills the rest. */
export function configForNewProject(input: NewProjectInput): ProjectConfig {
  const config: ProjectConfig = {
    layout: buildLayoutSpec(input.layout),
    mode: input.mode,
    simpleModeMax: input.simpleModeMax,
    server: { host: input.serverHost, port: input.serverPort },
    ui: { port: input.uiPort }
  };
  return config;
}

/** Present a stored ProjectConfig (partial) as the flattened editable view,
 *  filling gaps from DEFAULT_CONFIG and resolving the layout for display. */
export function toEditable(stored: ProjectConfig | null): EditableConfig {
  const layoutSpec = stored?.layout ?? DEFAULT_CONFIG.layout;
  const resolved = resolveLayout(layoutSpec);
  return {
    layout: specToChoice(layoutSpec),
    mode: stored?.mode ?? DEFAULT_CONFIG.mode,
    simpleModeMax: stored?.simpleModeMax ?? DEFAULT_CONFIG.simpleModeMax,
    serverHost: stored?.server?.host ?? DEFAULT_CONFIG.server.host,
    serverPort: stored?.server?.port ?? DEFAULT_CONFIG.server.port,
    uiPort: stored?.ui?.port ?? DEFAULT_CONFIG.ui.port,
    alpha: stored?.receiver?.alpha ?? DEFAULT_CONFIG.receiver.alpha,
    fallbackDelay: stored?.receiver?.fallbackDelay ?? DEFAULT_CONFIG.receiver.fallbackDelay,
    layoutLabel: resolved.name,
    cannonCount: resolved.count
  };
}

/** Fold the editable fields back into the existing stored config, preserving
 *  everything the editor does not own (osc, sync, receiver.shard/lightMap,
 *  debug). Returns a new ProjectConfig ready for saveProjectConfig. */
export function applyEditable(existing: ProjectConfig | null, edit: EditableConfig): ProjectConfig {
  const prev: ProjectConfig = existing ?? {};
  const prevReceiver: Partial<WavegridConfig['receiver']> = prev.receiver ?? {};
  return {
    ...prev,
    layout: buildLayoutSpec(edit.layout),
    mode: edit.mode,
    simpleModeMax: edit.simpleModeMax,
    server: { host: edit.serverHost, port: edit.serverPort },
    ui: { port: edit.uiPort },
    receiver: { ...prevReceiver, alpha: edit.alpha, fallbackDelay: edit.fallbackDelay }
  };
}
