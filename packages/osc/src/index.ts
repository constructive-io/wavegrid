// Hand-driven OSC for debugging what reaches the hardware
export type { OscArg, OscListener, ReceivedOsc } from './debug';
export { listenForOsc, parseIndexRange, parseOscArg, probeGrid, sendOscMessage } from './debug';

// Color conversion
export type { RGB } from './color';
export { hsbToRgb, hsbToRgb100, hsbToRgb255 } from './color';

// OSC adapters
export type {
  BeyondOscConfig,
  CannonRoute,
  CannonState,
  FB4OscConfig,
  FixtureKind,
  OscMessage,
  OscTarget,
  OutputAdapter,
  ProjectorControl,
  ProjectorCueCommand,
  RoutingConfig
} from './osc-adapters';
export {
  BeyondOscOutput,
  createRoutedOutput,
  DEBUG_OSC,
  encodeBeyondCueMessage,
  encodeBeyondMessages,
  encodeBeyondProjectorMessages,
  encodeFB4Messages,
  FB4OscOutput,
  RoutedOscOutput} from './osc-adapters';
