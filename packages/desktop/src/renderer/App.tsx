import { Activity, Cog, Cpu, FolderKanban, Lightbulb, MonitorPlay, Radio, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';

import { type AppLinkRenderer } from '@/components/ui/app-bar';
import { type AppNavigationGroup,AppShell } from '@/components/ui/app-shell';
import { AppSplash } from '@/components/ui/app-splash';
import { ConstructiveIcon } from '@/components/ui/constructive-icon';
import {
  useAccessKeys,
  useBrainStatus,
  useDevices,
  useDiscovery,
  useDoctor,
  useLightMap,
  useOscTarget,
  usePresets,
  useProjectConfig,
  useProjects,
  useProjectSecrets,
  useProjectUsers,
  useSessions,
  useStore,
  useTransfer
} from '@/renderer/lib/use-wavegrid';
import { AccessRoute } from '@/renderer/routes/access-route';
import { ConfigRoute } from '@/renderer/routes/config-route';
import { DevicesRoute } from '@/renderer/routes/devices-route';
import { LightsRoute } from '@/renderer/routes/lights-route';
import { OutputRoute } from '@/renderer/routes/output-route';
import { ProjectsRoute } from '@/renderer/routes/projects-route';
import { SettingsRoute } from '@/renderer/routes/settings-route';
import { ShowRoute } from '@/renderer/routes/show-route';
import { StatusRoute } from '@/renderer/routes/status-route';

type Route =
  | 'show'
  | 'status'
  | 'projects'
  | 'config'
  | 'access'
  | 'lights'
  | 'output'
  | 'devices'
  | 'settings';

const ROUTE_LABEL: Record<Route, string> = {
  show: 'Show',
  status: 'Status',
  projects: 'Projects',
  config: 'Config',
  access: 'Users & Secrets',
  lights: 'Lights',
  output: 'Output',
  devices: 'Devices',
  settings: 'Settings'
};

const ROUTES: Route[] = [
  'show',
  'status',
  'projects',
  'config',
  'access',
  'lights',
  'output',
  'devices',
  'settings'
];

export function App() {
  const [route, setRoute] = React.useState<Route>('show');
  const [busy, setBusy] = React.useState(false);

  const status = useBrainStatus();
  const { projects, loaded, refresh, use, create, remove } = useProjects();
  const presets = usePresets();

  // Boot splash: keep the cube loader up until the project registry has landed
  // AND one full animation cycle has played, so it never flashes for a frame.
  const [splashCycleDone, setSplashCycleDone] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setSplashCycleDone(true), 1400);
    return () => window.clearTimeout(t);
  }, []);
  const showSplash = !loaded || !splashCycleDone;

  const activeProject = projects.find((p) => p.active)?.name ?? status.project ?? null;
  const { devices, refresh: refreshDevices, rename: renameDevice, assignShard } =
    useDevices(activeProject);

  // The project whose config the editor is bound to — defaults to the active one,
  // overridden when the operator clicks "Config" on a specific project row.
  const [configProject, setConfigProject] = React.useState<string | null>(null);
  const editingProject = configProject ?? activeProject;
  const { config, loading: configLoading, refresh: refreshConfig, save: saveConfig } =
    useProjectConfig(editingProject);
  const {
    users,
    refresh: refreshUsers,
    add: addUser,
    remove: removeUser,
    setRole: setUserRole
  } = useProjectUsers(editingProject);
  const {
    sessions,
    refresh: refreshSessions,
    revoke: revokeSession
  } = useSessions(editingProject);
  const {
    keys,
    refresh: refreshKeys,
    mint: mintKey,
    setEnabled: setKeyEnabled,
    setRole: setKeyRole,
    remove: removeKey,
    removeAll: removeAllKeys
  } = useAccessKeys(editingProject);
  const {
    secrets,
    refresh: refreshSecrets,
    generate: generateSecrets
  } = useProjectSecrets(editingProject);
  const {
    view: lightMap,
    loading: lightMapLoading,
    refresh: refreshLightMap,
    saveMap: saveLightMap,
    activate: activateLightMap,
    deleteMap: deleteLightMap,
    autoMap: autoMapLights,
    identify: identifyLight,
    identifyClear: identifyClearLights
  } = useLightMap(editingProject);
  const { info: storeInfo, refresh: refreshStore, clear: clearStore } = useStore();
  const {
    report: doctorReport,
    loading: doctorLoading,
    error: doctorError,
    refresh: refreshDoctor
  } = useDoctor(activeProject);
  const { target: oscTarget, refresh: refreshOsc, save: saveOsc } = useOscTarget(editingProject);
  const discovery = useDiscovery();
  const { exportProject, importProject } = useTransfer(refresh);

  // A failed start is reported through `status.lastError` (pushed by the main
  // process), so the rejection here is expected and not re-thrown.
  const onStart = React.useCallback(async () => {
    if (!activeProject) return;
    setBusy(true);
    try {
      await window.wavegrid.brain.start(activeProject).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }, [activeProject]);

  const onStop = React.useCallback(async () => {
    setBusy(true);
    try {
      await window.wavegrid.brain.stop();
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Switching the active project has to move every project-scoped panel with it
   * — and a brain still serving the previous project would keep the artist UI
   * (and its light map) on the old layout, so it is restarted onto the new one.
   */
  const onUse = React.useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        await use(name);
        // Drop any project pinned by "Config" on a row, so every project-scoped
        // panel (config, lights, devices, access) follows the project in use
        // instead of the one last inspected.
        setConfigProject(null);
        if (status.running && status.project !== name) {
          await window.wavegrid.brain.start(name).catch(() => undefined);
        }
      } finally {
        setBusy(false);
      }
    },
    [use, status.running, status.project]
  );

  const onCreate = React.useCallback(
    async (input: Parameters<typeof create>[0]) => {
      setBusy(true);
      try {
        await create(input);
      } finally {
        setBusy(false);
      }
    },
    [create]
  );

  const onRemove = React.useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        await remove(name);
        setConfigProject((cur) => (cur === name ? null : cur));
      } finally {
        setBusy(false);
      }
    },
    [remove]
  );

  const onEditConfig = React.useCallback((name: string) => {
    setConfigProject(name);
    setRoute('config');
  }, []);

  const withBusy = React.useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  // A live brain resolved its config at startup, so a layout/port change only
  // reaches the artist UI (and the light map derived from it) on a restart.
  const onSaveConfig = React.useCallback(
    async (next: Parameters<typeof saveConfig>[0]) => {
      setBusy(true);
      try {
        await saveConfig(next);
        if (editingProject && status.running && status.project === editingProject) {
          await window.wavegrid.brain.start(editingProject).catch(() => undefined);
        }
        await refreshLightMap();
      } finally {
        setBusy(false);
      }
    },
    [saveConfig, refreshLightMap, editingProject, status.running, status.project]
  );

  // Hash links drive an in-app route switch (no real navigation — the window
  // never leaves the renderer bundle).
  const renderLink: AppLinkRenderer = ({ href, onClick, ...props }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        const next = href.replace(/^#/, '') as Route;
        if (ROUTES.includes(next)) setRoute(next);
        onClick?.(e);
      }}
      {...props}
    />
  );

  const navigation: AppNavigationGroup[] = [
    {
      id: 'main',
      items: [
        {
          id: 'show',
          label: 'Show',
          href: '#show',
          icon: MonitorPlay,
          isActive: route === 'show'
        },
        {
          id: 'status',
          label: 'Status',
          href: '#status',
          icon: Activity,
          isActive: route === 'status'
        },
        {
          id: 'projects',
          label: 'Projects',
          href: '#projects',
          icon: FolderKanban,
          isActive: route === 'projects',
          badge: projects.length || undefined
        },
        {
          id: 'config',
          label: 'Config',
          href: '#config',
          icon: SlidersHorizontal,
          isActive: route === 'config'
        },
        {
          id: 'access',
          label: 'Users & Secrets',
          href: '#access',
          icon: ShieldCheck,
          isActive: route === 'access'
        },
        {
          id: 'lights',
          label: 'Lights',
          href: '#lights',
          icon: Lightbulb,
          isActive: route === 'lights'
        },
        {
          id: 'output',
          label: 'Output',
          href: '#output',
          icon: Radio,
          isActive: route === 'output'
        },
        {
          id: 'devices',
          label: 'Devices',
          href: '#devices',
          icon: Cpu,
          isActive: route === 'devices',
          badge: devices.length || undefined
        },
        {
          id: 'settings',
          label: 'Settings',
          href: '#settings',
          icon: Cog,
          isActive: route === 'settings'
        }
      ]
    }
  ];

  React.useEffect(() => {
    if (route === 'projects') void refresh();
    if (route === 'devices') void refreshDevices();
    if (route === 'config') void refreshConfig();
    if (route === 'access') {
      void refreshUsers();
      void refreshSessions();
      void refreshKeys();
      void refreshSecrets();
    }
    if (route === 'lights') void refreshLightMap();
    if (route === 'output') void refreshOsc();
    if (route === 'settings') void refreshStore();
    if (route === 'status') void refreshDoctor();
  }, [route, refresh, refreshDevices, refreshConfig, refreshUsers, refreshSessions, refreshKeys, refreshSecrets, refreshLightMap, refreshOsc, refreshStore, refreshDoctor]);

  return (
    <AppShell
      navigation={navigation}
      renderLink={renderLink}
      brand={{
        name: 'Wavegrid',
        logo: <ConstructiveIcon className='size-5' />,
        description: activeProject ? `Project · ${activeProject}` : 'No active project'
      }}
      breadcrumbs={[{ id: route, label: ROUTE_LABEL[route], current: true }]}
    >
      {route === 'show' && (
        <ShowRoute
          status={status}
          activeProject={activeProject}
          onStart={onStart}
          onStop={onStop}
          busy={busy}
        />
      )}
      {route === 'status' && (
        <StatusRoute
          project={activeProject}
          report={doctorReport}
          loading={doctorLoading}
          error={doctorError}
          onRefresh={() => void refreshDoctor()}
          brainLive={status.running && status.project === activeProject}
          receiverRunning={status.receiverRunning && status.project === activeProject}
          onStartReceiver={() => void withBusy(async () => {
            await window.wavegrid.brain.startReceiver();
            await refreshDoctor();
          })}
          onStopReceiver={() => void withBusy(async () => {
            await window.wavegrid.brain.stopReceiver();
            await refreshDoctor();
          })}
          busy={busy}
        />
      )}
      {route === 'projects' && (
        <ProjectsRoute
          projects={projects}
          presets={presets}
          onUse={onUse}
          onCreate={onCreate}
          onRemove={(name) => void onRemove(name)}
          onEditConfig={onEditConfig}
          onExport={(project, includeSecrets) =>
            withBusy(() => exportProject(project, includeSecrets))
          }
          onImport={(req) => withBusy(() => importProject(req))}
          busy={busy}
        />
      )}
      {route === 'config' && (
        <ConfigRoute
          project={editingProject}
          config={config}
          loading={configLoading}
          onSave={onSaveConfig}
          busy={busy}
        />
      )}
      {route === 'access' && (
        <AccessRoute
          project={editingProject}
          users={users}
          sessions={sessions}
          secrets={secrets}
          onAddUser={(u, p, r) => withBusy(() => addUser(u, p, r))}
          onRemoveUser={(u) => void withBusy(() => removeUser(u))}
          onSetUserRole={(u, r) => void withBusy(() => setUserRole(u, r))}
          onRevokeSession={(id) => void withBusy(() => revokeSession(id))}
          onRefreshSessions={() => void refreshSessions()}
          keys={keys}
          onMintKey={(name, role) => withBusy(() => mintKey(name, role))}
          onSetKeyEnabled={(name, enabled) => void withBusy(() => setKeyEnabled(name, enabled))}
          onSetKeyRole={(name, role) => void withBusy(() => setKeyRole(name, role))}
          onRemoveKey={(name) => void withBusy(() => removeKey(name))}
          onRemoveAllKeys={() => void withBusy(() => removeAllKeys())}
          onGenerateSecrets={(force) => void withBusy(() => generateSecrets(force))}
          busy={busy}
        />
      )}
      {route === 'lights' && (
        <LightsRoute
          project={editingProject}
          view={lightMap}
          loading={lightMapLoading}
          onSaveMap={(name, pl) => void withBusy(() => saveLightMap(name, pl))}
          onActivate={(name) => void withBusy(() => activateLightMap(name))}
          onDeleteMap={(name) => void withBusy(() => deleteLightMap(name))}
          onAutoMap={autoMapLights}
          onIdentify={identifyLight}
          onIdentifyClear={identifyClearLights}
          brainLive={status.running && status.project === editingProject}
          busy={busy}
        />
      )}
      {route === 'devices' && (
        <DevicesRoute
          activeProject={activeProject}
          devices={devices}
          onRename={(id, name) => void renameDevice(id, name)}
          onAssignShard={(id, shard) => void assignShard(id, shard)}
          busy={busy}
          discovery={{
            brains: discovery.brains,
            scanning: discovery.scanning,
            scanned: discovery.scanned,
            onScan: () => void discovery.scan()
          }}
        />
      )}
      {route === 'output' && (
        <OutputRoute
          activeProject={editingProject}
          target={oscTarget}
          onSave={(target) => withBusy(() => saveOsc(target))}
          busy={busy}
        />
      )}
      {route === 'settings' && (
        <SettingsRoute
          info={storeInfo}
          onClear={async (keepDevice) => {
            setBusy(true);
            try {
              const result = await clearStore(keepDevice);
              // Everything the other screens mirror just vanished — re-read it all
              // so no route keeps showing a project that no longer exists.
              setConfigProject(null);
              await refresh();
              return result;
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
        />
      )}
      {showSplash && <AppSplash />}
    </AppShell>
  );
}
