import { contextBridge, ipcRenderer } from 'electron';

import type { AccessKeyInfo, BrainStatus, DeviceInfo, DiscoveredBrainInfo, DoctorReport, EditableConfig, ExportResult, ImportRequest, ImportSummary, LaserSyncState, LightMapView, NetworkReport, NewProjectInput, OscTarget, ProjectSummary, RequiredSecretInfo, SessionInfo, ShardRange, StoreClearResult, StoreInfo, TrafficCaptureFile, TrafficCaptureRequest, TrafficCaptureState, TrafficDiscovery, TrafficDoctorReport, TrafficInterfaceInfo, TrafficResult, TrafficSettings, UserAccount, UserRole, WavegridApi, WavegridLaser } from '@/types/ipc';

// The single, narrow bridge exposed to the renderer. The renderer never imports
// @wavegrid/settings or `fs`; everything goes through these typed calls.
const api: WavegridApi = {
  brain: {
    status: () => ipcRenderer.invoke('brain:status'),
    start: (project) => ipcRenderer.invoke('brain:start', project),
    stop: () => ipcRenderer.invoke('brain:stop'),
    startReceiver: () => ipcRenderer.invoke('brain:startReceiver'),
    stopReceiver: () => ipcRenderer.invoke('brain:stopReceiver'),
    onStatus: (cb: (status: BrainStatus) => void) => {
      const listener = (_e: unknown, payload: BrainStatus) => cb(payload);
      ipcRenderer.on('brain:status', listener);
      return () => ipcRenderer.removeListener('brain:status', listener);
    }
  },
  doctor: {
    report: (project) => ipcRenderer.invoke('doctor:report', project) as Promise<DoctorReport | null>,
    network: () => ipcRenderer.invoke('doctor:network') as Promise<NetworkReport | null>
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list') as Promise<ProjectSummary[]>,
    active: () => ipcRenderer.invoke('projects:active') as Promise<string | null>,
    use: (name) => ipcRenderer.invoke('projects:use', name) as Promise<ProjectSummary[]>,
    presets: () => ipcRenderer.invoke('projects:presets') as Promise<string[]>,
    create: (input: NewProjectInput) => ipcRenderer.invoke('projects:create', input) as Promise<ProjectSummary[]>,
    remove: (name) => ipcRenderer.invoke('projects:remove', name) as Promise<ProjectSummary[]>,
    getConfig: (project) => ipcRenderer.invoke('projects:getConfig', project) as Promise<EditableConfig | null>,
    saveConfig: (project, config: EditableConfig) =>
      ipcRenderer.invoke('projects:saveConfig', project, config) as Promise<EditableConfig | null>,
    exportToFile: (project, includeSecrets) =>
      ipcRenderer.invoke('projects:exportToFile', project, includeSecrets) as Promise<ExportResult | null>,
    importFromFile: (req: ImportRequest) =>
      ipcRenderer.invoke('projects:importFromFile', req) as Promise<ImportSummary | null>
  },
  users: {
    list: (project) => ipcRenderer.invoke('users:list', project) as Promise<UserAccount[]>,
    add: (project, username, password, role: UserRole) =>
      ipcRenderer.invoke('users:add', project, username, password, role) as Promise<UserAccount[]>,
    remove: (project, username) =>
      ipcRenderer.invoke('users:remove', project, username) as Promise<UserAccount[]>,
    setRole: (project, username, role: UserRole) =>
      ipcRenderer.invoke('users:setRole', project, username, role) as Promise<UserAccount[]>
  },
  sessions: {
    list: (project) => ipcRenderer.invoke('sessions:list', project) as Promise<SessionInfo[]>,
    revoke: (project, id) => ipcRenderer.invoke('sessions:revoke', project, id) as Promise<SessionInfo[]>
  },
  keys: {
    list: (project) => ipcRenderer.invoke('keys:list', project) as Promise<AccessKeyInfo[]>,
    mint: (project, name, role: UserRole) =>
      ipcRenderer.invoke('keys:mint', project, name, role) as Promise<{
        passphrase: string;
        keys: AccessKeyInfo[];
      }>,
    setEnabled: (project, name, enabled) =>
      ipcRenderer.invoke('keys:setEnabled', project, name, enabled) as Promise<AccessKeyInfo[]>,
    setRole: (project, name, role: UserRole) =>
      ipcRenderer.invoke('keys:setRole', project, name, role) as Promise<AccessKeyInfo[]>,
    remove: (project, name) =>
      ipcRenderer.invoke('keys:remove', project, name) as Promise<AccessKeyInfo[]>,
    removeAll: (project) => ipcRenderer.invoke('keys:removeAll', project) as Promise<AccessKeyInfo[]>
  },
  secrets: {
    status: (project) => ipcRenderer.invoke('secrets:status', project) as Promise<RequiredSecretInfo[]>,
    generate: (project, force) =>
      ipcRenderer.invoke('secrets:generate', project, force) as Promise<RequiredSecretInfo[]>
  },
  devices: {
    list: (project) => ipcRenderer.invoke('devices:list', project) as Promise<DeviceInfo[]>,
    rename: (project, idOrName, newName) =>
      ipcRenderer.invoke('devices:rename', project, idOrName, newName) as Promise<DeviceInfo[]>,
    assignShard: (project, idOrName, shard: ShardRange | null) =>
      ipcRenderer.invoke('devices:assignShard', project, idOrName, shard) as Promise<DeviceInfo[]>
  },
  lights: {
    view: (project) => ipcRenderer.invoke('lights:view', project) as Promise<LightMapView | null>,
    saveMap: (project, name, physicalLights) =>
      ipcRenderer.invoke('lights:saveMap', project, name, physicalLights) as Promise<LightMapView | null>,
    activate: (project, name) =>
      ipcRenderer.invoke('lights:activate', project, name) as Promise<LightMapView | null>,
    deleteMap: (project, name) =>
      ipcRenderer.invoke('lights:deleteMap', project, name) as Promise<LightMapView | null>,
    autoMap: (project, strategyId) =>
      ipcRenderer.invoke('lights:autoMap', project, strategyId) as Promise<number[] | null>,
    identify: (project, physicalIndex) =>
      ipcRenderer.invoke('lights:identify', project, physicalIndex) as Promise<boolean>,
    identifyClear: (project) =>
      ipcRenderer.invoke('lights:identifyClear', project) as Promise<void>
  },
  nova: {
    apply: (project, look) => ipcRenderer.invoke('nova:apply', project, look) as Promise<boolean>,
    speed: (project, value) => ipcRenderer.invoke('nova:speed', project, value) as Promise<boolean>,
    blackout: (project) => ipcRenderer.invoke('nova:blackout', project) as Promise<boolean>
  },
  osc: {
    get: (project) => ipcRenderer.invoke('osc:get', project) as Promise<OscTarget | null>,
    set: (project, target: OscTarget) =>
      ipcRenderer.invoke('osc:set', project, target) as Promise<OscTarget | null>
  },
  discovery: {
    browse: (timeoutMs) =>
      ipcRenderer.invoke('discovery:browse', timeoutMs) as Promise<DiscoveredBrainInfo[]>
  },
  // Traffic panel. Nothing is invoked until that screen mounts, so a machine
  // without Wireshark never notices these exist.
  traffic: {
    doctor: () => ipcRenderer.invoke('traffic:doctor') as Promise<TrafficDoctorReport | null>,
    interfaces: (host) =>
      ipcRenderer.invoke('traffic:interfaces', host) as Promise<TrafficInterfaceInfo[]>,
    discover: (iface, seconds) =>
      ipcRenderer.invoke('traffic:discover', iface, seconds) as Promise<TrafficDiscovery | null>,
    start: (req: TrafficCaptureRequest) =>
      ipcRenderer.invoke('traffic:start', req) as Promise<TrafficCaptureState | null>,
    stop: () => ipcRenderer.invoke('traffic:stop') as Promise<TrafficCaptureState | null>,
    status: () => ipcRenderer.invoke('traffic:status') as Promise<TrafficCaptureState | null>,
    captures: () => ipcRenderer.invoke('traffic:captures') as Promise<TrafficCaptureFile[]>,
    analyze: (path, host) =>
      ipcRenderer.invoke('traffic:analyze', path, host) as Promise<TrafficResult>,
    compare: (a, b, host) =>
      ipcRenderer.invoke('traffic:compare', a, b, host) as Promise<TrafficResult>,
    settings: () => ipcRenderer.invoke('traffic:settings') as Promise<TrafficSettings>,
    setCaptureDir: (dir) =>
      ipcRenderer.invoke('traffic:setCaptureDir', dir) as Promise<TrafficSettings>,
    chooseCaptureDir: () =>
      ipcRenderer.invoke('traffic:chooseCaptureDir') as Promise<TrafficSettings | null>
  },
  store: {
    info: () => ipcRenderer.invoke('store:info') as Promise<StoreInfo>,
    clear: (keepDevice) =>
      ipcRenderer.invoke('store:clear', keepDevice) as Promise<StoreClearResult>
  }
};

contextBridge.exposeInMainWorld('wavegrid', api);

// Fire-and-forget channel the renderer uses to position the native laser view.
const laser: WavegridLaser = {
  sync: (state: LaserSyncState) => ipcRenderer.send('laser:sync', state)
};
contextBridge.exposeInMainWorld('wavegridLaser', laser);
