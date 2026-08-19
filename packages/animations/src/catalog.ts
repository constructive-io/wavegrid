// Browser-safe entry: this catalogue is read by the UI as well as the brain.
import { type Layout, presets } from '@wavegrid/layout/client';

import { animations } from './animations';
import { scenes } from './scenes';

/**
 * What a look needs from the rig it runs on.
 *
 * Most looks read normalized fixture geometry and work anywhere, so `any` is
 * the default. The rest are honest about their requirement, because a bitmap
 * drawn for a 7-wide grid is meaningless on a ring and an operator should be
 * told that rather than discovering it on the lasers.
 */
export type Fits =
  | { needs: 'any' }
  /** Meaningful grid row/col, at least this big. */
  | { needs: 'grid'; cols: number; rows: number }
  /** An ordered ring: fixtures the look can walk around a circle. */
  | { needs: 'ring' }
  /** Written for specific installations, by layout id. */
  | { needs: 'layout'; ids: string[] };

export interface LookDef {
  /** Wire name — the `name` field of an `animation`/`scene` command. */
  id: string;
  kind: 'animation' | 'scene';
  label: string;
  fits: Fits;
}

/** Human-readable reason a look does not suit a layout, or '' when it does. */
export function fitsReason(fits: Fits, layout: Layout): string {
  switch (fits.needs) {
  case 'any':
    return '';
  case 'grid':
    if (!layout.hasGridCoords) return 'needs a grid';
    return layout.cols >= fits.cols && layout.rows >= fits.rows
      ? ''
      : `needs ${fits.cols}×${fits.rows} or larger`;
  case 'ring':
    // Grids have no ring to travel around; every other topology does.
    return layout.topology === 'grid' ? 'needs a ring' : '';
  case 'layout':
    return fits.ids.includes(layout.id) ? '' : `made for ${fits.ids.join(', ')}`;
  }
}

export function fitsLayout(fits: Fits, layout: Layout): boolean {
  return fitsReason(fits, layout) === '';
}

const ANY: Fits = { needs: 'any' };
const RING: Fits = { needs: 'ring' };
const ART_GRID: Fits = { needs: 'grid', cols: 7, rows: 7 };

/**
 * Every look the brain can run, with what it needs. Kept beside the registries
 * it describes, and a test fails if the two drift apart.
 */
