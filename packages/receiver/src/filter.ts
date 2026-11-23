/**
 * Independent low-pass filter for the receiver.
 *
 * This is separate from the simulator's filter — the receiver runs its own
 * smoothing so that even if the upstream connection drops mid-transition,
 * the output to hardware never jolts.
 */

export interface CannonState {
  h: number; // hue 0–360
  s: number; // saturation 0–100
  b: number; // brightness 0–100
}

export interface FilteredCannon extends CannonState {
  targetH: number;
  targetS: number;
  targetB: number;
}

export const DEFAULT_RECEIVER_ALPHA = 0.06;

/**
 * Create a filtered grid with one cell per fixture in the layout.
 */
export function createFilteredGrid(numCannons: number): FilteredCannon[] {
  return Array.from({ length: numCannons }, () => ({
    h: 0,
    s: 0,
    b: 0,
    targetH: 0,
    targetS: 0,
    targetB: 0
  }));
}

/**
 * Shortest angular distance on the hue circle.
 */
export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Single tick of exponential low-pass interpolation.
 * Returns true if any cannon changed (i.e., output is still settling).
 */
export function tickFilter(
  grid: FilteredCannon[],
  alpha: number = DEFAULT_RECEIVER_ALPHA,
  brightnessScale: number = 1
): boolean {
  let changed = false;
  for (let i = 0; i < grid.length; i++) {
    const c = grid[i];
    const dh = angleDelta(c.h, c.targetH);
    const ds = c.targetS - c.s;
    const targetB = c.targetB * brightnessScale;
    const db = targetB - c.b;

    if (Math.abs(dh) > 0.3 || Math.abs(ds) > 0.3 || Math.abs(db) > 0.3) {
      c.h = (c.h + dh * alpha + 360) % 360;
      c.s = c.s + ds * alpha;
      c.b = c.b + db * alpha;
      changed = true;
    } else {
      c.h = c.targetH;
      c.s = c.targetS;
      c.b = targetB;
    }
  }
  return changed;
}

/**
 * Hard-reset the entire grid — snaps BOTH current and target to black
 * instantly, bypassing the low-pass filter. Use when switching visual
 * modes to prevent old state from bleeding through.
 */
export function resetFilteredGrid(grid: FilteredCannon[], h: number = 0, s: number = 0, b: number = 0) {
  for (let i = 0; i < grid.length; i++) {
    const c = grid[i];
    c.h = h;
    c.s = s;
    c.b = b;
    c.targetH = h;
    c.targetS = s;
    c.targetB = b;
  }
}

/**
 * Set the target state for all cannons from an upstream state snapshot.
 * The filter will smoothly converge to these values.
 */
export function applyUpstreamState(
  grid: FilteredCannon[],
  upstream: CannonState[]
) {
  for (let i = 0; i < Math.min(grid.length, upstream.length); i++) {
    grid[i].targetH = upstream[i].h;
    grid[i].targetS = upstream[i].s;
    grid[i].targetB = upstream[i].b;
  }
}
