// Types shared across the IPC boundary (main ⇄ preload ⇄ renderer). These stay
// framework-neutral: no store objects, no secret values ever cross the wire.

export type RunMode = 'simple' | 'distributed' | 'auto';

export interface BrainStatus {
  running: boolean;
  /** Origin the embedded laser UI + API are served on, e.g. http://127.0.0.1:3000. */
  url: string | null;
  project: string | null;
  runMode: RunMode | null;
  /** Whether this machine's in-process receiver (the output stage) is running.
   *  It can be stopped and restarted without taking the brain down. */
  receiverRunning: boolean;
  /** LAN URLs receivers / iPads can point at while the brain is running. */
  lanUrls: string[];
  /** Why the output stage isn't running while the brain is up (OSC target,
   *  network) — the show plays on screen but nothing reaches the lasers. */
  receiverError: string | null;
  /** What the running receiver is driving, e.g. `['Console', 'BEYOND OSC →
   *  10.0.0.5:8000 (row-major, rgb)']`. `['Console']` alone means the show is
   *  running with no OSC output — the lasers stay dark. */
  receiverOutputs: string[];
  /** Why the last start attempt failed, while the brain is down. Cleared by a
   *  successful start. */
  lastError: string | null;
}

export interface ProjectSummary {
  name: string;
  active: boolean;
}

/** How a project's layout is chosen — a built-in preset id, or a generated
 *  shape (grid cols×rows, ring/filledRing/annulus count, explicit ring counts).
 *  Mirrors the CLI's LayoutSpec. */
export interface LayoutChoice {
  preset?: string;
  kind?: 'grid' | 'ring' | 'filledRing' | 'annulus' | 'rings';
  cols?: number;
  rows?: number;
  count?: number;
  /** annulus: size of the hole in the middle, 0..1. */
  innerRadius?: number;
  /** rings: cannons per ring, outermost first, e.g. "12,8,4,1". */
  ringCounts?: string;
}

/** Input for the create-project wizard. Main turns this into a ProjectConfig,
 *  creates the project, and generates its secrets once. */
export interface NewProjectInput {
  name: string;
  layout: LayoutChoice;
  mode: 'auto' | 'simple' | 'distributed';
  serverHost: string;
  serverPort: number;
  uiPort: number;
  simpleModeMax: number;
}

/** The flattened, editable view of a project's config the editor screen binds
 *  to. Fields the editor does not own (osc, sync, receiver.shard/lightMap,
 *  debug) are preserved untouched by main on save. */
export interface EditableConfig {
  layout: LayoutChoice;
  mode: 'auto' | 'simple' | 'distributed';
  simpleModeMax: number;
  serverHost: string;
  serverPort: number;
  uiPort: number;
  alpha: number;
  fallbackDelay: number;
  /** Resolved layout summary for display (name + cannon count). */
  layoutLabel: string;
  cannonCount: number;
}

/** Where a project bundle was written, and what travelled with it. */
export interface ExportResult {
  path: string;
  project: string;
  /** True when the shared receiverKey/jwtSecret are in the file. */
  includeSecrets: boolean;
  deviceCount: number;
  userCount: number;
}

export interface ImportRequest {
  /** Import under this name instead of the bundle's own. */
  name?: string;
  activate: boolean;
  /** Replace an existing project of the same name (the store refuses otherwise). */
  overwrite: boolean;
}

export interface ImportSummary {
  project: string;
  /** True when the bundle carried no secrets, so fresh ones were generated —
   *  they will NOT match the brain until they are synced. */
  generatedSecrets: boolean;
  deviceCount: number;
  userCount: number;
  path: string;
}

/** How a project drives lasers — the same four choices as the CLI's
 *  `wavegrid projects osc` wizard, flattened for the editor. */
export interface OscTarget {
  kind: 'none' | 'beyond' | 'fb4' | 'routing';
  host: string;
  port: number;
  /** BEYOND only: how BEYOND enumerates a grid's fixtures. */
  gridOrder: 'row' | 'column';
  /** `routing` only: absolute path to a routing JSON file. */
  file: string;
  /** True when the project also holds a unified routing spec, which generates
   *  each device's config — authored separately, not owned by this screen. */
  hasUnifiedRouting: boolean;
}

