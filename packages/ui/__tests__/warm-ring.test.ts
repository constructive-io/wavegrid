import {
  AMBER_HUE,
  LEVELS,
  TINTS,
  tintCss,
  tintPalette,
  warmFlat,
  warmMotionCode,
  warmStillCode,
  type Wrapper
} from '../src/lib/warm-ring';

/**
 * The nova tab's own wrapper, minus the colour interpolation the warm looks
 * don't use: enough for the generated source to run here.
 */
const wrap: Wrapper = (name, body, colorsCode) => `(function(){
${colorsCode}
function ringPos(ctx, i) {
  var ang = ctx.polar(i)[1];
  return ((ang / (Math.PI * 2)) % 1 + 1) % 1;
}
return { render: function(ctx) {
${body}
}, meta: { name: '${name}' } };
})()`;

interface Cell {
  h: number;
  s: number;
  b: number;
}

const RING = 6;

/** A stand-in for the receiver's pattern ctx over a ring of six. */
function run(code: string, t = 0): Cell[] {
  const cells: Cell[] = Array.from({ length: RING }, () => ({ h: -1, s: -1, b: -1 }));
  const ctx = {
    count: RING,
    cols: RING,
    rows: 1,
    frame: Math.round(t * 60),
    t,
    set(i: number, h: number, s: number, b: number) {
      cells[i] = { h, s, b };
    },
    fill(h: number, s: number, b: number) {
      for (let i = 0; i < RING; i++) cells[i] = { h, s, b };
    },
    // Ring of six starting at 12 o'clock, matching @wavegrid/layout.
    polar(i: number): [number, number] {
      const angle = -Math.PI / 2 + (i / RING) * Math.PI * 2;
      return [1, angle];
    },
    uv: (i: number): [number, number] => [i / RING, 0]
  };
  // eslint-disable-next-line no-eval
  const pattern = eval(code) as { render(c: typeof ctx): void };
  pattern.render(ctx);
  return cells;
}

function allLooks(sat: number): Record<string, string> {
  const stills = warmStillCode(wrap, sat);
  const motion = warmMotionCode(wrap, sat);
  return {
    solid: warmFlat(wrap, 'amber', sat, 100),
    glow: warmFlat(wrap, 'amber-glow', sat, 45),
    ...stills,
    ...motion
  };
}

describe('white ↔ amber tints', () => {
  it('runs white to amber on the amber hue', () => {
    expect(TINTS.map((t) => t.sat)).toEqual([0, 25, 50, 75, 100]);
    expect(TINTS[0].name).toBe('White');
    expect(TINTS[TINTS.length - 1].name).toBe('Amber');
  });

  it('bakes the tint into the palette', () => {
    expect(tintPalette(0)).toContain(`[[${AMBER_HUE},0,100]]`);
    expect(tintPalette(60)).toContain(`[[${AMBER_HUE},60,100]]`);
  });

  it('renders white as unsaturated and amber as warm', () => {
    expect(tintCss(0)).toBe(`hsl(${AMBER_HUE} 0% 100%)`);
    expect(tintCss(100)).toBe(`hsl(${AMBER_HUE} 100% 50%)`);
  });
});

describe('warm ring looks', () => {
  for (const { name, sat } of TINTS) {
    describe(`${name} (sat ${sat})`, () => {
      const looks = allLooks(sat);

      it('keeps every look on the amber hue at the chosen tint', () => {
        for (const [look, code] of Object.entries(looks)) {
          for (const cell of run(code, 0.5)) {
            expect({ look, ...cell }).toMatchObject({ look, h: AMBER_HUE, s: sat });
            expect(cell.b).toBeGreaterThanOrEqual(0);
            expect(cell.b).toBeLessThanOrEqual(100);
          }
        }
      });

      it('lights every laser of the ring', () => {
        for (const [look, code] of Object.entries(looks)) {
          expect(run(code, 0.5).map(() => look)).toHaveLength(RING);
          expect(run(code, 0.5).every((c) => c.b >= 0)).toBe(true);
        }
      });
    });
  }

  it('varies brightness across the ring where the look says it should', () => {
    const looks = allLooks(100);
    for (const key of ['alternate', 'ramp', 'horizon'] as const) {
      const brights = new Set(run(looks[key]).map((c) => c.b));
      expect(brights.size).toBeGreaterThan(1);
    }
  });

  it('moves over time', () => {
    const looks = allLooks(100);
    for (const key of ['chase', 'levels', 'heartbeat', 'embers'] as const) {
      const a = run(looks[key], 0).map((c) => c.b);
      const b = run(looks[key], 0.6).map((c) => c.b);
      expect(a).not.toEqual(b);
    }
  });

  it('chases one laser at a time around the ring', () => {
    const chase = allLooks(100).chase;
    const lit = new Set<number>();
    for (let step = 0; step < RING; step++) {
      const cells = run(chase, step / 4);
      const bright = cells.map((c, i) => [i, c.b] as const).filter(([, b]) => b > 50);
      expect(bright).toHaveLength(1);
      lit.add(bright[0][0]);
    }
    expect(lit.size).toBe(RING);
  });

  it('gives the ramp one brightness level per laser', () => {
    const brights = run(allLooks(100).ramp).map((c) => c.b);
    expect(new Set(brights).size).toBe(RING);
    expect([...brights].sort((a, b) => b - a)).toEqual([...LEVELS].sort((a, b) => b - a));
  });
});
