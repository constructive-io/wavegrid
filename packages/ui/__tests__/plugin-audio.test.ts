import { coercePlugins } from '../src/lib/plugin-data';
import { activePluginAudio, type LoadedPluginAudio, pluginAudioCommands, usePluginAudio } from '../src/lib/use-plugin-audio';

let mockSlots: any[] = [], mockCursor = 0, mockEffects: (() => void)[] = [];
const mockMemo = (fn: () => unknown, deps: unknown[]) => {
  const i = mockCursor++, previous = mockSlots[i];
  if (!previous || deps.some((value, index) => value !== previous.deps[index])) mockSlots[i] = { deps, value: fn() };
  return mockSlots[i].value;
};
jest.mock('react', () => ({
  useCallback: (fn: unknown, deps: unknown[]) => mockMemo(() => fn, deps),
  useRef: (value: unknown) => { const i = mockCursor++; return mockSlots[i] ||= { current: value }; },
  useState: (initial: any) => {
    const i = mockCursor++;
    if (!(i in mockSlots)) mockSlots[i] = initial;
    return [mockSlots[i], (value: unknown) => { mockSlots[i] = value; }];
  },
  useEffect: (fn: () => void, deps: unknown[]) => mockMemo(() => { mockEffects.push(fn); }, deps)
}));

const binding: LoadedPluginAudio = { tabId: 'demo/view', source: 'pattern source',
  audio: { mode: 'grace', params: { hueShift: 'hue', satShift: 'sat' },
    step: { param: 'stops', values: { file: 'gradients.json', key: 'stops' }, set: { paint: [] } } },
  values: [[[20, 90]], [[200, 80]]] };
const live: any = { active: true, code: binding.source, params: { plugin: binding.tabId, hue: 12, sat: -3, stops: binding.values[0], paint: [40, 90] } };
const out = { hueShift: 12, satShift: -3, step: true };
const send = jest.fn();
const plugins = coercePlugins([{ id: 'demo', tabs: [{ id: 'view', label: 'View', pattern: 'pattern.js', audio: binding.audio }] }]);
function render(pattern: any = live, mode = 'grace', playing = true) {
  mockCursor = 0;
  const callback = usePluginAudio(plugins, pattern, send, mode, playing);
  const effects = mockEffects; mockEffects = []; effects.forEach(effect => effect());
  return callback;
}
async function mount(pattern: any = live, mode = 'grace', playing = true) {
  render(pattern, mode, playing); await new Promise(resolve => setImmediate(resolve)); return render(pattern, mode, playing);
}
beforeEach(() => {
  mockSlots = []; mockEffects = []; send.mockClear();
  global.fetch = jest.fn(async (url: any) => ({ ok: true, text: async () => String(url).endsWith('pattern.js') ? binding.source
    : JSON.stringify(binding.values.map(stops => ({ stops }))) })) as any;
});
afterEach(() => jest.restoreAllMocks());

it('cycles nested values by JSON equality, wraps, and chooses first for an unknown live value', () => {
  for (const [current, expected] of [[binding.values[0], binding.values[1]], [binding.values[1], binding.values[0]], [null, binding.values[0]]]) {
    expect(pluginAudioCommands(binding, { ...live, params: { ...live.params, stops: JSON.parse(JSON.stringify(current)) } }, out))
      .toEqual([{ type: 'setPatternParam', name: 'paint', value: [] }, { type: 'setPatternParam', name: 'stops', value: expected }]);
  }
  expect(pluginAudioCommands(binding, live, { ...out, step: false })).toEqual([]);
});

it('never starts a pattern or writes to an inactive or foreign-source pattern', () => {
  for (const pattern of [null, { ...live, active: false }, { ...live, code: 'other' }]) {
    expect(activePluginAudio([binding], pattern)).toBeUndefined();
    expect(pluginAudioCommands(binding, pattern, out)).toEqual([]);
  }
  expect(pluginAudioCommands({ ...binding, values: [] }, live, out)).toEqual([]);
});

it.each([undefined, 'demo/other'])('controls a shared-source pattern started by another tab (tag: %s)', async plugin => {
  const pattern = { ...live, params: { ...live.params, plugin } };
  render(pattern); await new Promise(resolve => setImmediate(resolve));
  const callback = render(pattern);
  expect(activePluginAudio([binding], pattern)).toBe(binding);
  expect(callback(out)).toBe(true);
  expect(send).toHaveBeenCalledWith({ type: 'setPatternParam', name: 'stops', value: binding.values[1] });
  expect(send.mock.calls.every(([message]) => message.type === 'setPatternParam')).toBe(true);
});

