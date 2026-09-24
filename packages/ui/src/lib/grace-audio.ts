/**
 * Grace Audio: music steers the *colour* of the running GracePaint pattern and
 * nothing else. Brightness stays with the animation.
 *
 * Bass slowly warms/turns the hue, mids lift the saturation, and a strong beat
 * (at most every STEP_MIN_S seconds) asks for the next gradient. Everything is
 * slewed over seconds, so the window drifts with the music rather than
 * flickering with it.
 */

export interface GraceAudioInput {
  /** 0..1 levelled band energies. */
  low: number;
  mid: number;
  high: number;
  /** A beat was detected this frame. */
  beat: boolean;
  /** How far above its recent average the bass is on this frame (1 = average). */
  lowRatio: number;
}

export interface GraceAudioOptions {
  /** Hue/saturation drift with bass and mids. */
  drift: boolean;
  /** Step to the next gradient on a strong beat. */
  beats: boolean;
}

export interface GraceAudioState {
  hueShift: number;
  satShift: number;
  lastStepAt: number;
  time: number;
}

export interface GraceAudioOutput {
  /** Degrees to add to every pane's hue. */
  hueShift: number;
  /** Points to add to every pane's saturation. */
  satShift: number;
  /** Move to the next gradient now. */
  step: boolean;
}

/** Furthest the bass can turn the hue, in degrees. */
export const HUE_RANGE = 70;
/** Saturation swing with the mids: quiet mids desaturate a little, loud ones saturate. */
export const SAT_RANGE = 25;
/** Slew time constants, seconds. */
export const HUE_TAU = 2.5;
export const SAT_TAU = 1.5;
/** Shortest gap between gradient steps. */
export const STEP_MIN_S = 8;
/** How much louder than average the bass must hit to count as a strong beat. */
export const STRONG_BEAT = 1.9;

export function createGraceAudio(): GraceAudioState {
  return { hueShift: 0, satShift: 0, lastStepAt: -Infinity, time: 0 };
}

function slew(value: number, target: number, tau: number, dt: number): number {
  const a = 1 - Math.exp(-dt / tau);
  return value + (target - value) * a;
}

export function stepGraceAudio(
  state: GraceAudioState,
  input: GraceAudioInput,
  dt: number,
  opts: GraceAudioOptions
): GraceAudioOutput {
  state.time += dt;
  const hueTarget = opts.drift ? input.low * HUE_RANGE : 0;
  const satTarget = opts.drift ? (input.mid - 0.4) * SAT_RANGE : 0;
  state.hueShift = slew(state.hueShift, hueTarget, HUE_TAU, dt);
  state.satShift = slew(state.satShift, satTarget, SAT_TAU, dt);

  let step = false;
  if (opts.beats && input.beat && input.lowRatio >= STRONG_BEAT && state.time - state.lastStepAt >= STEP_MIN_S) {
    state.lastStepAt = state.time;
    step = true;
  }
  return { hueShift: state.hueShift, satShift: state.satShift, step };
}

/** Quantise so we only send a param when it visibly changed. */
export function quantiseShift(v: number, unit: number): number {
  return Math.round(v / unit) * unit;
}
