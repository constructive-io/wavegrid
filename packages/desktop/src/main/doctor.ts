/**
 * Adapter from `@wavegrid/doctor`'s diagnostics to the renderer's read model.
 * Same collector the CLI's `wavegrid doctor` uses, so the dashboard and the
 * terminal can never disagree about whether the rig is healthy. Range/relative
 * time formatting happens here so the renderer stays free of node deps.
 */
import { collectDiagnostics } from '@wavegrid/doctor';
import { formatRanges } from '@wavegrid/server';
import { openStore } from '@wavegrid/settings';

import { receiverRunning } from '@/main/brain';
import { resolveProjectConfig } from '@/main/receiver-env';
import type { DoctorReceiver, DoctorReport } from '@/types/ipc';

export async function buildDoctorReport(project: string): Promise<DoctorReport | null> {
  const store = openStore();
  if (!project || !store.hasProject(project)) return null;
  if (store.getActiveProject() !== project) store.setActiveProject(project);

  // Via the brain, so a diagnosis reads the selected project's own config and
  // not whatever a previous show left in this long-lived process's env.
  const resolved = resolveProjectConfig();
  const diag = await collectDiagnostics({ store, project, resolved });
  const nameFor = (id: string): string =>
    diag.devices.find((d) => d.id === id)?.name ?? `${id.slice(0, 8)}…`;

  const status = diag.server;
  const server: DoctorReport['server'] = status
    ? {
      version: status.server.version,
      layoutName: status.server.layout.name,
      count: status.server.layout.count,
      mode: status.server.mode,
      port: status.server.port,
      uptimeMs: status.server.uptimeMs,
      uiClients: status.uiClients,
      receivers: status.receivers.map<DoctorReceiver>((r) => {
        const hello = r.hello;
        const mismatch =
          hello && hello.layout.count !== status.server.layout.count
            ? `layout ${hello.layout.id} (${hello.layout.count}) ≠ server (${status.server.layout.count})`
            : null;
        return {
          label: hello?.deviceName ?? hello?.host ?? r.remote,
          remote: r.remote,
          shard: hello?.shard ? `${hello.shard.start}–${hello.shard.end}` : 'all cannons',
          version: hello?.version ?? null,
          layoutMismatch: mismatch
        };
      }),
      coverage: {
        claimed: formatRanges(status.coverage.claimed),
        gaps: formatRanges(status.coverage.gaps),
        overlaps: formatRanges(status.coverage.overlaps),
        healthy: status.coverage.gaps.length === 0 && status.coverage.overlaps.length === 0
      }
    }
    : null;

  return {
    project,
    checks: diag.checks,
    overall: diag.overall,
    devices: diag.devices.map((d) => ({
      name: d.name,
      address: d.address ?? null,
      lastSeen: d.lastSeen ?? null,
      shard: d.shard ? `${d.shard.start}–${d.shard.end}` : null
    })),
    sync: {
      enabled: diag.sync.enabled,
      revision: diag.sync.revision,
      fromServer: diag.sync.fromServer,
      // A project nobody has edited has nothing to say about replication.
      relevant: diag.sync.revision > 0 || diag.sync.entryCount > 0,
      behind: diag.sync.divergent.map((d) => ({
        name: nameFor(d.deviceId),
        ackedRevision: d.ackedRevision,
        behindBy: d.behindBy
      }))
    },
    server,
    serverUrl: diag.serverUrl,
    serverError: diag.serverError ?? null,
    receiverRunning: receiverRunning(project),
    generatedAt: Date.now()
  };
}
