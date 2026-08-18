import { DEFAULT_CONFIG, loadWavegridConfig, resolveMode } from '../src/config';
import { resolveLayout } from '../src/presets';

describe('resolveLayout', () => {
  it('resolves built-in presets', () => {
    expect(resolveLayout({ preset: 'grid-7x7' }).count).toBe(49);
    expect(resolveLayout({ preset: 'grid-7x2' }).count).toBe(14);
    expect(resolveLayout({ preset: 'ring-6' }).count).toBe(6);
    const nova = resolveLayout({ preset: 'nova' });
    expect(nova.count).toBe(6);
    expect(nova.topology).toBe('ring');
    expect(resolveLayout({ preset: 'ring-25-filled' }).count).toBe(25);
  });

  it('resolves grace-cathedral as two rings of twelve plus a centre', () => {
    const grace = resolveLayout({ preset: 'grace-cathedral' });
    expect(grace.count).toBe(25);
    expect(grace.topology).toBe('rings');
    expect(grace.hasGridCoords).toBe(false);

    const radii = [...new Set(grace.fixtures.map(f => +f.radius.toFixed(3)))].sort((a, b) => b - a);
    expect(radii).toEqual([1, 0.62, 0]);

    const byRadius = (r: number) => grace.fixtures.filter(f => +f.radius.toFixed(3) === r);
    expect(byRadius(1)).toHaveLength(12);
    expect(byRadius(0.62)).toHaveLength(12);
    expect(byRadius(0)).toHaveLength(1);

    // Outer ring first, then inner, then the centre — the order looks in the UI rely on.
    expect(grace.fixtures.slice(0, 12).every(f => +f.radius.toFixed(3) === 1)).toBe(true);
    expect(grace.fixtures[24].radius).toBe(0);

    // Ring index counts from the centre out, so the centre is its own ring 0.
    expect(grace.fixtures[24].ring).toBe(0);
    expect(grace.fixtures[0].ring).toBe(2);
  });

  it('staggers grace-cathedral’s inner ring half a step off the outer one', () => {
    const grace = resolveLayout({ preset: 'grace-cathedral' });
    const posOf = (f: { angle: number }) =>
      (((f.angle + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
    const outer = grace.fixtures.filter(f => +f.radius.toFixed(3) === 1).map(posOf);
    const inner = grace.fixtures.filter(f => +f.radius.toFixed(3) === 0.62).map(posOf);

    for (const p of inner) {
      const nearest = Math.min(...outer.map(o => {
        const d = Math.abs(o - p);
        return d > 0.5 ? 1 - d : d;
      }));
      expect(nearest).toBeCloseTo(0.5 / 12, 5);
    }
  });

  it('numbers grace-cathedral the way the venue numbers the rose window', () => {
    const grace = resolveLayout({ preset: 'grace-cathedral' });
    // Clock position in twelfths, 0 = 12 o'clock, growing clockwise.
    const slotOf = (f: { angle: number }) =>
      ((((f.angle + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1) * 12;

    // Their 1 and 12 straddle the top, so the outer ring is half a slot round.
    expect(slotOf(grace.fixtures[0])).toBeCloseTo(0.5, 5);
    expect(slotOf(grace.fixtures[11])).toBeCloseTo(11.5, 5);
    // Their 13 is the inner petal at 12 o'clock, and 25 is the centre.
    expect(slotOf(grace.fixtures[12])).toBeCloseTo(0, 5);
    expect(+grace.fixtures[12].radius.toFixed(3)).toBe(0.62);
    expect(grace.fixtures[24].radius).toBe(0);

    // Both rings run clockwise one slot at a time from their first cannon.
    for (const base of [0, 12]) {
      for (let i = 1; i < 12; i++) {
        expect(slotOf(grace.fixtures[base + i])).toBeCloseTo(slotOf(grace.fixtures[base]) + i, 5);
      }
    }
  });

  it('resolves generator specs', () => {
    expect(resolveLayout({ kind: 'grid', cols: 10, rows: 10 }).count).toBe(100);
    expect(resolveLayout({ kind: 'ring', count: 12 }).count).toBe(12);
  });

  it('throws on unknown preset', () => {
    expect(() => resolveLayout({ preset: 'nope' })).toThrow(/Unknown layout preset/);
  });

  it('throws when neither preset nor kind is set', () => {
    expect(() => resolveLayout({})).toThrow();
  });
});

describe('resolveMode', () => {
  it('auto → simple below the threshold', () => {
    const layout = resolveLayout({ preset: 'ring-6' });
    expect(resolveMode({ ...DEFAULT_CONFIG, mode: 'auto', simpleModeMax: 40 }, layout)).toBe('simple');
  });

  it('auto → distributed at/above the threshold', () => {
    const layout = resolveLayout({ preset: 'grid-7x7' }); // 49
    expect(resolveMode({ ...DEFAULT_CONFIG, mode: 'auto', simpleModeMax: 40 }, layout)).toBe('distributed');
  });

  it('respects an explicit mode', () => {
    const layout = resolveLayout({ preset: 'grid-7x7' });
    expect(resolveMode({ ...DEFAULT_CONFIG, mode: 'simple' }, layout)).toBe('simple');
  });
});

describe('loadWavegridConfig', () => {
  it('defaults to grid-7x7 / distributed with an empty env and no config file', () => {
    const resolved = loadWavegridConfig({ cwd: '/', env: {} });
    expect(resolved.layout.count).toBe(49);
    expect(resolved.runMode).toBe('distributed');
  });

  it('applies the env layer (WAVEGRID_LAYOUT)', () => {
    const resolved = loadWavegridConfig({ cwd: '/', env: { WAVEGRID_LAYOUT: 'ring-6' } });
    expect(resolved.layout.id).toBe('ring-6');
    expect(resolved.runMode).toBe('simple');
  });

  it('honors explicit overrides above env', () => {
    const resolved = loadWavegridConfig({
      cwd: '/',
      env: { WAVEGRID_LAYOUT: 'ring-6' },
      overrides: { layout: { preset: 'grid-7x2' } }
    });
    expect(resolved.layout.id).toBe('grid-7x2');
  });

  it('config sync is on (secrets off) by default', () => {
    const resolved = loadWavegridConfig({ cwd: '/', env: {} });
    expect(resolved.config.sync).toEqual({ enabled: true, secrets: false });
  });

  it('WG_SYNC_ENABLED=0 disables sync via the env layer', () => {
    const resolved = loadWavegridConfig({ cwd: '/', env: { WG_SYNC_ENABLED: '0' } });
    expect(resolved.config.sync.enabled).toBe(false);
    expect(resolved.config.sync.secrets).toBe(false);
  });

  it('WG_SYNC_SECRETS=1 opts secrets into the sync channel', () => {
    const resolved = loadWavegridConfig({ cwd: '/', env: { WG_SYNC_SECRETS: 'true' } });
    expect(resolved.config.sync).toEqual({ enabled: true, secrets: true });
  });
});
