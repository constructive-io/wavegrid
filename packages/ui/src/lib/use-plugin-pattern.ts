import { isRecord } from '@wavegrid/settings/plugin-controls';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { coercePluginParams, pluginAssetUrl,type PluginTabData } from './plugin-data';
import { jsonEqual, pluginParamUpdates } from './plugin-view-bridge';
import type { PatternState } from './socket-state';

export { pluginParamUpdates } from './plugin-view-bridge';

export interface PluginPreset { name: string; params: Record<string, unknown> }

const lastParams = new Map<string, Record<string, unknown>>();

export async function fetchPluginText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

export function parsePluginPresets(source: string): PluginPreset[] {
  const raw: unknown = JSON.parse(source);
  if (!Array.isArray(raw) || !raw.every(preset => isRecord(preset) && typeof preset.name === 'string' && isRecord(preset.params))) {
    throw new Error('Presets must be an array of { name, params }');
  }
  return raw as PluginPreset[];
}

export function usePluginPattern(
  pluginId: string,
  tab: PluginTabData,
  presetsFile: string | undefined,
  send: (message: Record<string, unknown>) => void,
  pattern: PatternState | null,
  onPatternSelect: (id: string) => void
) {
  const controls = useMemo(() => tab.cards.flatMap(card => card.controls), [tab.cards]);
  const normalize = useCallback((raw: unknown) => tab.view
    ? { ...coercePluginParams(controls, {}), ...(isRecord(raw) ? raw : {}) } : coercePluginParams(controls, raw), [controls, tab.view]);
  const [params, setParams] = useState(() => normalize(lastParams.get(tab.id)));
  const paramsRef = useRef(params);
  const rememberParams = useCallback((next: Record<string, unknown>) => {
    lastParams.set(tab.id, next);
    paramsRef.current = next;
    setParams(next);
  }, [tab.id]);
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [presets, setPresets] = useState<PluginPreset[]>([]);
  const running = source !== null && !!pattern?.active && pattern.code === source;
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    rememberParams(normalize(lastParams.get(tab.id)));
  }, [normalize, tab.id, rememberParams]);

  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setSourceError(null);
    if (!tab.pattern) { setSourceError('No pattern file configured for this tab.'); return; }
    fetchPluginText(pluginAssetUrl(pluginId, tab.pattern)).then(code => {
      if (!code.trim()) throw new Error('Pattern file is empty.');
      if (!cancelled) setSource(code);
    }).catch(error => { if (!cancelled) setSourceError(`Pattern: ${String(error)}`); });
    return () => { cancelled = true; };
  }, [pluginId, tab.pattern]);

  useEffect(() => {
    let cancelled = false;
    setPresets([]);
    setPresetsError(null);
    if (!presetsFile) return;
    fetchPluginText(pluginAssetUrl(pluginId, presetsFile)).then(parsePluginPresets)
      .then(next => { if (!cancelled) setPresets(next); })
      .catch(error => { if (!cancelled) setPresetsError(`Presets: ${String(error)}`); });
    return () => { cancelled = true; };
  }, [pluginId, presetsFile]);

  useEffect(() => {
    if (!running || !pattern) return;
    const next = normalize(pattern.params);
    if (jsonEqual(next, paramsRef.current)) return;
    rememberParams(next);
  }, [pattern, running, normalize, rememberParams]);

  const startWithParams = useCallback((initial?: Record<string, unknown>) => {
    if (source === null) return;
    if (initial !== undefined) {
      rememberParams(normalize({ ...paramsRef.current, ...initial }));
    }
    onPatternSelect(tab.id);
    runningRef.current = true;
    send({ type: 'evalPattern', code: source, params: paramsRef.current });
  }, [source, send, onPatternSelect, tab.id, normalize, rememberParams]);
  const start = useCallback(() => startWithParams(), [startWithParams]);

  const apply = useCallback((patch: Record<string, unknown>) => {
    if (source === null) return;
    const previous = paramsRef.current;
    const next = normalize({ ...previous, ...patch });
    rememberParams(next);
    if (!runningRef.current) { start(); return; }
    for (const message of pluginParamUpdates(patch, next, pattern?.params)) send(message);
  }, [source, normalize, send, start, pattern, rememberParams]);

  const stop = useCallback(() => { runningRef.current = false; send({ type: 'stopPattern' }); }, [send]);
  return { params, presets, running, loading: source === null && !sourceError,
    ready: source !== null, errors: [sourceError, presetsError].filter(Boolean), start, startWithParams, stop, apply };
}
