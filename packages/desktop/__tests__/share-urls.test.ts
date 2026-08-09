import { rankLanUrls } from '../src/renderer/lib/share-urls';

describe('rankLanUrls', () => {
  it('offers the home/venue wifi range before docker and VPN ranges', () => {
    const ranked = rankLanUrls([
      'http://172.17.0.1:3000',
      'http://10.8.0.6:3000',
      'http://192.168.1.50:3000'
    ]);
    expect(ranked[0]).toBe('http://192.168.1.50:3000');
    expect(ranked[1]).toBe('http://10.8.0.6:3000');
  });

  it('sinks a self-assigned address below anything routable', () => {
    const ranked = rankLanUrls(['http://169.254.3.9:3000', 'http://100.64.2.2:3000']);
    expect(ranked[0]).toBe('http://100.64.2.2:3000');
  });

  it('leaves a single URL alone', () => {
    expect(rankLanUrls(['http://192.168.1.50:3000'])).toEqual(['http://192.168.1.50:3000']);
  });
});
