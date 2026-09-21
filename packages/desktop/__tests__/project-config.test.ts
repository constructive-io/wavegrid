import { applyEditable, buildLayoutSpec, toEditable } from '@/main/project-config';

describe('buildLayoutSpec', () => {
  it('builds the round shapes the wizard offers', () => {
    expect(buildLayoutSpec({ kind: 'annulus', count: 25, innerRadius: 0.4 })).toEqual({
      kind: 'annulus',
      count: 25,
      innerRadius: 0.4
    });
    const rings = buildLayoutSpec({ kind: 'rings', ringCounts: '12,8,4,1' });
    expect(rings.kind).toBe('rings');
    expect(rings.rings?.map((r) => r.count)).toEqual([12, 8, 4, 1]);
  });

  it('rejects an incomplete or unparseable choice with a user-facing message', () => {
    expect(() => buildLayoutSpec({ kind: 'annulus' })).toThrow(/cannon count/);
    expect(() => buildLayoutSpec({ kind: 'rings', ringCounts: '  ' })).toThrow(/cannons per ring/i);
    expect(() => buildLayoutSpec({ kind: 'rings', ringCounts: '12,nope' })).toThrow(/whole number/);
    expect(() => buildLayoutSpec({ kind: 'annulus', count: 25, innerRadius: 1 })).toThrow(/innerRadius/);
  });
});

describe('editable round-trip', () => {
  it('sets and clears a remote receiver brain', () => {
    const base = toEditable(null);
    const stored = applyEditable(null, { ...base, receiverServer: 'wss://grace.hipzap.com/path' });
    expect(stored.receiver?.server).toBe('wss://grace.hipzap.com');
    expect(toEditable(stored).receiverServer).toBe('wss://grace.hipzap.com');
    const cleared = applyEditable(stored, { ...toEditable(stored), receiverServer: '' });
    expect(cleared.receiver).not.toHaveProperty('server');
  });

  it('rejects a non-ws receiver brain URL', () => {
    expect(() => applyEditable(null, { ...toEditable(null), receiverServer: 'http://grace.hipzap.com' }))
      .toThrow(/ws:\/\//);
  });

  it('keeps an annulus intact through the editor', () => {
    const stored = applyEditable(null, {
      ...toEditable({ layout: { kind: 'annulus', count: 25, innerRadius: 0.5 } }),
      layout: { kind: 'annulus', count: 25, innerRadius: 0.5 }
    });
    const editable = toEditable(stored);
    expect(editable.layout).toEqual({ kind: 'annulus', count: 25, innerRadius: 0.5 });
    expect(editable.cannonCount).toBe(25);
  });

  it('shows a rings layout back as its shorthand, outermost first', () => {
    const stored = applyEditable(null, {
      ...toEditable(null),
      layout: { kind: 'rings', ringCounts: '12,8,4,1' }
    });
    const editable = toEditable(stored);
    expect(editable.layout).toEqual({ kind: 'rings', ringCounts: '12,8,4,1' });
    expect(editable.cannonCount).toBe(25);
  });
});
