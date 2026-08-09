import { takeTokenFromUrl } from '../src/lib/use-auth';

interface FakeWindow {
  location: { hash: string; pathname: string; search: string };
  history: { replaceState: (a: null, b: string, url: string) => void };
}

function fakeWindow(hash: string): FakeWindow {
  const w: FakeWindow = {
    location: { hash, pathname: '/', search: '' },
    history: {
      replaceState: (_a, _b, url) => {
        const i = url.indexOf('#');
        w.location.hash = i === -1 ? '' : url.slice(i);
      }
    }
  };
  (globalThis as unknown as { window: FakeWindow }).window = w;
  return w;
}

afterEach(() => {
  delete (globalThis as unknown as { window?: FakeWindow }).window;
});

describe('takeTokenFromUrl', () => {
  it('reads the handed-off session and erases it from the address', () => {
    const w = fakeWindow('#wg_token=abc.def.ghi');
    expect(takeTokenFromUrl()).toBe('abc.def.ghi');
    expect(w.location.hash).toBe('');
  });

  it('decodes a percent-encoded token', () => {
    fakeWindow('#wg_token=a%2Bb');
    expect(takeTokenFromUrl()).toBe('a+b');
  });

  it('keeps any other fragment the UI owns', () => {
    const w = fakeWindow('#tab=patterns&wg_token=abc');
    expect(takeTokenFromUrl()).toBe('abc');
    expect(w.location.hash).toBe('#tab=patterns');
  });

  it('is a no-op without a handoff', () => {
    const w = fakeWindow('#tab=patterns');
    expect(takeTokenFromUrl()).toBeNull();
    expect(w.location.hash).toBe('#tab=patterns');
  });
});
