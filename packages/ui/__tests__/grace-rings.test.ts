import { resolveLayout } from '@wavegrid/layout';

import {
  graceGradients,
  graceMotion,
  graceStills,
  gradientCss,
  GRADIENTS,
  hsbCss,
  type Look,
  PAIRS
} from '../src/lib/grace-rings';

interface Cell {
  h: number;
  s: number;
  b: number;
}

const GRACE = resolveLayout({ preset: 'grace-cathedral' });
const GRACE28 = resolveLayout({ preset: 'grace-28' });
const AMBER = PAIRS[0];
const CHAPEL = PAIRS.find(p => p.name === 'Chapel')!;

/** A stand-in for the receiver's pattern ctx, over the real Grace geometry. */
function run(code: string, t = 0, layout = GRACE): Cell[] {
  const cells: Cell[] = layout.fixtures.map(() => ({ h: -1, s: -1, b: -1 }));
  const ctx = {
    count: layout.count,
    cols: 0,
    rows: 0,
    t,
    frame: Math.round(t * 60),
    set(i: number, h: number, s: number, b: number) {
      if (i >= 0 && i < cells.length) cells[i] = { h, s, b };
    },
    get(i: number) {
      const c = cells[i];
      return [c.h, c.s, c.b];
    },
    polar(i: number): [number, number] {
      const f = layout.fixtures[i];
      return [f.radius, f.angle];
    },
    xy(i: number): [number, number] {
      const f = layout.fixtures[i];
      return [f.x, f.y];
    },
    uv(i: number): [number, number] {
      const f = layout.fixtures[i];
      return [f.u, f.v];
    }
  };

  const pattern = new Function('return (' + code + ');')();
  pattern.render(ctx);
  return cells;
}

const OUTER = GRACE.fixtures.filter(f => +f.radius.toFixed(3) === 1).map(f => f.index);
const INNER = GRACE.fixtures.filter(f => +f.radius.toFixed(3) === 0.62).map(f => f.index);
const CENTRE = GRACE.fixtures.filter(f => f.radius === 0).map(f => f.index);

const looks = (list: Look[]) => new Map(list.map(l => [l.name, l.code] as const));
const stills = looks(graceStills(AMBER));
const motion = looks(graceMotion(AMBER));

function get(name: string): string {
  const code = stills.get(name) ?? motion.get(name);
  if (!code) throw new Error(`no look named ${name}`);
  return code;
}

describe('grace geometry assumptions', () => {
  it('splits into 12 outer, 12 inner and one centre', () => {
    expect(OUTER).toHaveLength(12);
    expect(INNER).toHaveLength(12);
    expect(CENTRE).toHaveLength(1);
  });
});

describe('every grace look', () => {
  const all = [...graceStills(AMBER), ...graceMotion(AMBER)];

  it.each(all.map(l => [l.name, l.code] as const))('%s writes every fixture in range', (_name, code) => {
    for (const t of [0, 0.37, 1.2, 4.9]) {
      const cells = run(code, t);
      expect(cells).toHaveLength(25);
      for (const c of cells) {
        expect(c.b).toBeGreaterThanOrEqual(0);
        expect(c.b).toBeLessThanOrEqual(100);
        expect(c.h).toBeGreaterThanOrEqual(0);
        expect(c.s).toBeGreaterThanOrEqual(0);
        expect(c.s).toBeLessThanOrEqual(100);
      }
    }
  });

  it('names are unique across stills and motion', () => {
    expect(new Set(all.map(l => l.name)).size).toBe(all.length);
  });
});

