import { resolveLayout } from '@wavegrid/layout/client';

import { coercePlugins } from '../src/lib/plugin-data';
import { initialViewLoadState, jsonEqual, nextViewLoad, pluginParamUpdates, readViewMessage, VIEW_MESSAGE_MAX_BYTES, viewLayout, viewLookCommand, viewLooks, viewMessageFits } from '../src/lib/plugin-view-bridge';

const source = {};
const read = (data: unknown) => readViewMessage(data, source, source);
const looks = [
  { id: 'mine', name: 'Mine', params: { plugin: 'demo/view', stops: [[40, 100]] }, createdAt: 1 },
  { id: 'other', name: 'Other', params: { plugin: 'demo/other' }, createdAt: 2 },
  { id: 'legacy', name: 'Legacy', params: {}, createdAt: 3 }
];

describe('plugin iframe load trust', () => {
  it('trusts only the first load, then revokes trust and remounts with a fresh generation', () => {
    const initial = initialViewLoadState();
    expect(initial.loaded).toBe(false);
    const loaded = nextViewLoad(initial, 1000);
    expect(loaded).toEqual({ generation: 0, loaded: true, restarts: [], error: false });
    const navigated = nextViewLoad(loaded, 1100);
    expect(navigated).toEqual({ generation: 1, loaded: false, restarts: [1100], error: false });
    expect(nextViewLoad(navigated, 1200)).toEqual({ ...navigated, loaded: true });
    expect(initial.loaded).toBe(false);
  });

  it('stops after three remounts in ten seconds, without trusting a later load', () => {
    let state = nextViewLoad(initialViewLoadState(), 0);
    for (let i = 1; i <= 3; i++) {
      state = nextViewLoad(state, i * 100);
      expect(state.loaded).toBe(false);
      expect(state.error).toBe(false);
      state = nextViewLoad(state, i * 100 + 1);
    }
    state = nextViewLoad(state, 500);
    expect(state).toMatchObject({ generation: 3, loaded: false, error: true });
    expect(nextViewLoad(state, 20000)).toBe(state);
  });

  it('expires remounts outside the rolling ten-second window', () => {
    let state = nextViewLoad(initialViewLoadState(), 0);
    state = nextViewLoad(state, 100);
    state = nextViewLoad(state, 101);
    expect(nextViewLoad(state, 10100)).toEqual({ generation: 2, loaded: false, restarts: [10100], error: false });
  });
});

