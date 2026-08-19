import { Activity, AlertTriangle, Cog, Cpu, Flame, FolderKanban, Lightbulb, MonitorPlay, Radio, ShieldCheck, SlidersHorizontal, Waves, X } from 'lucide-react';
import * as React from 'react';

import { type AppLinkRenderer } from '@/components/ui/app-bar';
import { type AppNavigationGroup,AppShell } from '@/components/ui/app-shell';
import { AppSplash } from '@/components/ui/app-splash';
import { ConstructiveIcon } from '@/components/ui/constructive-icon';
import { isRoute, NAV_GROUPS, type Route,ROUTE_GROUP, ROUTE_LABEL } from '@/renderer/lib/navigation';
import {
  useAccessKeys,
  useBrainStatus,
  useDevices,
  useDiscovery,
  useDoctor,
  useLightMap,
  useNetwork,
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
import { NovaRoute } from '@/renderer/routes/nova-route';
import { OscRoute } from '@/renderer/routes/osc-route';
import { OutputRoute } from '@/renderer/routes/output-route';
import { ProjectSwitcher } from '@/renderer/routes/project-switcher';
import { ProjectsRoute } from '@/renderer/routes/projects-route';
import { SettingsRoute } from '@/renderer/routes/settings-route';
import { ShowRoute } from '@/renderer/routes/show-route';
import { StatusRoute } from '@/renderer/routes/status-route';
import { SwitchProjectDialog } from '@/renderer/routes/switch-project-dialog';
import { TrafficRoute } from '@/renderer/routes/traffic-route';

type AppIcon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

const ROUTE_ICON: Record<Route, AppIcon> = {
  show: MonitorPlay,
  nova: Flame,
  status: Activity,
  projects: FolderKanban,
  config: SlidersHorizontal,
  access: ShieldCheck,
  lights: Lightbulb,
  output: Radio,
  devices: Cpu,
  osc: Radio,
  traffic: Waves,
  settings: Cog
};

export function App() {
  const [route, setRoute] = React.useState<Route>('show');
  const [busy, setBusy] = React.useState(false);

  const status = useBrainStatus();
  const { projects, loaded, refresh, use, create, remove } = useProjects();
  const presets = usePresets();

  // Bumped whenever the store changes underneath the panels (project in use,
  // import, clear-all) so every project-scoped panel refetches — a panel bound
  // to the same project name would otherwise keep its mount-time data.
  const [dataRev, setDataRev] = React.useState(0);
  const invalidateProjectData = React.useCallback(() => setDataRev((n) => n + 1), []);

  // The action that just failed, if any. Store writes can refuse (the last admin,
  // a name clash), and a silently swallowed rejection looks like a dead button.
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Boot splash: keep the cube loader up until the project registry has landed
  // AND one full animation cycle has played, so it never flashes for a frame.
  const [splashCycleDone, setSplashCycleDone] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setSplashCycleDone(true), 1400);
    return () => window.clearTimeout(t);
  }, []);
  const showSplash = !loaded || !splashCycleDone;

  const activeProject = projects.find((p) => p.active)?.name ?? status.project ?? null;
  const activeScope = React.useMemo(
    () => ({ project: activeProject, rev: dataRev }),
    [activeProject, dataRev]
  );
  const { devices, refresh: refreshDevices, rename: renameDevice, assignShard } =
    useDevices(activeScope);

  // There is exactly one current project: the one in use. Panels used to be
  // able to pin a *different* project for editing, which meant the screen and
  // the stage could silently disagree about what you were changing.
  const editingProject = activeProject;
  const editingScope = React.useMemo(
    () => ({ project: editingProject, rev: dataRev }),
    [editingProject, dataRev]
  );
  const { config, loading: configLoading, refresh: refreshConfig, save: saveConfig } =
    useProjectConfig(editingScope);
  const {
    users,
    refresh: refreshUsers,
    add: addUser,
    remove: removeUser,
    setRole: setUserRole
  } = useProjectUsers(editingScope);
  const {
    sessions,
    refresh: refreshSessions,
    revoke: revokeSession
  } = useSessions(editingScope);
  const {
    keys,
    refresh: refreshKeys,
    mint: mintKey,
    setEnabled: setKeyEnabled,
    setRole: setKeyRole,
    remove: removeKey,
    removeAll: removeAllKeys
  } = useAccessKeys(editingScope);
  const {
    secrets,
    refresh: refreshSecrets,
    generate: generateSecrets
  } = useProjectSecrets(editingScope);
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
  } = useLightMap(editingScope);
  const { info: storeInfo, refresh: refreshStore, clear: clearStore } = useStore();
  const {
    report: doctorReport,
    loading: doctorLoading,
    error: doctorError,
    refresh: refreshDoctor
  } = useDoctor(activeScope);
  const {
    report: networkReport,
    loading: networkLoading,
    refresh: probeNetwork
  } = useNetwork();
  const { target: oscTarget, refresh: refreshOsc, save: saveOsc } = useOscTarget(editingScope);
  const discovery = useDiscovery();
  const { exportProject, importProject } = useTransfer(
    React.useCallback(async () => {
      await refresh();
      invalidateProjectData();
    }, [refresh, invalidateProjectData])
  );

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
        // Asked, not remembered: the rendered status is a broadcast that can lag
        // the brain, and acting on a stale one leaves the old project's show
        // running under the new project's screen.
        const before = await window.wavegrid.brain.status();
        const restart = before.running && before.project !== name;
        if (restart) await window.wavegrid.brain.stop();
        await use(name);
        invalidateProjectData();
        if (restart) await window.wavegrid.brain.start(name).catch(() => undefined);
      } finally {
        setBusy(false);
      }
    },
    [use, invalidateProjectData]
  );

  /**
   * Every path that changes the current project goes through here, so none of
   * them can skip the warning: a switch mid-show restarts the brain, which
   * darkens the lasers for a moment.
   */
  const [pendingProject, setPendingProject] = React.useState<string | null>(null);
  const requestProjectSwitch = React.useCallback(
    (name: string) => {
      if (name === activeProject) return;
      if (status.running) {
        setPendingProject(name);
        return;
      }
      void onUse(name);
    },
    [activeProject, status.running, onUse]
  );

  const onCreate = React.useCallback(
    async (input: Parameters<typeof create>[0]) => {
      setBusy(true);
      try {
        await create(input);
        invalidateProjectData();
      } finally {
        setBusy(false);
      }
    },
    [create, invalidateProjectData]
  );

  const onRemove = React.useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        await remove(name);
        invalidateProjectData();
      } finally {
        setBusy(false);
      }
    },
    [remove, invalidateProjectData]
  );

  /** Editing a project's layout means working *in* it — switch, then open it. */
  const onEditConfig = React.useCallback(
    (name: string) => {
      requestProjectSwitch(name);
      setRoute('config');
    },
    [requestProjectSwitch]
  );

  /**
   * Run a store write with the busy flag held, surfacing a refusal instead of
   * losing it: the store rejects some writes on purpose (removing the last
   * admin, an unknown user), and an unhandled rejection here reads as a button
   * that does nothing.
   */
  const withBusy = React.useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    setActionError(null);
    try {
      return await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Fire-and-forget variant for buttons that don't consume a result — the
   *  failure is already on screen, so the rejection is deliberately dropped. */
  const runAction = React.useCallback(
    (fn: () => Promise<unknown>) => {
      void withBusy(fn).catch(() => undefined);
    },
    [withBusy]
  );

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
        const next = href.replace(/^#/, '');
        if (isRoute(next)) setRoute(next);
        onClick?.(e);
      }}
      {...props}
    />
  );

  const navigation: AppNavigationGroup[] = NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.id === 'setup' && activeProject ? `Set up · ${activeProject}` : group.label,
    items: group.routes.map((r) => ({
      id: r,
      label: ROUTE_LABEL[r],
      href: `#${r}`,
      icon: ROUTE_ICON[r],
      isActive: route === r,
      badge: r === 'devices' ? devices.length || undefined : undefined
    }))
  }));

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
    // Nova previews the project's own ring, so it needs the resolved layout.
    if (route === 'nova') void refreshConfig();
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
        description: status.running ? 'Show running' : 'Show stopped'
      }}
      sidebarHeader={
        <ProjectSwitcher
          projects={projects}
          current={activeProject}
          onSelect={requestProjectSwitch}
          onManage={() => setRoute('projects')}
        />
      }
      breadcrumbs={[
        ...(ROUTE_GROUP[route]
          ? [{ id: `group-${route}`, label: ROUTE_GROUP[route] as string }]
          : []),
        { id: route, label: ROUTE_LABEL[route], current: true }
      ]}
    >
      {actionError && (
        <div className='text-destructive mb-4 flex items-start gap-2 rounded-lg border border-current/30 px-3 py-2 text-sm'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0' />
          <span className='flex-1'>
            <span className='font-medium'>That didn’t work.</span> {actionError}
          </span>
          <button
            type='button'
            aria-label='Dismiss'
            className='hover:opacity-70'
            onClick={() => setActionError(null)}
          >
            <X className='size-4' />
          </button>
        </div>
      )}
      {route === 'show' && (
        <ShowRoute
          status={status}
          activeProject={activeProject}
          onStart={onStart}
          onStop={onStop}
          busy={busy}
        />
      )}
      {route === 'nova' && (
        <NovaRoute
          project={editingProject}
          layoutLabel={config?.layoutLabel ?? null}
          count={config?.cannonCount ?? 6}
          brainLive={status.running && status.project === editingProject}
          onApply={(look) => {
            if (editingProject) void window.wavegrid.nova.apply(editingProject, look);
          }}
          onSpeed={(value) => {
            if (editingProject) void window.wavegrid.nova.speed(editingProject, value);
          }}
          onBlackout={() => {
            if (editingProject) void window.wavegrid.nova.blackout(editingProject);
          }}
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
          onStartReceiver={() => runAction(async () => {
            await window.wavegrid.brain.startReceiver();
            await refreshDoctor();
          })}
          onStopReceiver={() => runAction(async () => {
            await window.wavegrid.brain.stopReceiver();
            await refreshDoctor();
          })}
          busy={busy}
          network={networkReport}
          networkLoading={networkLoading}
          onProbeNetwork={() => void probeNetwork()}
        />
      )}
      {route === 'projects' && (
        <ProjectsRoute
          projects={projects}
          presets={presets}
          onUse={requestProjectSwitch}
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
          onRemoveUser={(u) => runAction(() => removeUser(u))}
          onSetUserRole={(u, r) => runAction(() => setUserRole(u, r))}
          onRevokeSession={(id) => runAction(() => revokeSession(id))}
          onRefreshSessions={() => void refreshSessions()}
          keys={keys}
          onMintKey={(name, role) => withBusy(() => mintKey(name, role))}
          onSetKeyEnabled={(name, enabled) => runAction(() => setKeyEnabled(name, enabled))}
          onSetKeyRole={(name, role) => runAction(() => setKeyRole(name, role))}
          onRemoveKey={(name) => runAction(() => removeKey(name))}
          onRemoveAllKeys={() => runAction(() => removeAllKeys())}
          onGenerateSecrets={(force) => runAction(() => generateSecrets(force))}
          busy={busy}
        />
      )}
      {route === 'lights' && (
        <LightsRoute
          project={editingProject}
          view={lightMap}
          loading={lightMapLoading}
          onSaveMap={(name, pl) => runAction(() => saveLightMap(name, pl))}
          onActivate={(name) => runAction(() => activateLightMap(name))}
          onDeleteMap={(name) => runAction(() => deleteLightMap(name))}
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
      {/* Traffic loads itself: it is the only screen that touches Wireshark, and
          nothing may be looked for until you open it. */}
      {route === 'traffic' && <TrafficRoute />}
      {/* OSC debugger: probes and single sends only, and only while open. */}
      {route === 'osc' && <OscRoute activeProject={editingProject} status={status} />}
      {route === 'settings' && (
        <SettingsRoute
          info={storeInfo}
          onClear={async (keepDevice) => {
            setBusy(true);
            try {
              const result = await clearStore(keepDevice);
              // Everything the other screens mirror just vanished — re-read it all
              // so no route keeps showing a project that no longer exists.
              await refresh();
              invalidateProjectData();
              return result;
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
        />
      )}
      <SwitchProjectDialog
        pending={pendingProject}
        current={activeProject}
        onCancel={() => setPendingProject(null)}
        onConfirm={() => {
          if (pendingProject) void onUse(pendingProject);
          setPendingProject(null);
        }}
      />
      {showSplash && <AppSplash />}
    </AppShell>
  );
}
