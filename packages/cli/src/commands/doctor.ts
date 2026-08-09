import {
  type Check,
  checkEnvHijack,
  collectDiagnostics,
  type Diagnostics,
  type NetworkReport,
  overallStatus,
  probeNetwork
} from '@wavegrid/doctor';
import { loadWavegridConfig } from '@wavegrid/layout';
import { formatRanges, type SystemStatus } from '@wavegrid/server';
import c from 'yanse';

import { type Flags, getStore } from '../project';

function renderCheck(check: Check): void {
  const icon = check.status === 'pass' ? c.green('✓') : check.status === 'warn' ? c.yellow('!') : c.red('✗');
  const name = check.name.padEnd(16);
  console.log(`  ${icon} ${name} ${check.detail}`);
  if (check.remedy && check.status !== 'pass') console.log(`      ${c.gray('↳ ' + check.remedy)}`);
}

function renderSystem(status: SystemStatus): void {
  console.log('');
  console.log(c.bold('  System (server-reported)'));
  const s = status.server;
  console.log(`  → Server:   ${c.cyan(`v${s.version}`)} · ${s.layout.name} (${s.layout.count}) · ${s.mode} · :${s.port} · up ${Math.round(s.uptimeMs / 1000)}s`);
  console.log(`  → Clients:  ${status.receivers.length} receiver(s), ${status.uiClients} UI`);

  if (status.receivers.length === 0) {
    console.log(c.yellow('  ! no receivers connected'));
  } else {
    for (const r of status.receivers) {
      const h = r.hello;
      const shard = h?.shard ? `shard ${h.shard.start}–${h.shard.end}` : 'all cannons';
      const mism = h && h.layout.count !== s.layout.count ? c.red(`  ⚠ layout ${h.layout.id}(${h.layout.count})≠server`) : '';
      const vskew = h && h.version !== undefined ? c.gray(`v${h.version}`) : '';
      const label = h?.deviceName ?? h?.host ?? r.remote;
      const at = c.gray(r.remote);
      console.log(`      • ${c.cyan(label)}  ${at}  ${shard}  ${vskew}${mism}`);
    }
  }

  const { claimed, gaps, overlaps } = status.coverage;
  const gapStr = gaps.length ? c.red(formatRanges(gaps)) : c.green('none');
  const overStr = overlaps.length ? c.red(formatRanges(overlaps)) : c.green('none');
  console.log(`  → Coverage: claimed ${formatRanges(claimed)} · gaps: ${gapStr} · overlaps: ${overStr}`);
}

/** Render the project device registry (devices that have joined, incl. offline). */
function renderDevices(diag: Diagnostics): void {
  if (diag.devices.length === 0) return;
  console.log('');
  console.log(c.bold(`  Devices (registered · ${diag.project})`));
  for (const d of diag.devices) {
    const at = d.address ? c.gray(d.address) : c.gray('—');
    const seen = d.lastSeen ? c.gray(seenAgo(d.lastSeen)) : c.gray('never');
    console.log(`      • ${c.cyan(d.name)}  ${at}  ${seen}`);
  }
}

/**
 * Render config-sync state: the current project revision and any devices that
 * lag it (divergence is surfaced, never hidden). Silent for a simple project
 * with no synced edits — no pay-as-you-go noise.
 */
function renderSync(diag: Diagnostics): void {
  const { sync, project } = diag;

  // Explicitly-off sync is worth a one-liner (edits won't propagate); an
  // untouched simple project with sync on stays silent.
  if (!sync.enabled) {
    console.log('');
    console.log(c.bold(`  Config sync (${project})`));
    console.log(`  ${c.yellow('○')} disabled ${c.gray('— edits stay local to each device (`wavegrid config set sync true` to replicate)')}`);
    return;
  }

  if (sync.revision === 0 && sync.entryCount === 0) return;

  const nameFor = (id: string): string => diag.devices.find((d) => d.id === id)?.name ?? `${id.slice(0, 8)}…`;
  const source = sync.fromServer ? 'server-reported' : 'local';

  console.log('');
  console.log(c.bold(`  Config sync (${project})`));
  console.log(`  → Revision: ${c.cyan(String(sync.revision))} ${c.gray(`(${source})`)}`);
  if (sync.divergent.length === 0) {
    console.log(`  ${c.green('✓')} all devices at revision ${sync.revision}`);
  } else {
    console.log(c.yellow(`  ! ${sync.divergent.length} device(s) behind:`));
    for (const d of sync.divergent) {
      console.log(`      • ${c.cyan(nameFor(d.deviceId))}  ${c.gray(`acked rev ${d.ackedRevision}, behind by ${d.behindBy}`)}`);
    }
    console.log(`      ${c.gray('↳ reconnect the device(s) to the brain to resync (`wavegrid receiver` / reopen the UI)')}`);
  }
}

