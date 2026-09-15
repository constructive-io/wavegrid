import { cannonPoints, type PoolColor } from '@wavegrid/pool';
import { useCallback, useEffect, useRef } from 'react';

import type { CannonColor, Orientation, PoolState } from '@/lib/socket-state';

/** Finger positions go to the server at most this often per finger. */
const MOVE_HZ = 30;
const REFERENCE_COLS = 7;
/** Same inset GridDisplay draws inside, so the markers land on Paint's orbs. */
const INSET = 10;

export type PoolTouchPhase = 'down' | 'move' | 'up';

interface PoolCanvasProps {
  count: number;
  columns: number;
  fixtures?: readonly { u: number; v: number }[];
  /** Per-cannon values in UI order — what the lasers are actually doing. */
  grid: readonly CannonColor[];
  /** The field as the server is running it. */
  pool: PoolState | null;
  color: PoolColor;
  viewFlip: Orientation | null;
  onTouch: (id: number, phase: PoolTouchPhase, x: number, y: number, color: PoolColor) => void;
}

function orientationToCss(o: Orientation): string {
  const parts: string[] = [];
  if (o.rotation !== 0) parts.push(`rotate(${o.rotation}deg)`);
  if (o.flipH) parts.push('scaleX(-1)');
  if (o.flipV) parts.push('scaleY(-1)');
  return parts.length > 0 ? parts.join(' ') : 'none';
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${Number.isFinite(h) ? h : 0}, ${Number.isFinite(s) ? s : 0}%, ${Number.isFinite(l) ? l : 0}%, ${a})`;
}

/**
 * The pool as seen from an iPad: a square canvas drawing the field the server
 * is running, with the fixture markers on top filled from the live grid.
 *
 * The simulation itself lives in the server, so several iPads stir one field
 * and it keeps drifting when they all go away. This component only forwards
 * fingers (in the field's 0..1 space, orientation undone) and draws what
 * comes back.
 */
export function PoolCanvas({
  count,
  columns,
  fixtures,
  grid,
  pool,
  color,
  viewFlip,
  onTouch
}: PoolCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const colorRef = useRef(color);
  colorRef.current = color;
  const onTouchRef = useRef(onTouch);
  onTouchRef.current = onTouch;

  const pointsRef = useRef(cannonPoints(count, columns, fixtures));
  useEffect(() => {
    pointsRef.current = cannonPoints(count, columns, fixtures);
  }, [count, columns, fixtures]);

  const gridRef = useRef(grid);
  gridRef.current = grid;
  const poolRef = useRef(pool);
  poolRef.current = pool;
  const sizeRef = useRef(600);
  /** Fingers down on this canvas, with when each last reported a move. */
  const activeRef = useRef(new Map<number, number>());

  const resize = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const size = Math.max(0, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight)));
    if (size <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    sizeRef.current = size;
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [resize]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = sizeRef.current;
    const dpr = canvas.width / Math.max(1, size);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#07070c';
    ctx.fillRect(0, 0, size, size);

    // Field coordinates (0..1) → pixels, inside the same inset as GridDisplay.
    const area = size - 2 * INSET;
    const X = (n: number) => INSET + n * area;
    const S = (n: number) => n * area;

    const field = poolRef.current;
    const sources = field?.active ? field.sources : [];

    // The field: every source as a soft radial gradient, additively blended,
    // so overlapping strokes brighten and mix where they meet.
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sources) {
      const alpha = Math.min(0.55, s.energy * 0.6);
      if (alpha < 0.01) continue;
      const light = 45;
      if (s.kind === 'ring') {
        const r = S(s.ring);
        const w = S(s.sigma) * 2.2;
        if (r <= 0) {
          const g = ctx.createRadialGradient(X(s.x), X(s.y), 0, X(s.x), X(s.y), w);
          g.addColorStop(0, hsl(s.hue, s.sat, light, alpha));
          g.addColorStop(1, hsl(s.hue, s.sat, light, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, size, size);
          continue;
        }
        ctx.strokeStyle = hsl(s.hue, s.sat, light, alpha * 0.9);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(X(s.x), X(s.y), r, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const rad = S(s.sigma) * 3;
      const g = ctx.createRadialGradient(X(s.x), X(s.y), 0, X(s.x), X(s.y), rad);
      g.addColorStop(0, hsl(s.hue, s.sat, light, alpha));
      g.addColorStop(0.45, hsl(s.hue, s.sat, light, alpha * 0.35));
      g.addColorStop(1, hsl(s.hue, s.sat, light, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Spiral centre, faintly, so you can see what the field is turning about.
    if (field?.active && field.settings.mode === 'spiral') {
      const sp = field.spiral;
      const strength = Math.min(1, Math.abs(sp.omega) / 0.3);
      if (strength > 0.02) {
        ctx.strokeStyle = `rgba(255,255,255,${0.05 + strength * 0.08})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(X(sp.cx), X(sp.cy), 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Cannons: a ring marker at every configured position, filled with the
    // value the server holds for it — this is exactly what the lasers do.
    const points = pointsRef.current;
    const values = gridRef.current;
    const orbR = (area / REFERENCE_COLS) * 0.22;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const out = values[i] ?? { h: 0, s: 0, b: 0 };
      const px = X(p.x);
      const py = X(p.y);
      const b = out.b / 100;
      if (b > 0.01) {
        const glow = ctx.createRadialGradient(px, py, orbR * 0.4, px, py, orbR * 2.6);
        glow.addColorStop(0, hsl(out.h, out.s, 55, 0.35 * b));
        glow.addColorStop(1, hsl(out.h, out.s, 55, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, orbR * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(px, py, orbR, 0, Math.PI * 2);
      ctx.fillStyle = b > 0.01 ? hsl(out.h, out.s, 12 + 48 * b) : '#111118';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + 0.5 * b})`;
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const liftAll = () => {
      for (const id of activeRef.current.keys()) onTouchRef.current(id, 'up', 0, 0, colorRef.current);
      activeRef.current.clear();
    };
    const onHide = () => {
      if (document.hidden) liftAll();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onHide);
      // Leaving the tab lifts our fingers; the server keeps the water moving.
      liftAll();
    };
  }, [draw]);

  const toField = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // The rect is of the *transformed* element; the canvas is square so its
    // centre and side survive rotation/mirroring. Undo the CSS transform in
    // the same order GridDisplay does (rotate back, then un-flip).
    const rect = e.currentTarget.getBoundingClientRect();
    const size = sizeRef.current;
    const scale = Math.max(rect.width, rect.height) / Math.max(1, size);
    const half = size / 2;
    let x = (e.clientX - (rect.left + rect.width / 2)) / scale;
    let y = (e.clientY - (rect.top + rect.height / 2)) / scale;
    const o = viewFlip;
    if (o) {
      if (o.rotation !== 0) {
        const rad = (o.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rx = x * cos + y * sin;
        const ry = -x * sin + y * cos;
        x = rx;
        y = ry;
      }
      if (o.flipH) x = -x;
      if (o.flipV) y = -y;
    }
    const area = Math.max(1, size - 2 * INSET);
    return {
      x: (half + x - INSET) / area,
      y: (half + y - INSET) / area
    };
  }, [viewFlip]);

  const handleDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toField(e);
    activeRef.current.set(e.pointerId, performance.now());
    onTouchRef.current(e.pointerId, 'down', p.x, p.y, colorRef.current);
  }, [toField]);

  const handleMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const last = activeRef.current.get(e.pointerId);
    if (last === undefined) return;
    const now = performance.now();
    if (now - last < 1000 / MOVE_HZ) return;
    activeRef.current.set(e.pointerId, now);
    const p = toField(e);
    onTouchRef.current(e.pointerId, 'move', p.x, p.y, colorRef.current);
  }, [toField]);

  const handleUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current.delete(e.pointerId)) return;
    onTouchRef.current(e.pointerId, 'up', 0, 0, colorRef.current);
  }, []);

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
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onLostPointerCapture={handleUp}
      />
    </div>
  );
}
