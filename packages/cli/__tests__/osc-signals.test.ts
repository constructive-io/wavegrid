import { resolveTarget } from '../src/commands/osc-signals';

const noTargets = { osc: {} };

describe('resolveTarget', () => {
  it('uses the project BEYOND target, so a probe exercises the show path', () => {
    const target = resolveTarget({}, { osc: { beyond: { host: '192.168.1.50', port: 7001 } } });
    expect(target).toEqual({
      kind: 'beyond',
      host: '192.168.1.50',
      port: 7001,
      origin: 'project config (BEYOND)'
    });
  });

  it('falls back to FB4 when no BEYOND is configured', () => {
    const target = resolveTarget({}, { osc: { fb4: { host: '192.168.1.77' } } });
    expect(target).toMatchObject({ kind: 'fb4', host: '192.168.1.77', port: 8000 });
  });

  it('prefers flags over config, and defaults the port per kind', () => {
    const config = { osc: { beyond: { host: '192.168.1.50', port: 7001 } } };
    expect(resolveTarget({ host: '127.0.0.1' }, config)).toMatchObject({
      kind: 'beyond',
      host: '127.0.0.1',
      port: 7001,
      origin: 'flags'
    });
    expect(resolveTarget({ host: '127.0.0.1', kind: 'fb4' }, config)).toMatchObject({
      kind: 'fb4',
      port: 8000
    });
    expect(resolveTarget({ host: '127.0.0.1', port: '9000' }, config)).toMatchObject({ port: 9000 });
  });

  it('overrides only the port when the host comes from config', () => {
    const config = { osc: { beyond: { host: '192.168.1.50', port: 7001 } } };
    expect(resolveTarget({ port: 8000 }, config)).toMatchObject({ host: '192.168.1.50', port: 8000 });
  });

  it('refuses to guess a target', () => {
    expect(() => resolveTarget({}, noTargets)).toThrow(/No OSC target/);
  });
});
