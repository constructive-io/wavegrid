import { Server as OscServer } from 'node-osc';
import { CannonState } from '../src/osc-adapters';

import {
  BeyondOscOutput,
  FB4OscOutput,
  RoutingConfig,
  encodeBeyondMessages,
  encodeFB4Messages,
  createRoutedOutput,
  encodeBeyondCueMessage,
  encodeBeyondProjectorMessages,
  RoutedOscOutput,
} from '../src/osc-adapters';
import { hsbToRgb255 } from '../src/color';

function makeGrid(h = 220, s = 90, b = 80): CannonState[] {
  return Array.from({ length: 49 }, () => ({ h, s, b }));
}

function makeSingleGrid(index: number, h: number, s: number, b: number): CannonState[] {
  const grid = makeGrid(0, 0, 0);
  grid[index] = { h, s, b };
  return grid;
}

// ═══════════════════════════════════════════════════
// Pure encoder tests (no UDP, fast, deterministic)
// ═══════════════════════════════════════════════════

describe('encodeBeyondMessages', () => {
  it('should produce alpha+red+green+blue+Brightness (5 messages)', () => {
    const grid = makeSingleGrid(0, 0, 100, 100); // h=0, s=100, b=100 (red)
    const messages = encodeBeyondMessages(grid, { 0: 3 });

    expect(messages).toHaveLength(5);
    expect(messages[0].address).toBe('/beyond/zone/3/livecontrol/alpha');
    expect(messages[0].value).toBe(255);
    expect(messages[1].address).toBe('/beyond/zone/3/livecontrol/red');
    expect(messages[1].value).toBe(255);
    expect(messages[2].address).toBe('/beyond/zone/3/livecontrol/green');
    expect(messages[2].value).toBe(0);
    expect(messages[3].address).toBe('/beyond/zone/3/livecontrol/blue');
    expect(messages[3].value).toBe(0);
    expect(messages[4].address).toBe('/beyond/zone/3/livecontrol/Brightness');
    expect(messages[4].value).toBe(100);
  });

  it('should produce white (255,255,255) for s=0 b=100', () => {
    const grid = makeSingleGrid(0, 0, 0, 100); // white
    const messages = encodeBeyondMessages(grid, { 0: 0 });

    expect(messages).toHaveLength(5);
    expect(messages[0].value).toBe(255); // alpha
    expect(messages[1].value).toBe(255); // red
    expect(messages[2].value).toBe(255); // green
    expect(messages[3].value).toBe(255); // blue
    expect(messages[4].value).toBe(100); // brightness
  });

  it('should produce black (0,0,0) for b=0', () => {
    const grid = makeSingleGrid(0, 0, 100, 0); // black
    const messages = encodeBeyondMessages(grid, { 0: 0 });

    expect(messages).toHaveLength(5);
    expect(messages[0].value).toBe(255); // alpha still 255
    expect(messages[1].value).toBe(0);   // red
    expect(messages[2].value).toBe(0);   // green
    expect(messages[3].value).toBe(0);   // blue
    expect(messages[4].value).toBe(0);   // brightness
  });

  it('should match hsbToRgb255 conversion', () => {
    const grid = makeSingleGrid(0, 120, 80, 75);
    const messages = encodeBeyondMessages(grid, { 0: 0 });
    const expected = hsbToRgb255(120, 80, 75);
    expect(messages[1].value).toBe(expected.r);
    expect(messages[2].value).toBe(expected.g);
    expect(messages[3].value).toBe(expected.b);
  });

  it('should skip unmapped cannons', () => {
    const grid = makeGrid(0, 100, 100);
    const messages = encodeBeyondMessages(grid, { 5: 10 });

    expect(messages).toHaveLength(5);
    expect(messages[0].address).toBe('/beyond/zone/10/livecontrol/alpha');
  });

  it('should handle multiple mapped cannons', () => {
    const grid = makeGrid(120, 100, 100);
    const messages = encodeBeyondMessages(grid, { 0: 0, 1: 1, 2: 2 });

    expect(messages).toHaveLength(15); // 3 cannons × 5 messages
  });

  it('should return empty array when no cannons are mapped', () => {
    const messages = encodeBeyondMessages(makeGrid(), {});
    expect(messages).toHaveLength(0);
  });

  it('should include brightness from HSB b value', () => {
    const grid = makeSingleGrid(0, 0, 100, 50); // 50% brightness
    const messages = encodeBeyondMessages(grid, { 0: 0 });
    expect(messages[4].address).toBe('/beyond/zone/0/livecontrol/Brightness');
    expect(messages[4].value).toBe(50);
  });

  it('should skip unchanged cannons when prevGrid is provided', () => {
    const grid = makeGrid(120, 100, 100);
    const prevGrid = makeGrid(120, 100, 100);
    const messages = encodeBeyondMessages(grid, { 0: 0, 1: 1 }, prevGrid);
    expect(messages).toHaveLength(0);
  });

  it('should include changed cannons when prevGrid differs', () => {
    const grid = makeGrid(120, 100, 100);
    const prevGrid = makeGrid(0, 100, 100); // different hue
    const messages = encodeBeyondMessages(grid, { 0: 0, 1: 1 }, prevGrid);
    expect(messages).toHaveLength(10); // 2 cannons × 5 messages
  });

  it('should send all cannons on first frame (no prevGrid)', () => {
    const grid = makeGrid(120, 100, 100);
    const messages = encodeBeyondMessages(grid, { 0: 0, 1: 1 });
    expect(messages).toHaveLength(10); // 2 cannons × 5 messages
  });

  it('should work with arbitrary grid sizes (not just 49)', () => {
    const grid: CannonState[] = Array.from({ length: 100 }, (_, i) => ({
      h: i * 3.6, s: 100, b: 100
    }));
    const map: Record<number, number> = { 0: 0, 99: 99 };
    const messages = encodeBeyondMessages(grid, map);
    expect(messages).toHaveLength(10); // 2 cannons × 5 messages
    expect(messages[5].address).toContain('/beyond/zone/99/');
  });
});