describe('per-ring colour', () => {
  it('gives each ring its own hue, and the centre the blend', () => {
    const cells = run(looks(graceStills(CHAPEL)).get('Two Tone')!);
    for (const i of OUTER) expect(cells[i].h).toBe(CHAPEL.outer[0]);
    for (const i of INNER) expect(cells[i].h).toBe(CHAPEL.inner[0]);
    // The centre takes the hue halfway between the two, the short way round the
    // wheel — so it is equidistant from both.
    const arc = (a: number, b: number) => {
      const d = Math.abs(a - b) % 360;
      return d > 180 ? 360 - d : d;
    };
    const mid = cells[CENTRE[0]].h;
    // Within a degree: the hue is rounded to keep the generated source short.
    expect(Math.abs(arc(mid, CHAPEL.outer[0]) - arc(mid, CHAPEL.inner[0]))).toBeLessThanOrEqual(1);
  });

  it('keeps colour with the ring even when brightness moves', () => {
    const cells = run(looks(graceMotion(CHAPEL)).get('Chase')!, 1.3);
    for (const i of OUTER) expect(cells[i].h).toBe(CHAPEL.outer[0]);
    for (const i of INNER) expect(cells[i].h).toBe(CHAPEL.inner[0]);
  });
});

describe('shapes', () => {
  it('Halo favours the outer ring, Core the centre', () => {
    const halo = run(get('Halo'));
    expect(halo[OUTER[0]].b).toBeGreaterThan(halo[INNER[0]].b);

    const core = run(get('Core'));
    expect(core[CENTRE[0]].b).toBeGreaterThan(core[INNER[0]].b);
    expect(core[INNER[0]].b).toBeGreaterThan(core[OUTER[0]].b);
  });

  it('Spokes lights alternate fixtures on both rings', () => {
    const cells = run(get('Spokes'));
    for (const ring of [OUTER, INNER]) {
      const lit = ring.filter(i => cells[i].b > 50);
      expect(lit).toHaveLength(6);
    }
  });

  it('Cross lights four arms plus the centre', () => {
    const cells = run(get('Cross'));
    expect(cells[CENTRE[0]].b).toBe(100);
    // The outer ring is the staggered one, so each arm lands between two of its
    // fixtures and lights both; the inner ring sits on the arms themselves.
    expect(OUTER.filter(i => cells[i].b > 50)).toHaveLength(8);
    expect(INNER.filter(i => cells[i].b > 50)).toHaveLength(4);
  });
});

describe('droplets', () => {
  it('Droplet moves outwards: the centre leads, the rim follows', () => {
    const centrePeak = Math.max(...[0, 0.05, 0.1].map(t => run(get('Droplet'), t)[CENTRE[0]].b));
    const rimPeak = Math.max(...[0, 0.05, 0.1].map(t => run(get('Droplet'), t)[OUTER[0]].b));
    expect(centrePeak).toBeGreaterThan(rimPeak);

    const late = run(get('Droplet'), 1.35);
    expect(late[OUTER[0]].b).toBeGreaterThan(late[CENTRE[0]].b);
  });

  it('Sink runs the other way', () => {
    const early = run(get('Sink'), 0.02);
    expect(early[OUTER[0]].b).toBeGreaterThan(early[CENTRE[0]].b);
  });

  it('each ring is lit in turn rather than all at once', () => {
    const brightest = (t: number) => {
      const cells = run(get('Droplet'), t);
      const avg = (idx: number[]) => idx.reduce((s, i) => s + cells[i].b, 0) / idx.length;
      return { outer: avg(OUTER), inner: avg(INNER), centre: cells[CENTRE[0]].b };
    };
    const mid = brightest(0.9); // wave near the inner ring
    expect(mid.inner).toBeGreaterThan(mid.outer);
    expect(mid.inner).toBeGreaterThan(mid.centre);
  });

  it('Rainfall keeps something moving on every ring', () => {
    const frames = [0, 0.4, 0.8, 1.6].map(t => run(get('Rainfall'), t));
    for (const ring of [OUTER, INNER, CENTRE]) {
      expect(frames.some(f => ring.some(i => f[i].b > 50))).toBe(true);
    }
  });
});

