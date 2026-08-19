/**
 * The desktop show has to reach the same lasers the OSC debugger does.
 *
 * `startReceiver` takes its OSC target from `process.env` alone — the resolved
 * config it is handed is only geometry — so the desktop app used to start a
 * receiver with no target at all: paint reached the brain over the WebSocket,
 * the show looked healthy, and nothing reached BEYOND. These tests pin the env
 * the receiver is handed for a given project.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_CONFIG,
  loadWavegridConfig,
  type ResolvedConfig,
  type WavegridConfig
} from '@wavegrid/layout';
import type { SettingsStore } from '@wavegrid/settings';

import { applyReceiverEnv, resolveProjectConfig } from '@/main/receiver-env';

const root = mkdtempSync(join(tmpdir(), 'wavegrid-receiver-env-'));

/** Just the store surface the receiver env needs. */
const store = {
  requireSecret: () => 'receiver-key',
  stateDir: (project: string) => join(root, project, 'state'),
  logsDir: (project: string) => join(root, project, 'logs'),
  getDevice: () => ({ id: 'device-1', name: 'booth' }),
  getDeviceRecord: () => ({ shard: { start: 0, end: 11 } })
} as unknown as SettingsStore;

/** Resolve a project config the way the appstash mirror would, env-free. */
function resolve(config: Partial<WavegridConfig>): ResolvedConfig {
  return loadWavegridConfig({
    cwd: join(root, 'nonexistent'),
    env: {},
    overrides: { ...DEFAULT_CONFIG, ...config }
  });
}

const beyond = resolve({
  layout: { preset: 'grace-cathedral' },
  osc: { beyond: { host: '10.0.0.5', port: 8000, gridOrder: 'row' } }
});
const consoleOnly = resolve({ osc: {} });

/** Keys `applyReceiverEnv` owns, cleared so each test starts from a cold app. */
const OWNED = [
  'BEYOND_HOST',
  'BEYOND_PORT',
  'BEYOND_GRID_ORDER',
  'FB4_HOST',
  'FB4_PORT',
  'ROUTING_CONFIG',
  'SHARD_START',
  'SHARD_END',
  'WAVEGRID_LAYOUT',
  'WG_RECEIVER_KEY',
  'WG_STATE_DIR',
  'WG_DEVICE_ID',
  'WG_DEVICE_NAME',
  'RECEIVER_LOG'
];

beforeEach(() => {
  for (const key of OWNED) delete process.env[key];
});

describe('applyReceiverEnv', () => {
  it('hands the receiver the project’s BEYOND target', () => {
    applyReceiverEnv(store, 'grace', beyond);
    expect(process.env.BEYOND_HOST).toBe('10.0.0.5');
    expect(process.env.BEYOND_PORT).toBe('8000');
    expect(process.env.BEYOND_GRID_ORDER).toBe('row');
    expect(process.env.WAVEGRID_LAYOUT).toBe('grace-cathedral');
  });

  it('hands it an FB4 target', () => {
    applyReceiverEnv(store, 'fb4', resolve({ osc: { fb4: { host: '192.168.1.40', port: 8000 } } }));
    expect(process.env.FB4_HOST).toBe('192.168.1.40');
    expect(process.env.FB4_PORT).toBe('8000');
  });

  // The desktop app is long-lived: one process starts many projects, so a stale
  // target here would keep firing at the previous project's lasers.
  it('drops the previous project’s target on a switch', () => {
    applyReceiverEnv(store, 'grace', beyond);
    applyReceiverEnv(store, 'rehearsal', consoleOnly);
    expect(process.env.BEYOND_HOST).toBeUndefined();
    expect(process.env.BEYOND_PORT).toBeUndefined();
    expect(process.env.ROUTING_CONFIG).toBeUndefined();
  });

  it('repoints at the switched-to project’s own target', () => {
    applyReceiverEnv(store, 'grace', beyond);
    applyReceiverEnv(
      store,
      'other',
      resolve({ osc: { beyond: { host: '10.0.0.9', port: 7001, gridOrder: 'column' } } })
    );
    expect(process.env.BEYOND_HOST).toBe('10.0.0.9');
    expect(process.env.BEYOND_PORT).toBe('7001');
  });

  it('points at a routing file generated from a multi-target spec', () => {
    const routed = resolve({
      layout: { preset: 'grace-cathedral' },
      osc: {
        routing: {
          targets: {
            left: { type: 'beyond', host: '10.0.0.5', port: 8000 },
            right: { type: 'beyond', host: '10.0.0.6', port: 8000 }
          },
          cannons: Array.from({ length: 25 }, (_, logical) => ({
            logical,
            target: logical < 13 ? 'left' : 'right'
          }))
        }
      }
    });
    applyReceiverEnv(store, 'routed', routed);
    expect(process.env.ROUTING_CONFIG).toBe(join(root, 'routed', 'state', 'routing', 'this-device.json'));
  });

  it('names the project’s own state dir and receiver log', () => {
    applyReceiverEnv(store, 'grace', beyond);
    expect(process.env.WG_STATE_DIR).toBe(join(root, 'grace', 'state'));
    expect(process.env.RECEIVER_LOG).toBe(join(root, 'grace', 'logs', 'receiver.log'));
    expect(process.env.WG_DEVICE_NAME).toBe('booth');
  });
});

describe('resolveProjectConfig', () => {
  // Env outranks the project layer in the loader, and applyReceiverEnv writes
  // into env — so reading the live env would resolve one project's show against
  // another project's lasers.
  it('ignores the env the app itself wrote', () => {
    applyReceiverEnv(store, 'grace', beyond);
    expect(process.env.BEYOND_HOST).toBe('10.0.0.5');
    expect(resolveProjectConfig().config.osc.beyond?.host).not.toBe('10.0.0.5');
  });
});
