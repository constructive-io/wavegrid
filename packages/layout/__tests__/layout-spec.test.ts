import { resolveLayout } from '../src/presets';
import { parseLayoutSpec } from '../src/layout-spec';

describe('parseLayoutSpec', () => {
  it('takes a preset id as-is', () => {
    expect(parseLayoutSpec('grid-7x7')).toEqual({ preset: 'grid-7x7' });
    expect(parseLayoutSpec(' ring-6 ')).toEqual({ preset: 'ring-6' });
  });

  it('parses each custom shorthand', () => {
    expect(parseLayoutSpec('grid:7x2')).toEqual({ kind: 'grid', cols: 7, rows: 2 });
    expect(parseLayoutSpec('ring:6')).toEqual({ kind: 'ring', count: 6 });
    expect(parseLayoutSpec('filled:25')).toEqual({ kind: 'filledRing', count: 25 });
    expect(parseLayoutSpec('annulus:25')).toEqual({ kind: 'annulus', count: 25 });
    expect(parseLayoutSpec('annulus:25@0.35')).toEqual({ kind: 'annulus', count: 25, innerRadius: 0.35 });
  });

  it('turns ring counts into evenly spaced rings, innermost 1 at the centre', () => {
    const spec = parseLayoutSpec('rings:12,8,4,1');
    expect(spec.kind).toBe('rings');
    expect(spec.rings?.map(r => r.count)).toEqual([12, 8, 4, 1]);
    expect(spec.rings?.[0].radius).toBeCloseTo(1);
    expect(spec.rings?.[3].radius).toBe(0);
    const layout = resolveLayout(spec);
    expect(layout.count).toBe(25);
    expect(layout.fixtures.filter(f => f.radius < 1e-9)).toHaveLength(1);
  });

  it('keeps a lone inner ring off-centre when it holds more than one fixture', () => {
    const spec = parseLayoutSpec('rings:16,9');
    expect(spec.rings?.[1].radius).toBeCloseTo(0.5);
    expect(resolveLayout(spec).count).toBe(25);
  });

  it('rejects nonsense with the accepted forms', () => {
    expect(() => parseLayoutSpec('')).toThrow(/Empty layout/);
    expect(() => parseLayoutSpec('nope')).toThrow(/Unknown layout/);
    expect(() => parseLayoutSpec('blob:3')).toThrow(/Unknown layout kind/);
    expect(() => parseLayoutSpec('grid:7')).toThrow(/<cols>x<rows>/);
    expect(() => parseLayoutSpec('ring:0')).toThrow(/whole number/);
    expect(() => parseLayoutSpec('annulus:25@1')).toThrow(/innerRadius/);
    expect(() => parseLayoutSpec('rings:12,x')).toThrow(/whole number/);
  });
});

describe('resolveLayout precedence', () => {
  it('an explicit kind wins over a preset merged in from the defaults', () => {
    const layout = resolveLayout({ preset: 'grid-7x7', kind: 'annulus', count: 25, innerRadius: 0.5 });
    expect(layout.topology).toBe('rings');
    expect(layout.count).toBe(25);
  });
});
