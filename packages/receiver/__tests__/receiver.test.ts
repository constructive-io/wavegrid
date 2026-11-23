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
