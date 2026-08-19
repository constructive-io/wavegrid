import type { Layout } from '@wavegrid/layout/client';

import { fitsReason, lookDef } from './catalog';

export interface ShowStep {
  type: 'animation' | 'scene' | 'evalPattern';
  name?: string;
  code?: string;
  /** Seconds on screen. */
  duration: number;
}

export interface ShowPreset {
  /** Stable id — what the UI keys and remembers. */
  id: string;
  name: string;
  description: string;
  /** CSS gradient for the card's swatch. */
  gradient: string;
  /** `sequence`: play as-is. `playlist`: a starting point to edit. */
  kind: 'sequence' | 'playlist';
  transition: 'cut' | 'fade';
  transitionDuration: number;
  loop: boolean;
  steps: ShowStep[];
}

const AMBER_GRADIENT = 'linear-gradient(135deg, #ffb703, #ff8800, #4a2a00)';
const PRIDE_GRADIENT = 'linear-gradient(135deg, #e40303, #ff8c00, #ffed00, #008026, #004dff, #750787)';

/**
 * Every preset show, for every rig. Nothing here is layout-specific by
 * declaration: which rigs a preset suits is derived from the looks it plays
 * (see `showFitsReason`), so a preset cannot claim a fit its steps don't have.
 */
export const SHOW_PRESETS: ShowPreset[] = [
  // ── Runs anywhere ──
  {
    id: 'solid-vibes',
    name: 'Solid Vibes',
    description: 'Pure colors, gradients, and static scenes — no movement, just beautiful light',
    gradient: 'linear-gradient(135deg, #e40303, #ff8c00, #ffed00, #008026, #004dff, #c8a000)',
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 3,
    loop: true,
    steps: [
      { type: 'scene', name: 'pride', duration: 150 },
      { type: 'scene', name: 'gold', duration: 120 },
      { type: 'scene', name: 'trans', duration: 150 },
      { type: 'scene', name: 'sunset', duration: 120 },
      { type: 'scene', name: 'ocean', duration: 120 },
      { type: 'scene', name: 'forest', duration: 120 },
      { type: 'scene', name: 'solstice', duration: 120 },
      { type: 'scene', name: 'fire', duration: 120 },
      { type: 'scene', name: 'night', duration: 120 }
    ]
  },
  {
    id: 'pride-show',
    name: 'Pride Show',
    description: 'Static flags + flowing animations — alternating calm and motion',
    gradient: PRIDE_GRADIENT,
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 2,
    loop: true,
    steps: [
      { type: 'scene', name: 'pride', duration: 120 },
      { type: 'animation', name: 'pride-flow', duration: 180 },
      { type: 'animation', name: 'rainbow', duration: 120 },
      { type: 'animation', name: 'pride-ring', duration: 120 },
      { type: 'scene', name: 'pride', duration: 90 },
      { type: 'animation', name: 'pride-breathe', duration: 120 },
      { type: 'animation', name: 'pride-rotate', duration: 120 },
      { type: 'scene', name: 'pride', duration: 90 },
      { type: 'animation', name: 'rainbow', duration: 180 }
    ]
  },
  {
    id: 'pride-trans',
    name: 'Pride & Trans',
    description: 'Mixed pride and trans — static flags, flowing animations, breathing colors',
    gradient: 'linear-gradient(135deg, #e40303, #ff8c00, #5BCEFA, #F5A9B8, #750787)',
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 2,
    loop: true,
    steps: [
      { type: 'scene', name: 'pride', duration: 120 },
      { type: 'animation', name: 'pride-flow', duration: 150 },
      { type: 'scene', name: 'trans', duration: 120 },
      { type: 'animation', name: 'trans-flow', duration: 150 },
      { type: 'animation', name: 'pride-ring', duration: 120 },
      { type: 'scene', name: 'trans', duration: 90 },
      { type: 'animation', name: 'trans-breathe', duration: 120 },
      { type: 'scene', name: 'pride', duration: 90 },
      { type: 'animation', name: 'pride-breathe', duration: 120 },
      { type: 'animation', name: 'trans-ring', duration: 120 },
      { type: 'scene', name: 'trans', duration: 90 },
      { type: 'animation', name: 'pride-rotate', duration: 120 },
      { type: 'animation', name: 'rainbow', duration: 120 },
      { type: 'animation', name: 'trans-flow', duration: 150 }
    ]
  },
  {
    id: 'ambient',
    name: 'Ambient',
    description: 'Chill background — slow waves, breathing, rain',
    gradient: 'linear-gradient(135deg, #1a3a5c, #2a5a3c, #3a2a5c)',
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 4,
    loop: true,
    steps: [
      { type: 'animation', name: 'wave', duration: 300 },
      { type: 'animation', name: 'breathe', duration: 240 },
      { type: 'animation', name: 'rain', duration: 300 },
      { type: 'animation', name: 'spiral', duration: 240 },
      { type: 'animation', name: 'wave', duration: 300 }
    ]
  },
  {
    id: 'high-energy',
    name: 'High Energy',
    description: 'Fast cuts — short bursts of variety',
    gradient: 'linear-gradient(135deg, #ff4400, #ffcc00, #00ff88, #0088ff)',
    kind: 'sequence',
    transition: 'cut',
    transitionDuration: 0,
    loop: true,
    steps: [
      { type: 'animation', name: 'pride-ring', duration: 60 },
      { type: 'animation', name: 'rainbow', duration: 45 },
      { type: 'animation', name: 'pride-rotate', duration: 60 },
      { type: 'animation', name: 'spiral', duration: 60 },
      { type: 'animation', name: 'wave', duration: 45 },
      { type: 'animation', name: 'pride-flow', duration: 60 },
      { type: 'animation', name: 'pacman', duration: 45 }
    ]
  },
  {
    id: 'ambient-playlist',
    name: 'Ambient',
    description: 'Four slow looks, long holds — a starting point to edit',
    gradient: 'linear-gradient(135deg, #1a3a5c, #2a5a3c, #3a2a5c)',
    kind: 'playlist',
    transition: 'fade',
    transitionDuration: 3,
    loop: true,
    steps: [
      { type: 'animation', name: 'wave', duration: 180 },
      { type: 'animation', name: 'breathe', duration: 120 },
      { type: 'animation', name: 'rain', duration: 180 },
      { type: 'animation', name: 'spiral', duration: 120 }
    ]
  },
  {
    id: 'pride-playlist',
    name: 'Pride Show',
    description: 'Flag looks back to back',
    gradient: PRIDE_GRADIENT,
    kind: 'playlist',
    transition: 'fade',
    transitionDuration: 2,
    loop: true,
    steps: [
      { type: 'animation', name: 'pride-flow', duration: 120 },
      { type: 'animation', name: 'pride-ring', duration: 120 },
      { type: 'animation', name: 'pride-breathe', duration: 60 },
      { type: 'animation', name: 'rainbow', duration: 120 },
      { type: 'animation', name: 'pride-rotate', duration: 60 }
    ]
  },

  // ── 7×7 art grid ──
  {
    id: 'heart-night',
    name: 'Heart Night',
    description: 'Romantic vibes — hearts, breathing, and city love',
    gradient: 'linear-gradient(135deg, #ff0040, #cc0030, #ff6080)',
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 3,
    loop: true,
    steps: [
      { type: 'scene', name: 'heart', duration: 180 },
      { type: 'animation', name: 'heart-breathe', duration: 300 },
      { type: 'animation', name: 'i-heart-sf', duration: 180 },
      { type: 'animation', name: 'heart-breathe', duration: 300 },
      { type: 'scene', name: 'heart', duration: 120 }
    ]
  },
  {
    id: 'sf-showcase',
    name: 'SF Showcase',
    description: 'City pride — SF scenes, hearts, and rainbows',
    gradient: 'linear-gradient(135deg, #c8a000, #ff6060, #4060ff)',
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 3,
    loop: true,
    steps: [
      { type: 'scene', name: 'sf', duration: 180 },
      { type: 'animation', name: 'i-heart-sf', duration: 240 },
      { type: 'animation', name: 'rainbow', duration: 120 },
      { type: 'scene', name: 'gold', duration: 120 },
      { type: 'animation', name: 'wave', duration: 180 },
      { type: 'scene', name: 'sf', duration: 120 }
    ]
  },
  {
    id: 'sf-night-playlist',
    name: 'SF Night',
    description: 'Bitmap art for the 7-wide grid',
    gradient: 'linear-gradient(135deg, #c8a000, #ff6060, #4060ff)',
    kind: 'playlist',
    transition: 'fade',
    transitionDuration: 3,
    loop: true,
    steps: [
      { type: 'animation', name: 'i-heart-sf', duration: 180 },
      { type: 'animation', name: 'heart-breathe', duration: 120 },
      { type: 'scene', name: 'sf', duration: 60 },
      { type: 'animation', name: 'rainbow', duration: 120 }
    ]
  },

  // ── Nova: amber on a ring ──
  {
    id: 'nova-amber-hour',
    name: 'Nova Amber Hour',
    description: 'The full amber vocabulary — still looks into motion, and back',
    gradient: AMBER_GRADIENT,
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 4,
    loop: true,
    steps: [
      { type: 'scene', name: 'amber-glow', duration: 120 },
      { type: 'animation', name: 'amber-breathe', duration: 180 },
      { type: 'animation', name: 'amber-wave', duration: 240 },
      { type: 'scene', name: 'amber-ramp', duration: 90 },
      { type: 'animation', name: 'amber-comet', duration: 180 },
      { type: 'animation', name: 'amber-levels', duration: 180 },
      { type: 'scene', name: 'amber-horizon', duration: 90 },
      { type: 'animation', name: 'amber-embers', duration: 240 },
      { type: 'scene', name: 'amber-glow', duration: 120 }
    ]
  },
  {
    id: 'nova-slow-burn',
    name: 'Nova Slow Burn',
    description: 'Warm and barely moving — for when the room is the show',
    gradient: 'linear-gradient(135deg, #6a3800, #ffb703, #3a1f00)',
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 6,
    loop: true,
    steps: [
      { type: 'animation', name: 'amber-embers', duration: 420 },
      { type: 'scene', name: 'amber-glow', duration: 300 },
      { type: 'animation', name: 'amber-breathe', duration: 360 },
      { type: 'scene', name: 'amber-alternate', duration: 240 },
      { type: 'animation', name: 'amber-embers', duration: 420 }
    ]
  },
  {
    id: 'nova-circle',
    name: 'Nova Circle',
    description: 'Motion that reads as a ring — chase, comet, wave, levels',
    gradient: AMBER_GRADIENT,
    kind: 'sequence',
    transition: 'cut',
    transitionDuration: 0,
    loop: true,
    steps: [
      { type: 'animation', name: 'amber-chase', duration: 90 },
      { type: 'animation', name: 'amber-comet', duration: 120 },
      { type: 'animation', name: 'amber-wave', duration: 120 },
      { type: 'animation', name: 'amber-levels', duration: 90 },
      { type: 'animation', name: 'amber-heartbeat', duration: 120 }
    ]
  },
  {
    id: 'nova-house-lights',
    name: 'Nova House Lights',
    description: 'Lit, warm, clearly not a blackout — between cues',
    gradient: 'linear-gradient(135deg, #ffb703, #7a4a00)',
    kind: 'playlist',
    transition: 'fade',
    transitionDuration: 5,
    loop: true,
    steps: [
      { type: 'scene', name: 'amber-glow', duration: 300 },
      { type: 'animation', name: 'amber-embers', duration: 300 },
      { type: 'scene', name: 'amber', duration: 120 }
    ]
  },
  {
    id: 'nova-chase-playlist',
    name: 'Nova Chase',
    description: 'Amber motion, short holds — a starting point to edit',
    gradient: AMBER_GRADIENT,
    kind: 'playlist',
    transition: 'cut',
    transitionDuration: 0,
    loop: true,
    steps: [
      { type: 'animation', name: 'amber-chase', duration: 60 },
      { type: 'animation', name: 'amber-comet', duration: 60 },
      { type: 'animation', name: 'amber-wave', duration: 60 },
      { type: 'animation', name: 'amber-levels', duration: 60 }
    ]
  },

  // ── Grace Cathedral: two rings and a centre ──
  {
    id: 'grace-vigil',
    name: 'Grace Vigil',
    description: 'Candlelight for the rose window — amber and white, almost still',
    gradient: 'linear-gradient(135deg, #ffb703, #ffffff, #6a3800)',
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 6,
    loop: true,
    steps: [
      { type: 'scene', name: 'amber-glow', duration: 360 },
      { type: 'animation', name: 'amber-embers', duration: 420 },
      { type: 'scene', name: 'white', duration: 180 },
      { type: 'animation', name: 'amber-breathe', duration: 300 },
      { type: 'scene', name: 'gold', duration: 240 }
    ]
  },
  {
    id: 'grace-rose',
    name: 'Grace Rose',
    description: 'Colour turning around the window — slow, wide sweeps',
    gradient: 'linear-gradient(135deg, #ffb703, #c86400, #4a2a6a, #1a3a5c)',
    kind: 'sequence',
    transition: 'fade',
    transitionDuration: 5,
    loop: true,
    steps: [
      { type: 'animation', name: 'amber-wave', duration: 300 },
      { type: 'animation', name: 'amber-comet', duration: 240 },
      { type: 'animation', name: 'spiral', duration: 300 },
      { type: 'animation', name: 'wave', duration: 240 },
      { type: 'scene', name: 'solstice', duration: 180 },
      { type: 'animation', name: 'amber-levels', duration: 240 }
    ]
  },
  {
    id: 'grace-playlist',
    name: 'Grace Warm',
    description: 'Warm ring looks for the cathedral — a starting point to edit',
    gradient: 'linear-gradient(135deg, #ffb703, #ffffff, #6a3800)',
    kind: 'playlist',
    transition: 'fade',
    transitionDuration: 4,
    loop: true,
    steps: [
      { type: 'scene', name: 'amber-glow', duration: 240 },
      { type: 'animation', name: 'amber-wave', duration: 180 },
      { type: 'animation', name: 'amber-embers', duration: 240 },
      { type: 'scene', name: 'white', duration: 120 }
    ]
  }
];

export function showDuration(steps: ShowStep[]): number {
  return steps.reduce((total, step) => total + step.duration, 0);
}

/**
 * Why a preset does not suit a layout, or '' when every step does. Custom code
 * steps are the operator's business, so they never block a fit.
 */
export function showFitsReason(steps: ShowStep[], layout: Layout): string {
  for (const step of steps) {
    if (step.type === 'evalPattern' || !step.name) continue;
    const def = lookDef(step.type, step.name);
    if (!def) return `unknown look "${step.name}"`;
    const reason = fitsReason(def.fits, layout);
    if (reason) return `${def.label} ${reason}`;
  }
  return '';
}

/** Presets of one kind, the ones that suit this rig first. */
export function showPresetsForLayout(
  layout: Layout,
  kind: ShowPreset['kind']
): Array<ShowPreset & { reason: string }> {
  return SHOW_PRESETS
    .filter(p => p.kind === kind)
    .map(p => ({ ...p, reason: showFitsReason(p.steps, layout) }))
    .sort((a, b) => Number(!!a.reason) - Number(!!b.reason));
}
