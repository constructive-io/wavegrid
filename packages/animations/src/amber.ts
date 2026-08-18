import type { Fixture, Layout } from '@wavegrid/layout';

import { setTarget, wrapUnit } from './helpers';
import { AnimationFn, SceneGenerator } from './types';

/**
 * Amber-only looks for the Nova rig — a ring of six lasers.
 *
 * A six-fixture ring can't draw a shape, and Nova is a single-colour rig: the
 * only two things that read from the floor are *where* on the circle the light
 * is and *how bright* it is. So every look below holds the hue at amber and
 * moves brightness around the ring by fixture angle, which keeps them correct
 * on any ring size (and degrades to index order on a rectangle).
 */

/** Amber. Deep enough to stay orange on a laser, not so deep it reads red. */
export const AMBER_HUE = 40;
export const AMBER_SAT = 100;

/**
 * Six descending brightness levels — one per Nova laser, so a look that wants
 * "different brightnesses of amber" can step through them exactly once around
 * the ring.
 */
export const AMBER_LEVELS = [100, 74, 52, 34, 20, 10];

/**
 * Where a fixture sits around the circle, 0..1 from 12 o'clock clockwise —
 * the same convention `ringLayout` places fixtures in. Rectangles have no
 * meaningful angle for this, so they fall back to logical order.
 */
export function ringPosition(fixture: Fixture, layout: Layout): number {
  if (layout.topology === 'grid') return fixture.index / Math.max(1, layout.count);
  return wrapUnit((fixture.angle + Math.PI / 2) / (Math.PI * 2));
}

/** Shortest distance between two 0..1 ring positions (0..0.5). */
function ringDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return d > 0.5 ? 1 - d : d;
}

function amber(b: number): { h: number; s: number; b: number } {
  return { h: AMBER_HUE, s: AMBER_SAT, b: Math.max(0, Math.min(100, b)) };
}

/** Static amber presets, keyed the same way as every other scene. */
export const amberScenes: Record<string, SceneGenerator> = {
  amber: () => amber(100),

  // The house look between cues: lit, warm, and clearly not a blackout.
  'amber-glow': () => amber(45),

  // On six fixtures this is three bright and three dim, alternating.
  'amber-alternate': (f, layout) => {
    const slot = layout.topology === 'grid' ? f.index : Math.round(ringPosition(f, layout) * layout.count);
    return amber(slot % 2 === 0 ? 100 : 22);
  },

  // One brightness level per laser, brightest at 12 o'clock.
  'amber-ramp': (f, layout) => {
    const slot = Math.round(ringPosition(f, layout) * layout.count) % layout.count;
    return amber(AMBER_LEVELS[slot % AMBER_LEVELS.length]);
  },

  // Bright on the top half of the circle, dim on the bottom.
  'amber-horizon': (f, layout) => amber(ringPosition(f, layout) < 0.5 ? 100 : 25)
};

