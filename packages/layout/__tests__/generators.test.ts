import { annulusLayout, filledRingLayout, gridLayout, ringLayout, ringsLayout } from '../src/generators';

describe('gridLayout', () => {
  it('creates a row-major grid with correct count and grid coords', () => {
    const layout = gridLayout({ cols: 7, rows: 2 });
    expect(layout.topology).toBe('grid');
    expect(layout.count).toBe(14);
    expect(layout.cols).toBe(7);
    expect(layout.rows).toBe(2);
    expect(layout.hasGridCoords).toBe(true);
    expect(layout.fixtures).toHaveLength(14);
    // index 8 => row 1, col 1
    expect(layout.fixtures[8].row).toBe(1);
    expect(layout.fixtures[8].col).toBe(1);
    // indices are contiguous
    layout.fixtures.forEach((f, i) => expect(f.index).toBe(i));
  });

  it('normalizes u/v across the bounding box', () => {
    const layout = gridLayout({ cols: 7, rows: 7 });
    expect(layout.fixtures[0].u).toBeCloseTo(0);
    expect(layout.fixtures[0].v).toBeCloseTo(0);
    expect(layout.fixtures[48].u).toBeCloseTo(1);
    expect(layout.fixtures[48].v).toBeCloseTo(1);
  });

  it('walks the perimeter of a 7×7 grid (24 border cells)', () => {
    const layout = gridLayout({ cols: 7, rows: 7 });
    expect(layout.perimeter).toHaveLength(24);
    expect(layout.perimeter[0]).toBe(0);
    // interior cell 24 (center) is never on the perimeter
    expect(layout.perimeter).not.toContain(24);
  });

  it('throws on degenerate dimensions', () => {
    expect(() => gridLayout({ cols: 0, rows: 3 })).toThrow();
  });
});

