import {
  createGraceAudio,
  type GraceAudioInput,
  HUE_RANGE,
  STEP_MIN_S,
  stepGraceAudio
} from '../src/lib/grace-audio';

const ON = { drift: true, beats: true };
const quiet: GraceAudioInput = { low: 0, mid: 0.4, high: 0, beat: false, lowRatio: 1 };
const bass: GraceAudioInput = { low: 1, mid: 0.4, high: 0, beat: false, lowRatio: 1 };

function run(input: GraceAudioInput, seconds: number, state = createGraceAudio(), opts = ON) {
  let out = stepGraceAudio(state, input, 1 / 60, opts);
  for (let i = 1; i < seconds * 60; i++) out = stepGraceAudio(state, input, 1 / 60, opts);
  return { out, state };
}

describe('Grace Audio slew', () => {
  test('bass turns the hue slowly, never in one frame', () => {
    const s = createGraceAudio();
    const first = stepGraceAudio(s, bass, 1 / 60, ON);
    expect(first.hueShift).toBeLessThan(2);
    const { out } = run(bass, 1, s);
    expect(out.hueShift).toBeGreaterThan(HUE_RANGE * 0.25);
    expect(out.hueShift).toBeLessThan(HUE_RANGE * 0.5);
    const { out: later } = run(bass, 10, s);
    expect(later.hueShift).toBeGreaterThan(HUE_RANGE * 0.95);
  });

  test('silence eases the shift back to zero', () => {
    const { state } = run(bass, 10);
    const { out } = run(quiet, 15, state);
    expect(Math.abs(out.hueShift)).toBeLessThan(0.5);
    expect(Math.abs(out.satShift)).toBeLessThan(0.5);
  });

  test('drift off holds colour untouched', () => {
    const { out } = run(bass, 5, createGraceAudio(), { drift: false, beats: true });
    expect(out.hueShift).toBe(0);
    expect(out.satShift).toBe(0);
  });

  test('gradient steps only on strong beats and at most every STEP_MIN_S', () => {
    const s = createGraceAudio();
    const weak: GraceAudioInput = { ...bass, beat: true, lowRatio: 1.3 };
    const strong: GraceAudioInput = { ...bass, beat: true, lowRatio: 2.4 };
    expect(stepGraceAudio(s, weak, 1 / 60, ON).step).toBe(false);
    expect(stepGraceAudio(s, strong, 1 / 60, ON).step).toBe(true);
    let steps = 0;
    for (let i = 0; i < STEP_MIN_S * 60 - 5; i++) steps += stepGraceAudio(s, strong, 1 / 60, ON).step ? 1 : 0;
    expect(steps).toBe(0);
    for (let i = 0; i < 10; i++) steps += stepGraceAudio(s, strong, 1 / 60, ON).step ? 1 : 0;
    expect(steps).toBe(1);
    expect(stepGraceAudio(s, strong, 1 / 60, { drift: true, beats: false }).step).toBe(false);
  });
});
