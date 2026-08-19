/**
 * The OSC debugger sends at live hardware, so what it puts on the wire has to be
 * exactly what the operator asked for: the project's own target, the addresses
 * the show uses, and nothing when there is no target to send to.
 */
interface Sent {
  host: string;
  port: number;
  address: string;
  args: { type: string; value: number | string }[];
}

const sent: Sent[] = [];
const probe = jest.fn<Promise<string>, [string, number, number?]>();

const config: { osc?: Record<string, unknown>; layout?: { preset?: string } } = {};

jest.mock('@wavegrid/settings', () => ({
  openStore: () => ({
    hasProject: (name: string) => name === 'show',
    getProjectConfig: () => config
  })
}));

jest.mock('@wavegrid/osc', () => {
  const actual = jest.requireActual('@wavegrid/osc');
  return {
    ...actual,
    sendOscMessage: (host: string, port: number, address: string, args: Sent['args']) => {
      sent.push({ host, port, address, args });
      return Promise.resolve();
    }
  };
});

jest.mock('@wavegrid/doctor', () => {
  const actual = jest.requireActual('@wavegrid/doctor');
  return {
    ...actual,
    udpProbe: (host: string, port: number, timeout?: number) => probe(host, port, timeout),
    // BEYOND is a Windows install; the tests must not depend on this box having one.
    findBeyondIni: () => null
  };
});

import {
  clearOscLog,
  oscDebugState,
  oscDebugTarget,
  probeOscTarget,
  sendOscPreset,
  sendOscSignal
} from '@/main/osc-debug';

beforeEach(() => {
  sent.length = 0;
  clearOscLog();
  probe.mockReset();
  probe.mockResolvedValue('no-rejection');
  config.osc = { beyond: { host: '127.0.0.1', port: 8000 } };
  config.layout = { preset: 'ring-6' };
});

describe('oscDebugTarget', () => {
  it('reports the project’s configured BEYOND target', () => {
    expect(oscDebugTarget('show')).toEqual({ kind: 'beyond', host: '127.0.0.1', port: 8000 });
  });

  it('is null for a project with no OSC output, and for an unknown project', () => {
    config.osc = {};
    expect(oscDebugTarget('show')).toBeNull();
    config.osc = { beyond: { host: '127.0.0.1', port: 8000 } };
    expect(oscDebugTarget('nope')).toBeNull();
  });
});

describe('probeOscTarget', () => {
  it('probes the configured host and port and keeps the verdict', async () => {
    probe.mockResolvedValue('refused');
    const state = await probeOscTarget('show');
    expect(probe).toHaveBeenCalledWith('127.0.0.1', 8000, expect.any(Number));
    expect(state.probe).toBe('refused');
  });

  it('does not probe when there is nothing configured to probe', async () => {
    config.osc = {};
    const state = await probeOscTarget('show');
    expect(probe).not.toHaveBeenCalled();
    expect(state.probe).toBeNull();
  });
});

describe('sendOscPreset', () => {
  it('addresses one zone with the show’s own livecontrol addresses', async () => {
    const result = await sendOscPreset('show', 'amber', 2);
    expect(result.ok).toBe(true);
    const addresses = sent.map((s) => s.address);
    expect(addresses).toContain('/beyond/zone/2/livecontrol/red');
    expect(addresses.every((a) => a.startsWith('/beyond/zone/2/'))).toBe(true);
    expect(sent.every((s) => s.host === '127.0.0.1' && s.port === 8000)).toBe(true);
  });

  it('covers every fixture in the layout when no zone is named', async () => {
    await sendOscPreset('show', 'white', null);
    const zones = new Set(sent.map((s) => s.address.split('/')[3]));
    expect([...zones].sort()).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('sends blackout as zero brightness, not as an absence of messages', async () => {
    await sendOscPreset('show', 'blackout', 0);
    const brightness = sent.find((s) => s.address.endsWith('/Brightness'));
    expect(brightness?.args[0].value).toBe(0);
  });

  it('sends floats, as the show does', async () => {
    await sendOscPreset('show', 'white', 0);
    expect(sent.every((s) => s.args.every((a) => a.type === 'float'))).toBe(true);
  });

  it('refuses when the project has no target, and puts nothing on the wire', async () => {
    config.osc = {};
    const result = await sendOscPreset('show', 'white', 0);
    expect(result.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('needs a serial before it can address an FB4', async () => {
    config.osc = { fb4: { host: '10.0.0.9', port: 8000 } };
    expect((await sendOscPreset('show', 'white', 0)).ok).toBe(false);
    expect(sent).toHaveLength(0);
    const result = await sendOscPreset('show', 'white', 0, '12345');
    expect(result.ok).toBe(true);
    expect(sent.map((s) => s.address)).toContain('/FB4-12345/color_red');
  });
});

describe('sendOscSignal', () => {
  it('sends a hand-typed address verbatim and logs exactly what went out', async () => {
    const result = await sendOscSignal('show', '/beyond/zone/3/livecontrol/red', ['255']);
    expect(result.ok).toBe(true);
    expect(sent[0]).toMatchObject({
      host: '127.0.0.1',
      port: 8000,
      address: '/beyond/zone/3/livecontrol/red'
    });
    const [entry] = oscDebugState('show').log;
    expect(entry).toMatchObject({
      dir: 'out',
      address: '/beyond/zone/3/livecontrol/red',
      peer: '127.0.0.1:8000'
    });
  });

  it('honours explicit argument types, so integer-only addresses can be tried', async () => {
    await sendOscSignal('show', '/beyond/zone/0/livecontrol/red', ['i:3']);
    expect(sent[0].args).toEqual([{ type: 'integer', value: 3 }]);
  });

  it('rejects an address that is not an OSC path', async () => {
    const result = await sendOscSignal('show', 'beyond/zone/0', ['1']);
    expect(result.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('sends a bare address when no arguments are given', async () => {
    await sendOscSignal('show', '/beyond/zone/0/livecontrol/red', ['']);
    expect(sent[0].args).toEqual([]);
  });
});
