import { presets } from '@wavegrid/layout/client';
import { parsePluginControl } from '@wavegrid/settings/plugin-controls';

import { coerceCards, coercePluginParams, coercePlugins, pluginAssetUrl } from '../src/lib/plugin-data';
import { allTabs, registryFor, tabById, tabsFor } from '../src/lib/tab-registry';
import { fetchPluginText, parsePluginPresets, pluginParamUpdates } from '../src/lib/use-plugin-pattern';

it('preserves valid audio conditions and fails closed on malformed ones', () => {
  for (const pluginAudio of [true, 'grace', 'future', false, '', null, 1, [], {}]) {
    const showWhen = { topology: 'rings', pluginAudio };
    const plugins = coercePlugins([{ id: 'demo', tabs: [{ id: 'dependent', label: 'Dependent', showWhen }] }]);
    expect(plugins[0].tabs[0].showWhen).toEqual(pluginAudio === true || (typeof pluginAudio === 'string' && pluginAudio.length > 0) ? showWhen : 'never');
  }
});

const raw = [{ id: 'demo', name: 'Demo', pattern: 'pattern.js', presetsFile: 'presets.json', tabs: [
  { id: 'demo/all', label: 'All', cards: [] },
  { id: 'projectors', label: 'Projectors', showWhen: { fixtureKind: 'projector' }, cards: [] },
  { id: 'rings', label: 'Rings', showWhen: { topology: 'rings' }, cards: [] },
  { id: 'hidden', label: 'Hidden', showWhen: 'never', cards: [] }
] }, { id: 'second', tabs: [{ id: 'tab', label: 'Second', cards: [], pattern: 'other.js' }] }];

describe('plugin tab registry', () => {
  const plugins = coercePlugins(raw);
  const registry = registryFor(plugins);
  it('appends namespaced tabs in plugin order without changing built-ins', () => {
    expect(registry.slice(0, allTabs.length)).toEqual(allTabs);
    expect(registry.slice(allTabs.length).map(tab => tab.id)).toEqual(['demo/all', 'demo/projectors', 'demo/rings', 'demo/hidden', 'second/tab']);
    expect(tabById('demo/all', registry)?.label).toBe('All');
    expect(plugins[0].tabs[0].pattern).toBe('pattern.js');
    expect(plugins[1].tabs[0].pattern).toBe('other.js');
  });
  it.each([
    ['grid-7x7', ['demo/all', 'second/tab']],
    ['interleaved-12x2', ['demo/all', 'demo/projectors', 'second/tab']],
    ['grace-cathedral', ['demo/all', 'demo/rings', 'second/tab']]
  ])('filters plugin visibility for %s', (layout, ids) => {
    expect(tabsFor(presets[layout](), registry).slice(tabsFor(presets[layout]()).length).map(tab => tab.id)).toEqual(ids);
  });
  it('handles empty/malformed config, cards, visibility and paths', () => {
    expect(coercePlugins(undefined)).toEqual([]);
    expect(coercePlugins([null, {}, { id: '../bad', tabs: [] }])).toEqual([]);
    expect(registryFor([])).toEqual(allTabs);
    expect(tabById('missing', registry)).toBeUndefined();
    expect(coerceCards([{ title: 'Bad', controls: [null, { type: 'future' }] }, null])).toEqual([{ title: 'Bad', controls: [] }]);
    const invalid = coercePlugins([{ id: 'safe', tabs: [{ id: 'x', label: 'X', pattern: '../escape', showWhen: { layoutId: 3 } }] }]);
    expect(invalid[0].tabs[0]).toMatchObject({ pattern: undefined, showWhen: 'never', cards: [] });
    expect(pluginAssetUrl('demo', 'a file/pattern.js')).toBe('/plugins/demo/a%20file/pattern.js');
  });
});

