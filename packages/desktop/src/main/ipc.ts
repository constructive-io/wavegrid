import { browse } from '@wavegrid/discovery';
import { autoMap, resolveLayout } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import { ipcMain } from 'electron';

import {
  sendToBrain,
  startBrain,
  startLocalReceiver,
  status,
  stopBrain,
  stopLocalReceiver
} from '@/main/brain';
import { buildDoctorReport } from '@/main/doctor';
import { invalidateLaserView, type LaserSyncState, syncLaser } from '@/main/laser-view';
import { buildLightMapView } from '@/main/light-map';
import { applyOscTarget, toOscTarget } from '@/main/osc-target';
import {
  applyEditable,
  configForNewProject,
  knownPresets,
  toEditable
} from '@/main/project-config';
import { exportProjectToFile, importProjectFromFile } from '@/main/transfer';
import type {
  DeviceInfo,
  DiscoveredBrainInfo,
  EditableConfig,
  ImportRequest,
  LightMapView,
  NewProjectInput,
  OscTarget,
  ProjectSummary,
  RequiredSecretInfo,
  ShardRange,
  StoreClearResult,
  StoreInfo,
  UserRole
} from '@/types/ipc';

/** Resolve the light-map debugger view for a project from the shared store:
 *  layout + device shards + the ACTIVE named map (or identity) + the library. */
function lightMapView(project: string): LightMapView | null {
  const store = openStore();
  if (!store.hasProject(project)) return null;
  const config = store.getProjectConfig(project);
  const devices = store.listDevices(project).map((d) => ({ name: d.name, shard: d.shard }));
  const activeMap = store.getActiveLightMap(project);
  // The store is authoritative: the editor shows the active named map, or
  // identity when none is active — not any stale runtime file.
  const active = activeMap ? store.readLightMap(project, activeMap) : null;
  return buildLightMapView({
    project,
    config,
    devices,
    stored: active ? { physicalLights: active.physicalLights } : null,
    maps: store.listLightMaps(project),
    activeMap
  });
}

/** Map the store's RequiredSecret[] to the sanitized IPC shape. Never touches
 *  secret values — only name/description/set cross the bridge. */
function secretStatus(project: string): RequiredSecretInfo[] {
  const store = openStore();
  if (!store.hasProject(project)) return [];
  return store.requiredSecrets(project).map((s) => ({
    name: s.name,
    description: s.description,
    set: s.set
  }));
}

/** Where the store lives and what it holds — no secrets, no key material. */
function storeInfo(): StoreInfo {
  const store = openStore();
  return {
    root: store.paths.root,
    baseOverride: process.env.APPSTASH_BASE_DIR ?? null,
    projects: store.listProjects(),
    deviceName: store.getDevice().name
  };
}

function projectSummaries(): ProjectSummary[] {
  const store = openStore();
  const active = store.getActiveProject();
  return store.listProjects().map((name) => ({ name, active: name === active }));
}

function devices(project: string): DeviceInfo[] {
  if (!project) return [];
  const store = openStore();
  if (!store.hasProject(project)) return [];
  return store.listDevices(project);
}

/** Register every main-process IPC handler. Each is a thin wrapper over the
 *  store / brain — the renderer never touches the store or `fs` directly. */