export const LOOKS: LookDef[] = [
  // ── Animations that adapt to any rig ──
  { id: 'wave', kind: 'animation', label: 'Wave', fits: ANY },
  { id: 'breathe', kind: 'animation', label: 'Breathe', fits: ANY },
  { id: 'rainbow', kind: 'animation', label: 'Rainbow', fits: ANY },
  { id: 'spiral', kind: 'animation', label: 'Spiral', fits: ANY },
  { id: 'rain', kind: 'animation', label: 'Rain', fits: ANY },
  { id: 'pacman', kind: 'animation', label: 'Pacman', fits: ANY },
  { id: 'pride-flow', kind: 'animation', label: 'Pride flow', fits: ANY },
  { id: 'pride-breathe', kind: 'animation', label: 'Pride breathe', fits: ANY },
  { id: 'pride-rotate', kind: 'animation', label: 'Pride rotate', fits: ANY },
  { id: 'pride-ring', kind: 'animation', label: 'Pride ring', fits: ANY },
  { id: 'trans-flow', kind: 'animation', label: 'Trans flow', fits: ANY },
  { id: 'trans-breathe', kind: 'animation', label: 'Trans breathe', fits: ANY },
  { id: 'trans-ring', kind: 'animation', label: 'Trans ring', fits: ANY },

  // ── Bitmap art: drawn cell by cell for the 7-wide grid ──
  { id: 'i-heart-sf', kind: 'animation', label: 'I ♥ SF', fits: ART_GRID },
  { id: 'heart-breathe', kind: 'animation', label: 'Heart breathe', fits: ART_GRID },

  // ── Amber (Nova): brightness travelling around a circle ──
  { id: 'amber-chase', kind: 'animation', label: 'Amber chase', fits: RING },
  { id: 'amber-comet', kind: 'animation', label: 'Amber comet', fits: RING },
  { id: 'amber-wave', kind: 'animation', label: 'Amber wave', fits: RING },
  { id: 'amber-levels', kind: 'animation', label: 'Amber levels', fits: RING },
  { id: 'amber-heartbeat', kind: 'animation', label: 'Amber heartbeat', fits: RING },
  { id: 'amber-embers', kind: 'animation', label: 'Amber embers', fits: RING },
  { id: 'amber-breathe', kind: 'animation', label: 'Amber breathe', fits: ANY },

  // ── Scenes ──
  { id: 'civic', kind: 'scene', label: 'Civic', fits: ANY },
  { id: 'pride', kind: 'scene', label: 'Pride', fits: ANY },
  { id: 'trans', kind: 'scene', label: 'Trans', fits: ANY },
  { id: 'gold', kind: 'scene', label: 'Gold', fits: ANY },
  { id: 'white', kind: 'scene', label: 'White', fits: ANY },
  { id: 'solstice', kind: 'scene', label: 'Solstice', fits: ANY },
  { id: 'ocean', kind: 'scene', label: 'Ocean', fits: ANY },
  { id: 'sunset', kind: 'scene', label: 'Sunset', fits: ANY },
  { id: 'forest', kind: 'scene', label: 'Forest', fits: ANY },
  { id: 'fire', kind: 'scene', label: 'Fire', fits: ANY },
  { id: 'off', kind: 'scene', label: 'Off', fits: ANY },
  { id: 'night', kind: 'scene', label: 'Night', fits: ANY },
  { id: 'checker', kind: 'scene', label: 'Checker', fits: ANY },
  { id: 'heart', kind: 'scene', label: 'Heart', fits: ART_GRID },
  { id: 'sf', kind: 'scene', label: 'SF', fits: ART_GRID },
  { id: 'amber', kind: 'scene', label: 'Amber', fits: ANY },
  { id: 'amber-glow', kind: 'scene', label: 'Amber glow', fits: ANY },
  { id: 'amber-alternate', kind: 'scene', label: 'Amber alternate', fits: ANY },
  { id: 'amber-ramp', kind: 'scene', label: 'Amber ramp', fits: RING },
  { id: 'amber-horizon', kind: 'scene', label: 'Amber horizon', fits: RING }
];

const BY_ID = new Map(LOOKS.map(l => [`${l.kind}:${l.id}`, l]));

export function lookDef(kind: 'animation' | 'scene', id: string): LookDef | undefined {
  return BY_ID.get(`${kind}:${id}`);
}

/** Registry names with no catalog entry (or vice versa) — used by the drift test. */
export function catalogDrift(): { uncatalogued: string[]; missing: string[] } {
  const registered = [
    ...Object.keys(animations).map(id => `animation:${id}`),
    ...Object.keys(scenes).map(id => `scene:${id}`)
  ];
  return {
    uncatalogued: registered.filter(key => !BY_ID.has(key)),
    missing: [...BY_ID.keys()].filter(key => !registered.includes(key))
  };
}

/**
 * The whole catalogue, ones that suit this rig first. Nothing is removed: an
 * operator with a specific look in mind should see it and read why it is
 * unavailable, rather than wonder where it went.
 */
export function looksForLayout(layout: Layout, kind?: 'animation' | 'scene'): Array<LookDef & { reason: string }> {
  return LOOKS
    .filter(l => !kind || l.kind === kind)
    .map(l => ({ ...l, reason: fitsReason(l.fits, layout) }))
    .sort((a, b) => Number(!!a.reason) - Number(!!b.reason));
}

/**
 * The rigs an operator builds shows for. Filtering is by *fit against a real
 * layout*, not by a tag someone remembered to set — so "Nova" means "runs on
 * the Nova ring", checked against the resolved preset.
 */
export interface LayoutFilter {
  id: string;
  label: string;
  /** Layout this filter judges fit against; null for "All". */
  layout: Layout | null;
}

export function layoutFilters(): LayoutFilter[] {
  return [
    { id: 'all', label: 'All', layout: null },
    { id: 'grid-7x7', label: '7×7', layout: presets['grid-7x7']() },
    { id: 'grace-cathedral', label: 'Grace', layout: presets['grace-cathedral']() },
    { id: 'nova', label: 'Nova', layout: presets.nova() }
  ];
}
