import {
  generateDeviceRouting,
  looksDeviceLocal,
  RoutingValidationError,
  summarizeRanges,
  type UnifiedRouting,
  unifiedRoutingForSingleTarget,
  validateShards,
  validateUnifiedRouting
} from '../src';

const beyond = { type: 'beyond' as const, host: '10.0.0.2', port: 8000 };
const beyond2 = { type: 'beyond' as const, host: '10.0.0.3', port: 8000 };

/** Warnings from generating just `device`'s file out of a 6-cannon spec. */
function warningsOf(spec: UnifiedRouting, device: string): string[] {
  return generateDeviceRouting(spec, [{ name: device, shard: { start: 3, end: 5 } }], 6).warnings;
}

/** A 6-cannon show: first three on pc1, last three on pc2. */
function twoPcSpec(): UnifiedRouting {
  return {
    targets: { pc1: beyond, pc2: beyond2 },
    cannons: [
      { logical: 0, target: 'pc1', label: 'A1' },
      { logical: 1, target: 'pc1', label: 'A2' },
      { logical: 2, target: 'pc1', label: 'A3' },
      { logical: 3, target: 'pc2', label: 'A4' },
      { logical: 4, target: 'pc2', label: 'A5' },
      { logical: 5, target: 'pc2', label: 'A6' }
    ]
  };
}

describe('generateDeviceRouting — simple one-laptop show', () => {
  it('is a no-op re-base: global indices and zones both start at 0', () => {
    const spec = unifiedRoutingForSingleTarget(beyond, 6);

    const { devices } = generateDeviceRouting(spec, [{ name: 'laptop' }], 6);

    expect(devices).toHaveLength(1);
    expect(devices[0].cannons.map((c) => [c.logical, c.projectorIndex])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5]
    ]);
    expect(devices[0].generated.shard).toBeNull();
  });
});

describe('generateDeviceRouting — distributed re-basing', () => {
  it('re-bases grid indices per device: the second laptop starts at 0 again', () => {
    const { devices } = generateDeviceRouting(
      twoPcSpec(),
      [
        { name: 'pc-a', shard: { start: 0, end: 2 } },
        { name: 'pc-b', shard: { start: 3, end: 5 } }
      ],
      6
    );

    const b = devices[1];
    expect(b.cannons.map((c) => c.logical)).toEqual([0, 1, 2]);
    // …while provenance still records where each came from globally.
    expect(b.cannons.map((c) => c.globalLogical)).toEqual([3, 4, 5]);
    expect(b.cannons.map((c) => c.label)).toEqual(['A4', 'A5', 'A6']);
  });

  it('re-bases BEYOND zones per device too', () => {
    const { devices } = generateDeviceRouting(
      twoPcSpec(),
      [
        { name: 'pc-a', shard: { start: 0, end: 2 } },
        { name: 'pc-b', shard: { start: 3, end: 5 } }
      ],
      6
    );

    expect(devices[0].cannons.map((c) => c.projectorIndex)).toEqual([0, 1, 2]);
    expect(devices[1].cannons.map((c) => c.projectorIndex)).toEqual([0, 1, 2]);
  });

  it('numbers zones per target, so one laptop driving two PCs gets two zone runs', () => {
    const spec: UnifiedRouting = {
      targets: { pc1: beyond, pc2: beyond2 },
      cannons: [
        { logical: 0, target: 'pc1' },
        { logical: 1, target: 'pc2' },
        { logical: 2, target: 'pc1' },
        { logical: 3, target: 'pc2' }
      ]
    };

    const { devices } = generateDeviceRouting(spec, [{ name: 'solo' }], 4);

    expect(devices[0].cannons.map((c) => [c.target, c.projectorIndex])).toEqual([
      ['pc1', 0],
      ['pc2', 0],
      ['pc1', 1],
      ['pc2', 1]
    ]);
  });

  it('only includes the targets a device actually drives, and says what it dropped', () => {
    const { devices, warnings } = generateDeviceRouting(
      twoPcSpec(),
      [
        { name: 'pc-a', shard: { start: 0, end: 2 } },
        { name: 'pc-b', shard: { start: 3, end: 5 } }
      ],
      6
    );

    expect(Object.keys(devices[0].targets)).toEqual(['pc1']);
    expect(Object.keys(devices[1].targets)).toEqual(['pc2']);
    expect(warnings.join(' ')).toContain('"pc-a" drives nothing on target "pc2"');
  });

  it('carries flushHz through and stamps generation provenance', () => {
    const spec = { ...twoPcSpec(), flushHz: 45 };

    const { devices } = generateDeviceRouting(spec, [{ name: 'pc-b', shard: { start: 3, end: 5 } }], 6);

    expect(devices[0].flushHz).toBe(45);
    expect(devices[0].generated).toEqual({
      device: 'pc-b',
      shard: { start: 3, end: 5 },
      zoneBase: 0,
      globalCount: 6
    });
  });
});

