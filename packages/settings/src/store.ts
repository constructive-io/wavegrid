import {
  type AccessKeyInfo,
  authenticateAccessKey,
  getAccessKeyRole,
  listAccessKeys,
  mintAccessKey,
  type MintedAccessKey,
  removeAccessKey,
  removeAllAccessKeys,
  setAccessKeyEnabled,
  setAccessKeyRole
} from './access-keys';
import { type DeviceIdentity, getDevice, setDeviceName } from './device';
import {
  deleteLightMap,
  getActiveLightMap,
  type LightMapSummary,
  listLightMaps,
  readLightMap,
  saveLightMap,
  setActiveLightMap,
  type StoredLightMap
} from './light-maps';
import {
  projectLogsDir,
  projectStateDir,
  resolvePaths,
  type StorePaths
} from './paths';
import {
  type ExportOptions,
  exportProject,
  type ImportOptions,
  importProject,
  type ImportResult,
  parseBundle,
  type PortableProject
} from './portable';
import {
  createProject,
  type CreateProjectOptions,
  deleteProject,
  getActiveProject,
  getProjectConfig,
  hasProject,
  listProjects,
  type ProjectConfig,
  saveProjectConfig,
  setActiveProject
} from './projects';
import {
  assignShard,
  type DeviceRecord,
  type DeviceRegistration,
  getDeviceRecord,
  listDevices,
  registerDevice,
  removeDevice,
  renameDevice
} from './registry';
import { type RequiredSecret,requiredSecrets } from './required';
import { type ResetOptions, resetStore, type ResetSummary } from './reset';
import {
  type GenerateResult,
  generateSecrets,
  hasSecret,
  type ProjectSecrets,
  readSecrets,
  requireSecret,
  type SecretName,
  setSecret
} from './secrets';
import {
  createSession,
  type CreateSessionInput,
  getSession,
  listSessions,
  pruneSessions,
  revokeSession,
  revokeUserSessions,
  type Session,
  touchSession
} from './sessions';
import {
  type ApplyResult,
  applyUpdate,
  type ConfigUpdate,
  type DivergentDevice,
  divergentDevices,
  mergeRemote,
  readSyncState,
  recordAck,
  type SyncState
} from './sync';
import {
  addUser,
  authenticate,
  getUserRole,
  listUsernames,
  listUsers as listUserInfos,
  removeUser,
  setUserRole,
  type UserInfo,
  type UserRole,
  verifyUser
} from './users';

export interface StoreOptions {
  /** Override the store root (defaults to ~/.wavegrid). Used by tests and hosts. */
  baseDir?: string;
}

/**
 * A handle to the Wavegrid settings store. All project/secret/user operations
 * hang off this so callers never juggle paths.
 */
export interface SettingsStore {
  readonly paths: StorePaths;

  // Projects
  listProjects(): string[];
  hasProject(name: string): boolean;
  getActiveProject(): string | null;
  createProject(name: string, config: ProjectConfig, opts?: CreateProjectOptions): void;
  setActiveProject(name: string): void;
  deleteProject(name: string): boolean;
  getProjectConfig(name: string): ProjectConfig | null;
  saveProjectConfig(name: string, config: ProjectConfig): void;

  // Secrets (generated once; runtime reads must be explicit)
  generateSecrets(project: string, opts?: { force?: boolean }): GenerateResult;
  hasSecret(project: string, name: SecretName): boolean;
  setSecret(project: string, name: SecretName, value: string): void;
  requireSecret(project: string, name: SecretName): string;
  readSecrets(project: string): Partial<ProjectSecrets>;
  requiredSecrets(project: string): RequiredSecret[];

  // Users
  listUsers(project: string): string[];
  listUserInfos(project: string): UserInfo[];
  getUserRole(project: string, username: string): UserRole | null;
  addUser(project: string, username: string, password: string, role?: UserRole): void;
  setUserRole(project: string, username: string, role: UserRole): UserInfo;
  removeUser(project: string, username: string): boolean;
  verifyUser(project: string, username: string, password: string): boolean;
  authenticate(project: string, username: string, password: string): UserInfo | null;

