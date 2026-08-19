import dgram from 'dgram';

import { udpProbe } from '../src/probe';

/** Bind a UDP socket on an ephemeral port and report which one. */
function listener(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    socket.bind(0, '127.0.0.1', () => {
      resolve({ port: socket.address().port, close: () => socket.close() });
    });
  });
}

describe('udpProbe', () => {
  it('reports no rejection when something is bound', async () => {
    const server = await listener();
    try {
      await expect(udpProbe('127.0.0.1', server.port, 300)).resolves.toBe('no-rejection');
    } finally {
      server.close();
    }
  });

  it('reports refused when nothing is bound — the wrong-port case', async () => {
    // Bind then release, so the port is known-free rather than merely unlikely.
    const server = await listener();
    const port = server.port;
    server.close();
    await expect(udpProbe('127.0.0.1', port, 1000)).resolves.toBe('refused');
  });

  it('resolves within its timeout for an unroutable host instead of hanging', async () => {
    const started = Date.now();
    // TEST-NET-1 (RFC 5737): guaranteed not to be a real host.
    const state = await udpProbe('192.0.2.1', 8000, 250);
    expect(['no-rejection', 'unreachable']).toContain(state);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