export function registerAllIpc(): void {
  ipcMain.handle('brain:status', () => status());
  // The embedded artist UI is served on the same origin whichever project runs,
  // so it has to be reloaded explicitly or it keeps the previous project's
  // layout and light map.
  ipcMain.handle('brain:start', async (_e, project: string) => {
    const s = await startBrain(project);
    invalidateLaserView();
    return s;
  });
  ipcMain.handle('brain:stop', () => stopBrain());
  // Receiver-only controls: the output stage reads its OSC target, shard, and
  // light map at startup, so restarting just the receiver applies a config
  // change without dropping the server, the laser UI, or connected clients.
  ipcMain.handle('brain:startReceiver', () => startLocalReceiver());
  ipcMain.handle('brain:stopReceiver', () => stopLocalReceiver());

  ipcMain.handle('doctor:report', (_e, project: string) => buildDoctorReport(project));

  ipcMain.handle('projects:list', () => projectSummaries());
  ipcMain.handle('projects:active', () => openStore().getActiveProject());
  ipcMain.handle('projects:use', (_e, name: string) => {
    const store = openStore();
    if (store.hasProject(name)) store.setActiveProject(name);
    return projectSummaries();
  });
  ipcMain.handle('projects:presets', () => knownPresets());
  ipcMain.handle('projects:create', (_e, input: NewProjectInput) => {
    const store = openStore();
    const name = (input.name ?? '').trim();
    if (store.hasProject(name)) throw new Error(`Project "${name}" already exists.`);
    // createProject validates the name; configForNewProject validates the layout.
    store.createProject(name, configForNewProject(input));
    // Secrets are generated exactly once, at creation — never lazily later.
    store.generateSecrets(name);
    return projectSummaries();
  });
  ipcMain.handle('projects:remove', (_e, name: string) => {
    const store = openStore();
    if (store.hasProject(name)) store.deleteProject(name);
    return projectSummaries();
  });
  ipcMain.handle('projects:getConfig', (_e, project: string) => {
    const store = openStore();
    if (!store.hasProject(project)) return null;
    return toEditable(store.getProjectConfig(project));
  });
  ipcMain.handle('projects:saveConfig', (_e, project: string, config: EditableConfig) => {
    const store = openStore();
    if (!store.hasProject(project)) return null;
    const next = applyEditable(store.getProjectConfig(project), config);
    store.saveProjectConfig(project, next);
    return toEditable(next);
  });

  ipcMain.handle('users:list', (_e, project: string) => {
    const store = openStore();
    return store.hasProject(project) ? store.listUserInfos(project) : [];
  });
  ipcMain.handle('users:add', (_e, project: string, username: string, password: string, role: UserRole) => {
    const store = openStore();
    // addUser hashes with scrypt and throws on empty username/password; the
    // password is used here only to hash and is never echoed, returned, or logged.
    if (store.hasProject(project)) store.addUser(project, username, password, role);
    return store.hasProject(project) ? store.listUserInfos(project) : [];
  });
  ipcMain.handle('users:remove', (_e, project: string, username: string) => {
    const store = openStore();
    if (store.hasProject(project)) {
      // Revoke the user's live sessions too, so a removed user can't refresh.
      store.removeUser(project, username);
      store.revokeUserSessions(project, username);
    }
    return store.hasProject(project) ? store.listUserInfos(project) : [];
  });
  ipcMain.handle('users:setRole', (_e, project: string, username: string, role: UserRole) => {
    const store = openStore();
    if (store.hasProject(project)) store.setUserRole(project, username, role);
    return store.hasProject(project) ? store.listUserInfos(project) : [];
  });

  ipcMain.handle('sessions:list', (_e, project: string) => {
    const store = openStore();
    return store.hasProject(project) ? store.listSessions(project) : [];
  });
  ipcMain.handle('sessions:revoke', (_e, project: string, id: string) => {
    const store = openStore();
    if (store.hasProject(project)) store.revokeSession(project, id);
    return store.hasProject(project) ? store.listSessions(project) : [];
  });

  ipcMain.handle('keys:list', (_e, project: string) => {
    const store = openStore();
    return store.hasProject(project) ? store.listAccessKeys(project) : [];
  });
  ipcMain.handle('keys:mint', (_e, project: string, name: string, role: UserRole) => {
    const store = openStore();
    if (!store.hasProject(project)) return { passphrase: '', keys: [] };
    // The cleartext is returned exactly once for the admin to copy and hand
    // over; only its scrypt hash is persisted. It is never logged.
    const minted = store.mintAccessKey(project, name, role);
    return { passphrase: minted.passphrase, keys: store.listAccessKeys(project) };
  });
  ipcMain.handle('keys:setEnabled', (_e, project: string, name: string, enabled: boolean) => {
    const store = openStore();
    if (store.hasProject(project)) store.setAccessKeyEnabled(project, name, enabled);
    return store.hasProject(project) ? store.listAccessKeys(project) : [];
  });
  ipcMain.handle('keys:setRole', (_e, project: string, name: string, role: UserRole) => {
    const store = openStore();
    if (store.hasProject(project)) store.setAccessKeyRole(project, name, role);
    return store.hasProject(project) ? store.listAccessKeys(project) : [];
  });
  ipcMain.handle('keys:remove', (_e, project: string, name: string) => {
    const store = openStore();
    if (store.hasProject(project)) {
      // Revoke sessions opened with the key too, so its holders can't refresh.
      if (store.removeAccessKey(project, name)) store.revokeUserSessions(project, name);
    }
    return store.hasProject(project) ? store.listAccessKeys(project) : [];
  });
  ipcMain.handle('keys:removeAll', (_e, project: string) => {
    const store = openStore();
    if (store.hasProject(project)) {
      for (const key of store.listAccessKeys(project)) {
        store.revokeUserSessions(project, key.name);
      }
      store.removeAllAccessKeys(project);
    }
    return store.hasProject(project) ? store.listAccessKeys(project) : [];
  });

  ipcMain.handle('secrets:status', (_e, project: string) => secretStatus(project));
  ipcMain.handle('secrets:generate', (_e, project: string, force: boolean) => {
    const store = openStore();
    // Explicit, operator-triggered generation/rotation only. `generateSecrets`
    // returns which names were generated/kept — never the values themselves.
    if (store.hasProject(project)) store.generateSecrets(project, { force });
    return secretStatus(project);
  });

  ipcMain.handle('devices:list', (_e, project: string) => devices(project));
  ipcMain.handle('devices:rename', (_e, project: string, idOrName: string, newName: string) => {
    const store = openStore();
    if (store.hasProject(project)) store.renameDevice(project, idOrName, newName);
    return devices(project);
  });
  ipcMain.handle('devices:assignShard', (_e, project: string, idOrName: string, shard: ShardRange | null) => {
    const store = openStore();
    if (store.hasProject(project)) store.assignShard(project, idOrName, shard);
    return devices(project);
  });

  ipcMain.handle('lights:view', (_e, project: string) => lightMapView(project));
  ipcMain.handle('lights:saveMap', (_e, project: string, name: string, physicalLights: number[]) => {
    const store = openStore();
    if (!store.hasProject(project)) return null;
    const layout = resolveLayout(store.getProjectConfig(project)?.layout ?? { preset: 'grid-7x7' });
    // Persist a named correction map. Normalization keeps it a valid permutation;
    // if it is the active map the store re-materializes the runtime light-map.json.
    store.saveLightMap(project, name, {
      numCannons: layout.count,
      gridColumns: layout.cols,
      physicalLights
    });
    return lightMapView(project);
  });
  ipcMain.handle('lights:activate', (_e, project: string, name: string | null) => {
    const store = openStore();
    if (!store.hasProject(project)) return null;
    store.setActiveLightMap(project, name);
    return lightMapView(project);
  });
  ipcMain.handle('lights:deleteMap', (_e, project: string, name: string) => {
    const store = openStore();
    if (!store.hasProject(project)) return null;
    store.deleteLightMap(project, name);
    return lightMapView(project);
  });
  ipcMain.handle('lights:autoMap', (_e, project: string, strategyId: string) => {
    const store = openStore();
    if (!store.hasProject(project)) return null;
    const layout = resolveLayout(store.getProjectConfig(project)?.layout ?? { preset: 'grid-7x7' });
    // Deterministic candidate only — never persisted here; the operator applies
    // it into the draft and Saves explicitly.
    return autoMap(layout, strategyId);
  });
  ipcMain.handle('lights:identify', (_e, project: string, physicalIndex: number) =>
    // Flash one physical output on the running rig (white). No-op unless this
    // project's brain is live — returns whether it was actually driven.
    sendToBrain(project, { type: 'physical_preview', physicalIndex })
  );
  ipcMain.handle('lights:identifyClear', (_e, project: string) => {
    sendToBrain(project, { type: 'physical_preview_clear' });
    sendToBrain(project, { type: 'calibration_mode', enabled: false });
  });

  ipcMain.handle('projects:exportToFile', (_e, project: string, includeSecrets: boolean) =>
    exportProjectToFile(project, includeSecrets)
  );
  ipcMain.handle('projects:importFromFile', (_e, req: ImportRequest) => importProjectFromFile(req));

  ipcMain.handle('osc:get', (_e, project: string) => {
    const store = openStore();
    if (!store.hasProject(project)) return null;
    return toOscTarget(store.getProjectConfig(project));
  });
  ipcMain.handle('osc:set', (_e, project: string, target: OscTarget) => {
    const store = openStore();
    if (!store.hasProject(project)) return null;
    // applyOscTarget validates the target and throws a user-facing message;
    // the renderer surfaces it rather than persisting a half-set target.
    store.saveProjectConfig(project, applyOscTarget(store.getProjectConfig(project), target));
    return toOscTarget(store.getProjectConfig(project));
  });

  ipcMain.handle('discovery:browse', async (_e, timeoutMs?: number) => {
    const brains = await browse(timeoutMs ? { timeoutMs } : {});
    return brains.map<DiscoveredBrainInfo>((b) => ({
      name: b.name,
      project: b.project,
      host: b.host,
      port: b.port,
      addresses: b.addresses,
      deviceName: b.deviceName,
      transient: b.transient,
      serverUrl: `ws://${b.addresses[0] ?? b.host}:${b.port}`
    }));
  });

  ipcMain.handle('store:info', () => storeInfo());
  ipcMain.handle('store:clear', async (_e, keepDevice: boolean): Promise<StoreClearResult> => {
    // Stop the brain first: it holds the project whose state is about to vanish,
    // and a running receiver would keep writing into the wiped state dir.
    await stopBrain();
    syncLaser({ url: null, bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false });
    const summary = openStore().reset({ keepDevice });
    return { ...summary, info: storeInfo() };
  });

  ipcMain.on('laser:sync', (_e, state: LaserSyncState) => syncLaser(state));
}
