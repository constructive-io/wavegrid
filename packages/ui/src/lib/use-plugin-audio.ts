import { parsePluginAudioValues, type PluginAudioBinding } from '@wavegrid/settings/plugin-controls';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GraceAudioOutput } from './grace-audio';
import { pluginAssetUrl, type UIPlugin } from './plugin-data';
import { jsonEqual, pluginParamUpdates } from './plugin-view-bridge';
import type { PatternState } from './socket-state';
import { fetchPluginText } from './use-plugin-pattern';

export interface LoadedPluginAudio { tabId: string; source: string; audio: PluginAudioBinding; values: unknown[] }

export function activePluginAudio(bindings: LoadedPluginAudio[], pattern: PatternState | null): LoadedPluginAudio | undefined {
  return pattern?.active ? bindings.find(binding => binding.source === pattern.code && pattern.params.plugin === binding.tabId) : undefined;
}

export function pluginAudioCommands(binding: LoadedPluginAudio, pattern: PatternState | null, out: GraceAudioOutput): Record<string, unknown>[] {
  if (!activePluginAudio([binding], pattern)) return [];
  const patch: Record<string, unknown> = {};
  for (const [field, name] of Object.entries(binding.audio.params)) {
    const value = out[field as keyof GraceAudioOutput];
    if (typeof value === 'boolean' || Number.isFinite(value)) patch[name] = value;
  }
  const step = binding.audio.step;
  if (out.step && step && binding.values.length) {
    const index = binding.values.findIndex(value => jsonEqual(value, pattern!.params[step.param]));
    Object.assign(patch, step.set, { [step.param]: binding.values[(index + 1) % binding.values.length] });
  }
  return pluginParamUpdates(patch, patch, pattern!.params);
}

export function usePluginAudio(plugins: UIPlugin[] | undefined, pattern: PatternState | null,
  send: (message: Record<string, unknown>) => void, mode: string, playing: boolean) {
  const [bindings, setBindings] = useState<LoadedPluginAudio[]>([]);
  useEffect(() => {
    let cancelled = false;
    setBindings([]);
    const modes = new Set<string>();
    const tasks = (plugins ?? []).flatMap(plugin => plugin.tabs.flatMap(tab => {
      const audio = tab.audio;
      if (!audio || !tab.pattern || modes.has(audio.mode)) return [];
      modes.add(audio.mode);
      const file = tab.pattern;
      return [async (): Promise<LoadedPluginAudio | null> => {
        let source: string;
        try {
          source = await fetchPluginText(pluginAssetUrl(plugin.id, file));
          if (!source.trim()) throw new Error('Empty pattern');
        } catch (error) { console.warn(`Plugin audio ${tab.id}: ${String(error)}`); return null; }
        let values: unknown[] = [];
        if (audio.step) {
          try { values = parsePluginAudioValues(JSON.parse(await fetchPluginText(pluginAssetUrl(plugin.id, audio.step.values.file))), audio.step.values.key); }
          catch (error) { console.warn(`Plugin audio ${tab.id}: ${String(error)}`); }
        }
        return { tabId: tab.id, source, audio, values };
      }];
    }));
    Promise.all(tasks.map(run => run())).then(loaded => { if (!cancelled) setBindings(loaded.filter((binding): binding is LoadedPluginAudio => binding !== null)); });
    return () => { cancelled = true; };
  }, [plugins]);

  const current = useRef({ bindings, pattern, send });
  current.current = { bindings, pattern, send };
  const receive = useCallback((out: GraceAudioOutput): boolean => {
    const snapshot = current.current;
    const binding = activePluginAudio(snapshot.bindings, snapshot.pattern);
    if (!binding) return false;
    for (const command of pluginAudioCommands(binding, snapshot.pattern, out)) {
      snapshot.send(command);
      snapshot.pattern = { ...snapshot.pattern!, params: { ...snapshot.pattern!.params, [command.name as string]: command.value } };
    }
    return true;
  }, []);

  useEffect(() => {
    if (mode !== 'grace' || !playing) receive({ hueShift: 0, satShift: 0, step: false });
  }, [mode, playing, pattern, bindings, receive]);
  return receive;
}
