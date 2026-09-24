import { resolveLayout } from '@wavegrid/layout';

import {
  ANIMS,
  defaultParams,
  emptyPaint,
  FLOWS,
  type GracePaintParams,
  gracePaintPattern,
  hasPaint,
  paintPane,
  ringPaint
} from '../src/lib/grace-paint';
import { GRADIENTS, PAIRS } from '../src/lib/grace-rings';
import { isGracePaintRunning, paramsFromPattern } from '../src/lib/use-grace-paint';

interface Cell {
  h: number;
  s: number;
  b: number;
}

const GRACE = resolveLayout({ preset: 'grace-cathedral' });
const GRACE28 = resolveLayout({ preset: 'grace-28' });
const CYCLE = 36;

const OUTER = GRACE.fixtures.filter(f => +f.radius.toFixed(3) === 1).map(f => f.index);
const MIDDLE = GRACE.fixtures.filter(f => f.radius > 0.45 && f.radius < 0.8).map(f => f.index);
const CENTRE = GRACE.fixtures.filter(f => f.radius <= 0.45).map(f => f.index);

/** Loads the pattern once and renders it at successive times with live params, like the receiver. */
function player(layout = GRACE, params: Partial<GracePaintParams> = {}) {
  const p: Record<string, unknown> = { ...defaultParams(layout.count, GRADIENTS[0]), ...params };
  const pattern = new Function('return (' + gracePaintPattern() + ');')();
  return {
    set(name: string, value: unknown) { p[name] = value; },
    at(t: number): Cell[] {
      const cells: Cell[] = layout.fixtures.map(() => ({ h: -1, s: -1, b: -1 }));
      pattern.render({
        count: layout.count,
        cols: 0,
        rows: 0,
        t,
        dt: 1 / 60,
        frame: Math.round(t * 60),
        p,
        set(i: number, h: number, s: number, b: number) { cells[i] = { h, s, b }; },
        get(i: number) { const c = cells[i]; return [c.h, c.s, c.b]; },
        polar(i: number): [number, number] { const f = layout.fixtures[i]; return [f.radius, f.angle]; },
        xy(i: number): [number, number] { const f = layout.fixtures[i]; return [f.x, f.y]; },
        uv(i: number): [number, number] { const f = layout.fixtures[i]; return [f.u, f.v]; }
      });
      return cells;
    }
  };
}

const mean = (cells: Cell[], idx: number[]) => idx.reduce((a, i) => a + cells[i].b, 0) / idx.length;

describe('GracePaint params', () => {
  it('starts unpainted with the gradient and no motion in brightness', () => {
    const d = defaultParams(25, GRADIENTS[0]);
    expect(d.paint).toHaveLength(50);
    expect(hasPaint(d.paint)).toBe(false);
    expect(d.stops).toEqual(GRADIENTS[0].stops);
    expect(d.anim).toBe('still');
  });

  it('paintPane is immutable, wraps hue and clamps saturation', () => {
    const base = emptyPaint(3);
    const next = paintPane(base, 1, 370, 140);
    expect(base[2]).toBe(-1);
    expect(next[2]).toBe(10);
    expect(next[3]).toBe(100);
    expect(hasPaint(next)).toBe(true);
  });

  it('paintPane grows the array when the layout has more panes than the paint', () => {
    expect(paintPane([], 2, 90, 50)).toEqual([-1, 0, -1, 0, 90, 50]);
  });

  it('spin 0 holds the gradient still; spin 2 moves it twice as far', () => {
    const still = player(GRACE, { spin: 0 });
    expect(still.at(0)[0].h).toBeCloseTo(still.at(20)[0].h, 5);
    const one = player(GRACE, { spin: 1 });
    const two = player(GRACE, { spin: 2 });
    expect(two.at(5)[0].h).toBeCloseTo(one.at(10)[0].h, 5);
    expect(two.at(5)[0].h).not.toBeCloseTo(one.at(5)[0].h, 1);
  });

  it('ringPaint gives the outer ring one colour and the inner ring + centre the other', () => {
    const pair = PAIRS.find(p => p.name === 'Chapel')!;
    const paint = ringPaint(GRACE.fixtures.map(f => f.radius), pair);
    expect(paint).toHaveLength(50);
    for (const i of OUTER) expect([paint[i * 2], paint[i * 2 + 1]]).toEqual(pair.outer);
    for (const i of [...MIDDLE, ...CENTRE]) expect([paint[i * 2], paint[i * 2 + 1]]).toEqual(pair.inner);
  });
});

