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

/**
 * Owns the GracePaint parameters and keeps the receiver in step: while the
 * GracePaint pattern is the one running, every change is a setPatternParam;
 * otherwise (nothing running, or another tab took over) the first change
 * starts the pattern with everything the operator has set so far. Painted
 * colours therefore outlive switching tabs and stopping the show.
 */
export function useGracePaint(
  count: number,
  send: (msg: Record<string, unknown>) => void,
  activePattern: string | null,
  onPatternSelect: (id: string) => void
) {
  const [params, setParams] = useState<GracePaintParams>(() => defaultParams(count, GRADIENTS[0]));
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const running = activePattern === GRACE_PAINT_ID;
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    if (paramsRef.current.paint.length === count * 2) return;
    const next = { ...paramsRef.current, paint: emptyPaint(count) };
    paramsRef.current = next;
    setParams(next);
  }, [count]);

  const start = useCallback(() => {
    onPatternSelect(GRACE_PAINT_ID);
    runningRef.current = true;
    send({ type: 'evalPattern', code: gracePaintPattern(), params: paramsRef.current });
  }, [onPatternSelect, send]);

  const update = useCallback(
    <K extends keyof GracePaintParams>(key: K, value: GracePaintParams[K]) => {
      const next = { ...paramsRef.current, [key]: value };
      paramsRef.current = next;
      setParams(next);
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
