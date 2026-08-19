import {
  animations,
  catalogDrift,
  fitsLayout,
  fitsReason,
  layoutFilters,
  LOOKS,
  looksForLayout,
  scenes,
  SHOW_PRESETS,
  showFitsReason,
  showPresetsForLayout
} from '@wavegrid/animations';
import { presets } from '@wavegrid/layout';

const grid7x7 = presets['grid-7x7']();
const nova = presets.nova();
const grace = presets['grace-cathedral']();

describe('catalog', () => {
  it('describes every registered animation and scene, and nothing else', () => {
    expect(catalogDrift()).toEqual({ uncatalogued: [], missing: [] });
  });

  it('has one entry per look', () => {
    const keys = LOOKS.map(l => `${l.kind}:${l.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps bitmap art off rigs that have no 7-wide grid', () => {
    const heart = LOOKS.find(l => l.id === 'i-heart-sf')!;
    expect(fitsLayout(heart.fits, grid7x7)).toBe(true);
    expect(fitsLayout(heart.fits, nova)).toBe(false);
    expect(fitsReason(heart.fits, nova)).toBe('needs a grid');
  });

  it('allows ring looks on any ring-ish layout but not on a grid', () => {
    const chase = LOOKS.find(l => l.id === 'amber-chase')!;
    expect(fitsLayout(chase.fits, nova)).toBe(true);
    expect(fitsLayout(chase.fits, grace)).toBe(true);
    expect(fitsReason(chase.fits, grid7x7)).toBe('needs a ring');
  });

  it('lists everything for a layout, fitting looks first', () => {
    const looks = looksForLayout(nova);
    expect(looks).toHaveLength(LOOKS.length);
    const firstUnfit = looks.findIndex(l => l.reason !== '');
    expect(firstUnfit).toBeGreaterThan(0);
    expect(looks.slice(firstUnfit).every(l => l.reason !== '')).toBe(true);
  });

  it('offers a filter per rig an operator builds shows for', () => {
    const filters = layoutFilters();
    expect(filters.map(f => f.id)).toEqual(['all', 'grid-7x7', 'grace-cathedral', 'nova']);
    expect(filters[0].layout).toBeNull();
    expect(filters[3].layout?.count).toBe(6);
  });
});

describe('show presets', () => {
  it('only plays looks that exist', () => {
    for (const preset of SHOW_PRESETS) {
      for (const step of preset.steps) {
        if (step.type === 'animation') expect(animations[step.name!]).toBeDefined();
        if (step.type === 'scene') expect(scenes[step.name!]).toBeDefined();
      }
    }
  });

  it('has unique ids', () => {
    const ids = SHOW_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports the first step that does not suit the rig', () => {
    const heartNight = SHOW_PRESETS.find(p => p.id === 'heart-night')!;
    expect(showFitsReason(heartNight.steps, grid7x7)).toBe('');
    expect(showFitsReason(heartNight.steps, nova)).toBe('Heart needs a grid');
  });

  it('gives every rig fitting sequences and playlists', () => {
    for (const layout of [grid7x7, nova, grace]) {
      for (const kind of ['sequence', 'playlist'] as const) {
        const fitting = showPresetsForLayout(layout, kind).filter(p => p.reason === '');
        expect(fitting.length).toBeGreaterThan(0);
      }
    }
  });

  it('ships Nova amber shows that run on the Nova ring', () => {
    const novaShows = SHOW_PRESETS.filter(p => p.id.startsWith('nova-'));
    expect(novaShows.length).toBeGreaterThanOrEqual(4);
    for (const show of novaShows) {
      expect(showFitsReason(show.steps, nova)).toBe('');
    }
  });

  it('ships Grace shows that run on the cathedral layout', () => {
    const graceShows = SHOW_PRESETS.filter(p => p.id.startsWith('grace-'));
    expect(graceShows.length).toBeGreaterThanOrEqual(3);
    for (const show of graceShows) {
      expect(showFitsReason(show.steps, grace)).toBe('');
    }
  });
});
