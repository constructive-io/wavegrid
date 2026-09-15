import { useCallback, useEffect, useRef } from 'react';

import {
  cannonPoints,
  type Hsb,
  OutputSmoother,
  type PoolColor,
  PoolField,
  type PoolSettings,
  quantize,
  sameHsb
} from '@/lib/pool-field';
import type { Orientation } from '@/lib/socket-state';

/** How often sampled cannon values go to the server. */
const SEND_HZ = 15;
const REFERENCE_COLS = 7;
/** Same inset GridDisplay draws inside, so the markers land on Paint's orbs. */
const INSET = 10;

interface PoolCanvasProps {
  count: number;
  columns: number;
  fixtures?: readonly { u: number; v: number }[];
  settings: PoolSettings;
  color: PoolColor;
  viewFlip: Orientation | null;
  onCannon: (index: number, h: number, s: number, b: number) => void;
  /** Hands the live field to the parent so Clear / Stop can reach it. */
  fieldRef: React.MutableRefObject<PoolField | null>;
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
 * The pool itself: a square canvas that draws the continuous field, the
 * fixture markers on top of it, and runs the simulation + output loop.
 *
 * Every pointer is fed to the field as a touch; the field is what decides
 * what the cannons do. Output is sampled at the configured fixture positions,
 * smoothed, and sent as ordinary `cannon` messages, so mapping, orientation,
 * master brightness and the receiver's low-pass all apply exactly as they do
 * for the paint tab.
 */
export function PoolCanvas({
  count,
  columns,
  fixtures,
  settings,
  color,
  viewFlip,
  onCannon,
  fieldRef
}: PoolCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const localField = useRef<PoolField | null>(null);
  if (!localField.current) localField.current = new PoolField(settings);
  const field = localField.current;
  fieldRef.current = field;
  field.settings = settings;

  const colorRef = useRef(color);
  colorRef.current = color;
  const onCannonRef = useRef(onCannon);
  onCannonRef.current = onCannon;

  const pointsRef = useRef(cannonPoints(count, columns, fixtures));
  useEffect(() => {
    pointsRef.current = cannonPoints(count, columns, fixtures);
  }, [count, columns, fixtures]);

  const smootherRef = useRef(new OutputSmoother(count));
  const lastSentRef = useRef<Hsb[]>([]);
  const sizeRef = useRef(600);

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

  const draw = useCallback((outputs: readonly Hsb[]) => {
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

    // The field: every source as a soft radial gradient, additively blended,
    // so overlapping strokes brighten and mix where they meet.
    ctx.globalCompositeOperation = 'lighter';
    field.forEachSource((s) => {
      const alpha = Math.min(0.55, s.energy * 0.6);
      if (alpha < 0.01) return;
      const light = 30 + Math.min(30, s.bright * 0.25);
      if (s.kind === 'ring') {
        const r = S(s.ring);
        const w = S(s.sigma) * 2.2;
        if (r <= 0) {
          const g = ctx.createRadialGradient(X(s.x), X(s.y), 0, X(s.x), X(s.y), w);
          g.addColorStop(0, hsl(s.hue, s.sat, light, alpha));
          g.addColorStop(1, hsl(s.hue, s.sat, light, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, size, size);
          return;
        }
        ctx.strokeStyle = hsl(s.hue, s.sat, light, alpha * 0.9);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(X(s.x), X(s.y), r, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }
      const rad = S(s.sigma) * 3;
      const g = ctx.createRadialGradient(X(s.x), X(s.y), 0, X(s.x), X(s.y), rad);
      g.addColorStop(0, hsl(s.hue, s.sat, light, alpha));
      g.addColorStop(0.45, hsl(s.hue, s.sat, light, alpha * 0.35));
      g.addColorStop(1, hsl(s.hue, s.sat, light, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
    ctx.globalCompositeOperation = 'source-over';

    // Spiral centre, faintly, so you can see what the field is turning about.
    if (settings.mode === 'spiral') {
      const sp = field.spiralState;
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
    // value about to be sent — this is exactly what the lasers will do.
    const points = pointsRef.current;
    const orbR = (area / REFERENCE_COLS) * 0.22;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const out = outputs[i] ?? { h: 0, s: 0, b: 0 };
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
  }, [field, settings.mode]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let sinceSend = 0;
    const smoother = smootherRef.current;

    let generation = field.generation;
    const frame = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (field.generation !== generation) {
        // The field was reset (blackout / clear): nothing may glide back up
        // out of the smoother, and the server already holds zeros.
        generation = field.generation;
        smoother.reset();
        lastSentRef.current = pointsRef.current.map(() => ({ h: 0, s: 0, b: 0 }));
      }
      field.step(dt);
      smoother.resize(pointsRef.current.length);
      const targets = field.sampleAll(pointsRef.current);
      const smoothed = smoother.step(targets, dt);
      draw(smoothed);

      sinceSend += dt;
      if (sinceSend >= 1 / SEND_HZ) {
        sinceSend = 0;
        const sent = lastSentRef.current;
        for (let i = 0; i < smoothed.length; i++) {
          const q = quantize(smoothed[i]);
          const prev = sent[i];
          if (prev && sameHsb(prev, q)) continue;
          if (!prev && q.b === 0) {
            sent[i] = q;
            continue;
          }
          sent[i] = q;
          onCannonRef.current(i, q.h, q.s, q.b);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onHide = () => {
      if (document.hidden) field.releaseAll();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [draw, field]);

  const toField = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = rect.width / Math.max(1, sizeRef.current);
    const inset = INSET * scale;
    const draw = Math.max(1, rect.width - 2 * inset);
    return {
      x: (e.clientX - rect.left - inset) / draw,
      y: (e.clientY - rect.top - inset) / draw
    };
  }, []);

  const handleDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toField(e);
    field.pointerDown(e.pointerId, p.x, p.y, colorRef.current);
  }, [field, toField]);

  const handleMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (field.touchCount === 0) return;
    const p = toField(e);
    field.pointerMove(e.pointerId, p.x, p.y);
  }, [field, toField]);

  const handleUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    field.pointerUp(e.pointerId);
  }, [field]);

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
