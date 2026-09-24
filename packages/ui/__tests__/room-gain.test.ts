import { applyGain, CEILING_DECAY, createRoomGain, MAX_GAIN, RAW_MIC_CONSTRAINTS, ROOM_FLOOR, spectrumPeak, updateRoomGain } from '../src/lib/room-gain';

const spectrum = (peak: number, n = 512) => {
  const s = new Uint8Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.round(peak * 255 * (i / n));
  return s;
};

describe('room gain', () => {
  it('boosts quiet music so its recent peak lands near full scale', () => {
    const st = createRoomGain();
    const quiet = spectrum(0.2);
    const g = updateRoomGain(st, spectrumPeak(quiet), 1 / 60);
    expect(g).toBeCloseTo(0.9 / 0.2, 3);
    applyGain(quiet, g);
    expect(spectrumPeak(quiet)).toBeGreaterThan(0.85);
    expect(spectrumPeak(quiet)).toBeLessThanOrEqual(1);
  });

  it('does not boost silence past MAX_GAIN, so a quiet room stays dark', () => {
    const st = createRoomGain();
    const g = updateRoomGain(st, 0, 1 / 60);
    expect(g).toBeLessThanOrEqual(MAX_GAIN);
    expect(st.ceiling).toBe(ROOM_FLOOR);
    const silence = new Uint8Array(64);
    applyGain(silence, g);
    expect(spectrumPeak(silence)).toBe(0);
  });

  it('a loud room is attenuated, never pinned at maximum', () => {
    const st = createRoomGain();
    const g = updateRoomGain(st, 1, 1 / 60);
    expect(g).toBeCloseTo(0.9);
  });

  it('the ceiling rises at once and falls back over seconds, so a quiet passage still reads quiet', () => {
    const st = createRoomGain();
    updateRoomGain(st, 0.8, 1 / 60);
    expect(st.ceiling).toBe(0.8);
    let g = 0;
    for (let t = 0; t < 1; t += 1 / 60) g = updateRoomGain(st, 0.1, 1 / 60);
    // After one second the ceiling has only decayed ~CEILING_DECAY of the way.
    expect(st.ceiling).toBeGreaterThan(0.8 * (1 - CEILING_DECAY) - 0.02);
    expect(st.ceiling).toBeLessThan(0.8);
    expect(g).toBeLessThan(0.9 / 0.1);
    for (let t = 0; t < 30; t += 1 / 60) g = updateRoomGain(st, 0.1, 1 / 60);
    expect(st.ceiling).toBeCloseTo(0.1, 2);
  });

  it('applyGain saturates at 255 and leaves the spectrum alone at gain 1', () => {
    const s = new Uint8Array([0, 100, 200, 255]);
    applyGain(s, 1);
    expect(Array.from(s)).toEqual([0, 100, 200, 255]);
    applyGain(s, 2);
    expect(Array.from(s)).toEqual([0, 200, 255, 255]);
  });

  it('opens the mic raw: no echo cancellation, noise suppression or auto gain', () => {
    const a = RAW_MIC_CONSTRAINTS.audio as MediaTrackConstraints;
    expect(a.echoCancellation).toBe(false);
    expect(a.noiseSuppression).toBe(false);
    expect(a.autoGainControl).toBe(false);
  });
});
