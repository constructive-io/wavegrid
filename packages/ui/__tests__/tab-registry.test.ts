import { matchesShowWhen, type ShowWhen } from '@wavegrid/animations';
import { type Layout, presets } from '@wavegrid/layout/client';

import { coercePlugins } from '../src/lib/plugin-data';
import { allTabs, registryFor, tabById, tabsFor } from '../src/lib/tab-registry';

const grid = presets['grid-7x7']();
const projectors = presets['interleaved-12x2']();
const rings = presets['grace-cathedral']();

describe('showWhen matcher', () => {
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
  it.each([
    [grid, ['paint', 'pool', 'gradient']],
    [projectors, ['paint', 'pool', 'gradient']],
    [rings, ['paint', 'pool', 'gradient', 'grace', 'gracepaint']]
  ] as const)('keeps the visible tab order for $0.id', (layout, ids) => {
    expect(tabsFor(layout).map(tab => tab.id)).toEqual(ids);
  });

  it('keeps all built-ins in their original order, including hidden renderers', () => {
    expect(allTabs.map(tab => [tab.id, tab.label])).toEqual([
      ['paint', 'Paint'], ['pool', 'Pool'], ['gradient', 'Gradient'],
      ['scenes', 'Scenes'], ['animations', 'Anim'], ['pride', 'Pride'], ['usa', 'USA'],
      ['grace', 'Grace'], ['gracepaint', 'GracePaint'], ['looks', 'Looks'],
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
