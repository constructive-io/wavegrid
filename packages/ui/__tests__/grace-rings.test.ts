import { resolveLayout } from '@wavegrid/layout';

import { graceMotion, graceStills, hsbCss, type Look, PAIRS } from '../src/lib/grace-rings';

interface Cell {
  h: number;
  s: number;
  b: number;
}

const GRACE = resolveLayout({ preset: 'grace-cathedral' });
const AMBER = PAIRS[0];
const CHAPEL = PAIRS.find(p => p.name === 'Chapel')!;

/** A stand-in for the receiver's pattern ctx, over the real Grace geometry. */
function run(code: string, t = 0): Cell[] {
  const cells: Cell[] = GRACE.fixtures.map(() => ({ h: -1, s: -1, b: -1 }));
  const ctx = {
    count: GRACE.count,
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
      const f = GRACE.fixtures[i];
      return [f.radius, f.angle];
    },
    xy(i: number): [number, number] {
      const f = GRACE.fixtures[i];
      return [f.x, f.y];
    },
    uv(i: number): [number, number] {
      const f = GRACE.fixtures[i];
      return [f.u, f.v];
    }
  };

  const pattern = new Function('return (' + code + ');')();
  pattern.render(ctx);
  return cells;
}

const OUTER = GRACE.fixtures.filter(f => f.radius === 1).map(f => f.index);
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
    expect(OUTER.filter(i => cells[i].b > 50)).toHaveLength(4);
    // The inner ring is staggered, so each arm lands between two fixtures.
    expect(INNER.filter(i => cells[i].b > 50)).toHaveLength(8);
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
    const cells = run(get('Comet'), 1 / 3); // head on an outer fixture
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

describe('hsbCss', () => {
  it('maps a saturated hue and black', () => {
    expect(hsbCss([40, 100])).toBe('hsl(40 100% 50%)');
    expect(hsbCss([40, 100], 0)).toBe('hsl(40 0% 0%)');
  });
});