describe('encodeFB4Messages', () => {
  it('should produce correct serial-based OSC addresses', () => {
    const grid = makeSingleGrid(0, 0, 100, 100); // pure red
    const messages = encodeFB4Messages(grid, { 0: '02356' });

    expect(messages).toHaveLength(3);
    expect(messages[0].address).toBe('/FB4-02356/color_red');
    expect(messages[0].value).toBe(100);
    expect(messages[1].address).toBe('/FB4-02356/color_green');
    expect(messages[1].value).toBe(0);
    expect(messages[2].address).toBe('/FB4-02356/color_blue');
    expect(messages[2].value).toBe(0);
  });

  it('should use 0-100 range for FB4 color values', () => {
    const grid = makeSingleGrid(0, 120, 100, 50); // green at 50% brightness
    const messages = encodeFB4Messages(grid, { 0: '00001' });

    for (const msg of messages) {
      expect(msg.value).toBeGreaterThanOrEqual(0);
      expect(msg.value).toBeLessThanOrEqual(100);
    }
  });

  it('should skip unmapped cannons', () => {
    const grid = makeGrid();
    const messages = encodeFB4Messages(grid, { 48: '99999' });

    expect(messages).toHaveLength(3);
    expect(messages[0].address).toContain('/FB4-99999/');
  });

  it('should handle multiple serials', () => {
    const grid = makeGrid(0, 100, 100);
    const messages = encodeFB4Messages(grid, { 47: '02356', 48: '02418' });

    expect(messages).toHaveLength(6);
    expect(messages[0].address).toContain('02356');
    expect(messages[3].address).toContain('02418');
  });
});

// ═══════════════════════════════════════════════════
// Mock UDP receiver tests (validates real OSC packets over UDP)
// ═══════════════════════════════════════════════════

interface ReceivedPacket {
  address: string;
  args: unknown[];
}

function createMockOscReceiver(port: number): Promise<{
  packets: ReceivedPacket[];
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const packets: ReceivedPacket[] = [];
    const server = new OscServer(port, '127.0.0.1', () => {
      server.on('message', (msg: unknown[]) => {
        const [address, ...args] = msg;
        packets.push({ address: address as string, args });
      });
      resolve({
        packets,
        close: () => new Promise<void>((res) => { server.close(); setTimeout(res, 50); })
      });
    });
  });
}

let portCounter = 19950;
function nextPort() { return portCounter++; }