/** A brain advertising itself on the LAN over mDNS. */
export interface DiscoveredBrainInfo {
  name: string;
  project: string;
  host: string;
  port: number;
  addresses: string[];
  deviceName: string | null;
  /** True for a receiver that self-promoted because no dedicated brain was found. */
  transient: boolean;
  /** ws:// URL a receiver can be pointed at (`wavegrid receiver --server …`). */
  serverUrl: string;
}

/** A user's privilege level. */
export type UserRole = 'admin' | 'operator';

/** A UI login and its role. Password material never crosses IPC. */
export interface UserAccount {
  username: string;
  role: UserRole;
}

/** A cheap server-visible login session. IP/user-agent are admin-only. */
export interface SessionInfo {
  id: string;
  username: string;
  role: UserRole;
  ip: string;
  userAgent: string;
  issuedAt: number;
  lastSeen: number;
  expiresAt: number;
}

/** A named access key. The passphrase itself is never included — it is returned
 *  only once, from a mint action, for the admin to copy and hand over. */
export interface AccessKeyInfo {
  name: string;
  role: UserRole;
  enabled: boolean;
  createdAt: number;
  /** Last successful login with this key, or null if never used. */
  lastUsedAt: number | null;
}

/** A required project secret and whether it is currently set. Only the name,
 *  description, and presence flag ever cross IPC — never the secret value. */
export interface RequiredSecretInfo {
  name: string;
  description: string;
  set: boolean;
}

export interface ShardRange {
  start: number;
  end: number;
}

/** One fixture in the light-map debugger — the full mapping chain for a cannon:
 *  animation logical index → physical light → position → driving device → OSC. */
export interface FixtureRow {
  /** Logical id the animations address (0..count-1). */
  logical: number;
  /** Physical light this logical index is wired to (`physicalLights[logical]`). */
  physical: number;
  /** Fixture label from the layout (e.g. "A1"). */
  label: string;
  /** Grid "row R, col C" or ring "…°" position, phrased for the topology. */
  position: string;
  /** Normalized canvas position within the bounding box, both in [0, 1]. */
  u: number;
  v: number;
  /** Name of the device whose shard drives this fixture, or null (all/none). */
  shardOwner: string | null;
  /** Output index within the owning device's shard (logical − shard.start),
   *  re-based to 0 — the "second device starts from zero" number. null when
   *  no shard owns it (a single device drives every fixture). */
  localIndex: number | null;
  /** Human-readable OSC destination (BEYOND/FB4/routing/console). */
  oscTarget: string;
  /** True when physical ≠ logical — an explicit correction, not the default. */
  corrected: boolean;
}

/** A deterministic auto-map heuristic offered for a layout. */
export interface AutoMapStrategyInfo {
  id: string;
  label: string;
  description: string;
}

/** One entry in a project's saved-map library. */
export interface LightMapEntry {
  name: string;
  numCannons: number;
  updatedAt: string;
  active: boolean;
}

/** The whole light-map debugger view for a project. `physicalLights` is the raw
 *  normalized mapping the editor mutates (the active map, or identity); `rows` is
 *  the resolved per-fixture view. */
export interface LightMapView {
  project: string;
  layoutName: string;
  topology: 'grid' | 'ring' | 'filledRing' | 'rings';
  numCannons: number;
  gridColumns: number;
  physicalLights: number[];
  rows: FixtureRow[];
  /** True when the active map is pure identity — no correction needed. */
  identity: boolean;
  /** Deterministic auto-map candidates valid for this layout. */
  strategies: AutoMapStrategyInfo[];
  /** Saved named maps in the project's library. */
  maps: LightMapEntry[];
  /** The active map's name, or null for identity / no correction. */
  activeMap: string | null;
}

/** A device that has joined a project — the project-scoped registry the CLI's
 *  `devices` commands show. Machine identity/IP are runtime facts, not exported. */
