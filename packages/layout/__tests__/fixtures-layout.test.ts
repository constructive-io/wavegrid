import { fixturesLayout } from '../src/generators';
import { resolveLayout } from '../src/presets';

describe('fixtures layout', () => {
  it('keeps logical order, labels and kinds, and re-centres positions', () => {
    const layout = resolveLayout({
      kind: 'fixtures',
      fixtures: [
        { x: 10, y: 10, label: 'left', kind: 'projector' },
        { x: 20, y: 10 },
        { x: 30, y: 10, label: 'right' }
      ]
    });
    expect(layout.count).toBe(3);
    expect(layout.topology).toBe('ring');
    expect(layout.hasGridCoords).toBe(false);
    expect(layout.fixtures.map((f) => f.label)).toEqual(['left', '2', 'right']);
    expect(layout.fixtures[0].kind).toBe('projector');
    expect(layout.fixtures[1].x).toBeCloseTo(0);
    expect(layout.id).toBe('fixtures-3');
  });

  it('becomes a grid when every fixture has row/col', () => {
    const layout = fixturesLayout({
      fixtures: [
        { x: 0, y: 0, row: 0, col: 0 },
        { x: 1, y: 0, row: 0, col: 1 },
        { x: 0, y: 1, row: 1, col: 0 }
      ],
      id: 'venue',
      name: 'Venue'
    });
    expect(layout.topology).toBe('grid');
    expect(layout.hasGridCoords).toBe(true);
    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.id).toBe('venue');
    expect(layout.name).toBe('Venue');
  });

  it('uses an explicit perimeter', () => {
    const layout = fixturesLayout({
      fixtures: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      perimeter: [2, 0]
    });
    expect(layout.perimeter).toEqual([2, 0]);
  });

  it('rejects malformed fixtures', () => {
    expect(() => resolveLayout({ kind: 'fixtures', fixtures: [] })).toThrow(/non-empty/);
    expect(() => fixturesLayout({ fixtures: [{ x: Number.NaN, y: 0 }] })).toThrow(/numeric/);
    expect(() => fixturesLayout({ fixtures: [{ x: 0, y: 0, kind: 'strobe' as never }] })).toThrow(/unknown kind/);
    expect(() =>
      fixturesLayout({ fixtures: [{ x: 0, y: 0, row: 0, col: 0 }, { x: 1, y: 0 }] })
    ).toThrow(/every fixture or on none/);
    expect(() => fixturesLayout({ fixtures: [{ x: 0, y: 0 }], perimeter: [3] })).toThrow(/out of range/);
  });
});