it('maps output fields, suppresses unchanged params, and ignores non-finite shifts', () => {
  expect(pluginAudioCommands(binding, live, { hueShift: 25, satShift: 4, step: false })).toEqual([
    { type: 'setPatternParam', name: 'hue', value: 25 }, { type: 'setPatternParam', name: 'sat', value: 4 }
  ]);
  expect(pluginAudioCommands(binding, live, { hueShift: NaN, satShift: Infinity, step: false })).toEqual([]);
});

it('loads source and keyed values without mounting a plugin tab, then updates the active brain pattern', async () => {
  const callback = await mount();
  expect(global.fetch).toHaveBeenCalledWith('/plugins/demo/pattern.js');
  expect(global.fetch).toHaveBeenCalledWith('/plugins/demo/gradients.json');
  expect(callback(out)).toBe(true);
  expect(send).toHaveBeenCalledWith({ type: 'setPatternParam', name: 'stops', value: binding.values[1] });
  expect(send.mock.calls.every(([message]) => message.type === 'setPatternParam')).toBe(true);
});

it.each(['stop', 'mode'])('resets shifts on audio %s only while the bound pattern runs', async reason => {
  (await mount())(out); send.mockClear();
  render(live, reason === 'mode' ? 'energy' : 'grace', reason !== 'stop');
  expect(send.mock.calls.map(([message]) => message)).toEqual([
    { type: 'setPatternParam', name: 'hue', value: 0 }, { type: 'setPatternParam', name: 'sat', value: 0 }
  ]);
  send.mockClear(); render({ ...live, active: false }, 'energy', false);
  expect(send).not.toHaveBeenCalled();
});

it('leaves manual params alone on startup and pattern changes when Grace audio never ran', async () => {
  const callback = await mount(live, 'energy', false);
  render({ ...live, params: { ...live.params, hue: 40, sat: 15 } }, 'energy', false);
  render(live, 'grace', false);
  callback({ hueShift: 0, satShift: 0, step: false });
  expect(send).not.toHaveBeenCalled();
});

it('does not reset a binding that sent no commands during the Grace audio run', async () => {
  const callback = await mount();
  callback({ ...out, step: false });
  render(live, 'grace', false);
  expect(send).not.toHaveBeenCalled();
});

it('does not reset a newly active binding when only a different pattern ran during audio', async () => {
  const callback = await mount({ ...live, code: 'other' });
  expect(callback(out)).toBe(false);
  render(live, 'energy', false);
  expect(send).not.toHaveBeenCalled();
});

it('resets once, does not follow stopped pattern changes, and clears participation for the next run', async () => {
  (await mount())(out); send.mockClear();
  render(live, 'grace', false);
  expect(send).toHaveBeenCalledTimes(2);
  send.mockClear();
  render({ ...live, params: { ...live.params, hue: 50 } }, 'grace', false);
  render(live, 'grace', true);
  render(live, 'grace', false);
  expect(send).not.toHaveBeenCalled();
});

it.each([false, true])('does not reset when the participated pattern is no longer active (foreign source: %s)', async foreign => {
  (await mount())(out); send.mockClear();
  render(foreign ? { ...live, code: 'other' } : { ...live, active: false }, 'grace', false);
  render(live, 'grace', false);
  expect(send).not.toHaveBeenCalled();
});

it('warns on a bad values fetch without starting a pattern or clearing paint on a beat', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  global.fetch = jest.fn(async (url: any) => ({ ok: true, text: async () => String(url).endsWith('pattern.js') ? binding.source : 'invalid JSON' })) as any;
  const callback = await mount();
  expect(callback(out)).toBe(true);
  expect(warn).toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it('keeps the first binding per mode even across plugins', () => {
  const loaded = coercePlugins([{ id: 'a', tabs: [{ id: 'x', label: 'X', audio: binding.audio }] },
    { id: 'b', tabs: [{ id: 'x', label: 'X', audio: binding.audio }] }]);
  expect(loaded[0].tabs[0].audio).toEqual(binding.audio);
  expect(loaded[1].tabs[0].audio).toBeUndefined();
});