describe('zoneBase', () => {
  it('starts zone numbering at 1 when the rig is 1-based', () => {
    const spec: UnifiedRouting = { ...twoPcSpec(), zoneBase: 1 };

    const { devices } = generateDeviceRouting(spec, [{ name: 'pc-b', shard: { start: 3, end: 5 } }], 6);

    expect(devices[0].cannons.map((c) => c.projectorIndex)).toEqual([1, 2, 3]);
    expect(devices[0].generated.zoneBase).toBe(1);
    expect(warningsOf(spec, 'pc-b').join(' ')).toContain('No listed device drives fixtures 0–2');
  });

  it('rejects a zone base other than 0 or 1', () => {
    const spec = { ...twoPcSpec(), zoneBase: 2 } as unknown as UnifiedRouting;

    expect(validateUnifiedRouting(spec, 6).join(' ')).toContain('zoneBase must be 0 or 1');
  });
});

describe('pinned projectorIndex (hardware as installed)', () => {
  it('keeps the override and routes generated zones around it', () => {
    const spec: UnifiedRouting = {
      targets: { pc1: beyond },
      cannons: [
        { logical: 0, target: 'pc1', projectorIndex: 1 },
        { logical: 1, target: 'pc1' },
        { logical: 2, target: 'pc1' }
      ]
    };

    const { devices } = generateDeviceRouting(spec, [{ name: 'solo' }], 3);

    // 0 is pinned to zone 1, so generation hands out 0 then skips 1 → 2.
    expect(devices[0].cannons.map((c) => c.projectorIndex)).toEqual([1, 0, 2]);
  });

  it('rejects two fixtures pinned to the same zone on one machine', () => {
    const spec: UnifiedRouting = {
      targets: { pc1: beyond },
      cannons: [
        { logical: 0, target: 'pc1', projectorIndex: 3 },
        { logical: 1, target: 'pc1', projectorIndex: 3 }
      ]
    };

    expect(() => generateDeviceRouting(spec, [{ name: 'solo' }], 2)).toThrow(RoutingValidationError);
  });
});

describe('validateUnifiedRouting', () => {
  it('accepts a complete spec', () => {
    expect(validateUnifiedRouting(twoPcSpec(), 6)).toEqual([]);
  });

  it('rejects a duplicate logical index', () => {
    const spec = twoPcSpec();
    spec.cannons[1].logical = 0;

    expect(validateUnifiedRouting(spec, 6).join(' ')).toContain('logical 0 appears more than once');
  });

  it('rejects a missing fixture — the spec must cover the whole show', () => {
    const spec = twoPcSpec();
    spec.cannons.pop();

    expect(validateUnifiedRouting(spec, 6).join(' ')).toContain('Cannon 5 is missing');
  });

  it('rejects an unknown target reference', () => {
    const spec = twoPcSpec();
    spec.cannons[0].target = 'pc9';

    expect(validateUnifiedRouting(spec, 6).join(' ')).toContain('unknown target "pc9"');
  });

  it('requires a serial for FB4 targets', () => {
    const spec: UnifiedRouting = {
      targets: { box: { type: 'fb4', host: '10.0.0.9', port: 8000 } },
      cannons: [{ logical: 0, target: 'box' }]
    };

    expect(validateUnifiedRouting(spec, 1).join(' ')).toContain('no fb4Serial');
  });

  it('flags a bad target definition', () => {
    const spec: UnifiedRouting = {
      targets: { pc1: { type: 'beyond', host: '', port: 0 } },
      cannons: [{ logical: 0, target: 'pc1' }]
    };

    const problems = validateUnifiedRouting(spec, 1).join(' ');
    expect(problems).toContain('no host');
    expect(problems).toContain('invalid port');
  });
});

describe('double re-base detection', () => {
  it('recognizes an already-generated config and refuses to re-base it', () => {
    const generated = generateDeviceRouting(
      twoPcSpec(),
      [{ name: 'pc-b', shard: { start: 3, end: 5 } }],
      6
    ).devices[0];

    const asSpec = generated as unknown as UnifiedRouting;
    expect(looksDeviceLocal(asSpec, 6)).toBe(true);
    expect(() => generateDeviceRouting(asSpec, [{ name: 'pc-b' }], 6)).toThrow(
      /was generated for a single device/
    );
  });

  it('treats a short cannon list as device-local', () => {
    const spec = twoPcSpec();
    spec.cannons = spec.cannons.slice(0, 3);

    expect(looksDeviceLocal(spec, 6)).toBe(true);
  });
});

