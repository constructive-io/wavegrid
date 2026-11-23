import { isRecord } from '@wavegrid/settings/plugin-controls';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { coercePluginParams, pluginAssetUrl,type PluginTabData } from './plugin-data';
import type { PatternState } from './socket-state';

export interface PluginPreset { name: string; params: Record<string, unknown> }

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

export function pluginParamUpdates(patch: Record<string, unknown>, params: Record<string, unknown>, live: unknown) {
  const current = isRecord(live) ? live : {};
  return Object.keys(patch)
    .filter(name => Object.prototype.hasOwnProperty.call(params, name))
    .map(name => [name, params[name]] as const)
    .filter(([name, value]) => !Object.prototype.hasOwnProperty.call(current, name) || current[name] !== value)
    .map(([name, value]) => ({ type: 'setPatternParam', name, value }));
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
  const [params, setParams] = useState(() => coercePluginParams(controls, {}));
  const paramsRef = useRef(params);
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [presets, setPresets] = useState<PluginPreset[]>([]);
  const running = source !== null && !!pattern?.active && pattern.code === source;
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    const next = coercePluginParams(controls, {});
    paramsRef.current = next;
    setParams(next);
  }, [controls]);

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
    const next = coercePluginParams(controls, pattern.params);
    if (JSON.stringify(next) === JSON.stringify(paramsRef.current)) return;
    paramsRef.current = next;
    setParams(next);
  }, [pattern, running, controls]);

  const start = useCallback(() => {
    if (source === null) return;
    onPatternSelect(tab.id);
    runningRef.current = true;
    send({ type: 'evalPattern', code: source, params: paramsRef.current });
  }, [source, send, onPatternSelect, tab.id]);

  const apply = useCallback((patch: Record<string, unknown>) => {
    if (source === null) return;
    const previous = paramsRef.current;
    const next = coercePluginParams(controls, { ...previous, ...patch });
    paramsRef.current = next;
    setParams(next);
    if (!runningRef.current) { start(); return; }
    for (const message of pluginParamUpdates(patch, next, pattern?.params)) send(message);
  }, [source, controls, send, start, pattern]);

  const stop = useCallback(() => { runningRef.current = false; send({ type: 'stopPattern' }); }, [send]);
  return { params, presets, running, loading: source === null && !sourceError,
    ready: source !== null, errors: [sourceError, presetsError].filter(Boolean), start, stop, apply };
}