describe('BeyondOscOutput (UDP integration)', () => {
  it('should send alpha+rgb+brightness packets to UDP target', async () => {
    const port = nextPort();
    const mock = await createMockOscReceiver(port);

    const adapter = new BeyondOscOutput({
      host: '127.0.0.1',
      port,
      projectorMap: { 0: 5 },
      sendEveryNFrames: 1
    });
    adapter.connect();

    const grid = makeSingleGrid(0, 0, 100, 100); // pure red
    adapter.send(grid);

    await new Promise((r) => setTimeout(r, 200));

    expect(mock.packets.length).toBeGreaterThanOrEqual(5);

    const alphaPkt = mock.packets.find(p => p.address === '/beyond/zone/5/livecontrol/alpha');
    expect(alphaPkt).toBeDefined();
    expect(alphaPkt!.args[0]).toBeCloseTo(255, 0);

    const redPkt = mock.packets.find(p => p.address === '/beyond/zone/5/livecontrol/red');
    expect(redPkt).toBeDefined();
    expect(redPkt!.args[0]).toBeCloseTo(255, 0);
    expect(typeof redPkt!.args[0]).toBe('number');

    const brightPkt = mock.packets.find(p => p.address === '/beyond/zone/5/livecontrol/Brightness');
    expect(brightPkt).toBeDefined();
    expect(brightPkt!.args[0]).toBeCloseTo(100, 0);

    adapter.close();
    await mock.close();
  });

  it('should throttle sends based on sendEveryNFrames', async () => {
    const port = nextPort();
    const mock = await createMockOscReceiver(port);

    const adapter = new BeyondOscOutput({
      host: '127.0.0.1',
      port,
      projectorMap: { 0: 0 },
      sendEveryNFrames: 3
    });
    adapter.connect();

    const grid = makeSingleGrid(0, 0, 100, 100);
    adapter.send(grid); // frame 1 — skipped
    adapter.send(grid); // frame 2 — skipped
    adapter.send(grid); // frame 3 — sent

    await new Promise((r) => setTimeout(r, 200));

    expect(mock.packets.length).toBe(5); // one send = 5 packets (alpha, red, green, blue, Brightness)

    adapter.close();
    await mock.close();
  });
});

describe('FB4OscOutput (UDP integration)', () => {
  it('should send correct OSC packets to UDP target', async () => {
    const port = nextPort();
    const mock = await createMockOscReceiver(port);

    const adapter = new FB4OscOutput({
      host: '127.0.0.1',
      port,
      serialMap: { 0: '02356' },
      sendEveryNFrames: 1
    });
    adapter.connect();

    const grid = makeSingleGrid(0, 0, 100, 100); // pure red
    adapter.send(grid);

    await new Promise((r) => setTimeout(r, 200));

    expect(mock.packets.length).toBeGreaterThanOrEqual(3);

    const redPkt = mock.packets.find(p => p.address === '/FB4-02356/color_red');
    expect(redPkt).toBeDefined();
    expect(redPkt!.args[0]).toBeCloseTo(100, 0);

    const greenPkt = mock.packets.find(p => p.address === '/FB4-02356/color_green');
    expect(greenPkt).toBeDefined();
    expect(greenPkt!.args[0]).toBeCloseTo(0, 0);

    adapter.close();
    await mock.close();
  });

  it('should default to port 8000', () => {
    const adapter = new FB4OscOutput({
      host: '127.0.0.1',
      serialMap: { 0: '00001' }
    });
    expect(adapter).toBeDefined();
  });
});

