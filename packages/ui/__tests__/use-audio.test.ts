import { useAudio } from '../src/lib/use-audio';

let mockSlots: any[] = [], mockCursor = 0, mockEffects: (() => void)[] = [];
const mockMemo = (fn: () => unknown, deps: unknown[]) => {
  const i = mockCursor++, previous = mockSlots[i];
  if (!previous || deps.some((value, index) => value !== previous.deps[index])) mockSlots[i] = { deps, value: fn() };
  return mockSlots[i].value;
};
jest.mock('react', () => ({
  useCallback: (fn: unknown, deps: unknown[]) => mockMemo(() => fn, deps),
  useRef: (value: unknown) => { const i = mockCursor++; return mockSlots[i] ||= { current: value }; },
  useState: (initial: unknown) => {
    const i = mockCursor++;
    if (!(i in mockSlots)) mockSlots[i] = initial;
    return [mockSlots[i], (value: any) => { mockSlots[i] = typeof value === 'function' ? value(mockSlots[i]) : value; }];
  },
  useEffect: (fn: () => void, deps: unknown[]) => mockMemo(() => { mockEffects.push(fn); }, deps)
}));

const send = jest.fn();
const frames = new Map<number, FrameRequestCallback>();
const sources: any[] = [];
const buffer = { duration: 10, sampleRate: 10000, getChannelData: () => new Float32Array(100) };
const globals = ['AudioContext', 'requestAnimationFrame', 'cancelAnimationFrame', 'navigator'];
let descriptors: (PropertyDescriptor | undefined)[];
function render() {
  mockCursor = 0;
  const audio = useAudio(send, 4, 2, 40);
  const effects = mockEffects; mockEffects = []; effects.forEach(effect => effect());
  return audio;
}
const file = (name = 'track.wav') => ({ name, arrayBuffer: async () => new ArrayBuffer(0) }) as File;
function frame() {
  const [id, callback] = frames.entries().next().value!;
  frames.delete(id); callback(0);
}
beforeEach(() => {
  mockSlots = []; mockEffects = []; frames.clear(); sources.length = 0; send.mockClear();
  descriptors = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  let frameId = 0;
  const values = [class {
    state = 'running'; currentTime = 0; destination = {};
    resume = jest.fn(async () => {});
    decodeAudioData = jest.fn(async () => buffer);
    createBufferSource() {
      const source: any = { onended: null, connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(),
        stop: jest.fn(() => source.onended?.()) };
      sources.push(source); return source;
    }
    createAnalyser() { return { frequencyBinCount: 128, connect: jest.fn(), getByteFrequencyData: (data: Uint8Array) => data.fill(80) }; }
  }, (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; },
  (id: number) => frames.delete(id), { mediaDevices: { getUserMedia: jest.fn() } }];
  globals.forEach((key, i) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[i] }));
});
afterEach(() => {
  globals.forEach((key, i) => {
    if (descriptors[i]) Object.defineProperty(globalThis, key, descriptors[i]!);
    else Reflect.deleteProperty(globalThis, key);
  });
});

it('clears the playing Energy overlay before Grace and never sends another overlay in Grace', async () => {
  let audio = render(); await audio.loadFile(file()); audio = render(); audio.play(); frame();
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio_layer', blend: 'replace' }));
  send.mockClear(); audio.setMode('grace');
  expect(send).toHaveBeenCalledWith({ type: 'audio_layer_clear' });
  frame();
  expect(send.mock.calls.some(([message]) => message.type === 'audio_layer')).toBe(false);
  audio = render(); expect(audio.state.playing).toBe(true); expect(audio.mode).toBe('grace');
});

it('does not clear an overlay for an unchanged mode or when leaving Grace', () => {
  let audio = render(); audio.setMode('energy'); expect(send).not.toHaveBeenCalled();
  audio.setMode('grace'); audio = render(); send.mockClear();
  audio.setMode('energy'); expect(send).not.toHaveBeenCalled();
});
