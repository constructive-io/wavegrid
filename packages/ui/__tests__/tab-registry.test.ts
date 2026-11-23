import { matchesShowWhen, type ShowWhen } from '@wavegrid/animations';
import { type Layout, presets } from '@wavegrid/layout/client';

import { coercePlugins } from '../src/lib/plugin-data';
import { allTabs, registryFor, tabById, tabsFor } from '../src/lib/tab-registry';

const grid = presets['grid-7x7']();
const projectors = presets['interleaved-12x2']();
const rings = presets['grace-cathedral']();

describe('showWhen matcher', () => {
  it('matches any or exact plugin audio mode without depending on a project name', () => {
    for (const pluginAudioModes of [undefined, [], ['grace'], ['future'], ['grace', 'future']]) {
      const context = { pluginAudioModes };
      expect(matchesShowWhen({ pluginAudio: true }, grid, context)).toBe(!!pluginAudioModes?.length);
      expect(matchesShowWhen({ pluginAudio: 'grace' }, grid, context)).toBe(!!pluginAudioModes?.includes('grace'));
      expect(matchesShowWhen({ pluginAudio: 'future' }, grid, context)).toBe(!!pluginAudioModes?.includes('future'));
      expect(matchesShowWhen('always', grid, context)).toBe(true);
      expect(matchesShowWhen('never', grid, context)).toBe(false);
      expect(matchesShowWhen({}, grid, context)).toBe(true);
    }
    expect(matchesShowWhen({ pluginAudio: true }, grid)).toBe(false);
    expect(matchesShowWhen({ pluginAudio: 'grace' }, grid)).toBe(false);
  });

  it('ANDs audio bindings with every existing condition', () => {
    const context = { pluginAudioModes: ['grace'] };
    const condition: ShowWhen = { pluginAudio: 'grace', fixtureKind: 'cannon', topology: 'grid', minFixtures: 49, layoutId: ['grid-7x7'] };
    expect(matchesShowWhen(condition, grid, context)).toBe(true);
    expect(matchesShowWhen(condition, grid, { pluginAudioModes: [] })).toBe(false);
    for (const mismatch of [{ fixtureKind: 'projector' as const }, { topology: 'rings' }, { minFixtures: 50 }, { layoutId: [] }]) {
      expect(matchesShowWhen({ ...condition, ...mismatch }, grid, context)).toBe(false);
    }
    expect(matchesShowWhen({ pluginAudio: true }, { ...grid, fixtures: [], count: 0 }, context)).toBe(true);
  });
  it.each<[ShowWhen, boolean]>([
    ['always', true], ['never', false], [{}, true],
    [{ fixtureKind: 'cannon' }, true], [{ fixtureKind: 'projector' }, false],
    [{ topology: 'grid' }, true], [{ topology: 'rings' }, false],
    [{ minFixtures: 49 }, true], [{ minFixtures: 50 }, false],
    [{ minFixtures: 0 }, true],
    [{ layoutId: 'grid-7x7' }, true], [{ layoutId: 'grid' }, false],
    [{ layoutId: ['other', 'grid-7x7'] }, true], [{ layoutId: [] }, false],
    [{ fixtureKind: 'cannon', topology: 'grid', minFixtures: 49, layoutId: ['grid-7x7'] }, true],
    [{ fixtureKind: 'projector', topology: 'grid', minFixtures: 49, layoutId: 'grid-7x7' }, false],
    [{ fixtureKind: 'cannon', topology: 'rings', minFixtures: 49, layoutId: 'grid-7x7' }, false],
    [{ fixtureKind: 'cannon', topology: 'grid', minFixtures: 50, layoutId: 'grid-7x7' }, false],
    [{ fixtureKind: 'cannon', topology: 'grid', minFixtures: 49, layoutId: 'other' }, false]
  ])('matches %j against a grid: %s', (condition, expected) => {
    expect(matchesShowWhen(condition, grid)).toBe(expected);
  });

  it('finds either fixture kind in a mixed rig', () => {
    expect(matchesShowWhen({ fixtureKind: 'cannon' }, projectors)).toBe(true);
    expect(matchesShowWhen({ fixtureKind: 'projector' }, projectors)).toBe(true);
  });

  it('treats missing fixture kinds as cannon and requires an actual fixture', () => {
    const { kind: _kind, ...fixture } = grid.fixtures[0];
    const legacy = { ...grid, fixtures: [fixture] } as Layout;
    expect(matchesShowWhen({ fixtureKind: 'cannon' }, legacy)).toBe(true);
    expect(matchesShowWhen({ fixtureKind: 'projector' }, legacy)).toBe(false);
    const empty = { ...grid, fixtures: [], count: 0 };
    expect(matchesShowWhen({}, empty)).toBe(true);
    expect(matchesShowWhen({ minFixtures: 1 }, empty)).toBe(false);
    expect(matchesShowWhen({ fixtureKind: 'cannon' }, empty)).toBe(false);
  });
});

