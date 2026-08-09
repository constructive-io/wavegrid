import { buildLightMapView, normalizeLightMap } from '@/main/light-map';

describe('normalizeLightMap', () => {
  const dims = { numCannons: 6, gridColumns: 0 };

  it('defaults a missing map to identity', () => {
    expect(normalizeLightMap(null, dims).physicalLights).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps a valid permutation as-is', () => {
    const pl = [5, 4, 3, 2, 1, 0];
    expect(normalizeLightMap({ physicalLights: pl }, dims).physicalLights).toEqual(pl);
  });

  it('drops duplicates and back-fills from unused identity slots', () => {
    // logical 0 and 1 both claim physical 2 → the second is dropped and back-filled.
    const out = normalizeLightMap({ physicalLights: [2, 2, 0, 1] }, dims).physicalLights;
    expect(out).toHaveLength(6);
    expect(new Set(out).size).toBe(6); // still a permutation
    expect(out.every((n) => n >= 0 && n < 6)).toBe(true);
    expect(out[0]).toBe(2);
  });

  it('drops out-of-range and non-integer values', () => {
    const out = normalizeLightMap({ physicalLights: [99, -1, 1.5, 3] }, dims).physicalLights;
    expect(new Set(out).size).toBe(6);
    expect(out.every((n) => Number.isInteger(n) && n >= 0 && n < 6)).toBe(true);
    expect(out[3]).toBe(3);
  });

  it('truncates an over-long source to numCannons and stays a permutation', () => {
    const out = normalizeLightMap({ physicalLights: [0, 1, 2, 3, 4, 5, 6, 7] }, dims).physicalLights;
    expect(out).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('buildLightMapView', () => {
  it('resolves one row per fixture with the mapping chain', () => {
    const view = buildLightMapView({
      project: 'demo',
      config: { layout: { preset: 'ring-6' } },
      devices: [{ name: 'laptop-a', shard: { start: 0, end: 2 } }],
      stored: { physicalLights: [1, 0, 2, 3, 4, 5] }
    });

    expect(view.numCannons).toBe(6);
    expect(view.rows).toHaveLength(6);
    expect(view.physicalLights[0]).toBe(1);
    // logical 0..2 are driven by the sharded device; 3..5 by nobody in particular.
    expect(view.rows[0].shardOwner).toBe('laptop-a');
    expect(view.rows[5].shardOwner).toBeNull();
    // Device-local output re-bases to 0 within the shard: logical 2 → local 2.
    expect(view.rows[2].localIndex).toBe(2);
    expect(view.rows[5].localIndex).toBeNull();
    // logical 0↔1 are swapped → both corrected; the rest identity.
    expect(view.rows[0].corrected).toBe(true);
    expect(view.rows[2].corrected).toBe(false);
    expect(view.identity).toBe(false);
    // a ring gets the order strategies, never the grid ones.
    expect(view.strategies.map((s) => s.id)).toEqual(['identity', 'reverse', 'ringCounterClockwise']);
    // no OSC target configured → console.
    expect(view.rows[0].oscTarget).toMatch(/console/);
  });

  it('reports identity when no correction is stored', () => {
    const view = buildLightMapView({
      project: 'demo',
      config: { layout: { preset: 'grid-7x7' } },
      devices: [],
      stored: null
    });
    expect(view.identity).toBe(true);
    expect(view.rows.every((r) => !r.corrected)).toBe(true);
    // grid offers the geometric heuristics; square grids include rotate90.
    expect(view.strategies.map((s) => s.id)).toContain('flipH');
    expect(view.strategies.map((s) => s.id)).toContain('rotate90');
    // fixtures carry normalized canvas positions.
    expect(view.rows[0].u).toBeGreaterThanOrEqual(0);
    expect(view.rows[0].u).toBeLessThanOrEqual(1);
  });

  it('describes a BEYOND OSC target and grid positions', () => {
    const view = buildLightMapView({
      project: 'grid',
      config: {
        layout: { preset: 'grid-7x7' },
        osc: { beyond: { host: '10.0.0.5', port: 5568, gridOrder: 'row' } }
      },
      devices: [],
      stored: null
    });

    expect(view.numCannons).toBe(49);
    expect(view.rows[0].oscTarget).toBe('BEYOND @ 10.0.0.5:5568');
    expect(view.rows[0].position).toMatch(/row \d+, col \d+/);
  });
});
