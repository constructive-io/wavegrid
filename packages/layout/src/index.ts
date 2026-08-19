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
  SyncConfig,
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

// Light-map helpers (physical correction layer) + auto-map heuristics
export {
  autoMap,
  autoMapStrategies,
  type AutoMapStrategy,
  availableStrategies,
  identityMap,
  isIdentityMap,
  normalizeLightMap
} from './light-map';

// OSC target hosts (loopback normalization — UDP fails silently otherwise)
export { isLoopbackHost, LOOPBACK_HOST, normalizeOscHost } from './osc-host';

// Unified → per-device routing generation (shard + zone re-basing, validation)
export {
  type DeviceCannon,
  type DeviceRouting,
  generateDeviceRouting,
  type GenerateRoutingResult,
  looksDeviceLocal,
  type RoutingDevice,
  type RoutingTarget,
  RoutingValidationError,
  type ShardCheckOptions,
  summarizeRanges,
  uncoveredFixtures,
  type UnifiedCannon,
  type UnifiedRouting,
  unifiedRoutingForSingleTarget,
  validateShards,
  validateUnifiedRouting
} from './routing';

// Config loading (confstash) + run-mode derivation
export {
  createWavegridLoader,
  DEFAULT_BEYOND_PORT,
  DEFAULT_CONFIG,
  DEFAULT_FB4_PORT,
  type LoadOptions,
  loadWavegridConfig,
  type ResolvedConfig,
  resolveMode
} from './config';