describe('RoutedOscOutput', () => {
  it('should dispatch to correct targets based on routing config', async () => {
    const beyondPort = nextPort();
    const fb4Port = nextPort();

    const beyondMock = await createMockOscReceiver(beyondPort);
    const fb4Mock = await createMockOscReceiver(fb4Port);

    const config: RoutingConfig = {
      targets: {
        'beyond-a': { type: 'beyond', host: '127.0.0.1', port: beyondPort },
        'fb4-b': { type: 'fb4', host: '127.0.0.1', port: fb4Port }
      },
      flushHz: 60,
      cannons: [
        { logical: 0, target: 'beyond-a', projectorIndex: 3 },
        { logical: 48, target: 'fb4-b', fb4Serial: '02356' }
      ]
    };

    const routed = createRoutedOutput(config);
    routed.connect();

    const grid = makeGrid(0, 100, 100); // all red
    routed.send(grid);

    await new Promise((r) => setTimeout(r, 300));

    const beyondAlpha = beyondMock.packets.find(p => p.address === '/beyond/zone/3/livecontrol/alpha');
    expect(beyondAlpha).toBeDefined();
    expect(beyondAlpha!.args[0]).toBeCloseTo(255, 0);

    const beyondRed = beyondMock.packets.find(p => p.address === '/beyond/zone/3/livecontrol/red');
    expect(beyondRed).toBeDefined();
    expect(beyondRed!.args[0]).toBeCloseTo(255, 0); // hue 0 → red 255

    const fb4Red = fb4Mock.packets.find(p => p.address === '/FB4-02356/color_red');
    expect(fb4Red).toBeDefined();
    expect(fb4Red!.args[0]).toBeCloseTo(100, 0);

    routed.close();
    await beyondMock.close();
    await fb4Mock.close();
  });

  it('should skip safeDisabled cannons', () => {
    const config: RoutingConfig = {
      targets: {
        'beyond-a': { type: 'beyond', host: '127.0.0.1', port: 9999 }
      },
      cannons: [
        { logical: 0, target: 'beyond-a', projectorIndex: 0 },
        { logical: 1, target: 'beyond-a', projectorIndex: 1, safeDisabled: true }
      ]
    };

    const routed = createRoutedOutput(config);
    expect(routed.targetNames).toContain('beyond-a');

    const grid = makeGrid(0, 100, 100);
    const messages = encodeBeyondMessages(grid, { 0: 0 });
    expect(messages).toHaveLength(5);
  });

  it('should expose target names', () => {
    const config: RoutingConfig = {
      targets: {
        'beyond-a': { type: 'beyond', host: '127.0.0.1', port: 9000 },
        'fb4-b': { type: 'fb4', host: '127.0.0.1', port: 8000 }
      },
      cannons: [
        { logical: 0, target: 'beyond-a', projectorIndex: 0 },
        { logical: 48, target: 'fb4-b', fb4Serial: '02356' }
      ]
    };

    const routed = createRoutedOutput(config);
    expect(routed.targetNames).toEqual(expect.arrayContaining(['beyond-a', 'fb4-b']));
  });

  it('should handle empty cannons list', () => {
    const config: RoutingConfig = {
      targets: {
        'beyond-a': { type: 'beyond', host: '127.0.0.1', port: 9000 }
      },
      cannons: []
    };

    const routed = createRoutedOutput(config);
    expect(routed.targetNames).toHaveLength(0);
    routed.send(makeGrid());
    routed.close();
  });
});

describe('encodeBeyondProjectorMessages', () => {
  it('emits one zone livecontrol message per control, clamped to documented ranges', () => {
    const msgs = encodeBeyondProjectorMessages(
      { 1: { size: 50, posx: 99999, rotoz: -30, anispeed: 500, fx: [3, -1, 60, 0] } },
      { 1: 7 }
    );
    expect(msgs).toEqual([
      { address: '/beyond/zone/7/livecontrol/size', value: 50 },
      { address: '/beyond/zone/7/livecontrol/posx', value: 32768 },
      { address: '/beyond/zone/7/livecontrol/rotoz', value: -30 },
      { address: '/beyond/zone/7/livecontrol/anispeed', value: 400 },
      { address: '/beyond/zone/7/livecontrol/fx1', value: 3 },
      { address: '/beyond/zone/7/livecontrol/fx2', value: -1 },
      { address: '/beyond/zone/7/livecontrol/fx3', value: 47 },
      { address: '/beyond/zone/7/livecontrol/fx4', value: 0 }
    ]);
  });

  it('skips indices with no zone mapping', () => {
    expect(encodeBeyondProjectorMessages({ 5: { size: 10 } }, { 1: 0 })).toEqual([]);
  });
});

describe('encodeBeyondCueMessage', () => {
  it('encodes PangoScript gateway commands with integer arguments', () => {
    expect(encodeBeyondCueMessage({ cueDown: { page: 2, cue: 5 } })).toEqual({
      address: '/beyond/general/CueDown', value: [2, 5], ints: true
    });
    expect(encodeBeyondCueMessage({ stopZone: 3 })).toEqual({
      address: '/beyond/general/StopZone', value: [3, 0], ints: true
    });
    expect(encodeBeyondCueMessage({ stopAllNow: true })).toEqual({
      address: '/beyond/general/StopAllNow', value: [], ints: true
    });
  });
});

describe('RoutedOscOutput projector controls', () => {
  it('only forwards controls for kind: projector routes', () => {
    const routed = new RoutedOscOutput({
      targets: { pc: { type: 'beyond', host: '127.0.0.1', port: 1 } },
      cannons: [
        { logical: 0, target: 'pc', projectorIndex: 0, kind: 'cannon' },
        { logical: 1, target: 'pc', projectorIndex: 1, kind: 'projector' },
        { logical: 2, target: 'pc', projectorIndex: 2 }
      ]
    });
    expect(routed.projectorLogicals).toEqual([1]);
    // Without connect() nothing is sent; this only checks the filter does not throw.
    routed.sendProjector({ 0: { size: 10 }, 1: { size: 20 }, 2: { size: 30 } });
    routed.sendCue({ stopAllNow: true });
    routed.close();
  });
});
