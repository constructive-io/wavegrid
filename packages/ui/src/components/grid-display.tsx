import { useCallback, useEffect, useRef } from 'react';

import type { CannonColor, Orientation } from '@/lib/use-socket';

export type GridMode = 'paint' | 'gradient' | 'drops' | 'scenes' | 'animations' | 'audio' | 'video' | 'flags' | 'pride' | 'usa' | 'nova' | 'grace' | 'patterns' | 'playlist' | 'sequences' | 'debug';

export interface FixturePos {
  u: number;
  v: number;
}

interface GridDisplayProps {
  grid: CannonColor[];
  columns: number;
  /**
   * Normalized fixture positions (u,v in 0..1) from the resolved layout.
   * When present, orbs are drawn and hit-tested at their true positions so
   * rings render as rings and filled circles as circles. Grids fall back to
   * evenly-spaced fixtures, matching the classic rectangular view.
   */
  fixtures?: FixturePos[];
  currentHue: number;
  currentSat: number;
  currentBright: number;
  mode: GridMode;
  brushSize: number;
  softEdge: boolean;
  motionPath?: number[];
  viewFlip?: Orientation | null;
  onCannon: (index: number, h: number, s: number, b: number) => void;
  onDrop?: (index: number) => void;
  onMotionPoint?: (index: number) => void;
  onGradientDrag?: (startIdx: number, endIdx: number) => void;
}

// Reference density for orb sizing. The classic 7×7 grid dot size is the
// canonical look, so every layout draws dots at this fixed size regardless of
// how many fixtures there are or how they're spaced.
const REFERENCE_COLS = 7;

function orientationToCss(o: Orientation): string {
  const parts: string[] = [];
  // Counter-rotate: remapGridForUi rotates data CCW by θ, so rotate CW by θ to undo
  if (o.rotation !== 0) parts.push(`rotate(${o.rotation}deg)`);
  // Counter-flip
  if (o.flipH) parts.push('scaleX(-1)');
  if (o.flipV) parts.push('scaleY(-1)');
  return parts.length > 0 ? parts.join(' ') : 'none';
}

function hslStr(h: number, s: number, l: number): string {
  const hh = Number.isFinite(h) ? h : 0;
  const ss = Number.isFinite(s) ? s : 0;
  const ll = Number.isFinite(l) ? l : 0;
  return `hsl(${hh}, ${ss}%, ${ll}%)`;
}

function hslRgb(h: number, s: number, l: number): [number, number, number] {
  h = Number.isFinite(h) ? h : 0;
  s = (Number.isFinite(s) ? s : 0) / 100;
  l = (Number.isFinite(l) ? l : 0) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)];
}