export interface DeviceInfo {
  id: string;
  name: string;
  hostname?: string;
  address?: string;
  lastSeen?: number;
  layout?: string;
  mode?: 'simple' | 'distributed';
  shard?: ShardRange | null;
}

/** Where the store lives and what it holds — the Settings screen's read model. */
export interface StoreInfo {
  root: string;
  /** Set when APPSTASH_BASE_DIR relocates the store (otherwise null). */
  baseOverride: string | null;
  projects: string[];
  /** This machine's device name, so an operator sees what a wipe would forget. */
  deviceName: string;
}

/** What a clear-all removed, so the UI reports facts instead of guessing. */
export interface StoreClearResult {
  projects: string[];
  secrets: number;
  logs: number;
  device: boolean;
  info: StoreInfo;
}

/** One diagnostic and, when it isn't passing, the exact fix. */
export interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  remedy?: string;
}

/** A receiver the brain currently has connected, as the brain sees it. */
export interface DoctorReceiver {
  /** Device name, else host, else remote address. */
  label: string;
  remote: string;
  /** "start–end" or "all cannons". */
  shard: string;
  version: string | null;
  /** Set when this receiver's layout disagrees with the server's — it would
   *  drive the wrong fixtures. */
  layoutMismatch: string | null;
}

/** The live health snapshot behind the Status screen — the same data
 *  `wavegrid doctor` prints, formatted for display. */
export interface DoctorReport {
  project: string;
  checks: DoctorCheck[];
  overall: 'pass' | 'warn' | 'fail';
  devices: { name: string; address: string | null; lastSeen: number | null; shard: string | null }[];
  sync: {
    enabled: boolean;
    revision: number;
    /** True when the revision came from the running brain, not local state. */
    fromServer: boolean;
    /** False for an untouched project, where replication has nothing to report. */
    relevant: boolean;
    behind: { name: string; ackedRevision: number; behindBy: number }[];
  };
  /** The brain's own report, or null when it could not be read. */
  server: {
    version: string;
    layoutName: string;
    count: number;
    mode: string;
    port: number;
    uptimeMs: number;
    uiClients: number;
    receivers: DoctorReceiver[];
    coverage: { claimed: string; gaps: string; overlaps: string; healthy: boolean };
  } | null;
  serverUrl: string;
  /** 'not-running' | 'unauthorized' | 'timeout' | 'refused' | 'not-wavegrid'. */
  serverError: string | null;
  /** Whether this machine's receiver is driving the show right now. */
  receiverRunning: boolean;
  generatedAt: number;
}

/** How confident the app is that other devices can reach this show, and why.
 *  Only `proven-reachable` is evidence rather than deduction. */
export type NetworkVerdict =
  | 'proven-reachable'
  | 'loopback-only'
  | 'blocked-locally'
  | 'no-network'
  | 'isolation-likely'
  | 'unproven';

/** The Advanced → Network panel's read model. Entirely runtime state: nothing
 *  here is stored, and it is null whenever the brain is down. */
export interface NetworkReport {
  bindHost: string;
  port: number;
  interfaces: { name: string; address: string; netmask: string }[];
  selfProbes: { address: string; url: string; reachable: boolean }[];
  /** Devices seen on the local segment (ARP). One or none suggests the network
   *  isolates its clients. */
  neighbourCount: number;
  /** False when the platform wouldn't give up its neighbour table — unknown,
   *  not zero. */
  neighboursKnown: boolean;
  visitors: { address: string; userAgent: string; lastSeen: number }[];
  verdict: NetworkVerdict;
  summary: string;
  hint: string | null;
  generatedAt: number;
}

export interface LaserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaserSyncState {
  /** Brain origin to load (http://127.0.0.1:PORT), or null to hide. */
  url: string | null;
  bounds: LaserBounds;
  visible: boolean;
}