  // Access keys — named passphrases minted at runtime and revocable one by one.
  // Handed to a person or shared with a crowd; each carries its own role.
  listAccessKeys(project: string): AccessKeyInfo[];
  getAccessKeyRole(project: string, name: string): UserRole | null;
  /** Mint (or re-mint) a key. The cleartext comes back exactly once — only its
   *  hash is persisted, so a forgotten key is replaced, not recovered. */
  mintAccessKey(project: string, name: string, role?: UserRole): MintedAccessKey;
  setAccessKeyEnabled(project: string, name: string, enabled: boolean): AccessKeyInfo | null;
  setAccessKeyRole(project: string, name: string, role: UserRole): AccessKeyInfo | null;
  removeAccessKey(project: string, name: string): boolean;
  removeAllAccessKeys(project: string): number;
  authenticateAccessKey(project: string, passphrase: string): UserInfo | null;

  // UI sessions (cheap server-visible login records; sockets untouched)
  createSession(project: string, input: CreateSessionInput): Session;
  listSessions(project: string): Session[];
  getSession(project: string, id: string): Session | null;
  touchSession(project: string, id: string): Session | null;
  revokeSession(project: string, id: string): boolean;
  revokeUserSessions(project: string, username: string): number;
  pruneSessions(project: string): Session[];

  // Device identity (machine-local; never travels with project exports)
  getDevice(): DeviceIdentity;
  setDeviceName(name: string): DeviceIdentity;

  // Project device registry (which devices have joined a project)
  listDevices(project: string): DeviceRecord[];
  getDeviceRecord(project: string, id: string): DeviceRecord | null;
  registerDevice(project: string, reg: DeviceRegistration): DeviceRecord;
  renameDevice(project: string, idOrName: string, newName: string): DeviceRecord | null;
  assignShard(project: string, idOrName: string, shard: { start: number; end: number } | null): DeviceRecord | null;
  removeDevice(project: string, idOrName: string): boolean;

  // Portable project export/import (machine identity + IPs never travel)
  exportProject(project: string, opts?: ExportOptions): PortableProject;
  importProject(bundle: unknown, opts?: ImportOptions): ImportResult;

  // Config synchronization (revisioned; server-mediated primary, peer fallback)
  getSyncState(project: string): SyncState;
  applySyncUpdate(project: string, update: ConfigUpdate): ApplyResult;
  ackSync(project: string, deviceId: string, revision: number): SyncState;
  mergeSync(project: string, remote: SyncState): { state: SyncState; changed: boolean };
  divergentDevices(project: string, knownDeviceIds?: string[]): DivergentDevice[];

  // Light-map library (named correction maps; active one is materialized to the
  // runtime light-map.json. null active = identity / no correction.)
  listLightMaps(project: string): LightMapSummary[];
  readLightMap(project: string, name: string): StoredLightMap | null;
  saveLightMap(
    project: string,
    name: string,
    data: { numCannons: number; gridColumns: number; physicalLights: readonly number[] }
  ): StoredLightMap;
  deleteLightMap(project: string, name: string): boolean;
  getActiveLightMap(project: string): string | null;
  setActiveLightMap(project: string, name: string | null): void;

  // Runtime paths
  stateDir(project: string): string;
  logsDir(project: string): string;

  /**
   * Wipe every project, secret, user, key, session, device record, light map
   * and log from this store, leaving the empty scaffold. Irreversible —
   * secrets are generated once and cannot be recovered — so callers must
   * confirm first.
   */
  reset(opts?: ResetOptions): ResetSummary;
}