describe('built-in tab registry', () => {
  it('shows Palace only once, from the project plugin, and never as a built-in', () => {
    const registry = registryFor(coercePlugins([{ id: 'palace', pattern: 'pattern.js', tabs: [
      { id: 'palace', label: 'Palace', view: 'view/index.html', paint: true, showWhen: { fixtureKind: 'projector' } }
    ] }]));
    expect(tabById('palace')).toBeUndefined();
    expect(tabsFor(projectors, registry).filter(tab => tab.label === 'Palace').map(tab => tab.id)).toEqual(['palace/palace']);
    expect(tabsFor(grid, registry).some(tab => tab.label === 'Palace')).toBe(false);
  });
  it('registers Pride only from the project plugin, with no built-in duplicate', () => {
    const registry = registryFor(coercePlugins([{ id: 'pride', pattern: 'pattern.js', tabs: [
      { id: 'pride', label: 'Pride', view: 'view/index.html', showWhen: 'always' }
    ] }]));
    const prideLayout = presets['grid-7x2']();
    expect(tabById('pride')).toBeUndefined();
    expect(tabsFor(prideLayout).some(tab => tab.label === 'Pride')).toBe(false);
    expect(tabsFor(prideLayout, registry).filter(tab => tab.label === 'Pride').map(tab => tab.id)).toEqual(['pride/pride']);
  });
  it('registers USA only from the project plugin, with no hidden built-in renderer', () => {
    const registry = registryFor(coercePlugins([{ id: 'usa', pattern: 'pattern.js', tabs: [
      { id: 'usa', label: 'USA', view: 'view/index.html', showWhen: 'always' }
    ] }]));
    expect(tabById('usa')).toBeUndefined();
    for (const layout of [grid, rings, projectors]) {
      expect(tabsFor(layout).some(tab => tab.label === 'USA')).toBe(false);
      expect(tabsFor(layout, registry).filter(tab => tab.label === 'USA').map(tab => tab.id)).toEqual(['usa/usa']);
    }
  });
  it('shows Audio for a retained plugin binding, including hidden or unmounted tabs, on any layout', () => {
    const plugins = coercePlugins([{ id: 'custom-project', pattern: 'pattern.js', tabs: [
      { id: 'bound', label: 'Bound', showWhen: 'never', audio: { mode: 'grace', params: { hueShift: 'hue' } } },
      { id: 'dependent', label: 'Dependent', showWhen: { topology: 'rings', pluginAudio: 'grace' } }
    ] }]);
    const registry = registryFor(plugins);
    for (const layout of [grid, rings, projectors]) {
      expect(tabsFor(layout, registry).map(tab => tab.id)).toEqual([
        'paint', 'pool', 'gradient', 'audio', ...(layout === rings ? ['custom-project/dependent'] : [])
      ]);
      expect(tabsFor(layout).some(tab => tab.id === 'audio')).toBe(false);
    }
    expect(tabsFor(grid, registryFor([])).some(tab => tab.id === 'audio')).toBe(false);
    for (const audio of [undefined, {}, { mode: 'unsupported', params: { hueShift: 'hue' } }]) {
      const invalid = registryFor(coercePlugins([{ id: 'invalid', tabs: [{ id: 'tab', label: 'Tab', audio }] }]));
      expect(tabsFor(rings, invalid).some(tab => tab.id === 'audio')).toBe(false);
    }
    const differentMode = registry.map(tab => tab.audioMode ? { ...tab, audioMode: 'future' } : tab);
    expect(tabsFor(rings, differentMode).some(tab => tab.id === 'audio')).toBe(false);
  });
  it('shows Grace and GracePaint only as plugins without exposing Audio when no binding is declared', () => {
    const registry = registryFor(coercePlugins([{ id: 'grace', pattern: 'pattern.js', tabs: [
      { id: 'grace', label: 'Grace', view: 'view/index.html', showWhen: { topology: 'rings' } },
      { id: 'gracepaint', label: 'GracePaint', pattern: 'paint/pattern.js', view: 'view/paint.html', showWhen: 'always', paint: true }
    ] }]));
    expect(tabById('grace')).toBeUndefined();
    expect(tabsFor(rings, registry).filter(tab => tab.label === 'Grace').map(tab => tab.id)).toEqual(['grace/grace']);
    expect(tabsFor(grid, registry).some(tab => tab.label === 'Grace')).toBe(false);
    expect(tabById('gracepaint')).toBeUndefined();
    expect(tabById('looks')).toBeUndefined();
    for (const layout of [rings, grid, projectors]) {
      expect(tabsFor(layout).some(tab => tab.label === 'GracePaint' || tab.label === 'Looks')).toBe(false);
      expect(tabsFor(layout, registry).filter(tab => tab.label === 'GracePaint').map(tab => tab.id)).toEqual(['grace/gracepaint']);
    }
    expect(tabById('audio', registry)?.label).toBe('Audio');
  });
  it.each([
    [grid, ['paint', 'pool', 'gradient']],
    [projectors, ['paint', 'pool', 'gradient']],
    [rings, ['paint', 'pool', 'gradient']]
  ] as const)('keeps the visible tab order for $0.id', (layout, ids) => {
    expect(tabsFor(layout).map(tab => tab.id)).toEqual(ids);
  });

  it('keeps all built-ins in their original order, including hidden renderers', () => {
    expect(allTabs.map(tab => [tab.id, tab.label])).toEqual([
      ['paint', 'Paint'], ['pool', 'Pool'], ['gradient', 'Gradient'],
      ['scenes', 'Scenes'], ['animations', 'Anim'],
      ['patterns', 'Patterns'], ['sequences', 'Sequences'], ['playlist', 'Playlist'],
      ['flags', 'Flags'], ['drops', 'Drops'], ['audio', 'Audio'], ['video', 'Video']
    ]);
    for (const tab of allTabs) {
      expect(tabById(tab.id)).toBe(tab);
      expect(typeof tab.render).toBe('function');
    }
    expect(tabById('unregistered')).toBeUndefined();
    expect(tabById('')).toBeUndefined();
  });
});
