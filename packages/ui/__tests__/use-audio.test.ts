import { AudioTab } from '../src/components/audio-tab';
import { useAudio } from '../src/lib/use-audio';

let mockSlots: any[] = [], mockCursor = 0, mockEffects: (() => void)[] = [];
const mockMemo = (fn: () => unknown, deps: unknown[]) => {
  const i = mockCursor++, previous = mockSlots[i];
  if (!previous || deps.some((value, index) => value !== previous.deps[index])) mockSlots[i] = { deps, value: fn() };
  return mockSlots[i].value;
};
jest.mock('react', () => ({
  ...jest.requireActual('react'),
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
  const audio = useAudio(4, 2, [], send, 40);
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
    createMediaStreamSource() { return { connect: jest.fn(), disconnect: jest.fn() }; }
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

function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return node?.props ? [node, ...elements(node.props.children)] : [];
}

it('disables Live Mic and explains missing mediaDevices without stopping file playback', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  let audio = render(); await audio.loadFile(file()); audio.play(); audio = render();
  expect(audio.micUnavailableReason).toMatch(/HTTPS or localhost/);
  const nodes = elements(AudioTab({ audio }));
  expect(nodes.find(node => node.type === 'button' && node.props['aria-describedby'] === 'mic-source-help').props.disabled).toBe(true);
  expect(nodes.find(node => node.props.id === 'mic-source-help').props.children).toBe(audio.micUnavailableReason);
  await audio.startMic(); audio = render();
  expect(audio.state.playing).toBe(true); expect(audio.state.micActive).toBe(false);
  expect(audio.micError).toBe(audio.micUnavailableReason);
});

it('shows microphone rejection errors and clears them after a successful retry', async () => {
  const getUserMedia = navigator.mediaDevices.getUserMedia as jest.Mock;
  getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
  let audio = render(); await audio.startMic(); audio = render();
  expect(audio.state.micActive).toBe(false); expect(audio.micError).toContain('Permission denied');
  expect(elements(AudioTab({ audio })).some(node => node.props.role === 'alert' && node.props.children.includes('Permission denied'))).toBe(true);
  getUserMedia.mockResolvedValue({ getTracks: () => [] });
  await audio.startMic(); audio = render();
  expect(audio.micUnavailableReason).toBeNull(); expect(audio.micError).toBeNull(); expect(audio.state.micActive).toBe(true);
});

it('stops and detaches an old looping source before reading its replacement', async () => {
  let audio = render(); await audio.loadFile(file('old.wav')); audio.play(); audio = render();
  const old = sources[0];
  expect(old.onended).toEqual(expect.any(Function));
  let finish!: (value: ArrayBuffer) => void;
  const replacement = { name: 'new.wav', arrayBuffer: jest.fn(() => new Promise<ArrayBuffer>(resolve => { finish = resolve; })) } as unknown as File;
  const loading = audio.loadFile(replacement);
  expect(old.onended).toBeNull(); expect(old.stop).toHaveBeenCalledTimes(1); expect(old.disconnect).toHaveBeenCalledTimes(1);
  expect(old.stop.mock.invocationCallOrder[0]).toBeLessThan((replacement.arrayBuffer as jest.Mock).mock.invocationCallOrder[0]);
  expect(frames.size).toBe(0); expect(render().state.playing).toBe(false); expect(sources).toHaveLength(1);
  finish(new ArrayBuffer(0)); await loading; audio = render();
  expect(audio.state).toMatchObject({ playing: false, fileName: 'new.wav', currentTime: 0 });
  expect(sources).toHaveLength(1);
  audio.play(); expect(sources).toHaveLength(2); expect(render().state.playing).toBe(true);
});

it('keeps the old source detached when reading the new file fails', async () => {
  const audio = render(); await audio.loadFile(file()); audio.play();
  await expect(audio.loadFile({ name: 'broken.wav', arrayBuffer: async () => { throw new Error('read failed'); } } as unknown as File)).rejects.toThrow('read failed');
  expect(sources[0].onended).toBeNull(); expect(sources[0].disconnect).toHaveBeenCalled();
  expect(sources).toHaveLength(1); expect(render().state.playing).toBe(false); expect(frames.size).toBe(0);
});
