import * as React from 'react';

import type {
  AccessKeyInfo,
  BrainStatus,
  DeviceInfo,
  DiscoveredBrainInfo,
  DoctorReport,
  EditableConfig,
  ExportResult,
  ImportRequest,
  ImportSummary,
  LightMapView,
  NetworkReport,
  NewProjectInput,
  OscTarget,
  ProjectSummary,
  RequiredSecretInfo,
  SessionInfo,
  ShardRange,
  StoreClearResult,
  StoreInfo,
  UserAccount,
  UserRole
} from '@/types/ipc';

const EMPTY_STATUS: BrainStatus = {
  running: false,
  url: null,
  project: null,
  runMode: null,
  receiverRunning: false,
  lanUrls: [],
  receiverError: null,
  lastError: null
};

/** Live brain status: seeded from the main process, then kept fresh via the
 *  `brain:status` push channel. */
export function useBrainStatus(): BrainStatus {
  const [status, setStatus] = React.useState<BrainStatus>(EMPTY_STATUS);

  React.useEffect(() => {
    let alive = true;
    void window.wavegrid.brain.status().then((s) => {
      if (alive) setStatus(s);
    });
    const off = window.wavegrid.brain.onStatus(setStatus);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return status;
}

/** The project registry, mirrored from the shared appstash store. Create/remove
 *  write straight through to the store — the same projects the CLI manages.
 *  `loaded` flips once the first fetch lands, so boot UI can wait on real data. */
export function useProjects(): {
  projects: ProjectSummary[];
  loaded: boolean;
  refresh: () => Promise<void>;
  use: (name: string) => Promise<void>;
  create: (input: NewProjectInput) => Promise<void>;
  remove: (name: string) => Promise<void>;
  } {
  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setProjects(await window.wavegrid.projects.list());
    setLoaded(true);
  }, []);

  const use = React.useCallback(async (name: string) => {
    setProjects(await window.wavegrid.projects.use(name));
  }, []);

  const create = React.useCallback(async (input: NewProjectInput) => {
    setProjects(await window.wavegrid.projects.create(input));
  }, []);

  const remove = React.useCallback(async (name: string) => {
    setProjects(await window.wavegrid.projects.remove(name));
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { projects, loaded, refresh, use, create, remove };
}

/** Built-in layout preset ids, loaded once from the store. */
export function usePresets(): string[] {
  const [presets, setPresets] = React.useState<string[]>([]);
  React.useEffect(() => {
    let alive = true;
    void window.wavegrid.projects.presets().then((p) => {
      if (alive) setPresets(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  return presets;
}

/**
 * What a project-scoped panel reads: a project name plus a revision counter.
 *
 * Keying a refetch on the project name alone isn't enough — switching the
 * project *in use* can leave a panel bound to the same name (or to a project
 * whose contents changed underneath it, e.g. after an import or a clear), and
 * the panel would then keep showing what it fetched on mount. Bumping `rev`
 * refetches every panel regardless of the name.
 */
export interface ProjectScope {
  project: string | null;
  rev: number;
}

/** The active project's editable config, mirrored from the store. `save` folds
 *  the edited fields back in (osc/sync/etc. preserved) and returns the result. */
export function useProjectConfig({ project, rev }: ProjectScope): {
  config: EditableConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (config: EditableConfig) => Promise<void>;
  } {
  const [config, setConfig] = React.useState<EditableConfig | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!project) {
      setConfig(null);
      return;
    }
    setLoading(true);
    try {
      setConfig(await window.wavegrid.projects.getConfig(project));
    } finally {
      setLoading(false);
    }
  }, [project, rev]);

  const save = React.useCallback(
    async (next: EditableConfig) => {
      if (!project) return;
      setConfig(await window.wavegrid.projects.saveConfig(project, next));
    },
    [project]
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { config, loading, refresh, save };
}

/** Export/import a project through native file dialogs. Both resolve null when
 *  the operator cancels the dialog — a cancel is not an error. */
export function useTransfer(onChanged: () => Promise<void>): {
  exportProject: (project: string, includeSecrets: boolean) => Promise<ExportResult | null>;
  importProject: (req: ImportRequest) => Promise<ImportSummary | null>;
  } {
  const exportProject = React.useCallback(
    (project: string, includeSecrets: boolean) =>
      window.wavegrid.projects.exportToFile(project, includeSecrets),
    []
  );

  const importProject = React.useCallback(
    async (req: ImportRequest) => {
      const result = await window.wavegrid.projects.importFromFile(req);
      // An import adds (or replaces) a project, so the registry the whole shell
      // renders from has to be re-read before anything else is shown.
      if (result) await onChanged();
      return result;
    },
    [onChanged]
  );

  return { exportProject, importProject };
}

/** A project's laser output target (BEYOND / FB4 / routing file / none). */
export function useOscTarget({ project, rev }: ProjectScope): {
  target: OscTarget | null;
  refresh: () => Promise<void>;
  save: (target: OscTarget) => Promise<void>;
  } {
  const [target, setTarget] = React.useState<OscTarget | null>(null);

  const refresh = React.useCallback(async () => {
    setTarget(project ? await window.wavegrid.osc.get(project) : null);
  }, [project, rev]);

  const save = React.useCallback(
    async (next: OscTarget) => {
      if (!project) return;
      setTarget(await window.wavegrid.osc.set(project, next));
    },
    [project]
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { target, refresh, save };
}

/** Brains advertising themselves on the LAN. Browsing takes a couple of seconds
 *  and resolves empty when multicast is blocked, so it is explicitly triggered
 *  (never on a timer) and reports whether a scan has ever completed. */
export function useDiscovery(): {
  brains: DiscoveredBrainInfo[];
  scanning: boolean;
  scanned: boolean;
  scan: () => Promise<void>;
  } {
  const [brains, setBrains] = React.useState<DiscoveredBrainInfo[]>([]);
  const [scanning, setScanning] = React.useState(false);
  const [scanned, setScanned] = React.useState(false);

  const scan = React.useCallback(async () => {
    setScanning(true);
    try {
      setBrains(await window.wavegrid.discovery.browse());
      setScanned(true);
    } finally {
      setScanning(false);
    }
  }, []);

  return { brains, scanning, scanned, scan };
}

/** UI login users for a project (username + role — password hashes never leave
 *  main). add/remove/setRole write straight through to the scrypt-backed store. */
export function useProjectUsers({ project, rev }: ProjectScope): {
  users: UserAccount[];
  refresh: () => Promise<void>;
  add: (username: string, password: string, role: UserRole) => Promise<void>;
  remove: (username: string) => Promise<void>;
  setRole: (username: string, role: UserRole) => Promise<void>;
  } {
  const [users, setUsers] = React.useState<UserAccount[]>([]);

  const refresh = React.useCallback(async () => {
    if (!project) {
      setUsers([]);
      return;
    }
    setUsers(await window.wavegrid.users.list(project));
  }, [project, rev]);

  const add = React.useCallback(
    async (username: string, password: string, role: UserRole) => {
      if (!project) return;
      setUsers(await window.wavegrid.users.add(project, username, password, role));
    },
    [project]
  );

  const remove = React.useCallback(
    async (username: string) => {
      if (!project) return;
      setUsers(await window.wavegrid.users.remove(project, username));
    },
    [project]
  );

  const setRole = React.useCallback(
    async (username: string, role: UserRole) => {
      if (!project) return;
      setUsers(await window.wavegrid.users.setRole(project, username, role));
    },
    [project]
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { users, refresh, add, remove, setRole };
}

/** Active UI login sessions for a project (who's logged in). Local admin reads
 *  straight from the shared store; revoke removes the row (the client loses
 *  access on its next token refresh — sockets are untouched). */
export function useSessions({ project, rev }: ProjectScope): {
  sessions: SessionInfo[];
  refresh: () => Promise<void>;
  revoke: (id: string) => Promise<void>;
  } {
  const [sessions, setSessions] = React.useState<SessionInfo[]>([]);

  const refresh = React.useCallback(async () => {
    setSessions(project ? await window.wavegrid.sessions.list(project) : []);
  }, [project, rev]);

  const revoke = React.useCallback(
    async (id: string) => {
      if (!project) return;
      setSessions(await window.wavegrid.sessions.revoke(project, id));
    },
    [project]
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, refresh, revoke };
}

/** A project's access keys + controls. `mint` creates (or replaces) a named key
 *  and returns its cleartext once, for the admin to copy; the store keeps only a
 *  hash. Every other action just reshapes the list. */
export function useAccessKeys({ project, rev }: ProjectScope): {
  keys: AccessKeyInfo[];
  refresh: () => Promise<void>;
  mint: (name: string, role: UserRole) => Promise<string>;
  setEnabled: (name: string, enabled: boolean) => Promise<void>;
  setRole: (name: string, role: UserRole) => Promise<void>;
  remove: (name: string) => Promise<void>;
  removeAll: () => Promise<void>;
  } {
  const [keys, setKeys] = React.useState<AccessKeyInfo[]>([]);

  const refresh = React.useCallback(async () => {
    if (!project) {
      setKeys([]);
      return;
    }
    setKeys(await window.wavegrid.keys.list(project));
  }, [project, rev]);

  const mint = React.useCallback(
    async (name: string, role: UserRole) => {
      if (!project) return '';
      const minted = await window.wavegrid.keys.mint(project, name, role);
      setKeys(minted.keys);
      return minted.passphrase;
    },
    [project]
  );

  const setEnabled = React.useCallback(
    async (name: string, enabled: boolean) => {
      if (!project) return;
      setKeys(await window.wavegrid.keys.setEnabled(project, name, enabled));
    },
    [project]
  );

  const setRole = React.useCallback(
    async (name: string, role: UserRole) => {
      if (!project) return;
      setKeys(await window.wavegrid.keys.setRole(project, name, role));
    },
    [project]
  );

  const remove = React.useCallback(
    async (name: string) => {
      if (!project) return;
      setKeys(await window.wavegrid.keys.remove(project, name));
    },
    [project]
  );

  const removeAll = React.useCallback(async () => {
    if (!project) return;
    setKeys(await window.wavegrid.keys.removeAll(project));
  }, [project]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { keys, refresh, mint, setEnabled, setRole, remove, removeAll };
}

/** Required-secret status for a project (name/description/set only). `generate`
 *  triggers one-time generation, or rotation with force=true. */
export function useProjectSecrets({ project, rev }: ProjectScope): {
  secrets: RequiredSecretInfo[];
  refresh: () => Promise<void>;
  generate: (force: boolean) => Promise<void>;
  } {
  const [secrets, setSecrets] = React.useState<RequiredSecretInfo[]>([]);

  const refresh = React.useCallback(async () => {
    if (!project) {
      setSecrets([]);
      return;
    }
    setSecrets(await window.wavegrid.secrets.status(project));
  }, [project, rev]);

  const generate = React.useCallback(
    async (force: boolean) => {
      if (!project) return;
      setSecrets(await window.wavegrid.secrets.generate(project, force));
    },
    [project]
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { secrets, refresh, generate };
}

/** The light-map debugger view for a project — the resolved mapping chain, the
 *  raw `physicalLights` the editor mutates, and the named-map library. Saving
 *  writes a named correction map; activating one materializes it into the same
 *  light-map.json the running brain reads (null = identity / no correction). */
export function useLightMap({ project, rev }: ProjectScope): {
  view: LightMapView | null;
  loading: boolean;
  refresh: () => Promise<void>;
  saveMap: (name: string, physicalLights: number[]) => Promise<void>;
  activate: (name: string | null) => Promise<void>;
  deleteMap: (name: string) => Promise<void>;
  autoMap: (strategyId: string) => Promise<number[] | null>;
  identify: (physicalIndex: number) => Promise<boolean>;
  identifyClear: () => Promise<void>;
  } {
  const [view, setView] = React.useState<LightMapView | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!project) {
      setView(null);
      return;
    }
    setLoading(true);
    try {
      setView(await window.wavegrid.lights.view(project));
    } finally {
      setLoading(false);
    }
  }, [project, rev]);

  const saveMap = React.useCallback(
    async (name: string, physicalLights: number[]) => {
      if (!project) return;
      setView(await window.wavegrid.lights.saveMap(project, name, physicalLights));
    },
    [project]
  );

  const activate = React.useCallback(
    async (name: string | null) => {
      if (!project) return;
      setView(await window.wavegrid.lights.activate(project, name));
    },
    [project]
  );

  const deleteMap = React.useCallback(
    async (name: string) => {
      if (!project) return;
      setView(await window.wavegrid.lights.deleteMap(project, name));
    },
    [project]
  );

  const autoMap = React.useCallback(
    async (strategyId: string) => (project ? window.wavegrid.lights.autoMap(project, strategyId) : null),
    [project]
  );

  const identify = React.useCallback(
    async (physicalIndex: number) => (project ? window.wavegrid.lights.identify(project, physicalIndex) : false),
    [project]
  );

  const identifyClear = React.useCallback(async () => {
    if (project) await window.wavegrid.lights.identifyClear(project);
  }, [project]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { view, loading, refresh, saveMap, activate, deleteMap, autoMap, identify, identifyClear };
}

/** The project-scoped device registry, mirrored from the shared appstash store.
 *  Renaming and shard assignment write straight through to the store — the same
 *  records the CLI's `devices` commands manage. */
export function useDevices({ project, rev }: ProjectScope): {
  devices: DeviceInfo[];
  refresh: () => Promise<void>;
  rename: (idOrName: string, newName: string) => Promise<void>;
  assignShard: (idOrName: string, shard: ShardRange | null) => Promise<void>;
  } {
  const [devices, setDevices] = React.useState<DeviceInfo[]>([]);

  const refresh = React.useCallback(async () => {
    setDevices(project ? await window.wavegrid.devices.list(project) : []);
  }, [project, rev]);

  const rename = React.useCallback(
    async (idOrName: string, newName: string) => {
      if (!project) return;
      setDevices(await window.wavegrid.devices.rename(project, idOrName, newName));
    },
    [project]
  );

  const assignShard = React.useCallback(
    async (idOrName: string, shard: ShardRange | null) => {
      if (!project) return;
      setDevices(await window.wavegrid.devices.assignShard(project, idOrName, shard));
    },
    [project]
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { devices, refresh, rename, assignShard };
}

/**
 * The live health snapshot for a project — the same data `wavegrid doctor`
 * prints. Each collection probes the brain, so refresh is explicit (or on an
 * interval the Status screen owns) rather than on every render.
 */
export function useDoctor({ project, rev }: ProjectScope): {
  report: DoctorReport | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  } {
  const [report, setReport] = React.useState<DoctorReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!project) {
      setReport(null);
      return;
    }
    setLoading(true);
    try {
      setReport(await window.wavegrid.doctor.report(project));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [project, rev]);

  return { report, loading, error, refresh };
}

/**
 * The network probe behind Status → Advanced. Not on the Status refresh
 * interval: it opens sockets and reads the neighbour table, which is worth
 * doing when an operator asks, not five times a minute.
 */
export function useNetwork(): {
  report: NetworkReport | null;
  loading: boolean;
  refresh: () => Promise<void>;
  } {
  const [report, setReport] = React.useState<NetworkReport | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setReport(await window.wavegrid.doctor.network());
    } finally {
      setLoading(false);
    }
  }, []);

  return { report, loading, refresh };
}

/** The global store: where it lives, what it holds, and clear-all. */
export function useStore(): {
  info: StoreInfo | null;
  refresh: () => Promise<void>;
  clear: (keepDevice: boolean) => Promise<StoreClearResult>;
  } {
  const [info, setInfo] = React.useState<StoreInfo | null>(null);

  const refresh = React.useCallback(async () => {
    setInfo(await window.wavegrid.store.info());
  }, []);

  const clear = React.useCallback(async (keepDevice: boolean) => {
    const result = await window.wavegrid.store.clear(keepDevice);
    setInfo(result.info);
    return result;
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { info, refresh, clear };
}