export interface WavegridApi {
  brain: {
    status(): Promise<BrainStatus>;
    start(project: string): Promise<BrainStatus>;
    stop(): Promise<BrainStatus>;
    /** Start this machine's receiver against the running brain (no-op if up). */
    startReceiver(): Promise<BrainStatus>;
    /** Stop the receiver only — the server and laser UI keep running. */
    stopReceiver(): Promise<BrainStatus>;
    onStatus(cb: (status: BrainStatus) => void): () => void;
  };
  doctor: {
    /** Collect the full health snapshot for a project (probes the brain, so it
     *  can take up to a few seconds when nothing is listening). */
    report(project: string): Promise<DoctorReport | null>;
    /** Probe the network the show is served on. Null while the brain is down. */
    network(): Promise<NetworkReport | null>;
  };
  projects: {
    list(): Promise<ProjectSummary[]>;
    active(): Promise<string | null>;
    use(name: string): Promise<ProjectSummary[]>;
    presets(): Promise<string[]>;
    create(input: NewProjectInput): Promise<ProjectSummary[]>;
    remove(name: string): Promise<ProjectSummary[]>;
    getConfig(project: string): Promise<EditableConfig | null>;
    saveConfig(project: string, config: EditableConfig): Promise<EditableConfig | null>;
    /** Write a portable bundle via a native save dialog. null when cancelled. */
    exportToFile(project: string, includeSecrets: boolean): Promise<ExportResult | null>;
    /** Read a portable bundle via a native open dialog. null when cancelled. */
    importFromFile(req: ImportRequest): Promise<ImportSummary | null>;
  };
  users: {
    list(project: string): Promise<UserAccount[]>;
    add(project: string, username: string, password: string, role: UserRole): Promise<UserAccount[]>;
    remove(project: string, username: string): Promise<UserAccount[]>;
    setRole(project: string, username: string, role: UserRole): Promise<UserAccount[]>;
  };
  sessions: {
    /** Active (non-expired) UI login sessions for a project, newest first. */
    list(project: string): Promise<SessionInfo[]>;
    /** Revoke a session by id (rejects its next request and closes its socket). */
    revoke(project: string, id: string): Promise<SessionInfo[]>;
  };
  keys: {
    /** Every access key in the project (never the passphrases). */
    list(project: string): Promise<AccessKeyInfo[]>;
    /** Mint (or re-mint) a named key. Returns the cleartext exactly once for the
     *  admin to copy — it is not persisted or retrievable afterwards. */
    mint(
      project: string,
      name: string,
      role: UserRole
    ): Promise<{ passphrase: string; keys: AccessKeyInfo[] }>;
    /** Turn one key on/off without changing its passphrase. */
    setEnabled(project: string, name: string, enabled: boolean): Promise<AccessKeyInfo[]>;
    /** Change the role a key grants. */
    setRole(project: string, name: string, role: UserRole): Promise<AccessKeyInfo[]>;
    /** Revoke a single key. */
    remove(project: string, name: string): Promise<AccessKeyInfo[]>;
    /** Revoke every key in the project. */
    removeAll(project: string): Promise<AccessKeyInfo[]>;
  };
  secrets: {
    status(project: string): Promise<RequiredSecretInfo[]>;
    /** Generate missing secrets (or rotate all with force). Returns the updated
     *  status; secret values are never returned. */
    generate(project: string, force: boolean): Promise<RequiredSecretInfo[]>;
  };
  devices: {
    list(project: string): Promise<DeviceInfo[]>;
    rename(project: string, idOrName: string, newName: string): Promise<DeviceInfo[]>;
    assignShard(project: string, idOrName: string, shard: ShardRange | null): Promise<DeviceInfo[]>;
  };
  lights: {
    /** Resolve the full mapping-chain view for a project. */
    view(project: string): Promise<LightMapView | null>;
    /** Create/overwrite a named map (re-materializes the runtime file if active). */
    saveMap(project: string, name: string, physicalLights: number[]): Promise<LightMapView | null>;
    /** Set the active map (name), or null for identity / no correction. */
    activate(project: string, name: string | null): Promise<LightMapView | null>;
    /** Delete a named map (falls back to identity if it was active). */
    deleteMap(project: string, name: string): Promise<LightMapView | null>;
    /** Build (but do not save) a candidate map from a deterministic heuristic. */
    autoMap(project: string, strategyId: string): Promise<number[] | null>;
    /** Flash one physical light on the running rig so the operator can see which
     *  fixture it is. Returns true if the brain for this project was driving it. */
    identify(project: string, physicalIndex: number): Promise<boolean>;
    /** Clear any active identify flash. */
    identifyClear(project: string): Promise<void>;
  };
  osc: {
    /** The project's current laser output target. */
    get(project: string): Promise<OscTarget | null>;
    /** Persist a target. Exactly one of beyond/fb4/routing survives; a unified
     *  routing spec (authored elsewhere) is preserved. */
    set(project: string, target: OscTarget): Promise<OscTarget | null>;
  };
  discovery: {
    /** Browse the LAN for advertised brains. Resolves [] when multicast is
     *  unavailable — never rejects, so a blocked network just shows nothing. */
    browse(timeoutMs?: number): Promise<DiscoveredBrainInfo[]>;
  };
  store: {
    /** Where the store lives + what it currently holds (for the Settings screen). */
    info(): Promise<StoreInfo>;
    /**
     * Clear all: wipe every project, secret, user, key, session, device record,
     * light map and log. Irreversible (secrets cannot be recovered), so the
     * renderer must confirm first; the brain is stopped before the wipe.
     */
    clear(keepDevice: boolean): Promise<StoreClearResult>;
  };
  /**
   * OSC debugger (Output → Advanced). Local only — the desktop process talks UDP
   * to the project's configured target; there is no service and no key. Sends
   * are single messages, never a running show.
   */
  oscDebug: {
    state(project: string): Promise<OscDebugState>;
    /** Probe the configured host:port for a refusal. Short, non-fatal. */
    probe(project: string): Promise<OscDebugState>;
    /** A known-good frame for one fixture (`zone`) or all of them (null). */
    preset(
      project: string,
      preset: OscDebugPreset,
      zone: number | null,
      serial?: string
    ): Promise<OscSignalResult>;
    /** One hand-typed address and its arguments, exactly as given. */
    send(project: string, address: string, args: string[]): Promise<OscSignalResult>;
    /** Bind a port and log what arrives — proof a send left the machine. */
    listen(project: string, port: number): Promise<OscDebugState & { error?: string }>;
    stopListen(project: string): Promise<OscDebugState>;
    clear(project: string): Promise<OscDebugState>;
  };
}

