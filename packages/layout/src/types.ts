/**
 * Layout — the single source of truth for where every cannon physically sits.
 *
 * Everything downstream (patterns, animations, scenes, the UI canvas, the 3D
 * viewer, OSC routing) reads geometry from a `Layout` instead of re-deriving it
 * from `(numCannons, gridColumns)`. A layout is plain, JSON-serializable data so
 * the server can resolve it once and broadcast it to every client over the wire.
 */

import type { UnifiedRouting } from './routing';

export type Topology = 'grid' | 'ring' | 'filledRing' | 'rings';

/**
 * One concentric ring of a `rings` layout. `radius` is 0..1 (1 = outermost);
 * `phase` rotates the ring in degrees so its fixtures can sit between the ones
 * outside it instead of lining up radially. A ring at radius 0 is the centre
 * fixture and must have `count: 1`.
 */
export interface RingSpec {
  count: number;
  radius: number;
  phase?: number;
}

/**
 * A single cannon's position. `index` is the logical id used everywhere else
 * (OSC `logical`, WebSocket grid arrays, pattern `set(idx, …)`).
 */
export interface Fixture {
  /** Logical id, contiguous 0..count-1 in traversal order. */
  index: number;
  /** Normalized position within the bounding box, both in [0, 1]. */
  u: number;
  v: number;
  /** Centered world position (unitless, origin at the layout centroid). */
  x: number;
  y: number;
  /** Angle from the centroid, radians, atan2(y, x). */
  angle: number;
  /** Distance from the centroid, normalized so the outermost fixture is 1. */
  radius: number;
  /** Concentric ring index from the centroid (0 = innermost). */
  ring: number;
  /** Grid row when the layout has grid coordinates, else -1. */
  row: number;
  /** Grid column when the layout has grid coordinates, else -1. */
  col: number;
  /** Optional human-readable label (e.g. "A1"). */
  label: string;
}

export interface Layout {
  /** Stable id, e.g. "grid-7x7", "ring-6", "ring-25-filled". */
  id: string;
  /** Human-readable name. */
  name: string;
  topology: Topology;
  /** Number of logical cannons (=== fixtures.length). */
  count: number;
  /** Fixtures in logical order; `fixtures[i].index === i`. */
  fixtures: Fixture[];
  /** Bounding-grid width. 0 for pure rings. */
  cols: number;
  /** Bounding-grid height. 0 for pure rings. */
  rows: number;
  /**
   * True when fixtures carry meaningful grid `row`/`col` (grid & filledRing).
   * Grid-space transforms (rotate/flip, row/col animations) only apply here.
   */
  hasGridCoords: boolean;
  /** Fixture indices tracing the outer edge, in draw order. */
  perimeter: number[];
}

export type RunMode = 'simple' | 'distributed';

/**
 * Layout kinds a config can ask for. `annulus` is sugar: it distributes a
 * fixture count over concentric rings and resolves to a `rings` layout.
 */
export type LayoutKind = Topology | 'annulus';

/** How a layout is described in a config file. */
export interface LayoutSpec {
  /** Reference a built-in preset by id (takes precedence over `kind`). */
  preset?: string;
  kind?: LayoutKind;
  /** grid: number of columns. */
  cols?: number;
  /** grid: number of rows. */
  rows?: number;
  /** ring / filledRing / annulus: number of cannons. */
  count?: number;
  /** rings: the concentric rings, in any order (outer-first is the result). */
  rings?: RingSpec[];
  /** annulus: radius of the hole in the middle, 0..1 (0 = solid disc). */
  innerRadius?: number;
  /** Override the generated id/name. */
  id?: string;
  name?: string;
}

export interface ServerConfig {
  host: string;
  port: number;
}

export interface UiConfig {
  port: number;
}

/** A contiguous cannon range this receiver drives in distributed mode. */
export interface ShardConfig {
  start: number;
  end: number;
}

/** A single BEYOND OSC target. */
export interface BeyondConfig {
  host: string;
  port: number;
  /** Order fixtures are emitted in — matches the BEYOND grid wiring. */
  gridOrder: 'row' | 'column';
}

/** A single FB4 OSC target. */
export interface Fb4Config {
  host: string;
  port: number;
}

/**
 * OSC output. Pick ONE: a single `beyond` target, a single `fb4` target, a
 * unified `routing` spec (multi-machine installs — per-device files are
 * generated from it), or a pre-written `routingConfig` file path. All optional —
 * when none is set the receiver runs console-only (no lasers).
 */
export interface OscConfig {
  beyond?: BeyondConfig;
  fb4?: Fb4Config;
  /**
   * The authoritative routing spec in GLOBAL logical order. Each laptop's own
   * config — shard-sliced, with zones re-based for that machine — is generated
   * from this, so there is exactly one thing to edit. See `./routing`.
   */
  routing?: UnifiedRouting;
  /** Absolute path to a JSON routing file (escape hatch / legacy installs). */
  routingConfig?: string;
}

export interface ReceiverConfig {
  /** Smoothing factor 0..1 applied to incoming values. */
  alpha: number;
  /** Milliseconds of silence before falling back to idle. */
  fallbackDelay: number;
  /** Distributed mode only: the cannon range this laptop drives. */
  shard?: ShardConfig;
  /** Absolute path to a fixture→light map JSON, when required by the outputs. */
  lightMap?: string;
}

export interface DebugConfig {
  /** Emit OSC packet logging. */
  osc: boolean;
  /** When set, open a debug grid UI on this port. */
  uiPort?: number;
}

/**
 * Config-sync behaviour. Sync is server-mediated (workstream F): the brain
 * serializes writes and broadcasts revisions. Off means edits stay local to
 * the laptop that made them — a one-laptop show never needs it on, and an
 * operator can pin a device offline. Secrets never ride the sync channel
 * unless `secrets` is explicitly enabled.
 */
export interface SyncConfig {
  /** Master switch for config replication. Default on. */
  enabled: boolean;
  /** Allow project secrets to replicate over sync. Default off. */
  secrets: boolean;
}

export interface WavegridConfig {
  layout: LayoutSpec;
  /**
   * 'auto' derives the run profile from the cannon count:
   * < `simpleModeMax` → 'simple' (one process, LAN-only, no sharding),
   * otherwise 'distributed'.
   */
  mode: 'auto' | RunMode;
  /** Cannon-count threshold below which 'auto' resolves to 'simple'. */
  simpleModeMax: number;
  server: ServerConfig;
  ui: UiConfig;
  receiver: ReceiverConfig;
  osc: OscConfig;
  sync: SyncConfig;
  debug: DebugConfig;
  /**
   * Name of the active named light map in the project's map library, or
   * null/undefined for identity (no correction). Activating one materializes it
   * into the state dir's `light-map.json`, which the runtime reads.
   */
  activeLightMap?: string | null;
}
