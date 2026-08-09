/**
 * Light-map helpers — the physical-correction layer.
 *
 * A light map is `physicalLights[logicalIndex] = physicalIndex`: to display the
 * animation's logical fixture L, the receiver drives physical output
 * `physicalLights[L]`. **Identity (`physicalLights[i] = i`) is the default** — a
 * healthy install needs no light map at all. The map exists purely to correct a
 * mismatch between the animation's logical order and how the lasers are actually
 * wired, which is why it lives in the debug panel.
 *
 * Every consumer (receiver, server `/api/light-map`, desktop debugger) normalizes
 * the same way and reads/writes the same `WG_STATE_DIR/light-map.json`.
 */
import type { Layout } from './types';

/** The do-nothing map: `[0, 1, 2, …, count-1]`. */
export function identityMap(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/** True when `map` is exactly the identity permutation (no correction). */
export function isIdentityMap(map: readonly number[]): boolean {
  return map.every((value, index) => value === index);
}

/**
 * Coerce arbitrary input into a valid permutation of `0..count-1`:
 * reject non-integers / out-of-range / duplicates, then back-fill any holes
 * from the unused indices (identity order). Overlong input is truncated.
 */
export function normalizeLightMap(
  source: readonly unknown[] | null | undefined,
  count: number
): number[] {
  const fallback = identityMap(count);
  const input = Array.isArray(source) ? source : fallback;
  const used = new Set<number>();

  const physicalLights: number[] = input.slice(0, count).map((value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n >= count || used.has(n)) return -1;
    used.add(n);
    return n;
  });

  for (let index = 0; index < count; index++) {
    if (physicalLights[index] !== undefined && physicalLights[index] >= 0) continue;
    const next = fallback.find((value) => !used.has(value));
    physicalLights[index] = next ?? index;
    used.add(physicalLights[index]);
  }

  return physicalLights;
}

/** A deterministic auto-map heuristic. */
export interface AutoMapStrategy {
  id: string;
  label: string;
  description: string;
  /** True when this strategy is meaningful for the given layout. */
  applies: (layout: Layout) => boolean;
  /** Produce the candidate `physicalLights[]` permutation. */
  build: (layout: Layout) => number[];
}

/** Row-major physical slot for a grid cell. */
function slot(row: number, col: number, cols: number): number {
  return row * cols + col;
}

/**
 * For each logical fixture, map it (via a grid-space transform of its row/col) to
 * the physical output that physically sits there. Falls back to identity for any
 * fixture without grid coords.
 */
function gridTransform(
  layout: Layout,
  transform: (row: number, col: number, rows: number, cols: number) => [number, number]
): number[] {
  const { cols, rows, count } = layout;
  const map = identityMap(count);
  for (const f of layout.fixtures) {
    if (f.row < 0 || f.col < 0) continue;
    const [r2, c2] = transform(f.row, f.col, rows, cols);
    map[f.index] = slot(r2, c2, cols);
  }
  return normalizeLightMap(map, count);
}

const isFullGrid = (l: Layout): boolean => l.hasGridCoords && l.cols * l.rows === l.count;
const isSquareGrid = (l: Layout): boolean => isFullGrid(l) && l.cols === l.rows;
const isPolar = (l: Layout): boolean => !l.hasGridCoords && l.count > 1;
const ringCount = (l: Layout): number => new Set(l.fixtures.map((f) => f.ring)).size;

/** Fixtures grouped by ring, outermost ring first, each in layout order. */
function ringGroups(layout: Layout): number[][] {
  const rings = [...new Set(layout.fixtures.map((f) => f.ring))].sort((a, b) => b - a);
  return rings.map((ring) => layout.fixtures.filter((f) => f.ring === ring).map((f) => f.index));
}

/** Map each logical fixture to the physical slot at the same spot in `order`. */
function reorder(layout: Layout, order: number[]): number[] {
  const map = identityMap(layout.count);
  order.forEach((logical, physical) => {
    map[logical] = physical;
  });
  return normalizeLightMap(map, layout.count);
}

