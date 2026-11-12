/**
 * Command mode protocol types.
 * 
 * In command mode, the server sends lightweight command messages
 * instead of full grid state every frame. The receiver runs
 * animations locally at 60fps.
 */

import type { ProjectorControl, ProjectorCueCommand } from '@wavegrid/osc';

export interface SetAnimationCommand {
  type: 'command';
  action: 'setAnimation';
  name: string;
  speed?: number;
}

export interface SetSceneCommand {
  type: 'command';
  action: 'setScene';
  name: string;
}

export interface PaintCommand {
  type: 'command';
  action: 'paint';
  cells: Array<{ idx: number; h: number; s: number; b: number }>;
}

export interface SetBrightnessCommand {
  type: 'command';
  action: 'setBrightness';
  value: number;
}

export interface StopCommand {
  type: 'command';
  action: 'stop';
}

export interface SetShiftCommand {
  type: 'command';
  action: 'setShift';
  vx: number;
  vy: number;
}

export interface SetSmoothnessCommand {
  type: 'command';
  action: 'setSmoothness';
  value: number;
}

export interface SetAttackCommand {
  type: 'command';
  action: 'setAttack';
  value: number;
}

export interface SetSpeedCommand {
  type: 'command';
  action: 'setSpeed';
  value: number;
}

export interface ClearCommand {
  type: 'command';
  action: 'clear';
}

export interface EvalPatternCommand {
  type: 'command';
  action: 'evalPattern';
  code: string;
  params?: Record<string, unknown>;
}

export interface SetPatternParamCommand {
  type: 'command';
  action: 'setPatternParam';
  name: string;
  value: unknown;
}

export interface StopPatternCommand {
  type: 'command';
  action: 'stopPattern';
}

export interface KeepaliveCommand {
  type: 'command';
  action: 'keepalive';
}

export type Rotation = 0 | 90 | 180 | 270;

export interface SetOrientationCommand {
  type: 'command';
  action: 'setOrientation';
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
}

/** Projector-only live controls (see docs/command-api.md), keyed by GLOBAL logical index. */
export interface ProjectorCommand {
  type: 'command';
  action: 'projector';
  controls: Record<number, ProjectorControl>;
}

/** Show-level BEYOND cue command. */
export interface ProjectorCueRelayCommand {
  type: 'command';
  action: 'projector_cue';
  command: ProjectorCueCommand;
}

export type CommandMessage =
  | ProjectorCommand
  | ProjectorCueRelayCommand
  | SetAnimationCommand
  | SetSceneCommand
  | PaintCommand
  | SetBrightnessCommand
  | StopCommand
  | SetShiftCommand
  | SetSmoothnessCommand
  | SetAttackCommand
  | SetSpeedCommand
  | ClearCommand
  | EvalPatternCommand
  | SetPatternParamCommand
  | StopPatternCommand
  | KeepaliveCommand
  | SetOrientationCommand;

/**
 * Local animation state tracked by the receiver in command mode.
 */
export interface AnimationState {
  currentAnimation: string | null;
  speed: number;
  currentScene: string | null;
  brightness: number;
  attack: number;
  shiftVx: number;
  shiftVy: number;
  shiftAccX: number;
  shiftAccY: number;
  tick: number;
  /** Whether a QuickJS sandbox pattern is actively rendering. */
  patternActive: boolean;
  /** Orientation transforms (rotation + flips). */
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
}

export function createDefaultAnimationState(): AnimationState {
  return {
    currentAnimation: null,
    speed: 1.0,
    currentScene: null,
    brightness: 100,
    attack: 1.0,
    shiftVx: 0,
    shiftVy: 0,
    shiftAccX: 0,
    shiftAccY: 0,
    tick: 0,
    patternActive: false,
    rotation: 0,
    flipH: false,
    flipV: false
  };
}
