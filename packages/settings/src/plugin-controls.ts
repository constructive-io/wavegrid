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
