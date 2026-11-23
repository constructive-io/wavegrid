import { loadWavegridConfig, resolveLayout } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import { stationLayoutKey } from '@wavegrid/stations';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';

import { startServer, type ServerHandle } from '../src/server';

const red = { h: 0, s: 100, b: 100 };
const blue = { h: 240, s: 100, b: 100 };

test('the brain extension host isolates station painting from other fixtures and the show', async () => {
  const saved = { ...process.env };
  const root = mkdtempSync(join(tmpdir(), 'wavegrid-stations-'));
  const sockets: WebSocket[] = [];
  let handle: ServerHandle | undefined;
  try {
    process.env.APPSTASH_BASE_DIR = root;
    process.env.WG_STATE_DIR = root;
    process.env.WAVEGRID_PROJECT = 'demo';
    process.env.WG_JWT_SECRET = 'station-test-secret';
    process.env.WG_RECEIVER_KEY = 'station-test-receiver';
    process.env.WG_HEARTBEAT_MS = '50';

    const layout = { preset: 'interleaved-12x2' };
    const fixtures = resolveLayout(layout).fixtures;
    const projector = fixtures.find(fixture => fixture.kind === 'projector')!.index;
    const config = {
      layout,
      server: { port: 0, host: '127.0.0.1' },
      stations: {
        enabled: true,
        layout: stationLayoutKey(resolveLayout(layout)),
        stations: [
          { slug: 'north', name: 'North', fixtures: [0, projector] },
          { slug: 'south', name: 'South', fixtures: [1] }
        ]
      }
    };
    const store = openStore();
    store.createProject('demo', config);
    store.setActiveProject('demo');
    store.addUser('demo', 'operator', 'test-password');
    const north = store.mintAccessKey('demo', 'north-key', 'operator', 'north').passphrase;
    const south = store.mintAccessKey('demo', 'south-key', 'operator', 'south').passphrase;
    handle = startServer(loadWavegridConfig({ overrides: config }), { uiDir: null });
    await handle.ready;
    const address = handle.server.address();
    if (typeof address !== 'object' || !address) throw new Error('Expected an ephemeral TCP port');
    const host = `127.0.0.1:${address.port}`;

    const waitFor = async (predicate: () => boolean) => {
      const deadline = Date.now() + 2000;
      while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Expected station state was not received');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };
    const login = (username: string, password: string, station?: string) =>
      fetch(`http://${host}/api/login`, {
        method: 'POST',
        body: JSON.stringify({ username, password, station })
      });
    expect((await login('north', north, 'south')).status).toBe(403);

    const dial = async (query: Record<string, string>) => {
      const ws = new WebSocket(`ws://${host}/?${new URLSearchParams(query)}`);
      sockets.push(ws);
      const frames: any[] = [];
      ws.on('message', raw => frames.push(JSON.parse(raw.toString())));
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      return {
        ws, frames,
        send: (message: Record<string, unknown>) => ws.send(JSON.stringify(message)),
        state: () => frames.filter(frame => frame.type === 'state').at(-1),
        overlay: () => frames.filter(frame => frame.action === 'stationOverlay').at(-1)?.cells
      };
    };
    const [a, b, operator] = await Promise.all([
      login('north', north, 'north').then(res => res.json()),
      login('south', south, 'south').then(res => res.json()),
      login('operator', 'test-password').then(res => res.json())
    ]);
    await expect(dial({ token: a.token, station: 'south' })).rejects.toThrow('403');
    const [clientA, clientB, full, receiver] = await Promise.all([
      dial({ token: a.token, station: 'north' }), dial({ token: b.token, station: 'south' }),
      dial({ token: operator.token }), dial({ key: 'station-test-receiver' })
    ]);
    await waitFor(() => clientA.state()?.grid.length === 2 && clientB.state()?.grid.length === 1 &&
      full.state()?.grid.length === fixtures.length);
    expect(clientA.frames[0].layout.fixtures.map((fixture: { index: number }) => fixture.index)).toEqual([0, projector]);

    full.send({ type: 'evalPattern', code: 'function render(ctx) { for (let i = 0; i < ctx.n; i++) ctx.set(i, 120, 100, 40); }' });
    await waitFor(() => receiver.frames.some(frame => frame.action === 'evalPattern'));
    const first = receiver.frames.length;
    clientA.send({ type: 'evalPattern', code: 'forbidden' });
    clientA.send({ type: 'sync_request' });
    clientA.send({ type: 'projector_cue', command: 'forbidden' });
    clientA.send({ type: 'station_mode', mode: 'show' });
    clientA.send({ type: 'cannon', index: 1, ...red });
    clientA.send({ type: 'cannon', index: projector, ...red });
    clientB.send({ type: 'cannon', index: 1, ...blue });
    await waitFor(() => clientA.state()?.grid[1]?.b === 100 && clientB.state()?.grid[0]?.h === 240);
    expect(receiver.overlay()).toEqual(expect.arrayContaining([{ idx: projector, ...red }, { idx: 1, ...blue }]));
    expect(receiver.frames.slice(first).filter(frame => frame.type === 'command')
      .map(frame => frame.action).filter(action => action !== 'keepalive')).toEqual(['stationOverlay', 'stationOverlay']);
    expect(clientA.frames.every(frame => ['station_layout', 'state'].includes(frame.type))).toBe(true);
    full.send({ type: 'master_brightness', value: 0.2 });
    await waitFor(() => receiver.frames.some(frame => frame.action === 'setBrightness' && frame.value === 20));
    const returningReceiver = await dial({ key: 'station-test-receiver' });
    await waitFor(() => returningReceiver.overlay() !== undefined);
    expect(returningReceiver.overlay()).toEqual(receiver.overlay());
    const overlayIndex = returningReceiver.frames.findIndex(frame => frame.action === 'stationOverlay');
    expect(returningReceiver.frames.slice(0, overlayIndex)).toContainEqual({
      type: 'command', action: 'setBrightness', value: 20
    });

    clientA.send({ type: 'clear' });
    await waitFor(() => clientA.state()?.grid[1]?.b === 0);
    expect(clientB.state().grid[0]).toEqual(blue);
    full.send({ type: 'station_mode', mode: 'stations' });
    await waitFor(() => full.state()?.stationMode === 'stations');
    expect(receiver.overlay()).toHaveLength(fixtures.length);
    full.send({ type: 'animation', name: 'stop' });
    await waitFor(() => clientA.state()?.stationOpen === false);
    clientB.send({ type: 'cannon', index: 1, ...blue });
    expect(receiver.overlay()).toEqual([]);
    full.send({ type: 'station_mode', mode: 'show' });
    await waitFor(() => full.state()?.stationMode === 'show');
    expect(clientB.state().stationOpen).toBe(false);

    full.send({ type: 'station_mode', mode: 'mixed' });
    await waitFor(() => clientB.state()?.stationOpen === true);
    clientB.send({ type: 'cannon', index: 1, ...blue });
    await waitFor(() => receiver.overlay()?.some((cell: { idx: number; h: number }) => cell.idx === 1 && cell.h === blue.h));
    handle.send({ type: 'physical_preview', physicalIndex: 1 });
    await waitFor(() => clientB.state()?.grid[0]?.h === 45);
    expect(clientB.state().stationOpen).toBe(false);
    expect(receiver.overlay()).toEqual([]);
    full.send({ type: 'station_mode', mode: 'mixed' });
    clientB.send({ type: 'cannon', index: 1, ...blue });
    full.send({ type: 'system_status' });
    await waitFor(() => full.frames.some(frame => frame.type === 'system_status'));
    expect(clientB.state().stationOpen).toBe(false);
    expect(receiver.overlay()).toEqual([]);
    handle.send({ type: 'physical_preview_clear' });
    handle.send({ type: 'calibration_mode', enabled: false });
    full.send({ type: 'station_mode', mode: 'mixed' });
    await waitFor(() => clientB.state()?.stationOpen === true);

    store.setAccessKeyEnabled('demo', 'north-key', false);
    await waitFor(() => clientA.ws.readyState === WebSocket.CLOSED);
    expect(clientB.ws.readyState).toBe(WebSocket.OPEN);
    store.saveProjectConfig('demo', { ...config, stations: { ...config.stations, enabled: false } });
    await waitFor(() => clientB.ws.readyState === WebSocket.CLOSED);
    expect(full.ws.readyState).toBe(WebSocket.OPEN);
  } finally {
    for (const socket of sockets) socket.terminate();
    handle?.stop();
    process.env = saved;
    rmSync(root, { recursive: true, force: true });
  }
});
