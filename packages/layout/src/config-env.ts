/**
 * Project a resolved config back into the env-var names the server and receiver
 * read directly — the inverse of `envLayer` in ./config.
 *
 * This lives beside the loader on purpose: the receiver reads its OSC target
 * from `process.env` alone, so any process that embeds `startReceiver` (the CLI
 * *and* the desktop app) has to run config through here first. A host that
 * skipped it got a receiver with no OSC output at all — the show looked healthy
 * over the WebSocket while nothing reached the lasers.
 */
import type { WavegridConfig } from './types';

export function configEnvMap(config: WavegridConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const set = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== '') env[k] = String(v);
  };

  if (config.layout.preset) set('WAVEGRID_LAYOUT', config.layout.preset);
  set('WAVEGRID_MODE', config.mode);
  set('WAVEGRID_HOST', config.server.host);
  set('WAVEGRID_PORT', config.server.port);
  set('WAVEGRID_UI_PORT', config.ui.port);
  set('SIMULATOR_URL', `ws://localhost:${config.server.port}`);

  set('RECEIVER_ALPHA', config.receiver.alpha);
  set('FALLBACK_DELAY', config.receiver.fallbackDelay);
  if (config.receiver.shard) {
    set('SHARD_START', config.receiver.shard.start);
    set('SHARD_END', config.receiver.shard.end);
  }
  set('LIGHT_MAP_CONFIG', config.receiver.lightMap);

  if (config.osc.beyond) {
    set('BEYOND_HOST', config.osc.beyond.host);
    set('BEYOND_PORT', config.osc.beyond.port);
    set('BEYOND_GRID_ORDER', config.osc.beyond.gridOrder);
  }
  if (config.osc.fb4) {
    set('FB4_HOST', config.osc.fb4.host);
    set('FB4_PORT', config.osc.fb4.port);
  }
  set('ROUTING_CONFIG', config.osc.routingConfig);

  if (config.debug.osc) set('DEBUG_OSC', '1');
  set('DEBUG_UI_PORT', config.debug.uiPort);

  return env;
}

/** Every key `configEnvMap` can own, whether or not this config sets it. */
export const CONFIG_ENV_KEYS: readonly string[] = [
  'WAVEGRID_LAYOUT',
  'WAVEGRID_MODE',
  'WAVEGRID_HOST',
  'WAVEGRID_PORT',
  'WAVEGRID_UI_PORT',
  'SIMULATOR_URL',
  'RECEIVER_ALPHA',
  'FALLBACK_DELAY',
  'SHARD_START',
  'SHARD_END',
  'LIGHT_MAP_CONFIG',
  'BEYOND_HOST',
  'BEYOND_PORT',
  'BEYOND_GRID_ORDER',
  'FB4_HOST',
  'FB4_PORT',
  'ROUTING_CONFIG',
  'DEBUG_OSC',
  'DEBUG_UI_PORT'
];

/**
 * Set config-derived env vars that aren't already present — operator env wins.
 * Right for a one-shot CLI process, where the ambient env is the operator's
 * explicit intent.
 */
export function applyConfigToEnv(config: WavegridConfig, env: NodeJS.ProcessEnv = process.env): void {
  const map = configEnvMap(config);
  for (const [k, v] of Object.entries(map)) {
    if (!env[k]) env[k] = v;
  }
}

/**
 * Make the env match `config` exactly, clearing config-derived keys this config
 * doesn't set — except keys the host process started with, which stay operator
 * overrides.
 *
 * A long-lived host (the desktop app) starts many projects in one process, so
 * "don't overwrite what's there" would pin the whole session to whichever
 * project started first: switch from a BEYOND project to a console-only one and
 * the old target would keep firing.
 */
export function resetConfigEnv(
  config: WavegridConfig,
  ambient: NodeJS.ProcessEnv,
  env: NodeJS.ProcessEnv = process.env
): void {
  const map = configEnvMap(config);
  for (const key of CONFIG_ENV_KEYS) {
    if (ambient[key] != null) {
      env[key] = ambient[key];
      continue;
    }
    if (map[key] != null) env[key] = map[key];
    else delete env[key];
  }
}
