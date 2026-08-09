import { isLoopbackHost, LOOPBACK_HOST, normalizeOscHost } from '../src/osc-host';

describe('normalizeOscHost', () => {
  it('rewrites every loopback alias to IPv4 loopback', () => {
    for (const alias of ['localhost', 'LocalHost', ' localhost ', '::1', '[::1]', 'ip6-localhost']) {
      expect(normalizeOscHost(alias)).toBe(LOOPBACK_HOST);
    }
  });

  it('leaves real hosts alone, trimmed', () => {
    expect(normalizeOscHost(' 192.168.1.50 ')).toBe('192.168.1.50');
    expect(normalizeOscHost('beyond-pc.local')).toBe('beyond-pc.local');
    expect(normalizeOscHost(LOOPBACK_HOST)).toBe(LOOPBACK_HOST);
  });

  it('keeps an empty host empty so callers can still require one', () => {
    expect(normalizeOscHost('   ')).toBe('');
  });

  it('recognizes this machine', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('192.168.1.50')).toBe(false);
  });
});
