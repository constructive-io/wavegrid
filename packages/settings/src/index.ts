// Store facade
export { openStore, type SettingsStore, type StoreOptions } from './store';

// Device identity
export { type DeviceIdentity } from './device';

// Project device registry
export { type DeviceRecord, type DeviceRegistration } from './registry';

// Portable project export/import
export {
  type ExportOptions,
  type ImportOptions,
  type ImportResult,
  parseBundle,
  type PortableProject
} from './portable';

// Config synchronization (revisioned, server-mediated + peer fallback)
export {
  type ApplyResult,
  type ConfigUpdate,
  deviceScope,
  type DivergentDevice,
  isValidScope,
  projectScope,
  type SyncEntry,
  type SyncScope,
  type SyncState
} from './sync';

// Paths
export {
  projectLogsDir,
  projectSecretsFile,
  projectStateDir,
  resolvePaths,
  type StorePaths,
  TOOL
} from './paths';

// Projects
export {
  type CreateProjectOptions,
  type ProjectConfig
} from './projects';

// Secrets
export {
  type GenerateResult,
  type ProjectSecrets,
  SECRET_NAMES,
  type SecretName,
  setSecret
} from './secrets';

// Light-map library (named correction maps + active selection)
export {
  type LightMapSummary,
  type StoredLightMap
} from './light-maps';

// Required-secrets report
export { type RequiredSecret } from './required';

// Store reset (clear-all; irreversible, callers must confirm)
export { type ResetOptions, type ResetSummary } from './reset';

// Users
export { type StoredUser, type UserInfo, type UserRole } from './users';

// Access keys (named passphrases, minted at runtime, revocable one by one)
export { type AccessKeyInfo, type MintedAccessKey } from './access-keys';

// UI sessions (cheap server-visible login records)
export {
  type CreateSessionInput,
  DEFAULT_SESSION_TTL_MS,
  type Session
} from './sessions';
