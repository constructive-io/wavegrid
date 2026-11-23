import { loadWavegridConfig } from '@wavegrid/layout';
import { createSocket } from 'dgram';

import { WebSocketInput } from '../src/adapters';
import { startReceiver } from '../src/main';

jest.mock('fs', () => ({ ...jest.requireActual('fs'), appendFileSync: jest.fn() }));

it('identifies the requested BEYOND zone on a column-major grid without a saved light map', async () => {
  const udp = createSocket('udp4');
  await new Promise<void>(resolve => udp.bind(0, '127.0.0.1', resolve));
  const env = process.env;
  process.env = {
    BEYOND_HOST: '127.0.0.1',
    BEYOND_PORT: String(udp.address().port),
    BEYOND_GRID_ORDER: 'column',
    LIGHT_MAP_CONFIG: __filename + '.missing'
  };
  const connect = jest.spyOn(WebSocketInput.prototype, 'connect').mockImplementation(() => {});
  const resolved = loadWavegridConfig({ overrides: { mode: 'simple', layout: { preset: 'grid-7x7' } } });
  const handle = startReceiver(resolved);
  try {
    const litZone = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No lit BEYOND zone received')), 2000);
      udp.on('message', packet => {
        const address = packet.subarray(0, packet.indexOf(0)).toString();
        if (!address.endsWith('/Brightness') || packet.readFloatBE(packet.length - 4) === 0) return;
        clearTimeout(timer);
        resolve(address);
      });
    });
    const input = connect.mock.contexts[0] as WebSocketInput;
    input.emit('command', {
      type: 'command',
      action: 'calibrationPreview',
      preview: { physicalIndex: 1 }
    });
    expect(await litZone).toBe('/beyond/zone/1/livecontrol/Brightness');
  } finally {
    handle.stop();
    connect.mockRestore();
    process.env = env;
    udp.close();
  }
});
