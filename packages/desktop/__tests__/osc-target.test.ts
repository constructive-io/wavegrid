import { applyOscTarget, describeOscTarget, toOscTarget } from '@/main/osc-target';
import type { OscTarget } from '@/types/ipc';

const NONE: OscTarget = {
  kind: 'none',
  host: '',
  port: 7001,
  gridOrder: 'row',
  file: '',
  hasUnifiedRouting: false
};

describe('toOscTarget', () => {
  it('reads no config as "none"', () => {
    expect(toOscTarget(null).kind).toBe('none');
    expect(toOscTarget({}).kind).toBe('none');
  });

  it('reads a BEYOND target with its grid order', () => {
    const t = toOscTarget({ osc: { beyond: { host: '10.0.0.2', port: 7001, gridOrder: 'column' } } });
    expect(t).toMatchObject({ kind: 'beyond', host: '10.0.0.2', port: 7001, gridOrder: 'column' });
  });

  it('reads FB4 and a routing file', () => {
    expect(toOscTarget({ osc: { fb4: { host: '10.0.0.3', port: 8000 } } })).toMatchObject({
      kind: 'fb4',
      host: '10.0.0.3',
      port: 8000
    });
    expect(toOscTarget({ osc: { routingConfig: '/tmp/routing.json' } })).toMatchObject({
      kind: 'routing',
      file: '/tmp/routing.json'
    });
  });

  it('flags a project that also holds a unified routing spec', () => {
    const stored = { osc: { routing: { targets: {}, cannons: [] }, beyond: { host: 'h', port: 7001, gridOrder: 'row' as const } } };
    expect(toOscTarget(stored).hasUnifiedRouting).toBe(true);
    expect(toOscTarget({ osc: { beyond: { host: 'h', port: 7001, gridOrder: 'row' } } }).hasUnifiedRouting).toBe(false);
  });
});

describe('applyOscTarget', () => {
  it('leaves exactly one target behind when switching kinds', () => {
    const beyond = applyOscTarget(null, { ...NONE, kind: 'beyond', host: '10.0.0.2' });
    const fb4 = applyOscTarget(beyond, { ...NONE, kind: 'fb4', host: '10.0.0.3', port: 8000 });
    // A leftover `beyond` would keep driving the old machine.
    expect(fb4.osc?.beyond).toBeUndefined();
    expect(fb4.osc?.fb4).toEqual({ host: '10.0.0.3', port: 8000 });

    const cleared = applyOscTarget(fb4, NONE);
    expect(cleared.osc).toEqual({});
  });

  it('preserves the unified routing spec it does not own', () => {
    const spec = { targets: {}, cannons: [], zoneBase: 0 };
    const out = applyOscTarget({ osc: { routing: spec } }, { ...NONE, kind: 'beyond', host: 'h' });
    expect(out.osc?.routing).toBe(spec);
  });

  it('preserves unrelated config keys', () => {
    const out = applyOscTarget({ mode: 'distributed', ui: { port: 4000 } }, { ...NONE, kind: 'beyond', host: 'h' });
    expect(out.mode).toBe('distributed');
    expect(out.ui).toEqual({ port: 4000 });
  });

  it('trims the host and rejects an empty one', () => {
    expect(applyOscTarget(null, { ...NONE, kind: 'beyond', host: '  10.0.0.2  ' }).osc?.beyond?.host).toBe('10.0.0.2');
    expect(() => applyOscTarget(null, { ...NONE, kind: 'beyond', host: '   ' })).toThrow(/BEYOND needs/);
    expect(() => applyOscTarget(null, { ...NONE, kind: 'fb4', host: '' })).toThrow(/FB4 needs/);
    expect(() => applyOscTarget(null, { ...NONE, kind: 'routing', file: '' })).toThrow(/routing JSON/);
  });

  it('falls back to the default port for an unusable one', () => {
    // BEYOND's factory OSC receive port, shared with the CLI and the receiver.
    expect(applyOscTarget(null, { ...NONE, kind: 'beyond', host: 'h', port: NaN }).osc?.beyond?.port).toBe(8000);
    expect(applyOscTarget(null, { ...NONE, kind: 'fb4', host: 'h', port: 99999 }).osc?.fb4?.port).toBe(8000);
  });

  it('round-trips through toOscTarget', () => {
    const target: OscTarget = { ...NONE, kind: 'beyond', host: '10.0.0.2', port: 7002, gridOrder: 'column' };
    expect(toOscTarget(applyOscTarget(null, target))).toEqual(target);
  });
});

describe('describeOscTarget', () => {
  it('matches the CLI wording', () => {
    expect(describeOscTarget({ ...NONE, kind: 'beyond', host: 'h', port: 7001 })).toBe(
      'BEYOND → h:7001 (row)'
    );
    expect(describeOscTarget(NONE)).toBe('none (console only — no lasers)');
  });
});