export function GridDisplay({
  grid,
  columns,
  fixtures,
  currentHue,
  currentSat,
  currentBright,
  mode,
  brushSize,
  softEdge,
  motionPath,
  viewFlip,
  onCannon,
  onDrop,
  onMotionPoint,
  onGradientDrag
}: GridDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const paintingRef = useRef(false);
  const lastPaintedRef = useRef(-1);
  const gradientStartRef = useRef(-1);
  const sizeRef = useRef({ gridOffset: 0, canvasW: 0, canvasH: 0 });
  // Pixel centers + orb size for each cannon, recomputed each draw.
  const geomRef = useRef<{ centers: { x: number; y: number }[]; cellSize: number; orbR: number }>({ centers: [], cellSize: 0, orbR: 0 });

  const isGrid = columns > 0;
  const rows = isGrid ? Math.ceil(grid.length / columns) : 1;

  // Compute pixel positions for every cannon. When fixtures are provided we
  // place orbs at their true normalized positions (rings render as rings);
  // otherwise fall back to an evenly-spaced rectangular grid.
  const computeGeom = useCallback((size: number) => {
    const gridOffset = 10;
    const drawArea = Math.max(0, size - 20);
    const count = grid.length;
    const centers: { x: number; y: number }[] = [];

    // Orb radius is fixed to the classic 7×7 reference size for every layout —
    // dots must not grow/shrink with the arrangement (a sparse ring would
    // otherwise balloon). Positions still come from the layout's fixtures.
    const orbR = (drawArea / REFERENCE_COLS) * 0.34;

    if (fixtures && fixtures.length >= count && count > 0) {
      // Nearest-neighbour spacing in normalized space → margin (so orbs don't
      // clip at the edges) and the click-tolerance radius.
      let minD = Infinity;
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = fixtures[i].u - fixtures[j].u;
          const dy = fixtures[i].v - fixtures[j].v;
          const d = Math.hypot(dx, dy);
          if (d > 1e-6 && d < minD) minD = d;
        }
      }
      if (!Number.isFinite(minD) || minD <= 0) minD = 1 / Math.max(1, Math.sqrt(count));
      const margin = drawArea * minD * 0.5;
      const inner = Math.max(0, drawArea - 2 * margin);
      for (let i = 0; i < count; i++) {
        centers.push({
          x: gridOffset + margin + fixtures[i].u * inner,
          y: gridOffset + margin + fixtures[i].v * inner
        });
      }
      return { centers, cellSize: drawArea * minD, orbR };
    }

    const cols = isGrid ? columns : count;
    const cellSize = Math.max(0, drawArea / Math.max(cols, rows));
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      centers.push({
        x: gridOffset + col * cellSize + cellSize / 2,
        y: gridOffset + row * cellSize + cellSize / 2
      });
    }
    return { centers, cellSize, orbR };
  }, [grid.length, columns, rows, fixtures, isGrid]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const maxW = wrap.clientWidth;
    const maxH = wrap.clientHeight;
    const size = Math.min(maxW, maxH);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    sizeRef.current = { gridOffset: 10, canvasW: size, canvasH: size };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { canvasW, canvasH } = sizeRef.current;
    ctx.clearRect(0, 0, canvasW, canvasH);

    const geom = computeGeom(canvasW);
    geomRef.current = geom;
    const { centers, cellSize, orbR } = geom;
    if (cellSize <= 0) return;

    const r = orbR;

    for (let i = 0; i < grid.length; i++) {
      const center = centers[i];
      if (!center) continue;
      const cx = center.x;
      const cy = center.y;
      const c = grid[i];
      const lightness = Math.max(5, c.b * 0.5);

      if (c.b > 5) {
        const glowR = r * (1.2 + c.b * 0.012);
        const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, glowR);
        const [gr, gg, gb] = hslRgb(c.h, c.s, lightness);
        grad.addColorStop(0, `rgba(${Math.round(gr * 255)},${Math.round(gg * 255)},${Math.round(gb * 255)},0.5)`);
        grad.addColorStop(1, `rgba(${Math.round(gr * 255)},${Math.round(gg * 255)},${Math.round(gb * 255)},0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      const orbGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r);
      if (c.b < 2) {
        orbGrad.addColorStop(0, '#181820');
        orbGrad.addColorStop(1, '#0e0e14');
      } else {
        const bright = Math.min(lightness + 15, 95);
        orbGrad.addColorStop(0, hslStr(c.h, c.s, bright));
        orbGrad.addColorStop(1, hslStr(c.h, c.s, lightness * 0.6));
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = orbGrad;
      ctx.fill();

      if (c.b > 20) {
        ctx.beginPath();
        ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${c.b * 0.002})`;
        ctx.fill();
      }
    }

    // Motion path overlay
    if (motionPath && motionPath.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(74, 124, 255, 0.6)';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash([]);

      ctx.beginPath();
      for (let i = 0; i < motionPath.length; i++) {
        const p = centers[motionPath[i]];
        if (!p) continue;
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();

      // Draw dots at each point
      for (let i = 0; i < motionPath.length; i++) {
        const p = centers[motionPath[i]];
        if (!p) continue;
        const px = p.x;
        const py = p.y;
        const isFirst = i === 0;
        const isLast = i === motionPath.length - 1;
        const dotR = isFirst || isLast ? 5 : 3;
        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, Math.PI * 2);
        ctx.fillStyle = isFirst ? '#4a7cff' : isLast ? '#ff4a4a' : 'rgba(74, 124, 255, 0.5)';
        ctx.fill();
      }

      ctx.restore();
    }
  }, [grid, motionPath, computeGeom]);

  const cannonAtXY = useCallback((clientX: number, clientY: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const { canvasW } = sizeRef.current;
    const { centers, cellSize } = geomRef.current;

    // Convert client coords to normalized canvas coords (0..canvasW)
    let x = (clientX - rect.left) * (canvasW / rect.width);
    let y = (clientY - rect.top) * (canvasW / rect.height);

    // If viewFlip is active, undo the CSS transform on the coordinates.
    // CSS transform order (right-to-left): scaleY → scaleX → rotate(+θ)
    // Inverse (applied left-to-right): rotate(-θ) → scaleX → scaleY
    if (viewFlip) {
      const half = canvasW / 2;
      // 1. Undo rotation: CSS applied rotate(-θ), so rotate by +θ
      if (viewFlip.rotation !== 0) {
        const rad = (viewFlip.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = x - half;
        const dy = y - half;
        x = half + dx * cos + dy * sin;
        y = half - dx * sin + dy * cos;
      }
      // 2. Undo flips (self-inverse)
      if (viewFlip.flipH) x = canvasW - x;
      if (viewFlip.flipV) y = canvasW - y;
    }

    // Pick the nearest fixture within a cell radius.
    if (cellSize <= 0 || centers.length === 0) return -1;
    let best = -1;
    let bestD = (cellSize * 0.6) ** 2;
    for (let i = 0; i < centers.length && i < grid.length; i++) {
      const dx = centers[i].x - x;
      const dy = centers[i].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD) {
        bestD = d2;
        best = i;
      }
    }
    return best;
  }, [grid.length, viewFlip]);

  const getAffectedCannons = useCallback((centerIdx: number): { idx: number; falloff: number }[] => {
    const result: { idx: number; falloff: number }[] = [{ idx: centerIdx, falloff: 1 }];
    // Brush spread is a grid-neighbourhood concept; only meaningful for grids.
    if (isGrid && brushSize > 1) {
      const cRow = Math.floor(centerIdx / columns);
      const cCol = centerIdx % columns;
      const reach = brushSize - 1;
      for (let dr = -reach; dr <= reach; dr++) {
        for (let dc = -reach; dc <= reach; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cRow + dr;
          const nc = cCol + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= columns) continue;
          const dist = Math.sqrt(dr * dr + dc * dc);
          if (dist > reach + 0.5) continue;
          const fo = softEdge ? Math.max(0, 1 - dist / (reach + 1)) : 1;
          result.push({ idx: nr * columns + nc, falloff: fo });
        }
      }
    }

    const seen = new Set<number>();
    return result.filter((m) => {
      if (m.idx < 0 || m.idx >= grid.length || seen.has(m.idx)) return false;
      seen.add(m.idx);
      return true;
    });
  }, [isGrid, columns, rows, brushSize, softEdge, grid.length]);

  const handleStart = useCallback((e: React.PointerEvent) => {
    paintingRef.current = true;
    lastPaintedRef.current = -1;
    const idx = cannonAtXY(e.clientX, e.clientY);

    if (mode === 'drops') {
      if (idx >= 0 && onDrop) onDrop(idx);
      lastPaintedRef.current = idx;
      return;
    }

    if (mode === 'gradient') {
      gradientStartRef.current = idx;
      return;
    }

    if (idx >= 0 && mode === 'paint') {
      const affected = getAffectedCannons(idx);
      for (const a of affected) {
        onCannon(a.idx, currentHue, currentSat, currentBright * a.falloff);
      }
      lastPaintedRef.current = idx;
    }
  }, [cannonAtXY, mode, onDrop, onMotionPoint, getAffectedCannons, onCannon, currentHue, currentSat, currentBright]);

  const handleMove = useCallback((e: React.PointerEvent) => {
    if (!paintingRef.current) return;
    const idx = cannonAtXY(e.clientX, e.clientY);
    if (idx < 0 || idx === lastPaintedRef.current) return;

    if (mode === 'drops') {
      if (onDrop) onDrop(idx);
      lastPaintedRef.current = idx;
      return;
    }

    if (mode === 'gradient' && gradientStartRef.current >= 0 && onGradientDrag) {
      onGradientDrag(gradientStartRef.current, idx);
      lastPaintedRef.current = idx;
      return;
    }

    if (mode === 'paint') {
      const affected = getAffectedCannons(idx);
      for (const a of affected) {
        onCannon(a.idx, currentHue, currentSat, currentBright * a.falloff);
      }
      lastPaintedRef.current = idx;
    }
  }, [cannonAtXY, mode, onDrop, onMotionPoint, onGradientDrag, getAffectedCannons, onCannon, currentHue, currentSat, currentBright]);

  const handleEnd = useCallback(() => {
    paintingRef.current = false;
    lastPaintedRef.current = -1;
    gradientStartRef.current = -1;
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    resize();

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(wrap);

    return () => ro.disconnect();
  }, [resize]);

  useEffect(() => {
    draw();
  }, [draw]);

  const flipCss = viewFlip ? orientationToCss(viewFlip) : 'none';

  return (
    <div
      ref={wrapRef}
      className="w-full h-full flex items-center justify-center"
      style={{ touchAction: 'none', minWidth: 0, minHeight: 0, overflow: 'hidden' }}
    >
      <canvas
        ref={canvasRef}
        width={600}
        height={600}
        style={{ borderRadius: 16, touchAction: 'none', cursor: 'crosshair', transform: flipCss }}
        onPointerDown={handleStart}
        onPointerMove={handleMove}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
      />
    </div>
  );
}