// ── OSC debugger (Output → Advanced) ──────────────────────────────────────
//
// OSC is UDP: a frame aimed at a closed port is dropped with no error, so a
// silent rig looks identical to a working one. The panel makes that visible —
// where we send, whether anything is bound there, what BEYOND's own settings
// say, and the exact bytes of a hand-sent message.

export interface OscDebugTarget {
  kind: 'beyond' | 'fb4';
  host: string;
  port: number;
}

/** What one UDP liveness probe can honestly say. `no-rejection` is not proof of
 *  delivery — UDP has no handshake — only the absence of a refusal. */
export type OscProbeState = 'refused' | 'unreachable' | 'no-rejection';

/** One line of the panel's message tail. */
export interface OscSignalEntry {
  at: number;
  dir: 'out' | 'in';
  address: string;
  /** Arguments as rendered for the operator, not as encoded on the wire. */
  args: string;
  peer: string;
}

export interface OscSignalResult {
  ok: boolean;
  sent: number;
  error?: string;
}

export type OscDebugPreset = 'blackout' | 'white' | 'amber';

export interface OscDebugState {
  target: OscDebugTarget | null;
  probe: OscProbeState | null;
  /** Port the panel is currently listening on, or null. */
  listening: number | null;
  log: OscSignalEntry[];
  /** BEYOND's local settings, when BEYOND is installed on this machine. */
  beyond: {
    path: string;
    oscPort: number | null;
    showRgbaPanel: boolean | null;
    checks: DoctorCheck[];
  } | null;
}

export interface WavegridLaser {
  sync(state: LaserSyncState): void;
  /** Escape pressed inside the embedded UI, which owns its own key events and is
   *  the only thing focused while it is full screen. Returns an unsubscribe. */
  onEscape(handler: () => void): () => void;
}

declare global {
  interface Window {
    wavegrid: WavegridApi;
    wavegridLaser: WavegridLaser;
  }
}
