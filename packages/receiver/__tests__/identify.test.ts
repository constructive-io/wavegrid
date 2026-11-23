import { loadWavegridConfig } from '@wavegrid/layout';
import { createSocket } from 'dgram';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { WebSocketInput } from '../src/adapters';
import { startReceiver, type ReceiverHandle } from '../src/main';

jest.mock('fs', () => ({ ...jest.requireActual('fs'), appendFileSync: jest.fn() }));

const black = { h: 0, s: 0, b: 0 };
const white = { h: 45, s: 0, b: 100 };
const preview = (index: number) => Array.from({ length: 49 }, (_, i) => i === index ? white : black);

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 10));
  expect(predicate()).toBe(true);
}

describe('BEYOND Identify over OSC', () => {
  const cleanup: (() => void)[] = [];
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wg-identify-'));
    cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  });

  afterEach(() => {
    for (const dispose of cleanup.splice(0).reverse()) dispose();
  });

  async function launch(order: 'row' | 'column', shard?: [number, number], savedMap?: number[]) {
    const udp = createSocket('udp4');
    await new Promise<void>((resolve, reject) => {
      udp.once('error', reject);
      udp.bind(0, '127.0.0.1', resolve);
    });
    cleanup.push(() => udp.close());
    const brightness = new Map<number, number>();
    udp.on('message', packet => {
      const address = packet.subarray(0, packet.indexOf(0)).toString();
      const match = /^\/beyond\/zone\/(\d+)\/livecontrol\/Brightness$/.exec(address);
      if (match) brightness.set(Number(match[1]), packet.readFloatBE(packet.length - 4));
    });

    const env = process.env;
    const lightMap = join(root, 'light-map.json');
    if (savedMap) writeFileSync(lightMap, JSON.stringify({ physicalLights: savedMap }));
    process.env = {
      BEYOND_HOST: '127.0.0.1',
      BEYOND_PORT: String(udp.address().port),
      BEYOND_GRID_ORDER: order,
      LIGHT_MAP_CONFIG: lightMap,
      RECEIVER_ALPHA: '1',
      ...(shard ? { SHARD_START: String(shard[0]), SHARD_END: String(shard[1]) } : {})
    };
    const connect = jest.spyOn(WebSocketInput.prototype, 'connect').mockImplementation(() => {});
    let handle: ReceiverHandle;
    let input: WebSocketInput;
    try {
      handle = startReceiver(loadWavegridConfig({
        overrides: { mode: shard ? 'distributed' : 'simple', layout: { preset: 'grid-7x7' } }
      }));
      input = connect.mock.contexts[0] as WebSocketInput;
    } finally {
      connect.mockRestore();
      process.env = env;
    }
    cleanup.push(handle.stop);
    return {
      brightness,
      lit: () => [...brightness.entries()].filter(([, b]) => b > 0),
      paint: (idx: number) => input.emit('command', { type: 'command', action: 'paint', cells: [{ idx, ...white }] }),
      identify: (grid: ReturnType<typeof preview> | null) => input.emit('command', { type: 'command', action: 'calibrationPreview', grid })
    };
  }

  it('identifies zone 1 directly without changing column-major show output', async () => {
    const receiver = await launch('column');
    receiver.paint(1);
    await waitFor(() => receiver.brightness.get(7) === 100);
    receiver.identify(preview(1));
    await waitFor(() => receiver.brightness.get(1) === 100 && receiver.brightness.get(7) === 0);
    expect(receiver.lit()).toEqual([[1, 100]]);
    receiver.identify(null);
    await waitFor(() => receiver.brightness.get(7) === 100 && receiver.brightness.get(1) === 0);
    expect(receiver.lit()).toEqual([[7, 100]]);
  });

  it('identifies only on the owning shard and clears the direct zone when the show returns', async () => {
    const left = await launch('column', [0, 6]);
    const right = await launch('column', [7, 13]);
    left.paint(1);
    right.paint(8);
    await waitFor(() => left.brightness.get(7) === 100 && right.brightness.get(7) === 100);
    left.identify(preview(8));
    right.identify(preview(8));
    await waitFor(() => left.brightness.get(7) === 0 && right.brightness.get(7) === 0 && right.brightness.get(1) === 100);
    expect(left.lit()).toEqual([]);
    expect(right.lit()).toEqual([[1, 100]]);
    left.identify(null);
    right.identify(null);
    await waitFor(() => right.brightness.get(1) === 0 && left.brightness.get(7) === 100 && right.brightness.get(7) === 100);
    expect(right.lit()).toEqual([[7, 100]]);
  });

  it('keeps row-major and saved-map Identify routing unchanged', async () => {
    const row = await launch('row');
    row.identify(preview(1));
    await waitFor(() => row.brightness.get(1) === 100);
    expect(row.lit()).toEqual([[1, 100]]);

    const map = Array.from({ length: 49 }, (_, i) => i);
    [map[1], map[7]] = [map[7], map[1]];
    const saved = await launch('column', undefined, map);
    saved.identify(preview(7));
    await waitFor(() => saved.brightness.get(1) === 100);
    expect(saved.lit()).toEqual([[1, 100]]);
  });
});
