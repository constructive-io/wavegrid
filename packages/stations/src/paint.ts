import type { Station } from './config';

export interface StationColor { h: number; s: number; b: number }
export interface StationCell extends StationColor { idx: number }
export const stationModes = ['mixed', 'show', 'stations'] as const;
export type StationMode = typeof stationModes[number];

export function isStationMode(value: unknown): value is StationMode {
  return stationModes.some(mode => mode === value);
}

const black = { h: 0, s: 0, b: 0 };

export class StationPaint {
  private layers = new Map<string, Map<number, StationColor>>();
  private mode: StationMode = 'mixed';
  private locked = false;

  get currentMode(): StationMode { return this.mode; }
  get acceptsInput(): boolean { return !this.locked && this.mode !== 'show'; }

  setMode(mode: StationMode): void {
    this.mode = mode;
    this.locked = false;
    if (mode === 'show') this.layers.clear();
  }

  stop(): void {
    this.layers.clear();
    this.locked = true;
  }

  write(station: Station, idx: number, color: StationColor): void {
    let layer = this.layers.get(station.slug);
    if (!layer) {
      layer = new Map();
      this.layers.set(station.slug, layer);
    }
    layer.set(idx, color);
  }

  snapshot(count: number): StationCell[] {
    if (this.mode === 'show') return [];
    const cells = this.mode === 'stations'
      ? Array.from({ length: count }, (_, idx) => ({ idx, ...black }))
      : [];
    if (this.locked) return cells;
    for (const layer of this.layers.values()) {
      for (const [idx, color] of layer) {
        const cell = { idx, ...color };
        if (this.mode === 'stations') cells[idx] = cell;
        else cells.push(cell);
      }
    }
    return cells;
  }
}

export function compositeStationPaint<T extends StationColor>(base: T[], cells: readonly StationCell[]): T[] {
  if (!cells.length) return base;
  const result = base.slice();
  for (const { idx, h, s, b } of cells) {
    if (Number.isInteger(idx) && idx >= 0 && idx < base.length) result[idx] = { ...base[idx], h, s, b };
  }
  return result;
}

type StationTool = (msg: Record<string, unknown>, station: Station, paint: StationPaint) => boolean;

export const stationTools: Readonly<Record<string, StationTool>> = Object.freeze({
  cannon(msg, station, paint) {
    const { index, h, s, b } = msg;
    if (typeof index !== 'number' || !station.fixtures.includes(index) ||
        typeof h !== 'number' || !Number.isFinite(h) || h < 0 || h > 360 ||
        typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > 100 ||
        typeof b !== 'number' || !Number.isFinite(b) || b < 0 || b > 100) return false;
    paint.write(station, index, { h, s, b });
    return true;
  },
  clear(_msg, station, paint) {
    for (const index of station.fixtures) paint.write(station, index, black);
    return true;
  }
});

export function dispatchStationTool(msg: Record<string, unknown>, station: Station, paint: StationPaint): boolean {
  return paint.acceptsInput && typeof msg.type === 'string' &&
    Object.prototype.hasOwnProperty.call(stationTools, msg.type) &&
    stationTools[msg.type](msg, station, paint);
}
