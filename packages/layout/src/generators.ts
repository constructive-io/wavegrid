import { Fixture, Layout, RingSpec, Topology } from './types';

interface RawFixture {
  x: number;
  y: number;
  row: number;
  col: number;
  label: string;
  /** Explicit concentric ring index; derived from the radius when omitted. */
  ring?: number;
}

interface FinalizeMeta {
  id: string;
  name: string;
  topology: Topology;
  cols: number;
  rows: number;
  hasGridCoords: boolean;
  perimeter: number[];
}

/**
 * Turn raw (x, y, row, col) fixtures into a finished Layout: normalize u/v to
 * the bounding box, compute polar angle/radius from the centroid, and bin a
 * concentric ring index. Fixtures are assumed to already be in logical order.
 */
function finalize(raw: RawFixture[], meta: FinalizeMeta): Layout {
  const n = raw.length;
  const xs = raw.map(f => f.x);
  const ys = raw.map(f => f.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const dists = raw.map(f => Math.hypot(f.x, f.y));
  const maxDist = Math.max(...dists) || 1;

  const fixtures: Fixture[] = raw.map((f, i) => ({
    index: i,
    u: (f.x - minX) / spanX,
    v: (f.y - minY) / spanY,
    x: f.x,
    y: f.y,
    angle: Math.atan2(f.y, f.x),
    radius: dists[i] / maxDist,
    ring: f.ring ?? Math.round(dists[i]),
    row: f.row,
    col: f.col,
    label: f.label
  }));

  return {
    id: meta.id,
    name: meta.name,
    topology: meta.topology,
    count: n,
    fixtures,
    cols: meta.cols,
    rows: meta.rows,
    hasGridCoords: meta.hasGridCoords,
    perimeter: meta.perimeter
  };
}

/** Border walk of a cols×rows grid, clockwise from the top-left. */
function gridPerimeter(cols: number, rows: number): number[] {
  if (rows === 1) return Array.from({ length: cols }, (_, c) => c);
  if (cols === 1) return Array.from({ length: rows }, (_, r) => r);
  const out: number[] = [];
  for (let c = 0; c < cols; c++) out.push(c);
  for (let r = 1; r < rows; r++) out.push(r * cols + (cols - 1));
  for (let c = cols - 2; c >= 0; c--) out.push((rows - 1) * cols + c);
  for (let r = rows - 2; r >= 1; r--) out.push(r * cols);
  return out;
}

export interface GridParams {
  cols: number;
  rows: number;
  id?: string;
  name?: string;
}

export function gridLayout({ cols, rows, id, name }: GridParams): Layout {
  if (cols < 1 || rows < 1) throw new Error('gridLayout requires cols >= 1 and rows >= 1');
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const raw: RawFixture[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      raw.push({ x: c - cx, y: r - cy, row: r, col: c, label: `${r}:${c}` });
    }
  }
  return finalize(raw, {
    id: id ?? `grid-${cols}x${rows}`,
    name: name ?? `${cols}×${rows} grid`,
    topology: 'grid',
    cols,
    rows,
    hasGridCoords: true,
    perimeter: gridPerimeter(cols, rows)
  });
}

export interface RingParams {
  count: number;
  id?: string;
  name?: string;
}

export function ringLayout({ count, id, name }: RingParams): Layout {
  if (count < 1) throw new Error('ringLayout requires count >= 1');
  const raw: RawFixture[] = [];
  for (let i = 0; i < count; i++) {
    // Start at 12 o'clock, go clockwise.
    const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
    raw.push({ x: Math.cos(angle), y: Math.sin(angle), row: -1, col: -1, label: `${i + 1}` });
  }
  return finalize(raw, {
    id: id ?? `ring-${count}`,
    name: name ?? `${count}-cannon ring`,
    topology: 'ring',
    cols: 0,
    rows: 0,
    hasGridCoords: false,
    perimeter: Array.from({ length: count }, (_, i) => i)
  });
}

interface DiscCell {
  r: number;
  c: number;
  dist: number;
}

