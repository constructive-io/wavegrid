import { upstreamUrl } from '../src/upstream';

describe('upstreamUrl', () => {
  it('adds the receiver key while preserving the upstream', () => {
    const parsed = new URL(upstreamUrl('wss://grace.hipzap.com', 'abc'));
    expect(parsed.protocol).toBe('wss:');
    expect(parsed.searchParams.get('key')).toBe('abc');
  });

  it('preserves a ws port', () => {
    expect(new URL(upstreamUrl('ws://127.0.0.1:3000', 'abc')).port).toBe('3000');
  });

  it('leaves an empty key unchanged', () => {
    expect(upstreamUrl('wss://grace.hipzap.com', '')).toBe('wss://grace.hipzap.com');
  });
});
