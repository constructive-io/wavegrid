import type { PluginTabData } from '../src/lib/plugin-data';
import { usePluginPattern } from '../src/lib/use-plugin-pattern';

let mockSlots: any[] = [], mockCursor = 0, mockEffects: (() => void)[] = [];
const mockMemo = (fn: () => unknown, deps: unknown[]) => {
  const i = mockCursor++, previous = mockSlots[i];
  if (!previous || deps.some((value, index) => value !== previous.deps[index])) mockSlots[i] = { deps, value: fn() };
  return mockSlots[i].value;
};
jest.mock('react', () => ({
  useMemo: (fn: () => unknown, deps: unknown[]) => mockMemo(fn, deps),
  useCallback: (fn: unknown, deps: unknown[]) => mockMemo(() => fn, deps),
  useRef: (value: unknown) => { const i = mockCursor++; return mockSlots[i] ||= { current: value }; },
  useState: (initial: any) => {
    const i = mockCursor++;
    if (!(i in mockSlots)) mockSlots[i] = typeof initial === 'function' ? initial() : initial;
    return [mockSlots[i], (value: unknown) => { mockSlots[i] = value; }];
  },
  useEffect: (fn: () => void, deps: unknown[]) => mockMemo(() => { mockEffects.push(fn); }, deps)
}));

const send = jest.fn(), select = jest.fn();
const tab = (id: string): PluginTabData => ({ id, label: id, cards: [], view: 'view.html', pattern: 'pattern.js', showWhen: 'always' });
const unmount = () => { mockSlots = []; mockEffects = []; };
function render(def: PluginTabData, pattern: any = null) {
  mockCursor = 0;
  const state = usePluginPattern('demo', def, undefined, send, pattern, select);
  const effects = mockEffects; mockEffects = []; effects.forEach(effect => effect());
  return state;
}
async function mount(def: PluginTabData, pattern: any = null) {
  unmount(); render(def, pattern);
  await new Promise(resolve => setImmediate(resolve));
  render(def, pattern);
  return render(def, pattern);
}
beforeEach(() => {
  unmount(); send.mockClear();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => 'pattern source' });
});
afterEach(() => { jest.restoreAllMocks(); });

it('restores nested params after start, stop, unmount and return without restarting', async () => {
  const def = tab('demo/paint');
  const params = { paint: [40, 90, -1, 0], stops: [[20, 100]], options: { enabled: true } };
  const first = await mount(def);
  first.startWithParams(params); first.stop();
  send.mockClear();
  const restored = await mount(def);
  expect(restored.params).toEqual(params);
  expect(restored.running).toBe(false);
  expect(send).not.toHaveBeenCalled();
  restored.start();
  expect(send).toHaveBeenCalledWith({ type: 'evalPattern', code: 'pattern source', params });
  expect((await mount(tab('demo/other'))).params).toEqual({});
});

it('remembers live updates when the pattern subsequently stops', async () => {
  const def = tab('demo/live');
  const live = { active: true, code: 'pattern source', params: { paint: [180, 75] } };
  const state = await mount(def, live);
  expect(state.params).toEqual(live.params);
  state.apply({ paint: [220, 90] }); state.stop();
  expect((await mount(def)).params).toEqual({ paint: [220, 90] });
});

it('recoerces cached card params against the current schema', async () => {
  const def: PluginTabData = { ...tab('demo/cards'), view: undefined, cards: [{ title: 'Settings', controls: [
    { type: 'slider', param: 'speed', min: 0, max: 10, default: 1 }
  ] }] };
  expect((await mount(def)).params).toEqual({ speed: 1 });
  (await mount(def)).apply({ speed: 8 });
  const changed: PluginTabData = { ...def, cards: [{ title: 'Settings', controls: [
    { type: 'slider', param: 'speed', min: 0, max: 3, default: 1 }
  ] }] };
  expect((await mount(changed)).params).toEqual({ speed: 3 });
});
