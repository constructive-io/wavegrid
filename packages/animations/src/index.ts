// Types
export type { AnimationFn, GridCell, SceneGenerator } from './types';

// Helpers
export {
  angleDelta,
  clamp,
  hexToRgb,
  isArtGrid,
  PRIDE_COLORS,
  prideColorAt,
  rgbToHsb,
  ROYGBIV,
  roygbivAt,
  setTarget,
  smooth,
  TRANS_COLORS,
  transColorAt,
  wrapUnit
} from './helpers';

// Catalogue: what each look needs from the rig it runs on
export type { Fits, LayoutFilter, LookDef } from './catalog';
export {
  catalogDrift,
  fitsLayout,
  fitsReason,
  layoutFilters,
  lookDef,
  LOOKS,
  looksForLayout
} from './catalog';

// Preset shows (sequences and playlist starting points)
export type { ShowPreset, ShowStep } from './shows';
export { SHOW_PRESETS, showDuration, showFitsReason, showPresetsForLayout } from './shows';

// Amber (Nova) looks
export type { AmberLook } from './amber';
export {
  AMBER_HUE,
  AMBER_LEVELS,
  AMBER_LOOKS,
  AMBER_SAT,
  amberAnimations,
  amberScenes,
  ringPosition
} from './amber';

// Animations
export { animations, evaluateAnimation, getAnimationNames } from './animations';

// Scenes
export { applyScene, getSceneNames, scenes } from './scenes';