describe('GracePaint pattern — colour and brightness are separate layers', () => {
  it('painted panes keep their colour while the animation moves the brightness', () => {
    const p = player(GRACE, { anim: 'collapse' });
    p.set('paint', paintPane(emptyPaint(25), 3, 120, 80));
    const a = p.at(0);
    const b = p.at(CYCLE / 4);
    expect(a[3].h).toBe(120);
    expect(a[3].s).toBe(80);
    expect(b[3].h).toBe(120);
    expect(b[3].s).toBe(80);
    expect(Math.abs(a[3].b - b[3].b)).toBeGreaterThan(20);
  });

  it('unpainted panes follow the gradient and change colour as it turns', () => {
    const p = player(GRACE, { flow: 'wheel' });
    const a = p.at(0);
    const b = p.at(15);
    expect(a[0].h).not.toBe(b[0].h);
    for (const c of a) {
      expect(c.h).toBeGreaterThanOrEqual(0);
      expect(c.h).toBeLessThan(360);
    }
  });

  it('switching animation mid-flight keeps the paint (no reload needed)', () => {
    const p = player(GRACE, { anim: 'still' });
    p.set('paint', paintPane(emptyPaint(25), 7, 300, 100));
    expect(p.at(1)[7].h).toBe(300);
    p.set('anim', 'collapse');
    expect(p.at(2)[7].h).toBe(300);
    p.set('flow', 'spiral');
    expect(p.at(3)[7].h).toBe(300);
  });

  it('level caps brightness', () => {
    const p = player(GRACE, { anim: 'still', level: 40 });
    for (const c of p.at(0)) expect(c.b).toBeCloseTo(40);
  });

  it.each(ANIMS.map(a => a.key))('%s stays in range on both Grace layouts', (anim) => {
    for (const layout of [GRACE, GRACE28]) {
      const p = player(layout, { anim });
      for (let t = 0; t < CYCLE * 2; t += 0.7) {
        for (const c of p.at(t)) {
          expect(c.b).toBeGreaterThanOrEqual(0);
          expect(c.b).toBeLessThanOrEqual(100);
          expect(Number.isFinite(c.h)).toBe(true);
          expect(c.s).toBeGreaterThanOrEqual(0);
          expect(c.s).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it.each(FLOWS.map(f => f.key))('%s flow yields valid hues', (flow) => {
    const p = player(GRACE, { flow });
    for (let t = 0; t < 90; t += 5) {
      for (const c of p.at(t)) {
        expect(c.h).toBeGreaterThanOrEqual(0);
        expect(c.h).toBeLessThan(360);
      }
    }
  });
});

describe('Collapse — whole rings', () => {
  const p = player(GRACE, { anim: 'collapse' });

  it('centre never dims', () => {
    for (let t = 0; t < CYCLE; t += 0.5) expect(p.at(t)[CENTRE[0]].b).toBeCloseTo(100);
  });

  it('outer goes first, then middle; then middle returns before outer', () => {
    const beat = CYCLE / 6;
    const afterOuterOut = p.at(beat * 1.05);
    expect(mean(afterOuterOut, OUTER)).toBeLessThan(2);
    expect(mean(afterOuterOut, MIDDLE)).toBeGreaterThan(98);

    const centreOnly = p.at(beat * 2.5);
    expect(mean(centreOnly, OUTER)).toBeLessThan(2);
    expect(mean(centreOnly, MIDDLE)).toBeLessThan(2);

    const middleBack = p.at(beat * 4.05);
    expect(mean(middleBack, MIDDLE)).toBeGreaterThan(98);
    expect(mean(middleBack, OUTER)).toBeLessThan(2);

    const allBack = p.at(beat * 5.5);
    expect(mean(allBack, OUTER)).toBeGreaterThan(98);
    expect(mean(allBack, MIDDLE)).toBeGreaterThan(98);
  });
});

describe('every animation reads on the lasers', () => {
  const HOLD_ANIMS = ['still', 'breathe', 'ringBreathe', 'twinkle'];

  it('never leaves the whole window dark, and always-lit animations stay in the 80–100 band', () => {
    for (const a of ANIMS) {
      const p = player(GRACE, { anim: a.key });
      for (let t = 0; t < 120; t += 0.25) {
        const cells = p.at(t);
        expect(Math.max(...cells.map(c => c.b))).toBeGreaterThanOrEqual(80);
        if (HOLD_ANIMS.includes(a.key)) for (const c of cells) expect(c.b).toBeGreaterThanOrEqual(80 - 1e-6);
      }
    }
  });

  it('spends little time in the dim middle: panes are mostly clearly on or clearly off', () => {
    for (const a of ANIMS) {
      const p = player(GRACE, { anim: a.key });
      let dim = 0;
      let n = 0;
      for (let t = 0; t < 120; t += 0.25) {
        for (const c of p.at(t)) {
          n++;
          if (c.b > 10 && c.b < 80) dim++;
        }
      }
      expect(dim / n).toBeLessThan(0.4);
    }
  });

  it('comet: the centre stays on and the head is fully bright', () => {
    const p = player(GRACE, { anim: 'comet' });
    for (let t = 0; t < 28; t += 0.5) {
      const cells = p.at(t);
      expect(cells[CENTRE[0]].b).toBe(100);
      expect(Math.max(...OUTER.map(i => cells[i].b))).toBeGreaterThan(95);
    }
  });
});

describe('Unwind', () => {
  const p = player(GRACE, { anim: 'unwind' });

  it('centre never dims, even when both rings are fully drained', () => {
    for (let t = 0; t < CYCLE; t += 0.5) expect(p.at(t)[CENTRE[0]].b).toBeCloseTo(100);
    const drained = p.at(CYCLE * 0.47);
    expect(mean(drained, OUTER)).toBeLessThan(2);
    expect(mean(drained, MIDDLE)).toBeLessThan(2);
  });
});

describe('Collapse Panes — one pane at a time', () => {
  const p = player(GRACE, { anim: 'collapsePanes' });
  const beat = CYCLE / 6;

  it('centre never dims', () => {
    for (let t = 0; t < CYCLE; t += 0.5) expect(p.at(t)[CENTRE[0]].b).toBeCloseTo(100);
  });

  it('halfway through the outer beat about half the outer ring is dark and the middle is untouched', () => {
    const cells = p.at(beat * 0.5);
    const dark = OUTER.filter(i => cells[i].b < 5).length;
    const lit = OUTER.filter(i => cells[i].b > 95).length;
    expect(dark).toBeGreaterThanOrEqual(5);
    expect(lit).toBeGreaterThanOrEqual(5);
    expect(mean(cells, MIDDLE)).toBeGreaterThan(98);
  });

  it('panes fade in clockwise order from 12 o\'clock', () => {
    const cells = p.at(beat * 0.5);
    const clock = (i: number) => {
      const f = GRACE.fixtures[i];
      const a = (f.angle + Math.PI / 2) / (Math.PI * 2);
      return a - Math.floor(a);
    };
    const dark = OUTER.filter(i => cells[i].b < 5).map(clock);
    const lit = OUTER.filter(i => cells[i].b > 95).map(clock);
    expect(Math.max(...dark)).toBeLessThan(Math.min(...lit));
  });

  it('the ring is fully dark by the end of its beat and fully back by the end of its return beat', () => {
    expect(mean(p.at(beat * 1.02), OUTER)).toBeLessThan(2);
    expect(mean(p.at(beat * 2.02), MIDDLE)).toBeLessThan(2);
    expect(mean(p.at(beat * 4.02), MIDDLE)).toBeGreaterThan(98);
    expect(mean(p.at(beat * 5.02), OUTER)).toBeGreaterThan(98);
  });

  it('works on the 28 layout where the centre is a ring of four', () => {
    const p28 = player(GRACE28, { anim: 'collapsePanes' });
    const centre = GRACE28.fixtures.filter(f => f.radius <= 0.45).map(f => f.index);
    expect(centre).toHaveLength(4);
    for (const i of centre) expect(p28.at(beat * 2.5)[i].b).toBeCloseTo(100);
  });
});

describe('the brain decides whether GracePaint is running', () => {
  const live = {
    active: true,
    code: gracePaintPattern(),
    params: { ...defaultParams(25, GRADIENTS[0]), anim: 'collapse', spin: 0.5 }
  };

  it('recognises its own pattern and adopts the live params (so a tap keeps the running animation)', () => {
    expect(isGracePaintRunning(live)).toBe(true);
    expect(paramsFromPattern(live)?.anim).toBe('collapse');
    expect(paramsFromPattern(live)?.spin).toBe(0.5);
  });

  it('is not running when nothing, another pattern, or a stopped GracePaint is reported', () => {
    expect(isGracePaintRunning(null)).toBe(false);
    expect(isGracePaintRunning({ active: true, code: '({ render() {} })', params: {} })).toBe(false);
    expect(isGracePaintRunning({ ...live, active: false })).toBe(false);
    expect(paramsFromPattern({ ...live, params: { anim: 'x' } })).toBeNull();
  });
});