describe('chases', () => {
  it('Chase lights exactly one fixture per ring and walks around it', () => {
    const seen = { outer: new Set<number>(), inner: new Set<number>() };
    for (let step = 0; step < 12; step++) {
      const cells = run(get('Chase'), step / 6 + 0.01);
      const litOuter = OUTER.filter(i => cells[i].b > 50);
      const litInner = INNER.filter(i => cells[i].b > 50);
      expect(litOuter).toHaveLength(1);
      expect(litInner).toHaveLength(1);
      seen.outer.add(litOuter[0]);
      seen.inner.add(litInner[0]);
    }
    // A full lap visits all twelve slots of each ring — no collisions, no gaps.
    expect(seen.outer.size).toBe(12);
    expect(seen.inner.size).toBe(12);
  });

  it('Counter runs the rings in opposite directions', () => {
    const posOf = (i: number) => (((GRACE.fixtures[i].angle + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
    const litAt = (t: number) => {
      const cells = run(get('Counter'), t);
      return {
        outer: posOf(OUTER.filter(i => cells[i].b > 50)[0]),
        inner: posOf(INNER.filter(i => cells[i].b > 50)[0])
      };
    };
    const a = litAt(0.01);
    const b = litAt(1 / 6 + 0.01);
    const delta = (x: number, y: number) => ((y - x) % 1 + 1) % 1;
    expect(delta(a.outer, b.outer)).toBeCloseTo(1 / 12, 4);
    expect(delta(b.inner, a.inner)).toBeCloseTo(1 / 12, 4);
  });

  it('Comet keeps one bright head with a tail behind it', () => {
    // Head exactly on an outer fixture — they sit half a slot round from 12 o'clock.
    const cells = run(get('Comet'), 1 / 6);
    const lit = OUTER.filter(i => cells[i].b > 90);
    expect(lit).toHaveLength(1);
    const tail = OUTER.filter(i => cells[i].b > 20);
    expect(tail.length).toBeGreaterThan(1);
    expect(tail.length).toBeLessThan(OUTER.length);
  });
});

describe('ring dynamics', () => {
  it('Swap trades brightness between the rings', () => {
    const a = run(get('Swap'), 0.5);
    const b = run(get('Swap'), 0.5 + Math.PI / 1.2); // half a cycle later
    expect(Math.sign(a[OUTER[0]].b - a[INNER[0]].b)).toBe(-Math.sign(b[OUTER[0]].b - b[INNER[0]].b));
  });

  it('Breathe holds the inner ring a quarter cycle behind', () => {
    const cells = run(get('Breathe'), 0);
    expect(cells[OUTER[0]].b).not.toBeCloseTo(cells[INNER[0]].b, 1);
  });

  it('Vortex twists: the rings disagree at the same angle', () => {
    const cells = run(get('Vortex'), 0.3);
    expect(cells[OUTER[0]].b).not.toBeCloseTo(cells[INNER[0]].b, 1);
  });

  it('Beacon flashes the centre first, then the rings', () => {
    const at = (t: number) => run(get('Beacon'), t);
    expect(at(0)[CENTRE[0]].b).toBeGreaterThan(at(0)[OUTER[0]].b);
    const inner = at(0.25 / 0.8);
    expect(inner[INNER[0]].b).toBeGreaterThan(inner[CENTRE[0]].b);
    const outer = at(0.5 / 0.8);
    expect(outer[OUTER[0]].b).toBeGreaterThan(outer[INNER[0]].b);
  });
});

describe('grace-28 (inner ring of four)', () => {
  const INNER4 = GRACE28.fixtures.filter(f => f.radius < 0.45).map(f => f.index);

  it('has 12 + 12 + 4', () => {
    expect(INNER4).toEqual([24, 25, 26, 27]);
  });

  it('treats the inner four as the centre in pair looks', () => {
    const cells = run(get('Core'), 0, GRACE28);
    for (const i of INNER4) expect(cells[i].b).toBe(100);
    expect(cells[12].b).toBe(75);
    expect(cells[0].b).toBe(22);
  });

  it('every pair look writes all 28 fixtures in range', () => {
    for (const l of [...graceStills(CHAPEL), ...graceMotion(CHAPEL)]) {
      const cells = run(l.code, 0.7, GRACE28);
      expect(cells).toHaveLength(28);
      for (const c of cells) {
        expect(c.b).toBeGreaterThanOrEqual(0);
        expect(c.b).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('grace gradients', () => {
  const DAWN = GRADIENTS[0];
  const all = graceGradients(DAWN);
  const gradientLook = (name: string) => {
    const l = all.find(x => x.name === name);
    if (!l) throw new Error(`no gradient look ${name}`);
    return l.code;
  };

  it('offers many palettes and looks', () => {
    expect(GRADIENTS.length).toBeGreaterThanOrEqual(12);
    expect(all.length).toBeGreaterThanOrEqual(12);
    expect(new Set(all.map(l => l.name)).size).toBe(all.length);
  });

  it.each(GRADIENTS.map(g => [g.name] as const))('%s: every look writes every fixture on 25 and 28', (name) => {
    const g = GRADIENTS.find(x => x.name === name)!;
    for (const l of graceGradients(g)) {
      for (const layout of [GRACE, GRACE28]) {
        for (const t of [0, 13.7, 61.2]) {
          const cells = run(l.code, t, layout);
          expect(cells).toHaveLength(layout.count);
          for (const c of cells) {
            expect(c.h).toBeGreaterThanOrEqual(0);
            expect(c.h).toBeLessThan(360);
            expect(c.s).toBeGreaterThanOrEqual(0);
            expect(c.s).toBeLessThanOrEqual(100);
            expect(c.b).toBeGreaterThanOrEqual(0);
            expect(c.b).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it('Wheel lays the gradient around the ring and turns a full lap in 60 s', () => {
    const t0 = run(gradientLook('Wheel'), 0);
    const hues = OUTER.map(i => t0[i].h);
    expect(new Set(hues.map(h => Math.round(h))).size).toBeGreaterThan(6);
    const lap = run(gradientLook('Wheel'), 60);
    for (const i of OUTER) expect(lap[i].h).toBeCloseTo(t0[i].h, 3);
    const quarter = run(gradientLook('Wheel'), 15);
    expect(quarter[OUTER[0]].h).not.toBeCloseTo(t0[OUTER[0]].h, 0);
  });

  it('Wheel moves slowly: a second barely changes the colour', () => {
    const a = run(gradientLook('Wheel'), 0)[OUTER[0]].h;
    const b = run(gradientLook('Wheel'), 1)[OUTER[0]].h;
    expect(Math.abs(a - b)).toBeLessThan(12);
  });

  it('Counter turns the inner ring against the outer', () => {
    const t0 = run(gradientLook('Counter'), 0);
    // 5 s is one twelfth of a lap: each ring's colours land on a neighbour,
    // the outer ring on one side and the inner ring on the other.
    const t1 = run(gradientLook('Counter'), 5);
    const step = (ring: number[], from: number) => {
      const j = ring.indexOf(from);
      const next = ring[(j + 1) % 12];
      const prev = ring[(j + 11) % 12];
      if (Math.abs(t1[from].h - t0[next].h) < 0.01) return 1;
      if (Math.abs(t1[from].h - t0[prev].h) < 0.01) return -1;
      return 0;
    };
    const outerDir = step(OUTER, OUTER[3]);
    const innerDir = step(INNER, INNER[3]);
    expect(outerDir).not.toBe(0);
    expect(innerDir).toBe(-outerDir);
  });

  it('Sweep puts opposite sides of the window on opposite ends of the band', () => {
    const cells = run(gradientLook('Sweep'), 0);
    expect(cells[OUTER[0]].h).not.toBeCloseTo(cells[OUTER[6]].h, 0);
  });

  it('Still does not move', () => {
    const a = run(gradientLook('Still'), 0);
    const b = run(gradientLook('Still'), 100);
    a.forEach((c, i) => expect(c.h).toBeCloseTo(b[i].h, 6));
  });

  it('gradientCss is a conic loop back to its first stop', () => {
    const css = gradientCss(DAWN);
    expect(css.startsWith('conic-gradient(')).toBe(true);
    expect(css).toContain('0%');
    expect(css).toContain('100%');
  });
});

describe('hsbCss', () => {
  it('maps a saturated hue and black', () => {
    expect(hsbCss([40, 100])).toBe('hsl(40 100% 50%)');
    expect(hsbCss([40, 100], 0)).toBe('hsl(40 0% 0%)');
  });
});
