import { listenForOsc, parseIndexRange, parseOscArg, probeGrid, sendOscMessage } from '../src/debug';

describe('parseOscArg', () => {
  it('defaults numbers to float, because BEYOND ignores ints on float addresses', () => {
    expect(parseOscArg('255')).toEqual({ type: 'float', value: 255 });
    expect(parseOscArg('0.5')).toEqual({ type: 'float', value: 0.5 });
  });

  it('honours explicit type tags', () => {
    expect(parseOscArg('i:3')).toEqual({ type: 'integer', value: 3 });
    expect(parseOscArg('i:3.7')).toEqual({ type: 'integer', value: 4 });
    expect(parseOscArg('f:2')).toEqual({ type: 'float', value: 2 });
    expect(parseOscArg('s:12')).toEqual({ type: 'string', value: '12' });
  });

  it('treats non-numeric tokens as strings', () => {
    expect(parseOscArg('on')).toEqual({ type: 'string', value: 'on' });
  });

  it('rejects a tagged number that is not a number', () => {
    expect(() => parseOscArg('i:red')).toThrow(/Not a number/);
  });
});

describe('parseIndexRange', () => {
  it('expands ranges, lists, and singles', () => {
    expect(parseIndexRange('0-3')).toEqual([0, 1, 2, 3]);
    expect(parseIndexRange('0,3,7')).toEqual([0, 3, 7]);
    expect(parseIndexRange('5')).toEqual([5]);
    expect(parseIndexRange('0-2,9')).toEqual([0, 1, 2, 9]);
  });

  it('walks a descending range in reverse', () => {
    expect(parseIndexRange('3-1')).toEqual([3, 2, 1]);
  });

  it('rejects nonsense', () => {
    expect(() => parseIndexRange('')).toThrow(/No indices/);
    expect(() => parseIndexRange('a')).toThrow(/Not an index/);
  });
});

describe('probeGrid', () => {
  it('lights exactly one fixture and leaves the rest dark', () => {
    const grid = probeGrid(3, 1, { h: 40, s: 100, b: 90 });
    expect(grid).toEqual([
      { h: 40, s: 100, b: 0 },
      { h: 40, s: 100, b: 90 },
      { h: 40, s: 100, b: 0 }
    ]);
  });

  it('blacks everything out when nothing is lit', () => {
    expect(probeGrid(2, null, { h: 40, s: 100, b: 90 }).every((c) => c.b === 0)).toBe(true);
  });
});

describe('sendOscMessage / listenForOsc', () => {
  it('delivers a message over UDP with its arguments intact', async () => {
    const received: Array<{ address: string; args: unknown[] }> = [];
    const listener = await listenForOsc(41234, '127.0.0.1', (msg) => {
      received.push({ address: msg.address, args: msg.args });
    });

    await sendOscMessage('127.0.0.1', 41234, '/beyond/zone/0/livecontrol/red', [
      { type: 'float', value: 255 }
    ]);
    await new Promise((r) => setTimeout(r, 100));
    await listener.close();

    expect(received).toHaveLength(1);
    expect(received[0].address).toBe('/beyond/zone/0/livecontrol/red');
    expect(received[0].args).toEqual([255]);
  });
});
