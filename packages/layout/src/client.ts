// Browser-safe entry point — everything except the Node-only config loader
// (which pulls in confstash/`fs`). Import this from client/UI code.

// Types
export type {
  BeyondConfig,
  DebugConfig,
  Fb4Config,
  Fixture,
  Layout,
  LayoutKind,
  LayoutSpec,
  OscConfig,
  ReceiverConfig,
  RingSpec,
  RunMode,
  ServerConfig,
  ShardConfig,
  Topology,
  UiConfig,
  WavegridConfig
} from './types';

// Generators
export {
  annulusLayout,
  type AnnulusParams,
  filledRingLayout,
  type FilledRingParams,
  gridLayout,
  type GridParams,
  ringLayout,
  type RingParams,
  ringsLayout,
  type RingsParams
} from './generators';

// Presets + spec resolution
export { getPresetNames, presets, resolveLayout } from './presets';

// Human-writable layout shorthand ("annulus:25@0.4", "rings:12,8,4,1", …)
export { LAYOUT_SPEC_FORMS, parseLayoutSpec } from './layout-spec';
