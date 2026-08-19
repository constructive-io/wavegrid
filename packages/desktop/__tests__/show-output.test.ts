import { hasOscOutput, oscOutputs } from '@/renderer/lib/show-output';
import type { BrainStatus } from '@/types/ipc';

const status = (receiverOutputs: string[]): BrainStatus => ({
  running: true,
  url: 'http://127.0.0.1:3000',
  project: 'grace',
  runMode: 'simple',
  receiverRunning: true,
  lanUrls: [],
  receiverError: null,
  receiverOutputs,
  lastError: null
});

describe('what the show is driving', () => {
  // A receiver with no target starts cleanly and reports no error, so this is
  // the only signal that separates a healthy show from a dark rig.
  it('treats a console-only receiver as no OSC output', () => {
    expect(hasOscOutput(status(['Console']))).toBe(false);
    expect(hasOscOutput(status([]))).toBe(false);
    expect(oscOutputs(status(['Console']))).toEqual([]);
  });

  it('recognises any real output', () => {
    const driving = status(['Console', 'BEYOND OSC → 10.0.0.5:8000 (row-major, rgb)']);
    expect(hasOscOutput(driving)).toBe(true);
    expect(oscOutputs(driving)).toEqual(['BEYOND OSC → 10.0.0.5:8000 (row-major, rgb)']);
  });
});
