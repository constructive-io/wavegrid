import { resolveLayout } from '@wavegrid/layout';

import { ServerPatternEngine } from '../src/pattern-engine';

const LAYOUT = resolveLayout({ preset: 'grid-7x7' });
const grid = () => LAYOUT.fixtures.map(() => ({ h: 0, s: 0, b: 0 }));

const PARAM_PATTERN = `({
  meta: { params: { hue: { default: 30 } } },
  render(ctx) { ctx.fill(ctx.p.hue, 100, ctx.p.level === undefined ? 50 : ctx.p.level); }
})`;

describe('ServerPatternEngine params', () => {
  it('exposes meta defaults on ctx.p', () => {
    const engine = new ServerPatternEngine(LAYOUT);
    expect(engine.load(PARAM_PATTERN)).toBe(true);
    const g = grid();
    engine.render(g);
    expect(g[0]).toEqual({ h: 30, s: 100, b: 50 });
  });

  it('initial params override defaults', () => {
    const engine = new ServerPatternEngine(LAYOUT);
    engine.load(PARAM_PATTERN, { hue: 200, level: 80 });
    const g = grid();
    engine.render(g);
    expect(g[0]).toEqual({ h: 200, s: 100, b: 80 });
  });

  it('setParam changes the next frame without reloading', () => {
    const engine = new ServerPatternEngine(LAYOUT);
    engine.load(PARAM_PATTERN);
    engine.setParam('hue', 120);
    engine.setParam('level', 10);
    const g = grid();
    engine.render(g);
    expect(g[0]).toEqual({ h: 120, s: 100, b: 10 });
  });

  it('setParam calls onParam when the pattern has one', () => {
    const engine = new ServerPatternEngine(LAYOUT);
    engine.load(`({
      seen: [],
      onParam(name, value) { this.seen.push(name + '=' + value); },
      render(ctx) { ctx.fill(0, 0, this.seen.length); }
    })`);
    engine.setParam('a', 1);
    engine.setParam('b', 2);
    const g = grid();
    engine.render(g);
    expect(g[0].b).toBe(2);
  });

  it('reports the loaded code and live params, cleared by stop', () => {
    const engine = new ServerPatternEngine(LAYOUT);
    expect(engine.code).toBeNull();
    expect(engine.currentParams).toEqual({});
    engine.load(PARAM_PATTERN, { level: 80 });
    engine.setParam('hue', 120);
    expect(engine.code).toBe(PARAM_PATTERN);
    expect(engine.currentParams).toEqual({ hue: 120, level: 80 });
    engine.stop();
    expect(engine.code).toBeNull();
    expect(engine.currentParams).toEqual({});
  });

  it('setParam is a no-op with nothing loaded', () => {
    const engine = new ServerPatternEngine(LAYOUT);
    expect(() => engine.setParam('x', 1)).not.toThrow();
  });
});