/** Amber motion — brightness travelling around the circle, hue held at amber. */
export const amberAnimations: Record<string, AnimationFn> = {
  // One laser lit at a time, stepping around the ring: the clearest "it's a
  // circle" cue a six-laser rig has.
  'amber-chase': (grid, tick, attack, layout) => {
    const lit = Math.floor(tick * 0.06) % layout.count;
    layout.fixtures.forEach((f, i) => {
      const slot = Math.round(ringPosition(f, layout) * layout.count) % layout.count;
      setTarget(grid, i, AMBER_HUE, AMBER_SAT, slot === lit ? 100 : 8, attack);
    });
  },

  // A bright head with a fading tail, sweeping continuously round the circle.
  'amber-comet': (grid, tick, attack, layout) => {
    const head = wrapUnit(tick * 0.008);
    layout.fixtures.forEach((f, i) => {
      const d = ringDistance(ringPosition(f, layout), head);
      setTarget(grid, i, AMBER_HUE, AMBER_SAT, Math.max(6, 100 - d * layout.count * 40), attack);
    });
  },

  // A smooth brightness wave rolling around the ring — no fixture ever goes
  // fully dark, so the rig stays warm while it moves.
  'amber-wave': (grid, tick, attack, layout) => {
    const phase = tick * 0.01;
    layout.fixtures.forEach((f, i) => {
      const wave = Math.sin((ringPosition(f, layout) - phase) * Math.PI * 2);
      setTarget(grid, i, AMBER_HUE, AMBER_SAT, 30 + 70 * (0.5 + 0.5 * wave), attack);
    });
  },

  // The whole ring breathing as one.
  'amber-breathe': (grid, tick, attack) => {
    const b = 55 + 45 * Math.sin(tick * 0.02);
    for (let i = 0; i < grid.length; i++) {
      setTarget(grid, i, AMBER_HUE, AMBER_SAT, Math.max(8, b), attack);
    }
  },

  // Two alternating triads trading places — a slow amber heartbeat.
  'amber-heartbeat': (grid, tick, attack, layout) => {
    const swing = 0.5 + 0.5 * Math.sin(tick * 0.03);
    layout.fixtures.forEach((f, i) => {
      const slot = Math.round(ringPosition(f, layout) * layout.count) % layout.count;
      const level = slot % 2 === 0 ? swing : 1 - swing;
      setTarget(grid, i, AMBER_HUE, AMBER_SAT, 12 + 88 * level, attack);
    });
  },

  // Every laser drifts through its own brightness at its own rate: candlelight
  // rather than motion, for when a cue should feel still but alive.
  'amber-embers': (grid, tick, attack, layout) => {
    layout.fixtures.forEach((f, i) => {
      const pos = ringPosition(f, layout);
      const flicker = Math.sin(tick * 0.021 + pos * 11) * 0.6 + Math.sin(tick * 0.013 + pos * 27) * 0.4;
      setTarget(grid, i, AMBER_HUE, AMBER_SAT, 55 + 40 * flicker, attack);
    });
  },

  // The six brightness levels themselves, rotating one slot at a time.
  'amber-levels': (grid, tick, attack, layout) => {
    const offset = Math.floor(tick * 0.05);
    layout.fixtures.forEach((f, i) => {
      const slot = Math.round(ringPosition(f, layout) * layout.count) % layout.count;
      const level = AMBER_LEVELS[(slot + offset) % AMBER_LEVELS.length];
      setTarget(grid, i, AMBER_HUE, AMBER_SAT, level, attack);
    });
  }
};

/** What a look is called on the wire, and what an operator should see. */
export interface AmberLook {
  /** Scene or animation name — the `name` field of the wire command. */
  id: string;
  kind: 'scene' | 'animation';
  label: string;
  description: string;
}

/**
 * The Nova panel's menu, ordered the way an operator reaches for it: the still
 * presets first, then the motion.
 */
export const AMBER_LOOKS: AmberLook[] = [
  { id: 'amber', kind: 'scene', label: 'Amber', description: 'Every laser at full amber' },
  { id: 'amber-glow', kind: 'scene', label: 'Glow', description: 'Warm amber wash, half brightness' },
  { id: 'amber-alternate', kind: 'scene', label: 'Alternate', description: 'Three bright, three dim' },
  { id: 'amber-ramp', kind: 'scene', label: 'Ramp', description: 'A brightness level per laser' },
  { id: 'amber-horizon', kind: 'scene', label: 'Horizon', description: 'Bright top half, dim bottom' },
  { id: 'amber-chase', kind: 'animation', label: 'Chase', description: 'One laser at a time, around the ring' },
  { id: 'amber-comet', kind: 'animation', label: 'Comet', description: 'Bright head, fading tail' },
  { id: 'amber-wave', kind: 'animation', label: 'Wave', description: 'Brightness wave rolling around' },
  { id: 'amber-levels', kind: 'animation', label: 'Levels', description: 'Six brightness levels, rotating' },
  { id: 'amber-heartbeat', kind: 'animation', label: 'Heartbeat', description: 'Two triads trading brightness' },
  { id: 'amber-embers', kind: 'animation', label: 'Embers', description: 'Candlelit flicker, no motion' },
  { id: 'amber-breathe', kind: 'animation', label: 'Breathe', description: 'The whole ring as one' }
];
