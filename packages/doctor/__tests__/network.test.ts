import { type NetworkReport, verdictFor } from '../src/network';

type Facts = Omit<NetworkReport, 'verdict' | 'summary' | 'hint'>;

function facts(over: Partial<Facts> = {}): Facts {
  return {
    bindHost: '0.0.0.0',
    port: 3000,
    interfaces: [{ name: 'en0', address: '192.168.1.50', netmask: '255.255.255.0' }],
    urls: ['http://192.168.1.50:3000'],
    selfProbes: [{ address: '192.168.1.50', url: 'http://192.168.1.50:3000', reachable: true }],
    neighbours: [
      { address: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:ff' },
      { address: '192.168.1.23', mac: '11:22:33:44:55:66' }
    ],
    neighboursKnown: true,
    visitors: [],
    ...over
  };
}

describe('network verdict', () => {
  it('treats a device that loaded the show as proof, whatever else is true', () => {
    const v = verdictFor(
      facts({
        // Everything else looks bad; a real visitor still outranks it.
        neighbours: [],
        visitors: [{ address: '192.168.1.23', userAgent: 'iPhone', lastSeen: Date.now() }]
      })
    );
    expect(v.verdict).toBe('proven-reachable');
    expect(v.summary).toContain('192.168.1.23');
    expect(v.hint).toBeNull();
  });

  it('calls out a loopback bind before blaming the network', () => {
    const v = verdictFor(facts({ bindHost: '127.0.0.1' }));
    expect(v.verdict).toBe('loopback-only');
    expect(v.hint).toContain('0.0.0.0');
  });

  it('blames this machine when its own address refuses the port', () => {
    const v = verdictFor(facts({ selfProbes: [{ address: '192.168.1.50', url: 'x', reachable: false }] }));
    expect(v.verdict).toBe('blocked-locally');
    expect(v.hint).toContain('firewall');
  });

  it('reports no network rather than a firewall when there is no address', () => {
    const v = verdictFor(facts({ interfaces: [], selfProbes: [] }));
    expect(v.verdict).toBe('no-network');
  });

  it('suspects client isolation when the segment holds only the gateway', () => {
    const v = verdictFor(facts({ neighbours: [{ address: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:ff' }] }));
    expect(v.verdict).toBe('isolation-likely');
  });

  it('stays honest — an unreadable neighbour table proves nothing either way', () => {
    const v = verdictFor(facts({ neighbours: [], neighboursKnown: false }));
    expect(v.verdict).toBe('unproven');
  });
});
