type ParamControl = { param: string; label?: string };
export type PluginControl =
  | (ParamControl & { type: 'slider'; min: number; max: number; step?: number; default: number })
  | (ParamControl & { type: 'toggle'; default: boolean })
  | (ParamControl & { type: 'select'; options: { label: string; value: string | number | boolean }[]; default: string | number | boolean })
  | (ParamControl & { type: 'color'; default: string })
  | { type: 'button'; label: string; action: 'start' | 'stop' };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function scalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'boolean' || finite(value);
}

export type PluginAudioField = 'hueShift' | 'satShift' | 'step';
export interface PluginAudioBinding {
  mode: 'grace';
  params: Partial<Record<PluginAudioField, string>>;
  step?: { param: string; values: { file: string; key?: string }; set: Record<string, unknown> };
}

function paramName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
}

function jsonValue(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value)) return true;
  if (Array.isArray(value)) return value.every(item => jsonValue(item, depth + 1));
  return isRecord(value) && Object.values(value).every(item => jsonValue(item, depth + 1));
}

export function parsePluginAudio(raw: unknown): PluginAudioBinding | null {
  if (!isRecord(raw) || raw.mode !== 'grace' || (raw.params !== undefined && !isRecord(raw.params))) return null;
  const params = raw.params ?? {};
  if (!Object.entries(params).every(([field, target]) => ['hueShift', 'satShift', 'step'].includes(field) && paramName(target))) return null;
  const result: PluginAudioBinding = { mode: 'grace', params: { ...(params as PluginAudioBinding['params']) } };
  if (raw.step !== undefined) {
    const step = raw.step;
    if (!isRecord(step) || !paramName(step.param) || !isRecord(step.values)) return null;
    const { file, key } = step.values;
    if (typeof file !== 'string' || !file || /[\\:\0]/.test(file) || file.split('/').some(part => !part || part.startsWith('.')) ||
      (key !== undefined && !paramName(key))) return null;
    const set = step.set === undefined ? {} : step.set;
    if (!isRecord(set) || !Object.keys(set).every(paramName) || !jsonValue(set)) return null;
    result.step = { param: step.param, values: { file, ...(key === undefined ? {} : { key: key as string }) }, set: { ...set } };
  }
  return Object.keys(params).length || result.step ? result : null;
}

export function parsePluginAudioValues(raw: unknown, key?: string): unknown[] {
  if (!Array.isArray(raw) || !raw.length || (key !== undefined && !paramName(key))) throw new Error('Audio values must be a nonempty JSON array');
  const values = raw.map(value => {
    if (key === undefined) return value;
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`Audio value needs key ${key}`);
    return value[key];
  });
  if (!values.every(value => jsonValue(value))) throw new Error('Audio values must contain finite JSON values');
  return values;
}

/** Browser-safe normalization shared by project validation and the UI. */
export function parsePluginControl(raw: unknown): PluginControl | null {
  if (!isRecord(raw)) return null;
  if (raw.type === 'button') {
    return typeof raw.label === 'string' && raw.label.trim() && (raw.action === 'start' || raw.action === 'stop')
      ? { type: 'button', label: raw.label, action: raw.action } : null;
  }
  if (typeof raw.param !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(raw.param) ||
    ['__proto__', 'constructor', 'prototype'].includes(raw.param) ||
    (raw.label !== undefined && typeof raw.label !== 'string')) return null;
  const base = { param: raw.param, ...(raw.label === undefined ? {} : { label: raw.label as string }) };
  switch (raw.type) {
  case 'slider':
    if (!finite(raw.min) || !finite(raw.max) || raw.min > raw.max || !finite(raw.default) ||
        raw.default < raw.min || raw.default > raw.max || (raw.step !== undefined && (!finite(raw.step) || raw.step <= 0))) return null;
    return { ...base, type: 'slider', min: raw.min, max: raw.max, default: raw.default,
      ...(raw.step === undefined ? {} : { step: raw.step as number }) };
  case 'toggle': return typeof raw.default === 'boolean' ? { ...base, type: 'toggle', default: raw.default } : null;
  case 'color': return typeof raw.default === 'string' && /^#[\da-f]{6}$/i.test(raw.default)
    ? { ...base, type: 'color', default: raw.default } : null;
  case 'select': {
    if (!Array.isArray(raw.options) || !raw.options.length) return null;
    if (!raw.options.every(option => typeof option === 'string') && !raw.options.every(isRecord)) return null;
    const options = raw.options.map(option => typeof option === 'string' ? { label: option, value: option } : option);
    if (!options.every(option => isRecord(option) && typeof option.label === 'string' && scalar(option.value))) return null;
    const choices = options as Extract<PluginControl, { type: 'select' }>['options'];
    if (!scalar(raw.default) || !choices.some(option => option.value === raw.default)) return null;
    return { ...base, type: 'select', options: choices, default: raw.default };
  }
  default: return null;
  }
}
