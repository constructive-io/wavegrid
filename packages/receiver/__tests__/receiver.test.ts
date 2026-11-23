import { CallbackOutput, ConsoleOutput, WebSocketInput } from '../src/adapters';
import { Receiver } from '../src/receiver';

describe('Receiver', () => {
  it('should create with default config', () => {
    const r = new Receiver();
    expect(r.status).toBe('reconnecting');
    expect(r.fallbackActive).toBe(false);
  });

  it('should return output state with 49 cannons', () => {
    const r = new Receiver();
    const state = r.getOutputState();
    expect(state).toHaveLength(49);
    expect(state[0]).toHaveProperty('h');
    expect(state[0]).toHaveProperty('s');
    expect(state[0]).toHaveProperty('b');
  });

  it('should accept custom adapters', () => {
    const received: unknown[] = [];
    const input = new WebSocketInput({ url: 'ws://example.com:9999' });
    const output = new CallbackOutput((grid) => { received.push(grid); });
    const r = new Receiver({
      input,
      output,
      alpha: 0.03,
      fallbackDelay: 5000
    });
    expect(r.status).toBe('reconnecting');
    const state = r.getOutputState();
    expect(state).toHaveLength(49);
  });

  it('should accept ConsoleOutput adapter', () => {
    const output = new ConsoleOutput({ logEveryNFrames: 120 });
    const r = new Receiver({ output });
    expect(r.status).toBe('reconnecting');
  });

  it('applies station overlay after orientation and before sharding without interrupting animation', () => {
    const input = new WebSocketInput({ url: 'ws://example.com:9999' });
    jest.spyOn(input, 'connect').mockImplementation(() => {});
    const r = new Receiver({ input, output: new CallbackOutput(() => {}), shard: { start: 3, end: 4 } });
    r.start();
    try {
      input.emit('command', { type: 'command', action: 'setAnimation', name: 'rainbow' });
      input.emit('command', { type: 'command', action: 'setOrientation', rotation: 180, flipH: false, flipV: false });
      input.emit('command', { type: 'command', action: 'setBrightness', value: 50 });
      input.emit('command', { type: 'command', action: 'stationOverlay', cells: [
        { idx: 3, h: 240, s: 75, b: 80 }, { idx: 45, h: 120, s: 100, b: 100 }
      ] });
      expect(r.getOutputState()[0]).toEqual({ h: 240, s: 75, b: 40 });
      expect(r.animationState.currentAnimation).toBe('rainbow');
      input.emit('disconnected');
      expect(r.getOutputState()[0]).not.toEqual({ h: 240, s: 75, b: 40 });
    } finally {
      r.stop();
    }
  });

  it('applies replayed brightness once to station and operator paint without changing stored targets', () => {
    jest.useFakeTimers();
    const input = new WebSocketInput({ url: 'ws://example.com:9999' });
    jest.spyOn(input, 'connect').mockImplementation(() => {});
    const levels: number[][] = [];
    const r = new Receiver({ input, output: new CallbackOutput(grid => levels.push(grid.slice(0, 2).map(c => c.b))), alpha: 1 });
    r.start();
    try {
      input.emit('connected');
      input.emit('command', { type: 'command', action: 'setBrightness', value: 20 });
      jest.advanceTimersByTime(100);
      expect(levels).toEqual([]);
      input.emit('command', { type: 'command', action: 'stationOverlay', cells: [{ idx: 0, h: 240, s: 100, b: 80 }] });
      expect(r.getOutputState()[0].b).toBe(16);
      jest.advanceTimersByTime(100);
      expect(levels.at(-1)).toEqual([16, 0]);
      input.emit('command', { type: 'command', action: 'paint', cells: [{ idx: 1, h: 60, s: 100, b: 75 }] });
      jest.advanceTimersByTime(1000);
      expect(levels.at(-1)).toEqual([16, 15]);
      expect(r.rawGrid?.[1].targetB).toBe(75);
      input.emit('command', { type: 'command', action: 'setBrightness', value: 100 });
      jest.advanceTimersByTime(100);
      expect(levels.at(-1)).toEqual([80, 75]);
    } finally {
      r.stop();
      jest.useRealTimers();
    }
  });

  it('smooths master brightness changes for both operator and station paint in mixed output', () => {
    jest.useFakeTimers();
    const input = new WebSocketInput({ url: 'ws://example.com:9999' });
    jest.spyOn(input, 'connect').mockImplementation(() => {});
    const r = new Receiver({ input, output: new CallbackOutput(() => {}), alpha: 0.5, tickMs: 20 });
    r.start();
    try {
      input.emit('connected');
      input.emit('command', { type: 'command', action: 'paint', cells: [{ idx: 0, h: 60, s: 100, b: 80 }] });
      input.emit('command', { type: 'command', action: 'stationOverlay', cells: [{ idx: 1, h: 240, s: 100, b: 80 }] });
      jest.advanceTimersByTime(1000);
      expect(r.getOutputState().slice(0, 2).map(c => c.b)).toEqual([80, 80]);
      input.emit('command', { type: 'command', action: 'setBrightness', value: 50 });
      jest.advanceTimersByTime(20);
      expect(r.getOutputState().slice(0, 2).map(c => c.b)).toEqual([60, 60]);
      jest.advanceTimersByTime(200);
      expect(r.getOutputState()[0].b).toBe(40);
      expect(r.getOutputState()[1].b).toBeCloseTo(40, 1);
      expect(r.rawGrid?.[0].targetB).toBe(80);
    } finally {
      r.stop();
      jest.useRealTimers();
    }
  });

  it('uses the fallback brightness even when the upstream master brightness was zero', () => {
    jest.useFakeTimers();
    const input = new WebSocketInput({ url: 'ws://example.com:9999' });
    jest.spyOn(input, 'connect').mockImplementation(() => {});
    const r = new Receiver({ input, output: new CallbackOutput(() => {}), fallbackDelay: 30, alpha: 1 });
    r.start();
    try {
      input.emit('connected');
      input.emit('command', { type: 'command', action: 'setBrightness', value: 0 });
      input.emit('command', { type: 'command', action: 'paint', cells: [{ idx: 0, h: 60, s: 100, b: 100 }] });
      jest.advanceTimersByTime(17);
      expect(r.getOutputState()[0].b).toBe(0);
      jest.advanceTimersByTime(60);
      expect(r.fallbackActive).toBe(true);
      expect(r.getOutputState()[0].b).toBeGreaterThan(0);
    } finally {
      r.stop();
      jest.useRealTimers();
    }
  });

  it.each([false, true])('restores the station snapshot on keepalive after a signal timeout (local animation: %s)', localAnimation => {
    jest.useFakeTimers();
    const input = new WebSocketInput({ url: 'ws://example.com:9999' });
    jest.spyOn(input, 'connect').mockImplementation(() => {});
    const r = new Receiver({ input, output: new CallbackOutput(() => {}), fallbackDelay: 30 });
    const color = { h: 240, s: 100, b: 80 };
    r.start();
    try {
      input.emit('connected');
      if (localAnimation) input.emit('command', { type: 'command', action: 'setAnimation', name: 'rainbow' });
      input.emit('command', { type: 'command', action: 'stationOverlay', cells: [{ idx: 0, ...color }] });
      expect(r.getOutputState()[0]).toEqual(color);
      jest.advanceTimersByTime(60);
      expect(r.getOutputState()[0]).not.toEqual(color);
      input.emit('command', { type: 'command', action: 'keepalive' });
      expect(r.getOutputState()[0]).toEqual(color);
      input.emit('disconnected');
      input.emit('connected');
      input.emit('command', { type: 'command', action: 'keepalive' });
      expect(r.getOutputState()[0]).not.toEqual(color);
    } finally {
      r.stop();
      jest.useRealTimers();
    }
  });

  describe('sharding', () => {
    it('should return full grid when no shard config', () => {
      const r = new Receiver();
      expect(r.getOutputState()).toHaveLength(49);
    });

    it('should return only sharded range when shard is configured', () => {
      const r = new Receiver({ shard: { start: 0, end: 39 } });
      const state = r.getOutputState();
      expect(state).toHaveLength(40);
    });

    it('should return correct subset for second shard', () => {
      const r = new Receiver({ shard: { start: 40, end: 48 } });
      const state = r.getOutputState();
      expect(state).toHaveLength(9);
    });

    it('should return single cannon shard', () => {
      const r = new Receiver({ shard: { start: 24, end: 24 } });
      const state = r.getOutputState();
      expect(state).toHaveLength(1);
    });

    it('shards should cover full grid without overlap', () => {
      const rA = new Receiver({ shard: { start: 0, end: 39 } });
      const rB = new Receiver({ shard: { start: 40, end: 48 } });
      const totalCannons = rA.getOutputState().length + rB.getOutputState().length;
      expect(totalCannons).toBe(49);
    });
  });
});