/** Cells of a d×d grid whose center lies within the inscribed circle. */
function discCells(diameter: number): DiscCell[] {
  const center = (diameter - 1) / 2;
  const radius = diameter / 2;
  const cells: DiscCell[] = [];
  for (let r = 0; r < diameter; r++) {
    for (let c = 0; c < diameter; c++) {
      const dist = Math.hypot(r - center, c - center);
      if (dist <= radius + 1e-9) cells.push({ r, c, dist });
    }
  }
  return cells;
}

export interface FilledRingParams {
  count: number;
  id?: string;
  name?: string;
}

/**
 * A filled disc modeled as a grid with a circular mask — the user's insight
 * that "the filled circle really is a grid with some disabled". We grow the
 * bounding grid until the inscribed disc holds at least `count` cells, then
 * keep the `count` cells closest to the center (so the shape stays a disc and
 * the count is exact). Fixtures keep grid row/col, so grid-space transforms and
 * row/col animations still work.
 */
export function filledRingLayout({ count, id, name }: FilledRingParams): Layout {
  if (count < 1) throw new Error('filledRingLayout requires count >= 1');

  let diameter = 1;
  let cells = discCells(diameter);
  while (cells.length < count) {
    diameter += 1;
    cells = discCells(diameter);
  }

  // Keep the `count` cells nearest the center; deterministic tie-break.
  cells.sort((a, b) => a.dist - b.dist || a.r - b.r || a.c - b.c);
  const kept = cells.slice(0, count);

  // Emit in row-major order so logical traversal matches a grid.
  kept.sort((a, b) => a.r - b.r || a.c - b.c);

  const center = (diameter - 1) / 2;
  const raw: RawFixture[] = kept.map(cell => ({
    x: cell.c - center,
    y: cell.r - center,
    row: cell.r,
    col: cell.c,
    label: `${cell.r}:${cell.c}`
  }));

  const layout = finalize(raw, {
    id: id ?? `ring-${count}-filled`,
    name: name ?? `${count}-cannon filled ring`,
    topology: 'filledRing',
    cols: diameter,
    rows: diameter,
    hasGridCoords: true,
    perimeter: []
  });

  // Perimeter = outermost ring, ordered by angle.
  const maxRing = Math.max(...layout.fixtures.map(f => f.ring));
  layout.perimeter = layout.fixtures
    .filter(f => f.ring === maxRing)
    .sort((a, b) => a.angle - b.angle)
    .map(f => f.index);

  return layout;
}

export interface RingsParams {
  rings: RingSpec[];
  id?: string;
  name?: string;
}

/**
 * Concentric rings — the general round layout. One ring is a plain ring; a ring
 * plus a smaller one inside it is an annulus (a ring with a hole in the middle);
 * rings all the way in to a centre fixture is a symmetric disc. Radii are
 * relative (only their ratios matter), a radius of 0 is the centre fixture.
 *
 * Fixtures are emitted outermost ring first, each clockwise from 12 o'clock, so
 * shard slices and light maps stay contiguous per ring. There are no grid
 * coordinates — `radius`/`angle`/`ring` are the meaningful axes here.
 */
export function ringsLayout({ rings, id, name }: RingsParams): Layout {
  if (rings.length < 1) throw new Error('ringsLayout requires at least one ring');
  for (const ring of rings) {
    if (!Number.isInteger(ring.count) || ring.count < 1) {
      throw new Error(`ringsLayout requires an integer count >= 1 per ring, got ${ring.count}`);
    }
    if (!Number.isFinite(ring.radius) || ring.radius < 0) {
      throw new Error(`ringsLayout requires a radius >= 0 per ring, got ${ring.radius}`);
    }
    if (ring.radius === 0 && ring.count !== 1) {
      throw new Error('ringsLayout: the centre ring (radius 0) must have count 1');
    }
  }
  const radii = rings.map(r => r.radius);
  if (new Set(radii).size !== radii.length) {
    throw new Error('ringsLayout requires a distinct radius per ring');
  }
  if (Math.max(...radii) <= 0) throw new Error('ringsLayout requires at least one ring with radius > 0');

  // Outermost first; ring index counts from the inside out (0 = innermost).
  const outerFirst = [...rings].sort((a, b) => b.radius - a.radius);
  const ringIndexOf = (radius: number) => radii.filter(r => r < radius).length;

  const raw: RawFixture[] = [];
  for (let k = 0; k < outerFirst.length; k++) {
    const { count, radius, phase = 0 } = outerFirst[k];
    const offset = (phase * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      // Start at 12 o'clock, go clockwise — same convention as ringLayout.
      const angle = -Math.PI / 2 + offset + (i / count) * Math.PI * 2;
      raw.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        row: -1,
        col: -1,
        ring: ringIndexOf(radius),
        label: `${k + 1}:${i + 1}`
      });
    }
  }

  const total = raw.length;
  const counts = outerFirst.map(r => r.count).join('+');
  return finalize(raw, {
    id: id ?? `rings-${counts}`,
    name: name ?? `${total}-cannon rings (${counts})`,
    topology: 'rings',
    cols: 0,
    rows: 0,
    hasGridCoords: false,
    perimeter: Array.from({ length: outerFirst[0].count }, (_, i) => i)
  });
}

