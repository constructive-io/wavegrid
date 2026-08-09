import { createServer } from 'node:http';

import { DEFAULT_CONFIG, type ResolvedConfig, resolveLayout } from '@wavegrid/layout';

import { startServer } from '../src/server';

/**
 * `listen` is asynchronous, so a caller that doesn't await the bind reports a
 * running show while nothing is listening — the "why is the dot red?" case.
 * `ready` is the signal that makes the failure visible.
 */
function resolved(port: number): ResolvedConfig {
  return {
    config: { ...DEFAULT_CONFIG, server: { host: '127.0.0.1', port } },
    layout: resolveLayout({ preset: 'grid-7x7' }),
    runMode: 'simple'
  };
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const addr = probe.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  await new Promise<void>((r) => probe.close(() => r()));
  return port;
}

describe('startServer bind readiness', () => {
  it('resolves ready once the port is actually bound', async () => {
    const port = await freePort();
    const handle = startServer(resolved(port), { advertise: false });
    await expect(handle.ready).resolves.toBeUndefined();
    handle.stop();
  });

  it('rejects ready with an actionable message when the port is taken', async () => {
    const port = await freePort();
    const squatter = createServer();
    await new Promise<void>((r) => squatter.listen(port, '127.0.0.1', r));
    try {
      const handle = startServer(resolved(port), { advertise: false });
      await expect(handle.ready).rejects.toThrow(/already in use/i);
      handle.stop();
    } finally {
      await new Promise<void>((r) => squatter.close(() => r()));
    }
  });
});
