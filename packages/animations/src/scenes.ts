import type { Fixture, Layout } from '@wavegrid/layout';

import { amberScenes } from './amber';
import { isArtGrid, setTarget } from './helpers';
import { GridCell, SceneGenerator } from './types';

/**
 * Scenes assign a color per fixture from normalized coordinates (`u/v`) or the
 * fixture's logical index, so they work on any topology. The pixel-art scenes
 * (heart, SF) need the classic 7×7 grid and fall back to a wash elsewhere.
 */
export const scenes: Record<string, SceneGenerator> = {
  civic: () => ({ h: 220, s: 90, b: 80 }),

  pride: (f, layout) => ({ h: Math.round((f.index / layout.count) * 360), s: 100, b: 100 }),

  trans: f => {
    const band = Math.floor(f.v * 4.999);
    const colors = [
      { h: 197, s: 100, b: 100 },
      { h: 340, s: 100, b: 100 },
      { h: 0, s: 0, b: 100 },
      { h: 340, s: 100, b: 100 },
      { h: 197, s: 100, b: 100 }
    ];
    return colors[Math.min(band, 4)];
  },

  gold: () => ({ h: 45, s: 100, b: 100 }),

  white: () => ({ h: 0, s: 0, b: 100 }),

  solstice: f => ({ h: 40 + f.v * 30 + f.u * 24, s: 85, b: 80 }),

  ocean: f => ({ h: 180 + f.v * 48 + f.u * 18, s: 75, b: 70 }),

  sunset: f => ({ h: 10 + f.v * 30, s: 90, b: 85 - f.v * 30 }),

  heart: (f, layout) => {
    if (!isArtGrid(layout)) return { h: 0, s: 100, b: 2 };
    const bitmap = [
      [0, 1, 0, 0, 0, 1, 0],
      [1, 1, 1, 0, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0]
    ];
    const on = bitmap[f.row]?.[f.col];
    return on ? { h: 0, s: 100, b: 100 } : { h: 0, s: 0, b: 2 };
  },

  sf: (f, layout) => {
    if (!isArtGrid(layout)) return { h: 220, s: 80, b: 8 };
    const bitmap = [
      [0, 1, 1, 0, 1, 1, 1],
      [1, 0, 0, 0, 1, 0, 0],
      [1, 0, 0, 0, 1, 0, 0],
      [0, 1, 1, 0, 1, 1, 0],
      [0, 0, 1, 0, 1, 0, 0],
      [0, 0, 1, 0, 1, 0, 0],
      [1, 1, 0, 0, 1, 0, 0]
    ];
    const on = bitmap[f.row]?.[f.col];
    return on ? { h: 45, s: 95, b: 85 } : { h: 220, s: 80, b: 8 };
  },

  forest: f => ({ h: 120 + f.v * 36 + f.u * 12, s: 75, b: 30 + f.v * 48 }),

  fire: f => {
    const heat = 1 - f.v;
    return { h: 10 + heat * 36, s: 95, b: 40 + heat * 48 };
  },

  night: (f, layout) => {
    const starCount = Math.max(2, Math.floor(layout.count / 7));
    const step = layout.count / starCount;
    const starPositions = Array.from({ length: starCount }, (_, k) => Math.round(k * step));
    if (starPositions.includes(f.index)) {
      return { h: 200 + (f.u + f.v) * 60, s: 20, b: 90 };
    }
    return { h: 240, s: 60, b: 8 + f.v * 12 };
  },

  checker: (f, layout) => {
    const isLight = layout.hasGridCoords
      ? (f.row + f.col) % 2 === 0
      : f.index % 2 === 0;
    return isLight ? { h: 0, s: 0, b: 80 } : { h: 220, s: 80, b: 60 };
  },

  off: () => ({ h: 0, s: 0, b: 0 })
};

// ── Amber (Nova) presets ────

Object.assign(scenes, amberScenes);

export function getSceneNames(): string[] {
  return Object.keys(scenes);
}

/**
 * Apply a scene to a grid, setting targets for all cells.
 */
export function applyScene(grid: GridCell[], sceneName: string, layout: Layout): boolean {
  const generator = scenes[sceneName];
  if (!generator) return false;
  const n = Math.min(grid.length, layout.fixtures.length);
  for (let i = 0; i < n; i++) {
    const fixture: Fixture = layout.fixtures[i];
    const { h, s, b } = generator(fixture, layout);
    setTarget(grid, i, h, s, b);
  }
  return true;
}
