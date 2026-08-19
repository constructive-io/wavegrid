import { createConfigLoader } from 'confstash';

import { resolveLayout } from './presets';
import { Layout, RunMode, WavegridConfig } from './types';

/**
 * BEYOND's factory OSC receive port (`[OSC] PortIn` in BEYOND.ini). Every
 * default in the repo comes from here: a wrong default is invisible, because
 * OSC over UDP is silently dropped when nothing is bound.
 */
export const DEFAULT_BEYOND_PORT = 8000;

/** FB4's OSC port. */
export const DEFAULT_FB4_PORT = 8000;

export const DEFAULT_CONFIG: WavegridConfig = {
  layout: { preset: 'grid-7x7' },
  mode: 'auto',
  simpleModeMax: 40,
  server: { host: '0.0.0.0', port: 3000 },
  ui: { port: 3003 },
  receiver: { alpha: 0.06, fallbackDelay: 3000 },
  osc: {},
  sync: { enabled: true, secrets: false },
  debug: { osc: false }
};

function toBool(value: string | undefined): boolean | undefined {
  if (value == null || value.trim() === '') return undefined;
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return undefined;
}

function toInt(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function toFloat(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Map environment variables into a config layer. Env sits just below CLI
 * overrides so a single build can be re-pointed at another layout at runtime.
 */
function envLayer(env: NodeJS.ProcessEnv): Partial<WavegridConfig> {
  const out: Partial<WavegridConfig> = {};

  if (env.WAVEGRID_LAYOUT) out.layout = { preset: env.WAVEGRID_LAYOUT };
  if (env.WAVEGRID_MODE === 'simple' || env.WAVEGRID_MODE === 'distributed' || env.WAVEGRID_MODE === 'auto') {
    out.mode = env.WAVEGRID_MODE;
  }
  const simpleMax = toInt(env.WAVEGRID_SIMPLE_MAX);
  if (simpleMax != null) out.simpleModeMax = simpleMax;

  // Namespaced only: a bare `PORT`/`HOST` in a dev shell must NOT hijack the
  // server (that caused an EADDRINUSE against macOS AirPlay on :5000). The
  // store/project is authoritative; env overrides are explicit `WAVEGRID_*`.
  const serverPort = toInt(env.WAVEGRID_PORT);
  if (serverPort != null || env.WAVEGRID_HOST) {
    out.server = {
      ...DEFAULT_CONFIG.server,
      ...(serverPort != null ? { port: serverPort } : {}),
      ...(env.WAVEGRID_HOST ? { host: env.WAVEGRID_HOST } : {})
    };
  }
  const uiPort = toInt(env.WAVEGRID_UI_PORT);
  if (uiPort != null) out.ui = { port: uiPort };

  // Receiver tuning + sharding
  const receiver: Partial<WavegridConfig['receiver']> = {};
  const alpha = toFloat(env.RECEIVER_ALPHA);
  if (alpha != null) receiver.alpha = alpha;
  const fallback = toInt(env.FALLBACK_DELAY);
  if (fallback != null) receiver.fallbackDelay = fallback;
  const shardStart = toInt(env.SHARD_START);
  const shardEnd = toInt(env.SHARD_END);
  if (shardStart != null && shardEnd != null) receiver.shard = { start: shardStart, end: shardEnd };
  if (env.LIGHT_MAP_CONFIG) receiver.lightMap = env.LIGHT_MAP_CONFIG;
  if (Object.keys(receiver).length > 0) {
    out.receiver = { ...DEFAULT_CONFIG.receiver, ...receiver };
  }

  // OSC output — a single BEYOND / FB4 target or a routing file
  const osc: WavegridConfig['osc'] = {};
  if (env.BEYOND_HOST) {
    osc.beyond = {
      host: env.BEYOND_HOST,
      port: toInt(env.BEYOND_PORT) ?? DEFAULT_BEYOND_PORT,
      gridOrder: env.BEYOND_GRID_ORDER === 'column' ? 'column' : 'row'
    };
  }
  if (env.FB4_HOST) {
    osc.fb4 = { host: env.FB4_HOST, port: toInt(env.FB4_PORT) ?? DEFAULT_FB4_PORT };
  }
  if (env.ROUTING_CONFIG) osc.routingConfig = env.ROUTING_CONFIG;
  if (Object.keys(osc).length > 0) out.osc = osc;

  // Config sync — a runtime kill switch for replication (WG_SYNC_ENABLED=0)
  // and the secrets gate (WG_SYNC_SECRETS=1).
  const sync: Partial<WavegridConfig['sync']> = {};
  const syncEnabled = toBool(env.WG_SYNC_ENABLED);
  if (syncEnabled != null) sync.enabled = syncEnabled;
  const syncSecrets = toBool(env.WG_SYNC_SECRETS);
  if (syncSecrets != null) sync.secrets = syncSecrets;
  if (Object.keys(sync).length > 0) out.sync = { ...DEFAULT_CONFIG.sync, ...sync };

  // Debug
  const debug: Partial<WavegridConfig['debug']> = {};
  if (env.DEBUG_OSC) debug.osc = env.DEBUG_OSC !== '0' && env.DEBUG_OSC !== '';
  const debugUiPort = toInt(env.DEBUG_UI_PORT);
  if (debugUiPort != null) debug.uiPort = debugUiPort;
  if (Object.keys(debug).length > 0) {
    out.debug = { ...DEFAULT_CONFIG.debug, ...debug };
  }

  return out;
}

export function createWavegridLoader() {
  return createConfigLoader<WavegridConfig>({
    tool: 'wavegrid',
    defaults: DEFAULT_CONFIG,
    envLayer,
    // Layer the active project's config (written by @wavegrid/settings to
    // ~/.wavegrid/config/config.json) below any local ./wavegrid.json.
    userStash: true
  });
}

export interface ResolvedConfig {
  config: WavegridConfig;
  layout: Layout;
  runMode: RunMode;
  filepath?: string;
}

/** Derive the run profile from the config + resolved cannon count. */
export function resolveMode(config: WavegridConfig, layout: Layout): RunMode {
  if (config.mode === 'simple' || config.mode === 'distributed') return config.mode;
  return layout.count < config.simpleModeMax ? 'simple' : 'distributed';
}

export interface LoadOptions {
  cwd?: string;
  configFile?: string;
  overrides?: Partial<WavegridConfig>;
  env?: NodeJS.ProcessEnv;
}

/** Load config from disk/env, resolve the layout, and derive the run mode. */
export function loadWavegridConfig(opts: LoadOptions = {}): ResolvedConfig {
  const loader = createWavegridLoader();
  const { config, filepath } = loader.loadSync({
    cwd: opts.cwd,
    configFile: opts.configFile,
    overrides: opts.overrides,
    env: opts.env
  });
  const layout = resolveLayout(config.layout);
  const runMode = resolveMode(config, layout);
  return { config, layout, runMode, filepath };
}
