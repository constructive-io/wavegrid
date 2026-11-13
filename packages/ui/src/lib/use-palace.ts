import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  coercePalaceParams,
  defaultParams,
  type Duo,
  emptyPaint,
  kindPaint,
  paintFixture,
  PALACE_ID,
  type PalaceFixture,
  type PalaceParams,
  palacePattern,
  type Scene,
  withScene
} from './palace';
import type { Look, PatternState } from './socket-state';

/** How long after our last stroke the brain's echo of `paint` is treated as stale. */
const PAINT_SETTLE_MS = 1500;

/**
 * Owns the Palace parameters and keeps the receiver in step, the same way
 * useGracePaint does: the brain says whether the pattern is running; while it
 * is, every change is a setPatternParam; otherwise the first change starts it.
 */
export function usePalace(
  fixtures: PalaceFixture[],
  send: (msg: Record<string, unknown>) => void,
  pattern: PatternState | null,
  onPatternSelect: (id: string) => void
) {
  const count = fixtures.length;
  const code = useMemo(() => palacePattern(fixtures), [fixtures]);
  const [params, setParams] = useState<PalaceParams>(() => defaultParams(count));
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const running = !!pattern && pattern.active && pattern.code === code;
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    if (paramsRef.current.paint.length === count * 2) return;
    const next = { ...paramsRef.current, paint: emptyPaint(count) };
    paramsRef.current = next;
    setParams(next);
  }, [count]);

  const lastPaintAtRef = useRef(0);
  useEffect(() => {
    if (!running || !pattern) return;
    const live = coercePalaceParams(pattern.params, count);
    if (!live) return;
    const mine = paramsRef.current;
    const painting = Date.now() - lastPaintAtRef.current < PAINT_SETTLE_MS;
    const next = painting ? { ...live, paint: mine.paint } : live;
    if (JSON.stringify(next) === JSON.stringify(mine)) return;
    paramsRef.current = next;
    setParams(next);
  }, [pattern, running, count]);

  const start = useCallback(() => {
    onPatternSelect(PALACE_ID);
    runningRef.current = true;
    send({ type: 'evalPattern', code, params: paramsRef.current });
  }, [code, onPatternSelect, send]);

  /** Apply several params at once; on top of the running pattern, or by starting it. */
  const apply = useCallback(
    (next: PalaceParams) => {
      const prev = paramsRef.current;
      paramsRef.current = next;
      setParams(next);
      if (!runningRef.current) {
        start();
        return;
      }
      for (const key of Object.keys(next) as (keyof PalaceParams)[]) {
        if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
          send({ type: 'setPatternParam', name: key, value: next[key] });
        }
      }
    },
    [send, start]
  );

  const update = useCallback(
    <K extends keyof PalaceParams>(key: K, value: PalaceParams[K]) => {
      if (key === 'paint') lastPaintAtRef.current = Date.now();
      apply({ ...paramsRef.current, [key]: value });
    },
    [apply]
  );

  const paint = useCallback(
    (index: number, hue: number, sat: number) => update('paint', paintFixture(paramsRef.current.paint, index, hue, sat)),
    [update]
  );
  const fill = useCallback(
    (hue: number, sat: number) => {
      let next = paramsRef.current.paint;
      for (let i = 0; i < count; i++) next = paintFixture(next, i, hue, sat);
      update('paint', next);
    },
    [count, update]
  );
  const fillKind = useCallback(
    (kind: 'cannon' | 'projector', hue: number, sat: number) =>
      update('paint', kindPaint(paramsRef.current.paint, fixtures, kind, hue, sat)),
    [fixtures, update]
  );
  const clearPaint = useCallback(() => update('paint', emptyPaint(count)), [count, update]);

  /** A gradient takes over the whole rig: paint is cleared with it. */
  const setGradient = useCallback(
    (stops: [number, number][]) => {
      lastPaintAtRef.current = Date.now();
      const p = paramsRef.current;
      apply({ ...p, stops, paint: emptyPaint(count), flow: p.flow === 'duo' ? 'scroll' : p.flow, spin: p.flow === 'duo' && p.spin === 0 ? 1 : p.spin });
    },
    [apply, count]
  );
  /** A duo: cannons one colour, projectors the other, held. */
  const setDuo = useCallback(
    (duo: Duo) => {
      lastPaintAtRef.current = Date.now();
      apply({ ...paramsRef.current, stops: duo.stops.map(([h, s]) => [h, s] as [number, number]), flow: 'duo', spin: 0, paint: emptyPaint(count) });
    },
    [apply, count]
  );
  const applyScene = useCallback(
    (scene: Scene) => {
      lastPaintAtRef.current = Date.now();
      apply(withScene(paramsRef.current, scene));
    },
    [apply]
  );

  const applyLook = useCallback(
    (look: Look) => {
      const next = coercePalaceParams(look.params, count);
      if (!next) return;
      lastPaintAtRef.current = Date.now();
      apply(next);
    },
    [apply, count]
  );
  const saveLook = useCallback(
    (name: string) => {
      const p = paramsRef.current;
      send({ type: 'saveLook', name, params: runningRef.current ? p : { ...p, anim: 'solid' } });
    },
    [send]
  );
  const renameLook = useCallback((id: string, name: string) => send({ type: 'renameLook', id, name }), [send]);
  const deleteLook = useCallback((id: string) => send({ type: 'deleteLook', id }), [send]);

  return {
    code, params, running, start, update, paint, fill, fillKind, clearPaint,
    setGradient, setDuo, applyScene, applyLook, saveLook, renameLook, deleteLook
  };
}

export type PalaceControls = ReturnType<typeof usePalace>;
