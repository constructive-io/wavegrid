import { presets, resolveLayout } from '@wavegrid/layout';

import { coerceParams } from '../src/lib/use-grace-paint';
import {
  ANIMS, defaultParams, emptyPaint, FLOWS, kindPaint, type PalaceParams, palacePattern, paintFixture, SCENES, SPANS, SPINS
} from '../src/lib/palace';

type Cell = [number, number, number];

function render(fixtures: { x: number; kind?: 'cannon' | 'projector' }[], params: Partial<PalaceParams>, t: number): Cell[] {
  // eslint-disable-next-line no-eval
  const pat = (0, eval)(palacePattern(fixtures)) as { render: (ctx: unknown) => void };
  const out: Cell[] = fixtures.map(() => [0, 0, 0]);
  pat.render({ t, count: fixtures.length, p: { ...defaultParams(fixtures.length), ...params }, set: (i: number, h: number, s: number, b: number) => { out[i] = [h, s, b]; } });
  return out;
}

const zipper = presets['interleaved-12x2']().fixtures;
const plain = resolveLayout({ kind: 'grid', cols: 12, rows: 2 }).fixtures;

describe('palace pattern', () => {
  it.each([['zipper', zipper], ['no projectors', plain]])('every motion × who stays finite and in range (%s)', (_, fixtures) => {
    for (const a of ANIMS) {
      for (const who of ['both', 'cannon', 'projector'] as const) {
        for (let t = 0; t < 40; t += 0.7) {
          for (const [h, s, b] of render(fixtures, { anim: a.key, who, flow: 'scroll' }, t)) {
            expect(Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(b)).toBe(true);
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it('curtain, zipper and rainfall never take the whole rig dark', () => {
    for (const anim of ['curtain', 'zipper', 'rainfall']) {
      for (let t = 0; t < 36; t += 0.5) expect(Math.max(...render(zipper, { anim }, t).map((c) => c[2]))).toBeGreaterThanOrEqual(80);
    }
  });

  it("who: 'cannon' leaves projectors at level × projector trim", () => {
    const out = render(zipper, { anim: 'sweep', who: 'cannon', projector: 60 }, 3.3);
    zipper.forEach((f, i) => { if (f.kind === 'projector') expect(out[i][2]).toBeCloseTo(60); });
  });

  it('duo with two stops and no drift gives cannons stop 0 and projectors stop 1', () => {
    const out = render(zipper, { flow: 'duo', spin: 0, stops: [[40, 100], [200, 50]], anim: 'solid' }, 5);
    zipper.forEach((f, i) => expect(out[i].slice(0, 2)).toEqual(f.kind === 'projector' ? [200, 50] : [40, 100]));
  });

  it('painted fixtures keep their colour under every flow; trims scale brightness', () => {
    const paint = paintFixture(emptyPaint(24), 13, 123, 77);
    for (const f of FLOWS) {
      const out = render(zipper, { flow: f.key, paint, anim: 'solid', cannon: 50 }, 7);
      expect(out[13].slice(0, 2)).toEqual([123, 77]);
      expect(out[0][2]).toBeCloseTo(50);
      expect(out[13][2]).toBeCloseTo(100);
    }
  });

  it('kindPaint fills only the requested kind', () => {
    const p = kindPaint(emptyPaint(24), zipper, 'projector', 10, 20);
    zipper.forEach((f, i) => expect(p[i * 2]).toBe(f.kind === 'projector' ? 10 : -1));
  });

  it('scenes use only existing flows, motions, spans and drifts', () => {
    for (const s of SCENES) {
      expect(FLOWS.some((f) => f.key === s.params.flow)).toBe(true);
      expect(ANIMS.some((a) => a.key === s.params.anim)).toBe(true);
      expect(SPANS.some((x) => x.key === s.params.span)).toBe(true);
      expect(SPINS.some((x) => x.key === s.params.spin)).toBe(true);
    }
  });

  it('a Palace look is never taken as a GracePaint look', () => {
    expect(coerceParams(defaultParams(24) as unknown as Record<string, unknown>)).toBeNull();
  });
});
