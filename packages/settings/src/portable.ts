import {
  projectDevicesFile,
  projectSecretsFile,
  projectUsersFile,
  readJsonFile,
  type StorePaths,
  writeFileAtomic
} from './paths';
import { createProject, getProjectConfig, hasProject, type ProjectConfig } from './projects';
import { type DeviceRecord } from './registry';
import { generateSecrets, type ProjectSecrets, readSecrets } from './secrets';
import { readUsers, type StoredUser } from './users';

/**
 * A device as it travels in a portable export: the project-scoped identity
 * (id + name) and its device-scoped config (layout/mode/shard), but NOT the
 * runtime facts that belong to the live machine (address, lastSeen). The
 * importing machine keeps/generates its own machine-local identity and
 * re-registers with its own IP.
 */
export type PortableDevice = Omit<DeviceRecord, 'address' | 'lastSeen'>;

/**
 * A portable project bundle. Carries everything a DIFFERENT installation needs
 * to run the same show — layout + config + every device's device-scoped config
 * + UI users — and, only when explicitly requested, the shared secrets.
 *
 * It deliberately never carries machine-local identity (`device.json`) or stale
 * network addresses, so importing on a new laptop can't collide on identity or
 * inherit a wrong IP.
 */
export interface PortableProject {
  wavegrid: 'project-export';
  version: 1;
  exportedAt: string;
  project: string;
  config: ProjectConfig;
  /** Device-scoped configs for all known project devices (address/lastSeen stripped). */
  devices: PortableDevice[];
  /** UI login users (scrypt salt+hash; never plaintext). Omitted by opt-out. */
  users?: StoredUser[];
  /**
   * Shared secrets (receiverKey/jwtSecret). Present ONLY when exported with
   * `includeSecrets` — they let another machine join the SAME brain. Absent by
   * default; a plain import then generates fresh secrets that must be synced.
   */
  secrets?: Partial<ProjectSecrets>;
}

export interface ExportOptions {
  /** Include the shared secrets so another machine can join the same brain. Default false. */
  includeSecrets?: boolean;
  /** Include UI users (salt+hash). Default true. */
  includeUsers?: boolean;
}

/** Build a portable bundle for a project. Machine identity + IPs are never included. */
export function exportProject(paths: StorePaths, project: string, opts: ExportOptions = {}): PortableProject {
  if (!hasProject(paths, project)) {
    throw new Error(`Unknown project "${project}" — cannot export.`);
  }
  const config = getProjectConfig(paths, project) ?? {};
  const devices = (readJsonFile<{ devices: DeviceRecord[] }>(projectDevicesFile(paths, project))?.devices ?? []).map(
    (d): PortableDevice => ({
      id: d.id,
      name: d.name,
      hostname: d.hostname,
      layout: d.layout,
      mode: d.mode,
      shard: d.shard ?? null
    })
  );

  const bundle: PortableProject = {
    wavegrid: 'project-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    config,
    devices
  };

  if (opts.includeUsers !== false) {
    const users = readUsers(paths, project);
    if (users.length > 0) bundle.users = users;
  }
  if (opts.includeSecrets) {
    bundle.secrets = readSecrets(paths, project);
  }
  return bundle;
}

export interface ImportOptions {
  /** Import under this project name instead of the bundle's own name. */
  name?: string;
  /** Make the imported project active. */
  activate?: boolean;
  /** Overwrite an existing project of the same name. Default false (throws). */
  overwrite?: boolean;
}

export interface ImportResult {
  project: string;
  /** True when no secrets were in the bundle and fresh ones were generated. */
  generatedSecrets: boolean;
  deviceCount: number;
  userCount: number;
  /** True when an overwrite kept this machine's `osc` block because the bundle had none. */
  keptLocalOsc: boolean;
}

/** Validate an untrusted object as a PortableProject bundle. */
export function parseBundle(raw: unknown): PortableProject {
  const b = raw as Partial<PortableProject>;
  if (!b || b.wavegrid !== 'project-export' || b.version !== 1) {
    throw new Error('Not a Wavegrid project export (expected {"wavegrid":"project-export","version":1}).');
  }
  if (typeof b.project !== 'string' || !b.config || typeof b.config !== 'object') {
    throw new Error('Malformed export: missing project name or config.');
  }
  return {
    wavegrid: 'project-export',
    version: 1,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : new Date().toISOString(),
    project: b.project,
    config: b.config,
    devices: Array.isArray(b.devices) ? b.devices : [],
    users: Array.isArray(b.users) ? b.users : undefined,
    secrets: b.secrets && typeof b.secrets === 'object' ? b.secrets : undefined
  };
}

/**
 * Import a portable bundle into this store. Creates the project, restores the
 * device-scoped configs (as fresh registry records — no addresses/lastSeen),
 * users, and secrets. When the bundle has no secrets, fresh ones are generated
 * (the caller should tell the operator they must be synced with the brain).
 * The machine-local `device.json` is never touched.
 */
export function importProject(paths: StorePaths, bundle: PortableProject, opts: ImportOptions = {}): ImportResult {
  const project = opts.name ?? bundle.project;
  if (hasProject(paths, project) && !opts.overwrite) {
    throw new Error(`Project "${project}" already exists — pass overwrite to replace it, or import under a new name.`);
  }

  // The OSC target (BEYOND/FB4/routing) is a fact about the hardware next to
  // this machine, not portable project state — a bundle exported from a laptop
  // with no target must not wipe the one configured here.
  let config = bundle.config;
  let keptLocalOsc = false;
  if (hasProject(paths, project) && config.osc == null) {
    const localOsc = getProjectConfig(paths, project)?.osc;
    if (localOsc && Object.keys(localOsc).length > 0) {
      config = { ...config, osc: localOsc };
      keptLocalOsc = true;
    }
  }

  createProject(paths, project, config, { activate: opts.activate });

  // Device-scoped configs travel; runtime facts (address/lastSeen) do not —
  // each device re-registers with its own address when it next connects.
  const devices: DeviceRecord[] = bundle.devices.map((d) => ({
    id: d.id,
    name: d.name,
    hostname: d.hostname,
    layout: d.layout,
    mode: d.mode,
    shard: d.shard ?? null
  }));
  writeFileAtomic(projectDevicesFile(paths, project), JSON.stringify({ version: 1, devices }, null, 2) + '\n');

  const users = bundle.users ?? [];
  if (users.length > 0) {
    writeFileAtomic(projectUsersFile(paths, project), JSON.stringify(users, null, 2) + '\n', 0o600);
  }

  let generatedSecrets = false;
  if (bundle.secrets && (bundle.secrets.receiverKey || bundle.secrets.jwtSecret)) {
    writeFileAtomic(projectSecretsFile(paths, project), JSON.stringify(bundle.secrets, null, 2) + '\n', 0o600);
  } else {
    generateSecrets(paths, project);
    generatedSecrets = true;
  }

  return { project, generatedSecrets, deviceCount: devices.length, userCount: users.length, keptLocalOsc };
}