/**
 * Spread `count` fixtures over concentric rings between `innerRadius` and the
 * outer edge, keeping the spacing along a ring close to the spacing between
 * rings. `innerRadius: 0` gives a symmetric disc (the innermost ring is the
 * centre fixture); anything higher leaves a hole in the middle.
 */
export interface AnnulusParams {
  count: number;
  /** Radius of the hole, 0..1. Default 0.5. */
  innerRadius?: number;
  id?: string;
  name?: string;
}

export function annulusLayout({ count, innerRadius = 0.5, id, name }: AnnulusParams): Layout {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`annulusLayout requires an integer count >= 1, got ${count}`);
  }
  if (!Number.isFinite(innerRadius) || innerRadius < 0 || innerRadius >= 1) {
    throw new Error(`annulusLayout requires 0 <= innerRadius < 1, got ${innerRadius}`);
  }

  const hollow = innerRadius > 0;
  const label = hollow ? 'annulus' : 'disc';
  return ringsLayout({
    rings: annulusRings(count, innerRadius),
    id: id ?? `${label}-${count}`,
    name: name ?? `${count}-cannon ${label}`
  });
}

/**
 * Pick the rings for an annulus: the area per fixture gives an ideal spacing,
 * which fixes how many rings fit across the band; each ring then takes a share
 * of the count proportional to its circumference. Alternate rings are staggered
 * by half a step so fixtures interleave instead of lining up radially.
 */
function annulusRings(count: number, innerRadius: number): RingSpec[] {
  const area = Math.PI * (1 - innerRadius * innerRadius);
  const spacing = Math.sqrt(area / count);
  const band = 1 - innerRadius;
  const ringCount = Math.max(1, Math.min(count, Math.round(band / spacing) + 1));

  const radii = ringCount === 1
    ? [1]
    : Array.from({ length: ringCount }, (_, j) => 1 - (j * band) / (ringCount - 1));

  const counts = share(count, radii);
  return radii.map((radius, j) => ({
    radius,
    count: counts[j],
    phase: j % 2 === 1 ? 180 / counts[j] : 0
  }));
}

/** Split `count` across rings in proportion to their radius, each ring >= 1. */
function share(count: number, radii: number[]): number[] {
  const sum = radii.reduce((a, r) => a + r, 0);
  const exact = radii.map(r => (sum > 0 ? (count * r) / sum : 0));
  const alloc = exact.map(e => Math.max(1, Math.floor(e)));

  const total = () => alloc.reduce((a, n) => a + n, 0);
  while (total() < count) {
    let best = 0;
    for (let i = 1; i < alloc.length; i++) {
      if (exact[i] - alloc[i] > exact[best] - alloc[best]) best = i;
    }
    alloc[best]++;
  }
  while (total() > count) {
    let best = -1;
    for (let i = 0; i < alloc.length; i++) {
      if (alloc[i] <= 1) continue;
      if (best === -1 || alloc[i] - exact[i] > alloc[best] - exact[best]) best = i;
    }
    if (best === -1) break;
    alloc[best]--;
  }
  return alloc;
}