export const autoMapStrategies: AutoMapStrategy[] = [
  {
    id: 'identity',
    label: 'Identity (no correction)',
    description: 'Logical order = physical order. The default — clears any remap.',
    applies: () => true,
    build: (l) => identityMap(l.count)
  },
  {
    id: 'reverse',
    label: 'Reverse (last ↔ first)',
    description: 'Physical wiring runs in the opposite order to the logical index.',
    applies: () => true,
    build: (l) => identityMap(l.count).map((_, i) => l.count - 1 - i)
  },
  {
    id: 'flipH',
    label: 'Flip horizontal (mirror columns)',
    description: 'Each row is wired left-to-right reversed.',
    applies: (l) => l.hasGridCoords && l.cols > 1,
    build: (l) => gridTransform(l, (r, c, _rows, cols) => [r, cols - 1 - c])
  },
  {
    id: 'flipV',
    label: 'Flip vertical (mirror rows)',
    description: 'Rows are wired top-to-bottom reversed.',
    applies: (l) => l.hasGridCoords && l.rows > 1,
    build: (l) => gridTransform(l, (r, c, rows) => [rows - 1 - r, c])
  },
  {
    id: 'rotate180',
    label: 'Rotate 180°',
    description: 'The whole grid is mounted upside-down.',
    applies: (l) => l.hasGridCoords && (l.rows > 1 || l.cols > 1),
    build: (l) => gridTransform(l, (r, c, rows, cols) => [rows - 1 - r, cols - 1 - c])
  },
  {
    id: 'serpentine',
    label: 'Serpentine (boustrophedon rows)',
    description: 'Wiring snakes: odd rows run right-to-left.',
    applies: (l) => l.hasGridCoords && l.cols > 1,
    build: (l) => gridTransform(l, (r, c, _rows, cols) => [r, r % 2 === 0 ? c : cols - 1 - c])
  },
  {
    id: 'columnMajor',
    label: 'Column-major',
    description: 'Wired down each column before moving to the next column.',
    applies: isFullGrid,
    build: (l) => {
      const { rows, count } = l;
      const map = identityMap(count);
      for (const f of l.fixtures) {
        if (f.row < 0 || f.col < 0) continue;
        map[f.index] = f.col * rows + f.row;
      }
      return normalizeLightMap(map, count);
    }
  },
  {
    id: 'rotate90',
    label: 'Rotate 90° clockwise',
    description: 'Square grid mounted a quarter-turn clockwise.',
    applies: isSquareGrid,
    build: (l) => gridTransform(l, (r, c, rows) => [c, rows - 1 - r])
  },
  {
    id: 'rotate270',
    label: 'Rotate 90° counter-clockwise',
    description: 'Square grid mounted a quarter-turn counter-clockwise.',
    applies: isSquareGrid,
    build: (l) => gridTransform(l, (r, c, _rows, cols) => [cols - 1 - c, r])
  },
  {
    id: 'ringCounterClockwise',
    label: 'Rings wired counter-clockwise',
    description: 'Each ring is wired the other way round from 12 o’clock.',
    applies: isPolar,
    build: (l) => reorder(l, ringGroups(l).flatMap((ring) => [ring[0], ...ring.slice(1).reverse()]))
  },
  {
    id: 'ringsInnerFirst',
    label: 'Innermost ring first',
    description: 'Wiring starts at the centre and works outwards.',
    applies: (l) => isPolar(l) && ringCount(l) > 1,
    build: (l) => reorder(l, ringGroups(l).reverse().flat())
  }
];

/** The strategies that make sense for a given layout, in menu order. */
export function availableStrategies(layout: Layout): AutoMapStrategy[] {
  return autoMapStrategies.filter((s) => s.applies(layout));
}

/** Build a candidate map by strategy id, or identity if the id is unknown. */
export function autoMap(layout: Layout, strategyId: string): number[] {
  const strategy = autoMapStrategies.find((s) => s.id === strategyId);
  return strategy ? strategy.build(layout) : identityMap(layout.count);
}