describe('ringLayout', () => {
  it('places count fixtures on a unit circle with no grid coords', () => {
    const layout = ringLayout({ count: 6 });
    expect(layout.topology).toBe('ring');
    expect(layout.count).toBe(6);
    expect(layout.hasGridCoords).toBe(false);
    expect(layout.cols).toBe(0);
    expect(layout.rows).toBe(0);
    layout.fixtures.forEach(f => {
      expect(f.row).toBe(-1);
      expect(f.col).toBe(-1);
      expect(f.radius).toBeCloseTo(1);
    });
  });

  it('starts at 12 o’clock and goes clockwise', () => {
    const layout = ringLayout({ count: 4 });
    // first fixture at top: x≈0, y≈-1
    expect(layout.fixtures[0].x).toBeCloseTo(0);
    expect(layout.fixtures[0].y).toBeCloseTo(-1);
  });

  it('perimeter is every fixture in order', () => {
    const layout = ringLayout({ count: 6 });
    expect(layout.perimeter).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('filledRingLayout', () => {
  it('produces exactly count fixtures with grid coords', () => {
    const layout = filledRingLayout({ count: 25 });
    expect(layout.topology).toBe('filledRing');
    expect(layout.count).toBe(25);
    expect(layout.hasGridCoords).toBe(true);
    expect(layout.fixtures).toHaveLength(25);
    // bounding grid is square and large enough to hold the disc
    expect(layout.cols).toBe(layout.rows);
    layout.fixtures.forEach(f => {
      expect(f.row).toBeGreaterThanOrEqual(0);
      expect(f.col).toBeGreaterThanOrEqual(0);
      expect(f.row).toBeLessThan(layout.rows);
      expect(f.col).toBeLessThan(layout.cols);
    });
  });

  it('emits fixtures in row-major order', () => {
    const layout = filledRingLayout({ count: 25 });
    for (let i = 1; i < layout.fixtures.length; i++) {
      const prev = layout.fixtures[i - 1];
      const cur = layout.fixtures[i];
      const prevKey = prev.row * layout.cols + prev.col;
      const curKey = cur.row * layout.cols + cur.col;
      expect(curKey).toBeGreaterThan(prevKey);
    }
  });

  it('perimeter is a non-empty subset on the outer ring', () => {
    const layout = filledRingLayout({ count: 25 });
    expect(layout.perimeter.length).toBeGreaterThan(0);
    expect(layout.perimeter.length).toBeLessThanOrEqual(layout.count);
  });
});

describe('ringsLayout', () => {
  it('emits rings outermost first, each clockwise from 12 o’clock', () => {
    const layout = ringsLayout({ rings: [{ count: 4, radius: 0.5 }, { count: 8, radius: 1 }] });
    expect(layout.topology).toBe('rings');
    expect(layout.count).toBe(12);
    expect(layout.hasGridCoords).toBe(false);
    expect(layout.cols).toBe(0);
    // outer ring (8) first
    expect(layout.fixtures.slice(0, 8).every(f => f.radius > 0.9)).toBe(true);
    expect(layout.fixtures.slice(8).every(f => f.radius < 0.6)).toBe(true);
    expect(layout.fixtures[0].x).toBeCloseTo(0);
    expect(layout.fixtures[0].y).toBeCloseTo(-1);
    expect(layout.fixtures[1].x).toBeGreaterThan(0);
  });

  it('indexes rings from the inside out and takes the outer ring as perimeter', () => {
    const layout = ringsLayout({ rings: [{ count: 1, radius: 0 }, { count: 6, radius: 1 }, { count: 3, radius: 0.5 }] });
    expect(layout.count).toBe(10);
    expect(layout.perimeter).toEqual([0, 1, 2, 3, 4, 5]);
    const centre = layout.fixtures[layout.count - 1];
    expect(centre.ring).toBe(0);
    expect(centre.radius).toBeCloseTo(0);
    expect(layout.fixtures[0].ring).toBe(2);
  });

  it('phase rotates a ring', () => {
    const straight = ringsLayout({ rings: [{ count: 4, radius: 1 }] });
    const turned = ringsLayout({ rings: [{ count: 4, radius: 1, phase: 45 }] });
    expect(turned.fixtures[0].x).toBeCloseTo(Math.SQRT1_2);
    expect(straight.fixtures[0].x).toBeCloseTo(0);
  });

  it('rejects malformed rings', () => {
    expect(() => ringsLayout({ rings: [] })).toThrow(/at least one ring/);
    expect(() => ringsLayout({ rings: [{ count: 0, radius: 1 }] })).toThrow(/count >= 1/);
    expect(() => ringsLayout({ rings: [{ count: 2, radius: 0 }] })).toThrow(/centre ring/);
    expect(() => ringsLayout({ rings: [{ count: 2, radius: 1 }, { count: 3, radius: 1 }] })).toThrow(/distinct radius/);
  });
});

describe('annulusLayout', () => {
  it('spreads the count over concentric rings, leaving a hole', () => {
    const layout = annulusLayout({ count: 25, innerRadius: 0.5 });
    expect(layout.topology).toBe('rings');
    expect(layout.count).toBe(25);
    // nothing inside the hole
    layout.fixtures.forEach(f => expect(f.radius).toBeGreaterThanOrEqual(0.5 - 1e-9));
    // more than one ring, so it is not just a plain ring
    expect(new Set(layout.fixtures.map(f => f.ring)).size).toBeGreaterThan(1);
  });

  it('is symmetric: every ring is evenly spaced', () => {
    const layout = annulusLayout({ count: 25, innerRadius: 0.5 });
    const byRing = new Map<number, number[]>();
    layout.fixtures.forEach(f => byRing.set(f.ring, [...(byRing.get(f.ring) ?? []), f.angle]));
    for (const angles of byRing.values()) {
      if (angles.length < 3) continue;
      const sorted = [...angles].sort((a, b) => a - b);
      const gaps = sorted.slice(1).map((a, i) => a - sorted[i]);
      const expected = (Math.PI * 2) / angles.length;
      gaps.forEach(g => expect(g).toBeCloseTo(expected, 5));
    }
  });

  it('innerRadius 0 puts a single fixture at the centre (symmetric disc)', () => {
    const layout = annulusLayout({ count: 25, innerRadius: 0 });
    const centres = layout.fixtures.filter(f => f.radius < 1e-9);
    expect(centres).toHaveLength(1);
    expect(layout.count).toBe(25);
  });

  it('hits the exact count for every size', () => {
    for (let n = 1; n <= 80; n++) {
      expect(annulusLayout({ count: n, innerRadius: 0.5 }).count).toBe(n);
      expect(annulusLayout({ count: n, innerRadius: 0 }).count).toBe(n);
    }
  });

  it('rejects a bad count or innerRadius', () => {
    expect(() => annulusLayout({ count: 0 })).toThrow(/count >= 1/);
    expect(() => annulusLayout({ count: 10, innerRadius: 1 })).toThrow(/innerRadius/);
    expect(() => annulusLayout({ count: 10, innerRadius: -0.1 })).toThrow(/innerRadius/);
  });
});
