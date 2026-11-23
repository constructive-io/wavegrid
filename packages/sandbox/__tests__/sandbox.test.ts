import { resolveLayout } from '@wavegrid/layout';

import { createSandboxEngine, type SandboxEngine } from '../src';

const layout = resolveLayout({ preset: 'grid-7x7' });

describe('shared pattern sandbox', () => {
  let engine: SandboxEngine;
  beforeEach(async () => { engine = await createSandboxEngine(layout); });
  afterEach(() => engine?.dispose());

  it('keeps host globals out of both direct access and Function constructors', () => {
    engine.loadPattern(`({ render(ctx) {
      var global = Function('return this')();
      ctx.fill(typeof process === 'undefined' && typeof require === 'undefined' &&
        typeof global.process === 'undefined' && typeof global.require === 'undefined' ? 120 : 0, 100, 100);
    } })`);
    expect(engine.renderFrame(0, 0, 1)?.[0]).toEqual({ h: 120, s: 100, b: 100 });
  });

  it('interrupts a nonterminating load and can load another pattern', async () => {
    engine.dispose();
    engine = await createSandboxEngine(layout, { loadBudgetMs: 200 });
    const start = performance.now();
    expect(() => engine.loadPattern('(function(){ while(true){} })()')).toThrow();
    expect(performance.now() - start).toBeLessThan(1000);
    engine.loadPattern('({ render(ctx) { ctx.fill(20, 30, 40); } })');
    expect(engine.renderFrame(0, 0, 1)?.[0]).toEqual({ h: 20, s: 30, b: 40 });
  });

  it.each(['while(true){}', 'throw new Error("bad render")'])('contains render failures: %s', (body) => {
    engine.loadPattern(`({ render(ctx) { ctx.fill(40, 50, 60); ${body} } })`);
    const start = performance.now();
    expect(() => engine.renderFrame(0, 0, 1)).not.toThrow();
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('rejects syntax errors and missing render functions', () => {
    expect(() => engine.loadPattern('({')).toThrow();
    expect(() => engine.loadPattern('({ meta: {} })')).toThrow(/render/);
  });

  it.each([
    '\n({ render(ctx) { ctx.fill(120, 80, 60); } })',
    '({ render(ctx) { ctx.fill(120, 80, 60); } }); \n',
    ...['const', 'let', 'var'].map(kind => `${kind} hue = 120; function render(ctx) { ctx.fill(hue, 80, 60); }`)
  ])('loads expression and statement sources without return-prefix syntax restrictions: %s', (code) => {
    engine.loadPattern(code);
    expect(engine.renderFrame(0, 0, 1)?.[0]).toEqual({ h: 120, s: 80, b: 60 });
  });

  it('loads mixed-format patterns with line comments before declarations', () => {
    engine.loadPattern(`({
      // Pride palette
      // Shared by render
      var hue = 120;
      render: function(ctx) { ctx.fill(hue, 80, 60); }
    })`);
    expect(engine.renderFrame(0, 0, 1)?.[0]).toEqual({ h: 120, s: 80, b: 60 });
  });
});