describe('plugin view bridge boundary', () => {
  it('accepts messages only from the exact current iframe window', () => {
    expect(readViewMessage({ wg: 1, type: 'stop' }, {}, source)).toEqual({});
    expect(readViewMessage({ wg: 1, type: 'stop' }, null, null)).toEqual({});
    expect(read({ wg: 1, type: 'stop' }).message).toEqual({ wg: 1, type: 'stop' });
    expect(read({ wg: 1, type: 'unknown' })).toEqual({});
  });

  it.each([
    null, 'start', {}, { wg: 2, type: 'stop' }, { wg: 1, type: 'setParams', params: [] },
    { wg: 1, type: 'setParams', params: { bad: undefined } },
    { wg: 1, type: 'setParams', params: { bad: NaN } },
    { wg: 1, type: 'start', params: { bad: () => 1 } },
    { wg: 1, type: 'setParams', params: JSON.parse('{"__proto__":{"bad":1}}') },
    { wg: 1, type: 'saveLook', name: 3, params: {} }, { wg: 1, type: 'renameLook', id: 'a' },
    { wg: 1, type: 'deleteLook', id: 1 }, { wg: 1, type: 'resize', height: Infinity }
  ])('drops malformed data without throwing: %j', data => {
    expect(read(data).warning).toBeDefined();
    expect(read(data).message).toBeUndefined();
  });

  it('accepts JSON arrays/objects, empty params, and only whitelisted fields', () => {
    const params = { paint: [-1, 0, 240, 80], nested: { stops: [[40, 100]], enabled: true, value: null } };
    expect(read({ wg: 1, type: 'setParams', params }).message).toEqual({ wg: 1, type: 'setParams', params });
    expect(read({ wg: 1, type: 'start' }).message).toEqual({ wg: 1, type: 'start' });
    expect(read({ wg: 1, type: 'start', params: {} }).message).toEqual({ wg: 1, type: 'start', params: {} });
    expect(read({ wg: 1, type: 'stop', typeToSend: 'cannon', code: 'evil' }).message).toEqual({ wg: 1, type: 'stop' });
  });

  it('caps both directions by UTF-8 JSON bytes, including cycles and non-JSON data', () => {
    const message = { wg: 1, type: 'start', params: { text: '' } };
    const overhead = new TextEncoder().encode(JSON.stringify(message)).length;
    message.params.text = 'a'.repeat(VIEW_MESSAGE_MAX_BYTES - overhead);
    expect(viewMessageFits(message)).toBe(true);
    expect(read(message).message).toBeDefined();
    message.params.text += 'a';
    expect(viewMessageFits(message)).toBe(false);
    expect(read(message).warning).toBeDefined();
    expect(viewMessageFits({ text: '🌊'.repeat(70000) })).toBe(false);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(read(cyclic).warning).toBeDefined();
    expect(read({ wg: 1, type: 'start', params: { big: BigInt(1) } }).warning).toBeDefined();
    expect(viewMessageFits(undefined)).toBe(false);
  });

  it('clamps resize requests and supports the short resize envelope', () => {
    expect(read({ wg: 1, type: 'resize', height: -1 }).message).toMatchObject({ height: 120 });
    expect(read({ wg: 1, type: 'resize', height: 9000 }).message).toMatchObject({ height: 1600 });
    expect(read({ wg: 'resize', height: 420 }).message).toEqual({ wg: 1, type: 'resize', height: 420 });
  });

  it('passes normalized geometry and fixture kinds, not config/auth/routing', () => {
    const layout = viewLayout(resolveLayout({ preset: 'interleaved-12x2' }));
    expect(Object.keys(layout).sort()).toEqual(['cols', 'count', 'fixtures', 'id', 'rows', 'topology']);
    expect(layout.fixtures[0]).toMatchObject({ kind: 'cannon', uv: [0, 0] });
    expect(layout.fixtures[12].kind).toBe('projector');
    expect(coercePlugins([{ id: 'demo', tabs: [{ id: 'view', label: 'View', view: 'view/index.html', paint: true }] }])[0].tabs[0])
      .toMatchObject({ view: 'view/index.html', paint: true, cards: [] });
    expect(coercePlugins([{ id: 'demo', tabs: [{ id: 'view', label: 'View', view: '../escape', paint: 'true' }] }])[0].tabs[0])
      .toMatchObject({ view: undefined, paint: false });
  });
});

describe('view look scoping', () => {
  it('only exposes looks carrying this tab tag', () => {
    expect(viewLooks(looks, 'demo/view').map(look => look.id)).toEqual(['mine']);
    expect(viewLooks(looks, 'absent')).toEqual([]);
  });
  it('overwrites a forged tag on save and rejects foreign/unscoped ids for rename/delete', () => {
    expect(viewLookCommand({ wg: 1, type: 'saveLook', name: 'New', params: { plugin: 'demo/other', paint: [] } }, 'demo/view', looks))
      .toEqual({ type: 'saveLook', name: 'New', params: { plugin: 'demo/view', paint: [] } });
    for (const id of ['other', 'legacy', 'missing']) {
      expect(viewLookCommand({ wg: 1, type: 'renameLook', id, name: 'Bad' }, 'demo/view', looks)).toBeNull();
      expect(viewLookCommand({ wg: 1, type: 'deleteLook', id }, 'demo/view', looks)).toBeNull();
    }
    expect(viewLookCommand({ wg: 1, type: 'renameLook', id: 'mine', name: 'Good' }, 'demo/view', looks))
      .toEqual({ type: 'renameLook', id: 'mine', name: 'Good' });
    expect(viewLookCommand({ wg: 1, type: 'deleteLook', id: 'mine' }, 'demo/view', looks)).toEqual({ type: 'deleteLook', id: 'mine' });
  });
});

describe('deep JSON param diffing', () => {
  it('compares objects independent of key order and arrays by content/order', () => {
    expect(jsonEqual({ a: [1, { b: null }], c: false }, { c: false, a: [1, { b: null }] })).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual([], {})).toBe(false);
    expect(pluginParamUpdates({ paint: [40, 90] }, { paint: [40, 90], speed: 4 }, { paint: [40, 90], speed: 8 })).toEqual([]);
    expect(pluginParamUpdates({ paint: [40, 90] }, { paint: [40, 90] }, { paint: [40, 80] }))
      .toEqual([{ type: 'setPatternParam', name: 'paint', value: [40, 90] }]);
    expect(pluginParamUpdates({ speed: 1 }, { speed: 1 }, {})).toEqual([{ type: 'setPatternParam', name: 'speed', value: 1 }]);
  });
});
