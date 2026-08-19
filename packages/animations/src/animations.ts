import type { Fixture, Layout } from '@wavegrid/layout';

import { amberAnimations } from './amber';
import { isArtGrid, prideColorAt, ROYGBIV, roygbivAt, setTarget, smooth, transColorAt } from './helpers';
import { AnimationFn, GridCell } from './types';

/**
 * Every animation reads geometry from the layout's fixtures (normalized
 * `u/v`, polar `angle/radius`, or grid `row/col`) rather than from a column
 * count, so the same effect runs on a rectangle, a strip, or a circle.
 */
export const animations: Record<string, AnimationFn> = {
  wave: (grid, tick, attack, layout) => {
    layout.fixtures.forEach((f, i) => {
      const hue = (tick * 2 + f.u * 280) % 360;
      const bright = 60 + Math.sin(tick * 0.05 + f.u * 5.6) * 20;
      setTarget(grid, i, hue, 85, bright, attack);
    });
  },

  breathe: (grid, tick, attack) => {
    const brightness = 40 + Math.sin(tick * 0.03) * 35;
    for (let i = 0; i < grid.length; i++) {
      setTarget(grid, i, 220, 80, brightness, attack);
    }
  },

  rainbow: (grid, tick, attack, layout) => {
    layout.fixtures.forEach((f, i) => {
      const hue = (tick * 1.5 + (f.u + f.v) * 175) % 360;
      setTarget(grid, i, hue, 90, 80, attack);
    });
  },

  pacman: (grid, tick, attack, layout) => {
    const perimeter = layout.perimeter;
    const pos = Math.floor(tick * 0.3) % perimeter.length;
    for (let i = 0; i < grid.length; i++) {
      setTarget(grid, i, 220, 60, 15, attack);
    }
    const pacIdx = perimeter[pos];
    setTarget(grid, pacIdx, 55, 95, 95, 1.0);
    for (let t = 1; t <= 3; t++) {
      const trailPos = (pos - t + perimeter.length) % perimeter.length;
      const trailIdx = perimeter[trailPos];
      setTarget(grid, trailIdx, 55, 80, 70 - t * 18, 1.0);
    }
  },

  spiral: (grid, tick, attack, layout) => {
    const time = tick / 60;
    layout.fixtures.forEach((f, i) => {
      const phase = f.angle;
      const distance = f.radius;
      const arms = Math.cos(phase * 3 - time * 1.55 + distance * 6.2);
      const tail = Math.cos(phase * 3 - time * 1.55 + distance * 6.2 - 0.72);
      const coreVoid = smooth((distance - 0.16) / 0.18);
      const intensity = (smooth((arms - 0.18) / 0.82) * 0.78 + smooth((tail - 0.2) / 0.8) * 0.24) * coreVoid;
      const color = prideColorAt(0.78 + phase / (Math.PI * 2) + time * 0.1 + tail * 0.08, time);
      setTarget(grid, i, color.h, color.s, intensity * 100, attack);
    });
  },

  rain: (grid, tick, attack, layout) => {
    layout.fixtures.forEach((f, i) => {
      const phase = (tick * 0.0025 + f.u * 2.3 + f.u * f.u * 0.7) % 1;
      const dist = Math.abs(f.v - phase);
      const bright = dist < 0.22 ? 90 - dist * 200 : 10;
      setTarget(grid, i, 200 + f.u * 56, 70, bright, attack);
    });
  },

  'i-heart-sf': (grid, tick, attack, layout) => {
    const bitmaps = [
      // "I"
      [
        [0, 0, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 0, 0]
      ],
      // Heart
      [
        [0, 1, 0, 0, 0, 1, 0],
        [1, 1, 1, 0, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
      ],
      // "SF"
      [
        [0, 1, 1, 0, 1, 1, 1],
        [1, 0, 0, 0, 1, 0, 0],
        [1, 0, 0, 0, 1, 0, 0],
        [0, 1, 1, 0, 1, 1, 0],
        [0, 0, 1, 0, 1, 0, 0],
        [0, 0, 1, 0, 1, 0, 0],
        [1, 1, 0, 0, 1, 0, 0]
      ]
    ];
    const colors = [
      { h: 45, s: 100, b: 100 },
      { h: 0, s: 100, b: 100 },
      { h: 45, s: 100, b: 100 }
    ];
    const frameTicks = 180; // 3s per frame
    const frame = Math.floor(tick / frameTicks) % 3;
    const bitmap = bitmaps[frame];
    const color = colors[frame];
    const art = isArtGrid(layout);
    layout.fixtures.forEach((f, i) => {
      const on = art && bitmap[f.row]?.[f.col];
      if (on) setTarget(grid, i, color.h, color.s, color.b, attack);
      else setTarget(grid, i, 220, 80, 8, attack);
    });
  },

  'heart-breathe': (grid, tick, attack, layout) => {
    const bitmap = [
      [0, 1, 0, 0, 0, 1, 0],
      [1, 1, 1, 0, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0]
    ];
    const t = (Math.sin(tick * 0.03) + 1) / 2;
    const brightness = 5 + Math.pow(t, 0.4) * 95;
    const art = isArtGrid(layout);
    layout.fixtures.forEach((f, i) => {
      const on = art && bitmap[f.row]?.[f.col];
      if (on) setTarget(grid, i, 0, 100, brightness, attack);
      else setTarget(grid, i, 0, 0, 2, attack);
    });
  }
};

// ── ROYGBIV Pride animations ────

animations['pride-flow'] = (grid, tick, attack, layout) => {
  const speed = tick * 0.012;
  layout.fixtures.forEach((f, i) => {
    const color = roygbivAt(f.v + speed);
    setTarget(grid, i, color.h, color.s, 90, attack);
  });
};

animations['pride-breathe'] = (grid, tick, attack) => {
  const speed = tick * 0.008;
  const brightness = 70 + Math.sin(tick * 0.04) * 20;
  const color = roygbivAt(speed);
  for (let i = 0; i < grid.length; i++) {
    setTarget(grid, i, color.h, color.s, brightness, attack);
  }
};

animations['pride-rotate'] = (grid, tick, attack, layout) => {
  const offset = Math.floor(tick * 0.08);
  layout.fixtures.forEach((f, i) => {
    const band = bandIndex(f, layout);
    const idx = ((band + offset) % ROYGBIV.length + ROYGBIV.length) % ROYGBIV.length;
    const color = ROYGBIV[idx];
    setTarget(grid, i, color.h, color.s, 90, attack);
  });
};

animations['pride-ring'] = (grid, tick, attack, layout) => {
  const n = layout.count;
  const speed = tick * 0.012;
  layout.fixtures.forEach((f, i) => {
    const color = roygbivAt(i / n + speed);
    setTarget(grid, i, color.h, color.s, 90, attack);
  });
};

// ── Trans flag animations ────
//
// The same three shapes as the pride looks, on the trans palette — the
// sequences have always asked for these by name.

animations['trans-flow'] = (grid, tick, attack, layout) => {
  const speed = tick * 0.012;
  layout.fixtures.forEach((f, i) => {
    const color = transColorAt(f.v + speed);
    setTarget(grid, i, color.h, color.s, 90, attack);
  });
};

animations['trans-breathe'] = (grid, tick, attack) => {
  const color = transColorAt(tick * 0.008);
  const brightness = 70 + Math.sin(tick * 0.04) * 20;
  for (let i = 0; i < grid.length; i++) {
    setTarget(grid, i, color.h, color.s, brightness, attack);
  }
};

animations['trans-ring'] = (grid, tick, attack, layout) => {
  const speed = tick * 0.012;
  layout.fixtures.forEach((f, i) => {
    const color = transColorAt(i / layout.count + speed);
    setTarget(grid, i, color.h, color.s, 90, attack);
  });
};

// ── Amber (Nova) animations ────

Object.assign(animations, amberAnimations);

/** A discrete "column-ish" band: grid column when available, else fixture index. */
function bandIndex(f: Fixture, layout: Layout): number {
  return layout.hasGridCoords ? f.col : f.index;
}

export function getAnimationNames(): string[] {
  return Object.keys(animations);
}

/**
 * Evaluate an animation by name against a grid.
 * Returns false if animation name is unknown.
 */
export function evaluateAnimation(
  grid: GridCell[],
  name: string,
  tick: number,
  attack: number,
  layout: Layout
): boolean {
  const fn = animations[name];
  if (!fn) return false;
  fn(grid, tick, attack, layout);
  return true;
}