export function openStore(opts: StoreOptions = {}): SettingsStore {
  const paths = resolvePaths(opts.baseDir);
  return {
    paths,

    listProjects: () => listProjects(paths),
    hasProject: (name) => hasProject(paths, name),
    getActiveProject: () => getActiveProject(paths),
    createProject: (name, config, o) => createProject(paths, name, config, o),
    setActiveProject: (name) => setActiveProject(paths, name),
    deleteProject: (name) => deleteProject(paths, name),
    getProjectConfig: (name) => getProjectConfig(paths, name),
    saveProjectConfig: (name, config) => saveProjectConfig(paths, name, config),

    generateSecrets: (project, o) => generateSecrets(paths, project, o),
    hasSecret: (project, name) => hasSecret(paths, project, name),
    setSecret: (project, name, value) => setSecret(paths, project, name, value),
    requireSecret: (project, name) => requireSecret(paths, project, name),
    readSecrets: (project) => readSecrets(paths, project),
    requiredSecrets: (project) => requiredSecrets(paths, project),

    listUsers: (project) => listUsernames(paths, project),
    listUserInfos: (project) => listUserInfos(paths, project),
    getUserRole: (project, username) => getUserRole(paths, project, username),
    // A key's name *is* the identity its holder logs in as, so accounts and keys
    // share one namespace — guard both directions rather than resolving a clash
    // at login time.
    addUser: (project, username, password, role) => {
      if (listAccessKeys(paths, project).some((k) => k.name === username)) {
        throw new Error(`"${username}" is already an access key in ${project}; pick another name.`);
      }
      addUser(paths, project, username, password, role);
    },
    setUserRole: (project, username, role) => setUserRole(paths, project, username, role),
    removeUser: (project, username) => removeUser(paths, project, username),
    verifyUser: (project, username, password) => verifyUser(paths, project, username, password),
    authenticate: (project, username, password) => authenticate(paths, project, username, password),

    listAccessKeys: (project) => listAccessKeys(paths, project),
    getAccessKeyRole: (project, name) => getAccessKeyRole(paths, project, name),
    mintAccessKey: (project, name, role) => {
      if (listUsernames(paths, project).includes(name)) {
        throw new Error(`"${name}" is already a user account in ${project}; pick another name.`);
      }
      return mintAccessKey(paths, project, name, role);
    },
    setAccessKeyEnabled: (project, name, enabled) =>
      setAccessKeyEnabled(paths, project, name, enabled),
    setAccessKeyRole: (project, name, role) => setAccessKeyRole(paths, project, name, role),
    removeAccessKey: (project, name) => removeAccessKey(paths, project, name),
    removeAllAccessKeys: (project) => removeAllAccessKeys(paths, project),
    authenticateAccessKey: (project, passphrase) =>
      authenticateAccessKey(paths, project, passphrase),

    createSession: (project, input) => createSession(paths, project, input),
    listSessions: (project) => listSessions(paths, project),
    getSession: (project, id) => getSession(paths, project, id),
    touchSession: (project, id) => touchSession(paths, project, id),
    revokeSession: (project, id) => revokeSession(paths, project, id),
    revokeUserSessions: (project, username) => revokeUserSessions(paths, project, username),
    pruneSessions: (project) => pruneSessions(paths, project),

    getDevice: () => getDevice(paths),
    setDeviceName: (name) => setDeviceName(paths, name),

    listDevices: (project) => listDevices(paths, project),
    getDeviceRecord: (project, id) => getDeviceRecord(paths, project, id),
    registerDevice: (project, reg) => registerDevice(paths, project, reg),
    renameDevice: (project, idOrName, newName) => renameDevice(paths, project, idOrName, newName),
    assignShard: (project, idOrName, shard) => assignShard(paths, project, idOrName, shard),
    removeDevice: (project, idOrName) => removeDevice(paths, project, idOrName),

    exportProject: (project, o) => exportProject(paths, project, o),
    importProject: (bundle, o) => importProject(paths, parseBundle(bundle), o),

    getSyncState: (project) => readSyncState(paths, project),
    applySyncUpdate: (project, update) => applyUpdate(paths, project, update),
    ackSync: (project, deviceId, revision) => recordAck(paths, project, deviceId, revision),
    mergeSync: (project, remote) => mergeRemote(paths, project, remote),
    divergentDevices: (project, known) => divergentDevices(paths, project, known),

    listLightMaps: (project) => listLightMaps(paths, project),
    readLightMap: (project, name) => readLightMap(paths, project, name),
    saveLightMap: (project, name, data) => saveLightMap(paths, project, name, data),
    deleteLightMap: (project, name) => deleteLightMap(paths, project, name),
    getActiveLightMap: (project) => getActiveLightMap(paths, project),
    setActiveLightMap: (project, name) => setActiveLightMap(paths, project, name),

    stateDir: (project) => projectStateDir(paths, project),
    logsDir: (project) => projectLogsDir(paths, project),

    reset: (o) => resetStore(paths, o)
  };
}