describe('validateShards', () => {
  it('accepts a contiguous cover', () => {
    expect(
      validateShards(
        [
          { name: 'a', shard: { start: 0, end: 2 } },
          { name: 'b', shard: { start: 3, end: 5 } }
        ],
        6
      )
    ).toEqual([]);
  });

  it('reports overlaps with both owners', () => {
    const problems = validateShards(
      [
        { name: 'a', shard: { start: 0, end: 3 } },
        { name: 'b', shard: { start: 3, end: 5 } }
      ],
      6
    ).join(' ');

    expect(problems).toContain('Fixture 3 is claimed by both "a" and "b"');
  });

  it('reports gaps compactly when the whole installation is being checked', () => {
    const devices = [
      { name: 'a', shard: { start: 0, end: 1 } },
      { name: 'b', shard: { start: 4, end: 5 } }
    ];

    expect(validateShards(devices, 6, { requireCoverage: true }).join(' ')).toContain(
      'No device drives fixtures 2–3'
    );
    // Generating one laptop's file at a time must not fail on the laptops the
    // caller didn't list.
    expect(validateShards(devices, 6)).toEqual([]);
  });

  it('rejects a shard running past the last fixture', () => {
    expect(validateShards([{ name: 'a', shard: { start: 0, end: 9 } }], 6).join(' ')).toContain(
      'runs past the last fixture (5)'
    );
  });

  it('rejects an inverted range', () => {
    expect(validateShards([{ name: 'a', shard: { start: 4, end: 1 } }], 6).join(' ')).toContain(
      'end before start'
    );
  });

  it('rejects an unsharded device alongside others', () => {
    const problems = validateShards(
      [{ name: 'a' }, { name: 'b', shard: { start: 0, end: 5 } }],
      6
    ).join(' ');

    expect(problems).toContain('"a" has no shard');
  });

  it('allows a single unsharded device to drive everything', () => {
    expect(validateShards([{ name: 'solo' }], 6)).toEqual([]);
  });
});

describe('generateDeviceRouting failure modes', () => {
  it('throws with every problem at once, not just the first', () => {
    const spec = twoPcSpec();
    spec.cannons[0].target = 'nope';
    spec.cannons.pop();

    try {
      generateDeviceRouting(spec, [{ name: 'a', shard: { start: 0, end: 1 } }], 6);
      throw new Error('expected a validation error');
    } catch (e) {
      const err = e as RoutingValidationError;
      expect(err).toBeInstanceOf(RoutingValidationError);
      expect(err.problems.length).toBeGreaterThan(1);
    }
  });

  it('needs at least one device', () => {
    expect(() => generateDeviceRouting(twoPcSpec(), [], 6)).toThrow(/No devices/);
  });

  it('refuses to generate a whole installation with a shard gap', () => {
    expect(() =>
      generateDeviceRouting(
        twoPcSpec(),
        [
          { name: 'a', shard: { start: 0, end: 1 } },
          { name: 'b', shard: { start: 4, end: 5 } }
        ],
        6,
        { requireCoverage: true }
      )
    ).toThrow(/No device drives fixtures 2–3/);
  });
});

describe('summarizeRanges', () => {
  it('collapses runs and keeps singletons', () => {
    expect(summarizeRanges([0, 1, 2, 7, 12, 13])).toBe('0–2, 7, 12–13');
  });
});

describe('unifiedRoutingForSingleTarget', () => {
  it('puts every cannon on one target in logical order', () => {
    const spec = unifiedRoutingForSingleTarget(beyond, 3, { targetName: 'pc1', labels: ['A', 'B', 'C'] });

    expect(spec.targets).toEqual({ pc1: beyond });
    expect(spec.cannons).toEqual([
      { logical: 0, target: 'pc1', label: 'A' },
      { logical: 1, target: 'pc1', label: 'B' },
      { logical: 2, target: 'pc1', label: 'C' }
    ]);
    expect(validateUnifiedRouting(spec, 3)).toEqual([]);
  });
});

describe('fixture kind in routing', () => {
  const targets = {
    pc: { type: 'beyond' as const, host: '10.0.0.1', port: 8000 },
    box: { type: 'fb4' as const, host: '10.0.0.2', port: 8000 }
  };

  it('carries kind through to the device-local config', () => {
    const spec: UnifiedRouting = {
      targets,
      cannons: [
        { logical: 0, target: 'pc', kind: 'cannon' },
        { logical: 1, target: 'pc', kind: 'projector' },
        { logical: 2, target: 'pc' }
      ]
    };
    const { devices } = generateDeviceRouting(spec, [{ name: 'solo' }], 3);
    expect(devices[0].cannons.map((c) => c.kind)).toEqual(['cannon', 'projector', undefined]);
    expect(validateUnifiedRouting(spec, 3)).toEqual([]);
  });

  it('refuses a projector on an FB4 target', () => {
    const spec: UnifiedRouting = {
      targets,
      cannons: [{ logical: 0, target: 'box', kind: 'projector', fb4Serial: '02356' }]
    };
    const problems = validateUnifiedRouting(spec, 1);
    expect(problems.some((p) => /Projector 0 drives FB4 target "box"/.test(p))).toBe(true);
  });

  it('refuses an unknown kind', () => {
    const spec = {
      targets,
      cannons: [{ logical: 0, target: 'pc', kind: 'disco' }]
    } as unknown as UnifiedRouting;
    expect(validateUnifiedRouting(spec, 1).some((p) => /unknown kind "disco"/.test(p))).toBe(true);
  });
});
