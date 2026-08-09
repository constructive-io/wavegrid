import { annulusLayout, filledRingLayout, gridLayout, ringLayout, ringsLayout } from './generators';
import { Layout, LayoutSpec } from './types';

/**
 * Built-in layouts. New installations are just a preset id (or a spec) in a
 * config file — no new code. Add a shape here and it is available everywhere.
 */
export const presets: Record<string, () => Layout> = {
  'grid-7x7': () => gridLayout({ cols: 7, rows: 7, id: 'grid-7x7', name: '7×7 grid (49)' }),
  'grid-7x2': () => gridLayout({ cols: 7, rows: 2, id: 'grid-7x2', name: '7×2 grid (14)' }),
  'ring-6': () => ringLayout({ count: 6, id: 'ring-6', name: '6-cannon ring' }),
  nova: () => ringLayout({ count: 6, id: 'nova', name: 'Nova (6-laser ring)' }),
  'ring-25-filled': () => filledRingLayout({ count: 25, id: 'ring-25-filled', name: '25-cannon filled ring' }),
  'ring-25-hollow': () => annulusLayout({ count: 25, innerRadius: 0.5, id: 'ring-25-hollow', name: '25-cannon ring with a hollow centre' }),
  'disc-25': () => annulusLayout({ count: 25, innerRadius: 0, id: 'disc-25', name: '25-cannon disc (concentric rings)' })
};

export function getPresetNames(): string[] {
  return Object.keys(presets);
}

/**
 * Build a Layout from a spec (preset id, or a generator kind + params). An
 * explicit `kind` wins over `preset`, because the default config carries a
 * preset that a project's custom shape is merged on top of.
 */
export function resolveLayout(spec: LayoutSpec): Layout {
  if (spec.preset && !spec.kind) {
    const make = presets[spec.preset];
    if (!make) {
      throw new Error(
        `Unknown layout preset "${spec.preset}". Known presets: ${getPresetNames().join(', ')}`
      );
    }
    const layout = make();
    return spec.id || spec.name
      ? { ...layout, id: spec.id ?? layout.id, name: spec.name ?? layout.name }
      : layout;
  }

  switch (spec.kind) {
  case 'grid':
    if (spec.cols == null || spec.rows == null) {
      throw new Error('grid layout requires "cols" and "rows"');
    }
    return gridLayout({ cols: spec.cols, rows: spec.rows, id: spec.id, name: spec.name });
  case 'ring':
    if (spec.count == null) throw new Error('ring layout requires "count"');
    return ringLayout({ count: spec.count, id: spec.id, name: spec.name });
  case 'filledRing':
    if (spec.count == null) throw new Error('filledRing layout requires "count"');
    return filledRingLayout({ count: spec.count, id: spec.id, name: spec.name });
  case 'rings':
    if (!spec.rings?.length) throw new Error('rings layout requires a non-empty "rings" list');
    return ringsLayout({ rings: spec.rings, id: spec.id, name: spec.name });
  case 'annulus':
    if (spec.count == null) throw new Error('annulus layout requires "count"');
    return annulusLayout({ count: spec.count, innerRadius: spec.innerRadius, id: spec.id, name: spec.name });
  default:
    throw new Error('layout spec must set either "preset" or "kind"');
  }
}
