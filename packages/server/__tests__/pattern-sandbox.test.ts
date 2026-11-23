import { resolveLayout } from '@wavegrid/layout';
import { createSandboxEngine } from '@wavegrid/sandbox';

import { gracePaintPattern, defaultParams as graceParams } from '../../ui/src/lib/grace-paint';
import { GRADIENTS } from '../../ui/src/lib/grace-rings';
import { palacePattern, defaultParams as palaceParams } from '../../ui/src/lib/palace';
import { ServerPatternEngine } from '../src/pattern-engine';
import { compilePlaylist } from '../src/playlist-compiler';

const layout = resolveLayout({ preset: 'interleaved-12x2' });
const mixedPride = `({
  var COLORS = [0, 30, 55, 120, 210, 290];
  function hue(i) { return COLORS[i % COLORS.length]; }
  render: function(ctx) {
    for (var i = 0; i < ctx.count; i++) ctx.set(i, hue(i) + ctx.t, 100, ctx.p.level);
  },
  meta: { params: { level: { default: 80 } } }
})`;

describe('QuickJS brain preview', () => {
  let engine: ServerPatternEngine;
  beforeEach(async () => {
    engine = new ServerPatternEngine(layout);
    await engine.init();
  });
  afterEach(() => { jest.restoreAllMocks(); engine.stop(); });

  it.each([
    ['Palace', palacePattern(layout.fixtures), palaceParams(layout.count)],
    ['mixed Pride', mixedPride, { level: 70 }],
    ['GracePaint', gracePaintPattern(), graceParams(layout.count, GRADIENTS[0])],
    ['compiled playlist', compilePlaylist({
      steps: [{ type: 'animation', name: 'rainbow', duration: 5 }, { type: 'scene', name: 'civic', duration: 5 }],
      loop: true, transition: 'fade', transitionDuration: 1
    }), {}]
  ])('matches the receiver engine for %s', async (_name, code, params) => {
    const receiver = await createSandboxEngine(layout);
    try {
      let now = 1000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      expect(engine.load(code as string, params as Record<string, unknown>)).toBe(true);
      receiver.loadPattern(code as string, params as Record<string, unknown>);
      const grid = layout.fixtures.map(() => ({ h: 0, s: 0, b: 0 }));
      let elapsed = 0;
      let frame = 0;
      for (const offset of [20, 40, 60, 4700, 5100, 10100]) {
        const next = 1000 + offset;
        const dt = (next - now) / 1000;
        elapsed += dt;
        now = next;
        expect(engine.render(grid)).toBe(true);
        expect(grid).toEqual(receiver.renderFrame(elapsed, dt, ++frame));
      }
    } finally { receiver.dispose(); }
  });

  it('isolates host globals in the brain too', () => {
    expect(engine.load(`({ render(ctx) {
      var g = Function('return this')();
      ctx.fill(typeof process === 'undefined' && typeof require === 'undefined' &&
        typeof g.process === 'undefined' && typeof g.require === 'undefined' ? 120 : 0, 100, 100);
    } })`)).toBe(true);
    const grid = layout.fixtures.map(() => ({ h: 0, s: 0, b: 0 }));
    expect(engine.render(grid)).toBe(true);
    expect(grid[0].h).toBe(120);
  });

  it('returns false for bad code, clears state, and renders nothing while stopped', () => {
    expect(engine.load(mixedPride)).toBe(true);
    expect(engine.load('({')).toBe(false);
    expect(engine.active).toBe(false);
    expect(engine.code).toBeNull();
    expect(engine.currentParams).toEqual({});
    expect(engine.render([])).toBe(false);
    expect(engine.load('')).toBe(false);
  });

  it('bounds infinite load and render execution in the brain', () => {
    let start = performance.now();
    expect(engine.load('(function(){ while(true){} })()')).toBe(false);
    expect(performance.now() - start).toBeLessThan(3000);
    expect(engine.load('({ render() { while(true){} } })')).toBe(true);
    start = performance.now();
    expect(() => engine.render([])).not.toThrow();
    expect(performance.now() - start).toBeLessThan(1000);
  }, 10000);

  it('contains throwing renders without crashing the brain', () => {
    expect(engine.load('({ render() { throw new Error("bad frame"); } })')).toBe(true);
    expect(() => engine.render([])).not.toThrow();
    expect(engine.load('({ render(ctx) { ctx.fill(30, 40, 50); } })')).toBe(true);
    const grid = [{ h: 0, s: 0, b: 0 }];
    expect(engine.render(grid)).toBe(true);
    expect(grid[0]).toEqual({ h: 30, s: 40, b: 50 });
  });
});
