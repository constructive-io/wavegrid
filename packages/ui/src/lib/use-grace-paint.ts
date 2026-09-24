import { useCallback, useEffect, useRef, useState } from 'react';

import {
  defaultParams,
  emptyPaint,
  GRACE_PAINT_ID,
  type GracePaintParams,
  gracePaintPattern,
  paintPane
} from './grace-paint';
import { GRADIENTS } from './grace-rings';
import type { PatternState } from './socket-state';

const PATTERN_CODE = gracePaintPattern();
/** How long after our last stroke the brain's echo of `paint` is treated as stale. */
const PAINT_SETTLE_MS = 1500;

/** True when the brain reports it is running the GracePaint pattern. */
export function isGracePaintRunning(pattern: PatternState | null): boolean {
  return !!pattern && pattern.active && pattern.code === PATTERN_CODE;
}

/** The brain's live GracePaint `ctx.p`, if it is well-formed enough to adopt. */
export function paramsFromPattern(pattern: PatternState | null): GracePaintParams | null {
  if (!isGracePaintRunning(pattern)) return null;
  const p = pattern!.params;
  if (typeof p.anim !== 'string' || typeof p.flow !== 'string') return null;
  if (!Array.isArray(p.stops) || !Array.isArray(p.paint)) return null;
  return {
    anim: p.anim,
    flow: p.flow,
    stops: p.stops as [number, number][],
    paint: p.paint as number[],
    level: typeof p.level === 'number' ? p.level : 100,
    spin: typeof p.spin === 'number' ? p.spin : 1
  };
}

/**
 * Owns the GracePaint parameters and keeps the receiver in step. Whether
 * GracePaint is running is the brain's word, not this tab's memory: while the
 * brain runs it, every change is a setPatternParam on top of the brain's live
 * params (so a reloaded or second iPad joins the running animation instead of
 * restarting it); otherwise the first change starts the pattern with
 * everything the operator has set so far.
 */
export function useGracePaint(
  count: number,
  send: (msg: Record<string, unknown>) => void,
  pattern: PatternState | null,
  onPatternSelect: (id: string) => void
) {
  const [params, setParams] = useState<GracePaintParams>(() => defaultParams(count, GRADIENTS[0]));
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const running = isGracePaintRunning(pattern);
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    if (paramsRef.current.paint.length === count * 2) return;
    const next = { ...paramsRef.current, paint: emptyPaint(count) };
    paramsRef.current = next;
    setParams(next);
  }, [count]);

  // Adopt the brain's live params whenever they differ from ours. Paint is the
  // exception while a finger is on the window: the brain's echo of our own
  // strokes lags, so taking it mid-stroke would drop the newest panes.
  const lastPaintAtRef = useRef(0);
  useEffect(() => {
    const live = paramsFromPattern(pattern);
    if (!live) return;
    const mine = paramsRef.current;
    const painting = Date.now() - lastPaintAtRef.current < PAINT_SETTLE_MS;
    const next = painting ? { ...live, paint: mine.paint } : live;
    if (JSON.stringify(next) === JSON.stringify(mine)) return;
    paramsRef.current = next;
    setParams(next);
  }, [pattern]);

  const start = useCallback(() => {
    onPatternSelect(GRACE_PAINT_ID);
    runningRef.current = true;
    send({ type: 'evalPattern', code: PATTERN_CODE, params: paramsRef.current });
  }, [onPatternSelect, send]);

  const update = useCallback(
    <K extends keyof GracePaintParams>(key: K, value: GracePaintParams[K]) => {
      const next = { ...paramsRef.current, [key]: value };
      paramsRef.current = next;
      setParams(next);
      if (key === 'paint') lastPaintAtRef.current = Date.now();
      if (runningRef.current) send({ type: 'setPatternParam', name: key, value });
      else start();
    },
    [send, start]
  );

  const paint = useCallback(
    (index: number, hue: number, sat: number) => {
      update('paint', paintPane(paramsRef.current.paint, index, hue, sat));
    },
    [update]
  );

  const fill = useCallback(
    (hue: number, sat: number) => {
      let next = paramsRef.current.paint;
      for (let i = 0; i < count; i++) next = paintPane(next, i, hue, sat);
      update('paint', next);
    },
    [count, update]
  );

  const clearPaint = useCallback(() => update('paint', emptyPaint(count)), [count, update]);

  /** A gradient takes over the whole window: any paint is cleared with it. */
  const setGradient = useCallback(
    (stops: [number, number][]) => {
      const next = { ...paramsRef.current, stops, paint: emptyPaint(count) };
      paramsRef.current = next;
      setParams(next);
      lastPaintAtRef.current = Date.now();
      if (runningRef.current) {
        send({ type: 'setPatternParam', name: 'stops', value: stops });
        send({ type: 'setPatternParam', name: 'paint', value: next.paint });
      } else start();
    },
    [count, send, start]
  );

  return { params, running, start, update, paint, fill, clearPaint, setGradient };
}

export type GracePaintControls = ReturnType<typeof useGracePaint>;
