/**
 * Command-mode animation engine for the receiver.
 *
 * When in command mode, the receiver runs animations locally at 60fps.
 * This module evaluates the current animation state and writes targets
 * into the filtered grid, just like computeFallbackFrame does for fallback.
 */

import { applyScene, evaluateAnimation, setTarget } from '@wavegrid/animations';
import type { Layout } from '@wavegrid/layout';

import { AnimationState, CommandMessage, createDefaultAnimationState, Rotation } from './command-types';
import { FilteredCannon } from './filter';

/**
 * Process a command message and update the animation state.
 * Returns true if the command was recognized and handled.
 */
export function handleCommand(state: AnimationState, cmd: CommandMessage): boolean {
  switch (cmd.action) {
  case 'setAnimation':
    if (state.currentAnimation !== cmd.name) {
      state.tick = 0;
    }
    state.currentAnimation = cmd.name;
    state.currentScene = null;
    if (cmd.speed !== undefined) state.speed = cmd.speed;
    return true;

  case 'setScene':
    state.currentScene = cmd.name;
    state.currentAnimation = null;
    return true;

  case 'paint':
    state.currentAnimation = null;
    state.currentScene = null;
    state.patternActive = false;
    return true;

  case 'keepalive':
    return true;

  case 'setBrightness':
    state.brightness = Math.max(0, Math.min(100, cmd.value));
    return true;

  case 'stop':
    state.currentAnimation = null;
    state.patternActive = false;
    state.shiftVx = 0;
    state.shiftVy = 0;
    state.shiftAccX = 0;
    state.shiftAccY = 0;
    return true;

  case 'clear':
    state.currentAnimation = null;
    state.currentScene = null;
    state.patternActive = false;
    state.shiftVx = 0;
    state.shiftVy = 0;
    state.shiftAccX = 0;
    state.shiftAccY = 0;
    return true;

  case 'evalPattern':
    // Handled by the receiver (async sandbox load)
    state.currentAnimation = null;
    state.currentScene = null;
    state.patternActive = true;
    return true;

  case 'setPatternParam':
    // Handled by the receiver directly
    return true;

  case 'stopPattern':
    state.patternActive = false;
    return true;

  case 'setShift':
    state.shiftVx = cmd.vx;
    state.shiftVy = cmd.vy;
    if (cmd.vx === 0 && cmd.vy === 0) {
      state.shiftAccX = 0;
      state.shiftAccY = 0;
    }
    return true;

  case 'setSmoothness':
    // Smoothness is handled at the receiver level (alpha)
    return true;

  case 'setOrientation':
    state.rotation = (cmd.rotation ?? 0) as Rotation;
    state.flipH = !!cmd.flipH;
    state.flipV = !!cmd.flipV;
    return true;

  case 'setAttack':
    state.attack = Math.max(0, Math.min(1, cmd.value));
    return true;

  case 'setSpeed':
    state.speed = Math.max(0.001, Math.min(5.0, cmd.value));
    return true;

  default:
    return false;
  }
}

/**
 * Evaluate one tick of command-mode animation.
 * Writes targets into the filtered grid based on current state.
 */
export function tickCommandMode(
  grid: FilteredCannon[],
  state: AnimationState,
  layout: Layout
): void {
  // Evaluate animation if one is active (skip if pattern is active)
  if (!state.patternActive) {
    if (state.currentAnimation) {
      evaluateAnimation(grid, state.currentAnimation, state.tick, state.attack, layout);
    } else if (state.currentScene) {
      applyScene(grid, state.currentScene, layout);
    }
  }

  // Advance the animation tick (after evaluation, matching server order)
  state.tick += state.speed;

  // Apply shift (wrap-around pixel remapping) — grid layouts only
  if ((state.shiftVx !== 0 || state.shiftVy !== 0) && layout.cols > 0 && layout.rows > 0) {
    state.shiftAccX += state.shiftVx / 60;
    state.shiftAccY += state.shiftVy / 60;
    const stepsX = Math.trunc(state.shiftAccX);
    const stepsY = Math.trunc(state.shiftAccY);
    if (stepsX !== 0 || stepsY !== 0) {
      shiftGridTargets(grid, layout.cols, layout.rows, stepsX, stepsY);
      state.shiftAccX -= stepsX;
      state.shiftAccY -= stepsY;
    }
  }
}

/**
 * Apply paint commands directly to grid targets.
 */
export function applyPaint(
  grid: FilteredCannon[],
  cells: Array<{ idx: number; h: number; s: number; b: number }>,
  attack: number = 1.0
): void {
  for (const cell of cells) {
    if (cell.idx >= 0 && cell.idx < grid.length) {
      setTarget(grid, cell.idx, cell.h, cell.s, cell.b, attack);
    }
  }
}

/**
 * Shift grid targets by wrapping around edges.
 */
function shiftGridTargets(
  grid: FilteredCannon[],
  cols: number,
  rows: number,
  dx: number,
  dy: number
): void {
  const snapshot = grid.map(c => ({ h: c.targetH, s: c.targetS, b: c.targetB }));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcR = ((r - dy) % rows + rows) % rows;
      const srcC = ((c - dx) % cols + cols) % cols;
      const srcIdx = srcR * cols + srcC;
      const dstIdx = r * cols + c;
      if (dstIdx >= grid.length || srcIdx >= grid.length) continue;
      const src = snapshot[srcIdx];
      grid[dstIdx].targetH = src.h;
      grid[dstIdx].targetS = src.s;
      grid[dstIdx].targetB = src.b;
    }
  }
}

/**
 * Remap a grid from logical (animation) order to physical (output) order
 * based on the current orientation. This is the same transform the server
 * uses in mapUiToGrid — mapping a logical index to a physical index.
 */
export function remapGridForOutput<T>(grid: T[], columns: number, rows: number, state: AnimationState): T[] {
  // Orientation transforms only apply to grid layouts; rings pass through.
  if (columns <= 0 || rows <= 0) return grid;
  if (state.rotation === 0 && !state.flipH && !state.flipV) return grid;
  const result = new Array<T>(grid.length);
  for (let li = 0; li < grid.length; li++) {
    let r = Math.floor(li / columns);
    let c = li % columns;

    if (state.flipH) c = columns - 1 - c;
    if (state.flipV) r = rows - 1 - r;

    let gr: number, gc: number;
    switch (state.rotation) {
    case 90:  gr = c;               gc = rows - 1 - r;     break;
    case 180: gr = rows - 1 - r;    gc = columns - 1 - c;  break;
    case 270: gr = columns - 1 - c; gc = r;                break;
    default:  gr = r;               gc = c;                break;
    }

    const pi = gr * columns + gc;
    if (pi >= 0 && pi < grid.length) {
      result[pi] = grid[li];
    }
  }
  return result;
}

export { createDefaultAnimationState };
export type { AnimationState };