/**
 * Can anything else on the wifi reach this brain? Only printed while the show
 * is up, because every line of it is a live probe of the running server.
 */
function renderNetwork(net: NetworkReport): void {
  console.log('');
  console.log(c.bold('  Network'));
  const tone = net.verdict === 'proven-reachable' ? c.green : net.verdict === 'unproven' || net.verdict === 'isolation-likely' ? c.yellow : c.red;
  console.log(`  ${tone('●')} ${net.summary}`);
  if (net.hint) console.log(`      ${c.gray('↳ ' + net.hint)}`);
  for (const p of net.selfProbes) {
    const mark = p.reachable ? c.green('✓') : c.red('✗');
    console.log(`      ${mark} ${c.cyan(p.url)} ${c.gray(p.reachable ? 'open from this machine' : 'blocked from this machine')}`);
  }
  for (const v of net.visitors) {
    console.log(`      • ${c.cyan(v.address)} ${c.gray(seenAgo(v.lastSeen))}`);
  }
}

function seenAgo(lastSeen: number): string {
  const secs = Math.round((Date.now() - lastSeen) / 1000);
  if (secs < 60) return `seen ${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `seen ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `seen ${hrs}h ago`;
  return `seen ${Math.round(hrs / 24)}d ago`;
}

/** Report the one case the shared collector cannot: no project to diagnose. */
function reportNoProject(project: string | undefined, json: boolean): void {
  const checks: Check[] = [
    {
      name: 'Project',
      status: 'fail',
      detail: project ? `unknown project "${project}"` : 'no active project',
      remedy: 'wavegrid init <name>   (or `wavegrid use <name>`)'
    },
    checkEnvHijack(process.env)
  ];
  if (json) {
    console.log(JSON.stringify({ checks, overall: overallStatus(checks), server: null }, null, 2));
  } else {
    console.log('');
    console.log(c.bold('  Wavegrid · doctor'));
    console.log('');
    for (const check of checks) renderCheck(check);
    console.log('');
    console.log(`  Result: ${c.red('problems found')}`);
    console.log('');
  }
  process.exitCode = 1;
}

/** `wavegrid doctor [--project name] [--server ws://host:port] [--json]` */
export async function runDoctor(flags: Flags = {}, cwd = process.cwd()): Promise<void> {
  const store = getStore();
  const explicit = (typeof flags.project === 'string' ? flags.project : undefined) ?? process.env.WAVEGRID_PROJECT;
  const project = explicit ?? store.getActiveProject() ?? undefined;
  if (!project || !store.hasProject(project)) {
    reportNoProject(project, Boolean(flags.json));
    return;
  }
  if (store.getActiveProject() !== project) store.setActiveProject(project);

  const resolved = loadWavegridConfig({ cwd });
  const serverUrl = (typeof flags.server === 'string' ? flags.server : undefined) ?? process.env.SIMULATOR_URL;
  const diag = await collectDiagnostics({ store, project, resolved, serverUrl });

  if (flags.json) {
    console.log(JSON.stringify(diag, null, 2));
    process.exitCode = diag.overall === 'fail' ? 1 : 0;
    return;
  }

  console.log('');
  console.log(c.bold('  Wavegrid · doctor'));
  console.log('');
  console.log(c.bold('  Local'));
  for (const check of diag.checks) renderCheck(check);

  renderDevices(diag);
  renderSync(diag);

  if (diag.server) {
    renderSystem(diag.server);
    renderNetwork(
      await probeNetwork({
        bindHost: diag.server.server.host,
        port: diag.server.server.port,
        visitors: diag.server.lanVisitors
      })
    );
  } else if (diag.serverError === 'not-running') {
    console.log('');
    console.log(c.gray(`  Server not running at ${diag.serverUrl} (start it with \`wavegrid start\`).`));
  } else if (diag.serverError === 'unauthorized') {
    console.log('');
    console.log(c.red(`  ✗ Server at ${diag.serverUrl} rejected our receiverKey (401).`));
    console.log(`      ${c.gray('↳ this laptop\'s receiverKey must match the server\'s — re-sync via `wavegrid env export`')}`);
  } else if (diag.serverError) {
    console.log('');
    console.log(c.yellow(`  ! Could not read system status from ${diag.serverUrl} (${diag.serverError}).`));
  }

  console.log('');
  const label = diag.overall === 'pass' ? c.green('healthy') : diag.overall === 'warn' ? c.yellow('warnings') : c.red('problems found');
  console.log(`  Result: ${label}`);
  console.log('');
  process.exitCode = diag.overall === 'fail' ? 1 : 0;
}
