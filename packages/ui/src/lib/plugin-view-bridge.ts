import type { Layout } from '@wavegrid/layout/client';
import { isRecord } from '@wavegrid/settings/plugin-controls';

import type { Look } from './socket-state';

export const VIEW_MESSAGE_MAX_BYTES = 256 * 1024;
export interface ViewLoadState { generation: number; loaded: boolean; restarts: number[]; error: boolean }

export function initialViewLoadState(): ViewLoadState {
  return { generation: 0, loaded: false, restarts: [], error: false };
}

export function nextViewLoad(state: ViewLoadState, now: number): ViewLoadState {
  if (state.error) return state;
  if (!state.loaded) return { ...state, loaded: true };
  const restarts = state.restarts.filter(time => time > now - 10000);
  if (restarts.length >= 3) return { ...state, loaded: false, error: true };
  return { generation: state.generation + 1, loaded: false, restarts: [...restarts, now], error: false };
}

export type PluginPaint = { index: number; h: number; s: number; b: number };
export type RegisterPluginPaint = (handler: ((paint: PluginPaint) => void) | null) => void;
export type ViewMessage =
  | { wg: 1; type: 'start'; params?: Record<string, unknown> }
  | { wg: 1; type: 'stop' }
  | { wg: 1; type: 'setParams'; params: Record<string, unknown> }
  | { wg: 1; type: 'saveLook'; name: string; params: Record<string, unknown> }
  | { wg: 1; type: 'renameLook'; id: string; name: string }
  | { wg: 1; type: 'deleteLook'; id: string }
  | { wg: 1; type: 'resize'; height: number };

export function viewMessageFits(data: unknown): boolean {
  try {
    const json = JSON.stringify(data);
    return typeof json === 'string' && new TextEncoder().encode(json).length <= VIEW_MESSAGE_MAX_BYTES;
  } catch { return false; }
}

function jsonValue(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => jsonValue(item, depth + 1));
  return isRecord(value) && Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).every(item => jsonValue(item, depth + 1));
}

function params(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Object.keys(value).some(key => ['__proto__', 'constructor', 'prototype'].includes(key)) && jsonValue(value);
}

export function readViewMessage(data: unknown, source: unknown, expectedSource: unknown): { message?: ViewMessage; warning?: string } {
  if (!expectedSource || source !== expectedSource) return {};
  try {
    if (!viewMessageFits(data)) return { warning: 'Plugin view message exceeds 256 KiB or is not JSON' };
    if (!isRecord(data)) return { warning: 'Invalid plugin view envelope' };
    if (data.wg === 'resize') data = { wg: 1, type: 'resize', height: data.height };
    if (!isRecord(data) || data.wg !== 1 || typeof data.type !== 'string') return { warning: 'Invalid plugin view envelope' };
    const invalid = { warning: `Invalid plugin view ${data.type} message` };
    switch (data.type) {
    case 'start':
      return data.params === undefined || params(data.params)
        ? { message: { wg: 1, type: 'start', ...(data.params === undefined ? {} : { params: data.params }) } } : invalid;
    case 'stop': return { message: { wg: 1, type: 'stop' } };
    case 'setParams': return params(data.params) ? { message: { wg: 1, type: 'setParams', params: data.params } } : invalid;
    case 'saveLook': return typeof data.name === 'string' && params(data.params)
      ? { message: { wg: 1, type: 'saveLook', name: data.name, params: data.params } } : invalid;
    case 'renameLook': return typeof data.id === 'string' && typeof data.name === 'string'
      ? { message: { wg: 1, type: 'renameLook', id: data.id, name: data.name } } : invalid;
    case 'deleteLook': return typeof data.id === 'string' ? { message: { wg: 1, type: 'deleteLook', id: data.id } } : invalid;
    case 'resize': return typeof data.height === 'number' && Number.isFinite(data.height)
      ? { message: { wg: 1, type: 'resize', height: Math.max(120, Math.min(1600, data.height)) } } : invalid;
    default: return {};
    }
  } catch { return { warning: 'Invalid plugin view message' }; }
}

export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && jsonEqual(a[key], b[key]));
}

export function pluginParamUpdates(patch: Record<string, unknown>, next: Record<string, unknown>, live: unknown) {
  const current = isRecord(live) ? live : {};
  return Object.keys(patch).filter(name => Object.prototype.hasOwnProperty.call(next, name) &&
    (!Object.prototype.hasOwnProperty.call(current, name) || !jsonEqual(current[name], next[name])))
    .map(name => ({ type: 'setPatternParam', name, value: next[name] }));
}

export function viewLooks(looks: Look[], scope: string): Look[] {
  return looks.filter(look => look.params?.plugin === scope);
}

export function viewLookCommand(message: ViewMessage, scope: string, looks: Look[]): Record<string, unknown> | null {
  if (message.type === 'saveLook') return { type: 'saveLook', name: message.name, params: { ...message.params, plugin: scope } };
  if ((message.type === 'renameLook' || message.type === 'deleteLook') && viewLooks(looks, scope).some(look => look.id === message.id)) {
    return message.type === 'renameLook' ? { type: 'renameLook', id: message.id, name: message.name } : { type: 'deleteLook', id: message.id };
  }
  return null;
}

export function viewLayout(layout: Layout) {
  return { id: layout.id, topology: layout.topology, count: layout.count, cols: layout.cols, rows: layout.rows,
    fixtures: layout.fixtures.map(f => ({ index: f.index, x: f.x, y: f.y, u: f.u, v: f.v, uv: [f.u, f.v],
      col: f.col, row: f.row, radius: f.radius, angle: f.angle, kind: f.kind ?? 'cannon' })) };
}
