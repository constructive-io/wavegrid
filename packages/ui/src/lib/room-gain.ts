/**
 * Room auto-calibration for the live mic: instead of a fixed sensitivity,
 * track the recent peak of the spectrum and scale the whole spectrum so that
 * peak sits near full scale. Quiet, ear-level music then fills the range that
 * used to need shouting, and a loud room doesn't pin everything at maximum.
 *
 * The ceiling rises instantly and decays slowly (a few seconds), so a drop in
 * the music reads as a drop rather than being normalised away within a beat.
 */

/** Below this peak (0..1) we treat the room as silent and stop boosting. */
export const ROOM_FLOOR = 0.06;
/** Most the spectrum can be boosted, so silence stays silent. */
export const MAX_GAIN = 8;
/** How fast the ceiling falls back when the music gets quieter (per second, fraction of itself). */
export const CEILING_DECAY = 0.12;

export interface RoomGain {
  /** Recent spectral peak, 0..1. */
  ceiling: number;
}

export function createRoomGain(): RoomGain {
  return { ceiling: ROOM_FLOOR };
}

/** Peak of a byte spectrum as 0..1. */
export function spectrumPeak(spectrum: Uint8Array): number {
  let max = 0;
  for (let i = 0; i < spectrum.length; i++) if (spectrum[i] > max) max = spectrum[i];
  return max / 255;
}

/** Update the ceiling with this frame's peak; returns the gain to apply to the spectrum. */
export function updateRoomGain(state: RoomGain, peak: number, dt: number): number {
  const decayed = state.ceiling * Math.max(0, 1 - CEILING_DECAY * dt);
  state.ceiling = Math.max(ROOM_FLOOR, peak, decayed);
  // Aim the recent peak at ~90% of full scale.
  return Math.min(MAX_GAIN, 0.9 / state.ceiling);
}

/** Scale a byte spectrum in place, saturating at 255. */
export function applyGain(spectrum: Uint8Array, gain: number): void {
  if (gain === 1) return;
  for (let i = 0; i < spectrum.length; i++) {
    const v = spectrum[i] * gain;
    spectrum[i] = v > 255 ? 255 : v;
  }
}

/** Mic constraints: the raw signal, with the voice-call processing off. */
export const RAW_MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1
  }
};