describe('defensive plugin control coercion', () => {
  const controls = coerceCards([{ title: 'Controls', controls: [
    { type: 'slider', param: 'speed', min: 0, max: 4, default: 1 },
    { type: 'toggle', param: 'enabled', default: true },
    { type: 'select', param: 'mode', options: ['a', 'b'], default: 'a' },
    { type: 'color', param: 'tint', default: '#112233' },
    { type: 'button', label: 'Start', action: 'start' }
  ] }])[0].controls;
  it.each(['__proto__', 'constructor', 'prototype'])('filters reserved parameter name %s defensively', param => {
    expect(coerceCards([{ title: 'Unsafe', controls: [{ type: 'toggle', param, default: true }] }]))
      .toEqual([{ title: 'Unsafe', controls: [] }]);
  });

  it('uses tab defaults for initial, empty or invalid params', () => {
    const defaults = { speed: 1, enabled: true, mode: 'a', tint: '#112233' };
    expect(coercePluginParams(controls, null)).toEqual(defaults);
    expect(coercePluginParams(controls, { speed: NaN, enabled: {}, mode: 'bad', tint: 'red' })).toEqual(defaults);
  });
  it('coerces live params and presets, clamps sliders and ignores undeclared params', () => {
    expect(coercePluginParams(controls, { speed: '12', enabled: 'false', mode: 'b', tint: '#ABCDEF', injected: 1 }))
      .toEqual({ speed: 4, enabled: false, mode: 'b', tint: '#abcdef' });
    expect(coercePluginParams(controls, { speed: -9 }).speed).toBe(0);
    expect(parsePluginControl({ type: 'select', param: 'n', options: [{ label: 'Two', value: 2 }], default: 2 })).not.toBeNull();
  });
});

describe('running plugin parameter updates', () => {
  it('sends a displayed default that the raw live pattern has never received', () => {
    const controls = coerceCards([{ title: 'Speed', controls: [
      { type: 'slider', param: 'speed', min: 0, max: 4, default: 1 }
    ] }])[0].controls;
    const live = {};
    const displayed = coercePluginParams(controls, live);
    const patch = { speed: 1 };
    const preset = coercePluginParams(controls, { ...displayed, ...patch });
    expect(preset).toEqual(displayed);
    expect(pluginParamUpdates(patch, preset, live)).toEqual([{ type: 'setPatternParam', name: 'speed', value: 1 }]);
  });

  it('compares raw live values, not their coerced representation', () => {
    const patch = { speed: 1, enabled: false };
    expect(pluginParamUpdates(patch, patch, { speed: '1', enabled: false }))
      .toEqual([{ type: 'setPatternParam', name: 'speed', value: 1 }]);
    expect(pluginParamUpdates({ speed: 1 }, { speed: 1 }, { speed: 1 })).toEqual([]);
  });

  it('leaves untouched live params alone when another tab has narrower slider bounds', () => {
    const controls = coerceCards([{ title: 'Controls', controls: [
      { type: 'slider', param: 'speed', min: 0, max: 4, default: 1 },
      { type: 'slider', param: 'hue', min: 0, max: 360, default: 210 }
    ] }])[0].controls;
    const live = { speed: 8, hue: 200 };
    const displayed = coercePluginParams(controls, live);
    expect(displayed).toEqual({ speed: 4, hue: 200 });
    const patch = { hue: 210 };
    const next = coercePluginParams(controls, { ...displayed, ...patch });
    expect(pluginParamUpdates(patch, next, live)).toEqual([{ type: 'setPatternParam', name: 'hue', value: 210 }]);
    expect(pluginParamUpdates({ speed: 4 }, next, live)).toEqual([{ type: 'setPatternParam', name: 'speed', value: 4 }]);
  });

  it('handles empty desired params and missing or invalid live params', () => {
    expect(pluginParamUpdates({}, { speed: 1 }, null)).toEqual([]);
    expect(pluginParamUpdates({ unknown: 1 }, {}, null)).toEqual([]);
    for (const live of [undefined, null, []]) {
      expect(pluginParamUpdates({ enabled: false }, { enabled: false }, live)).toEqual([{ type: 'setPatternParam', name: 'enabled', value: false }]);
    }
  });
});

describe('plugin asset errors', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  it('fetches pattern text without evaluating it', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => 'throw new Error("not executed")' });
    expect(await fetchPluginText('/plugins/demo/pattern.js')).toContain('not executed');
  });
  it('rejects HTTP and network failures for the hook to display', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchPluginText('/missing')).rejects.toThrow('HTTP 404');
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(fetchPluginText('/missing')).rejects.toThrow('offline');
  });
  it('accepts empty and populated presets, rejecting malformed payloads', () => {
    expect(parsePluginPresets('[]')).toEqual([]);
    expect(parsePluginPresets('[{"name":"Slow","params":{"speed":0.5}}]')).toHaveLength(1);
    for (const source of ['{}', 'null', 'bad json', '[{"name":"Bad","params":null}]']) expect(() => parsePluginPresets(source)).toThrow();
  });
});
