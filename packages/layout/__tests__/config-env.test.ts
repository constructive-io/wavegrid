import { DEFAULT_CONFIG, loadWavegridConfig } from '../src/config';
import { applyConfigToEnv, CONFIG_ENV_KEYS, configEnvMap, resetConfigEnv } from '../src/config-env';
import type { WavegridConfig } from '../src/types';

const beyondProject: WavegridConfig = {
  ...DEFAULT_CONFIG,
  layout: { preset: 'grace-cathedral' },
  osc: { beyond: { host: '10.0.0.5', port: 8000, gridOrder: 'row' } }
};

const consoleOnlyProject: WavegridConfig = { ...DEFAULT_CONFIG, osc: {} };

describe('configEnvMap', () => {
  it('projects a BEYOND target the receiver can find', () => {
    const env = configEnvMap(beyondProject);
    expect(env.BEYOND_HOST).toBe('10.0.0.5');
    expect(env.BEYOND_PORT).toBe('8000');
    expect(env.BEYOND_GRID_ORDER).toBe('row');
    expect(env.WAVEGRID_LAYOUT).toBe('grace-cathedral');
  });

  it('projects an FB4 target', () => {
    const env = configEnvMap({ ...DEFAULT_CONFIG, osc: { fb4: { host: '192.168.1.40', port: 8000 } } });
    expect(env.FB4_HOST).toBe('192.168.1.40');
    expect(env.FB4_PORT).toBe('8000');
    expect(env.BEYOND_HOST).toBeUndefined();
  });

  it('names no OSC key for a project that sends nowhere', () => {
    const env = configEnvMap(consoleOnlyProject);
    for (const key of ['BEYOND_HOST', 'FB4_HOST', 'ROUTING_CONFIG']) {
      expect(env[key]).toBeUndefined();
    }
  });

  it('only produces keys it declares as its own', () => {
    const keys = Object.keys(
      configEnvMap({
        ...beyondProject,
        receiver: { ...DEFAULT_CONFIG.receiver, shard: { start: 0, end: 11 }, lightMap: '/map.json' },
        debug: { osc: true, uiPort: 3099 }
      })
    );
    expect(keys.filter((k) => !CONFIG_ENV_KEYS.includes(k))).toEqual([]);
  });

  // The projection is only useful if the loader reads back what it wrote.
  it('round-trips through the loader that parses it', () => {
    const resolved = loadWavegridConfig({ env: configEnvMap(beyondProject), cwd: '/nonexistent' });
    expect(resolved.config.osc.beyond).toEqual({ host: '10.0.0.5', port: 8000, gridOrder: 'row' });
    expect(resolved.layout.count).toBe(25);
  });
});

describe('applyConfigToEnv', () => {
  it('fills config values without touching what the operator set', () => {
    const env: NodeJS.ProcessEnv = { BEYOND_HOST: '127.0.0.1' };
    applyConfigToEnv(beyondProject, env);
    expect(env.BEYOND_HOST).toBe('127.0.0.1');
    expect(env.BEYOND_PORT).toBe('8000');
  });
});

describe('resetConfigEnv', () => {
  it('clears the previous project’s target instead of leaving it firing', () => {
    const env: NodeJS.ProcessEnv = {};
    resetConfigEnv(beyondProject, {}, env);
    expect(env.BEYOND_HOST).toBe('10.0.0.5');

    resetConfigEnv(consoleOnlyProject, {}, env);
    expect(env.BEYOND_HOST).toBeUndefined();
    expect(env.BEYOND_PORT).toBeUndefined();
  });

  it('repoints a switched project at its own target', () => {
    const env: NodeJS.ProcessEnv = {};
    resetConfigEnv(beyondProject, {}, env);
    resetConfigEnv({ ...DEFAULT_CONFIG, osc: { beyond: { host: '10.0.0.9', port: 7001, gridOrder: 'column' } } }, {}, env);
    expect(env.BEYOND_HOST).toBe('10.0.0.9');
    expect(env.BEYOND_PORT).toBe('7001');
    expect(env.BEYOND_GRID_ORDER).toBe('column');
  });

  it('keeps an env the host process was launched with as an override', () => {
    const ambient: NodeJS.ProcessEnv = { BEYOND_HOST: '127.0.0.1' };
    const env: NodeJS.ProcessEnv = { ...ambient };
    resetConfigEnv(beyondProject, ambient, env);
    expect(env.BEYOND_HOST).toBe('127.0.0.1');
    expect(env.BEYOND_PORT).toBe('8000');

    // ...and restores it even after another project overwrote the live env.
    env.BEYOND_HOST = '10.0.0.5';
    resetConfigEnv(consoleOnlyProject, ambient, env);
    expect(env.BEYOND_HOST).toBe('127.0.0.1');
  });

  it('leaves env it does not own alone', () => {
    const env: NodeJS.ProcessEnv = { WG_JWT_SECRET: 'secret', PATH: '/usr/bin' };
    resetConfigEnv(beyondProject, {}, env);
    expect(env.WG_JWT_SECRET).toBe('secret');
    expect(env.PATH).toBe('/usr/bin');
  });
});
