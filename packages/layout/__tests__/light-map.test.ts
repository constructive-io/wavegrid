import {
  autoMap,
  autoMapStrategies,
  availableStrategies,
  identityMap,
  isIdentityMap,
  normalizeLightMap
} from '../src/light-map';
import { resolveLayout } from '../src/presets';
import type { Layout } from '../src/types';

const grid7x7 = (): Layout => resolveLayout({ preset: 'grid-7x7' });
const grid7x2 = (): Layout => resolveLayout({ kind: 'grid', cols: 7, rows: 2 });
const ring6 = (): Layout => resolveLayout({ preset: 'ring-6' });
const hollow25 = (): Layout => resolveLayout({ preset: 'ring-25-hollow' });

const isPermutation = (map: number[], count: number): boolean => {
  if (map.length !== count) return false;
  return new Set(map).size === count && map.every((v) => v >= 0 && v < count);
};

describe('identity + normalize', () => {
  it('identityMap is [0..count-1]', () => {
    expect(identityMap(4)).toEqual([0, 1, 2, 3]);
    expect(isIdentityMap([0, 1, 2, 3])).toBe(true);
    expect(isIdentityMap([1, 0, 2, 3])).toBe(false);
  });

  it('defaults missing input to identity', () => {
    expect(normalizeLightMap(null, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('preserves a valid permutation', () => {
    expect(normalizeLightMap([2, 0, 1], 3)).toEqual([2, 0, 1]);
  });

  it('repairs duplicates and out-of-range by back-filling holes', () => {
    const out = normalizeLightMap([0, 0, 9, -1], 4);
    expect(isPermutation(out, 4)).toBe(true);
    expect(out[0]).toBe(0);
  });

  it('truncates overlong input', () => {
    expect(normalizeLightMap([0, 1, 2, 3, 4], 3)).toHaveLength(3);
  });
});

describe('auto-map heuristics', () => {
  it('every strategy yields a valid permutation on a 7x7 grid', () => {
    const layout = grid7x7();
    for (const s of autoMapStrategies) {
      if (!s.applies(layout)) continue;
      expect(isPermutation(s.build(layout), layout.count)).toBe(true);
    }
  });

  it('identity strategy is the identity map', () => {
    expect(autoMap(grid7x7(), 'identity')).toEqual(identityMap(49));
  });

  it('reverse strategy reverses the order', () => {
    expect(autoMap(ring6(), 'reverse')).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('flipH mirrors columns within each row (7x2)', () => {
    // row 0 logical 0..6 -> physical 6..0; row 1 logical 7..13 -> physical 13..7
    const map = autoMap(grid7x2(), 'flipH');
    expect(map.slice(0, 7)).toEqual([6, 5, 4, 3, 2, 1, 0]);
    expect(map.slice(7, 14)).toEqual([13, 12, 11, 10, 9, 8, 7]);
  });

  it('flipV mirrors rows (7x2)', () => {
    // row 0 <-> row 1: logical 0 -> physical 7, logical 7 -> physical 0
    const map = autoMap(grid7x2(), 'flipV');
    expect(map[0]).toBe(7);
    expect(map[7]).toBe(0);
  });

  it('columnMajor walks down columns (7x2)', () => {
    // logical (r,c) -> c*rows + r; logical 1 = (0,1) -> 1*2+0 = 2
    const map = autoMap(grid7x2(), 'columnMajor');
    expect(isPermutation(map, 14)).toBe(true);
    expect(map[1]).toBe(2);
  });

  it('rotate90 only offered for square grids', () => {
    expect(availableStrategies(grid7x7()).some((s) => s.id === 'rotate90')).toBe(true);
    expect(availableStrategies(grid7x2()).some((s) => s.id === 'rotate90')).toBe(false);
  });

  it('a single ring gets the order strategies, not the grid ones', () => {
    const ids = availableStrategies(ring6()).map((s) => s.id);
    expect(ids).toEqual(['identity', 'reverse', 'ringCounterClockwise']);
  });

  it('concentric rings also offer innermost-first', () => {
    const ids = availableStrategies(hollow25()).map((s) => s.id);
    expect(ids).toEqual(['identity', 'reverse', 'ringCounterClockwise', 'ringsInnerFirst']);
  });

  it('ringCounterClockwise reverses each ring but keeps its 12 o\u2019clock start', () => {
    const map = autoMap(ring6(), 'ringCounterClockwise');
    expect(isPermutation(map, 6)).toBe(true);
    expect(map[0]).toBe(0);
    expect(map[1]).toBe(5);
    expect(map[5]).toBe(1);
  });

  it('ringsInnerFirst drives the centre from physical output 0', () => {
    const layout = hollow25();
    const map = autoMap(layout, 'ringsInnerFirst');
    expect(isPermutation(map, layout.count)).toBe(true);
    const innermost = layout.fixtures.filter((f) => f.ring === 0).map((f) => f.index);
    expect(innermost.map((i) => map[i])).toEqual(innermost.map((_, slot) => slot));
    // the outermost ring lands at the end
    expect(map[0]).toBe(layout.count - layout.perimeter.length);
  });

  it('unknown strategy id falls back to identity', () => {
    expect(autoMap(ring6(), 'nope')).toEqual(identityMap(6));
  });
});
