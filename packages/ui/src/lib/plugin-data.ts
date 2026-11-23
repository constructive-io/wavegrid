import type { ShowWhen } from '@wavegrid/animations';
import { isRecord, parsePluginAudio, parsePluginControl, type PluginAudioBinding, type PluginControl } from '@wavegrid/settings/plugin-controls';

export type { PluginControl } from '@wavegrid/settings/plugin-controls';
export interface PluginCard { title: string; controls: PluginControl[] }
export interface PluginTabData { id: string; label: string; showWhen: ShowWhen; pattern?: string; view?: string; paint?: boolean; audio?: PluginAudioBinding; cards: PluginCard[] }
export interface UIPlugin { id: string; name: string; tabs: PluginTabData[]; presetsFile?: string }

function assetPath(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw || raw.startsWith('/') || /[\\:\0]/.test(raw)) return undefined;
  if (raw.split('/').some(part => !part || part.startsWith('.'))) return undefined;
  return raw;
}

function condition(raw: unknown): ShowWhen {
  if (raw === undefined || raw === 'always') return 'always';
  if (raw === 'never') return 'never';
  if (!isRecord(raw) || Object.keys(raw).some(key => !['fixtureKind', 'topology', 'minFixtures', 'layoutId'].includes(key)) ||
    (raw.fixtureKind !== undefined && raw.fixtureKind !== 'cannon' && raw.fixtureKind !== 'projector') ||
    (raw.topology !== undefined && typeof raw.topology !== 'string') ||
    (raw.minFixtures !== undefined && (typeof raw.minFixtures !== 'number' || !Number.isFinite(raw.minFixtures))) ||
    (raw.layoutId !== undefined && typeof raw.layoutId !== 'string' && !(Array.isArray(raw.layoutId) && raw.layoutId.every(id => typeof id === 'string')))) return 'never';
  return raw as ShowWhen;
}

export function coerceCards(raw: unknown): PluginCard[] {
  if (!Array.isArray(raw)) return [];
  const params = new Set<string>();
  return raw.filter(card => isRecord(card) && typeof card.title === 'string').map(card => ({
    title: card.title as string,
    controls: (Array.isArray(card.controls) ? card.controls : []).flatMap((raw: unknown) => {
      const control = parsePluginControl(raw);
      if (!control || (control.type !== 'button' && params.has(control.param))) return [];
      if (control.type !== 'button') params.add(control.param);
      return [control];
    })
  }));
}

export function coercePlugins(raw: unknown): UIPlugin[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const audioModes = new Set<string>();
  return raw.flatMap(plugin => {
    if (!isRecord(plugin) || typeof plugin.id !== 'string' || !/^[\w.-]+$/.test(plugin.id) ||
      plugin.id === '.' || plugin.id === '..' || !Array.isArray(plugin.tabs)) return [];
    const id = plugin.id;
    const tabs = plugin.tabs.flatMap(tab => {
      if (!isRecord(tab) || typeof tab.id !== 'string' || !tab.id || typeof tab.label !== 'string' || !tab.label) return [];
      const tabId = tab.id.startsWith(id + '/') ? tab.id : `${id}/${tab.id}`;
      if (ids.has(tabId)) return [];
      ids.add(tabId);
      const audio = parsePluginAudio(tab.audio);
      const useAudio = audio && !audioModes.has(audio.mode);
      if (useAudio) audioModes.add(audio.mode);
      return [{ id: tabId, label: tab.label, showWhen: condition(tab.showWhen),
        ...(useAudio ? { audio } : {}),
        view: assetPath(tab.view), paint: tab.paint === true,
        pattern: assetPath(tab.pattern ?? plugin.pattern), cards: coerceCards(tab.cards) }];
    });
    return [{ id, name: typeof plugin.name === 'string' ? plugin.name : id, tabs, presetsFile: assetPath(plugin.presetsFile) }];
  });
}

export function coercePluginParams(controls: PluginControl[], raw: unknown): Record<string, unknown> {
  const input = isRecord(raw) ? raw : {};
  return Object.fromEntries(controls.flatMap(control => {
    if (control.type === 'button') return [];
    const value = Object.prototype.hasOwnProperty.call(input, control.param) ? input[control.param] : undefined;
    let next: unknown = control.default;
    switch (control.type) {
    case 'slider': {
      const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
      if (Number.isFinite(n)) next = Math.max(control.min, Math.min(control.max, n));
      break;
    }
    case 'toggle':
      if (typeof value === 'boolean') next = value;
      else if (value === 'true' || value === 1) next = true;
      else if (value === 'false' || value === 0) next = false;
      break;
    case 'select': next = control.options.find(option => option.value === value)?.value ?? control.default; break;
    case 'color': if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) next = value.toLowerCase(); break;
    }
    return [[control.param, next]];
  }));
}

export function pluginAssetUrl(id: string, file: string): string {
  return `/plugins/${encodeURIComponent(id)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}
