import type { Layout } from '@wavegrid/layout';

import { GridCell } from './types';

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function smooth(value: number): number {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

export function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

export const PRIDE_COLORS = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#24408e', '#732982'];

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map(part => `${part}${part}`).join('')
    : value.padEnd(6, '0').slice(0, 6);
  const number = Number.parseInt(normalized, 16);

  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255
  };
}

export function rgbToHsb(r: number, g: number, b: number): { h: number; s: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }

  return {
    h: (h + 360) % 360,
    s: max === 0 ? 0 : (delta / max) * 100
  };
}

export function prideColorAt(position: number, time: number): { h: number; s: number } {
  const scaled = wrapUnit(position + time * 0.025) * PRIDE_COLORS.length;
  const index = Math.floor(scaled);
  const nextIndex = (index + 1) % PRIDE_COLORS.length;
  const mix = scaled - index;
  const from = hexToRgb(PRIDE_COLORS[index]);
  const to = hexToRgb(PRIDE_COLORS[nextIndex]);
  const r = Math.round(from.r + (to.r - from.r) * mix);
  const g = Math.round(from.g + (to.g - from.g) * mix);
  const b = Math.round(from.b + (to.b - from.b) * mix);

  return rgbToHsb(r, g, b);
}

export const ROYGBIV: Array<{ h: number; s: number }> = [
  { h: 0, s: 100 },     // Red
  { h: 30, s: 100 },    // Orange
  { h: 55, s: 100 },    // Yellow
  { h: 120, s: 100 },   // Green
  { h: 210, s: 100 },   // Blue
  { h: 260, s: 100 },   // Indigo
  { h: 290, s: 100 }    // Violet
];

export function roygbivAt(position: number): { h: number; s: number } {
  const p = ((position % 1) + 1) % 1;
  const scaled = p * ROYGBIV.length;
  const idx = Math.floor(scaled);
  const mix = scaled - idx;
  const a = ROYGBIV[idx % ROYGBIV.length];
  const b = ROYGBIV[(idx + 1) % ROYGBIV.length];
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return {
    h: ((a.h + dh * mix) + 360) % 360,
    s: a.s + (b.s - a.s) * mix
  };
}

/** The trans flag as a cyclic palette: blue, pink, white, pink, blue. */
export const TRANS_COLORS: Array<{ h: number; s: number }> = [
  { h: 197, s: 100 },
  { h: 340, s: 60 },
  { h: 0, s: 0 },
  { h: 340, s: 60 },
  { h: 197, s: 100 }
];

/** Sample the trans palette at `position` (0–1, wrapping), blending stops. */
export function transColorAt(position: number): { h: number; s: number } {
  const scaled = wrapUnit(position) * TRANS_COLORS.length;
  const idx = Math.floor(scaled);
  const mix = scaled - idx;
  const a = TRANS_COLORS[idx % TRANS_COLORS.length];
  const b = TRANS_COLORS[(idx + 1) % TRANS_COLORS.length];
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return {
    h: (a.h + dh * mix + 360) % 360,
    s: a.s + (b.s - a.s) * mix
  };
}

export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Set target for a single cell.
 * attack (0–1): how much of the new value to apply.
 */
export function setTarget(grid: GridCell[], index: number, h?: number, s?: number, b?: number, attack: number = 1.0) {
  const c = grid[index];
  if (attack >= 1.0) {
    if (h !== undefined) c.targetH = h;
    if (s !== undefined) c.targetS = s;
    if (b !== undefined) c.targetB = b;
  } else {
    if (h !== undefined) {
      const dh = angleDelta(c.targetH, h);
      c.targetH = (c.targetH + dh * attack + 360) % 360;
    }
    if (s !== undefined) c.targetS = c.targetS + (s - c.targetS) * attack;
    if (b !== undefined) c.targetB = c.targetB + (b - c.targetB) * attack;
  }
}

/**
 * True when a layout is the classic 7×7 grid the pixel-art scenes/animations
 * (heart, SF, "I ♥ SF") were drawn for. On any other shape those bitmaps have
 * no meaning, so callers fall back to a plain wash.
 */
export function isArtGrid(layout: Layout): boolean {
  return layout.hasGridCoords && layout.cols === 7 && layout.rows >= 7;
}
