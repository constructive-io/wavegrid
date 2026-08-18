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
  wrapUnit
} from './helpers';

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
