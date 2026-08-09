import { loadWavegridConfig, type RunMode } from '@wavegrid/layout';
import type { Inquirerer, Question } from 'inquirerer';
import c from 'yanse';

import { findConfigFile } from '../config-file';
import { type Flags, getStore, resolveProjectName } from '../project';
import { applyReceiverEnv, applyServerEnv, awaitBind } from './runtime';

export interface StartOptions {
  cwd?: string;
  /** When true, resolve + print the plan but do not start anything (tests). */
  dryRun?: boolean;
  /** Parsed CLI flags (e.g. `--project`). */
  flags?: Flags;
  /** Interactive prompter for project selection; omitted in non-interactive runs. */
  prompter?: Inquirerer;
}

export interface ServiceSpec {
  label: string;
}

export interface StartResult {
  runMode: RunMode;
  services: ServiceSpec[];
  /** Stop every started service. No-op for a dry run. */
  stop: () => void;
}

/**
 * Which services the CLI runs. The CLI bakes in the server + receiver and runs
 * them in-process — no pnpm, no workspace checkout. The server now also serves
 * the UI + API on its own port (one origin), so there is no separate UI process
 * to launch. Distributed mode still runs the local pair; the receiver just
 * shards via the shard config.
 */
export function servicesForMode(mode: RunMode): ServiceSpec[] {
  return [
    { label: 'server' },
    { label: mode === 'distributed' ? 'receiver (shard)' : 'receiver' }
  ];
}

/**
 * Pick the project to run. An explicit `--project` / active project is used
 * directly; otherwise, when interactive and several projects exist, prompt with
 * a `list`. Selecting a project activates it so config + secrets resolve to it.
 */
async function selectProject(opts: StartOptions): Promise<string> {
  const store = getStore();
  const flags = opts.flags ?? {};

  const explicit =
    (typeof flags.project === 'string' ? flags.project : undefined) ?? process.env.WAVEGRID_PROJECT;

  if (!explicit && opts.prompter) {
    const projects = store.listProjects();
    if (projects.length > 1) {
      const answer = (await opts.prompter.prompt({}, [
        {
          type: 'list',
          name: 'project',
          message: 'Project to launch',
          options: projects,
          default: store.getActiveProject() ?? projects[0]
        } as Question
      ])) as unknown as { project: string };
      if (answer.project) return answer.project;
    }
  }

  return resolveProjectName(store, flags);
}

/**
 * `wavegrid start` — resolve the config and run the installation in-process.
 * The shape lives entirely in the config; there is no shape-specific code.
 */
export async function runStart(opts: StartOptions = {}): Promise<StartResult> {
  const cwd = opts.cwd ?? process.cwd();

  // Dry-run resolves config only (no store / secrets) — used by tests + tooling.
  if (opts.dryRun) {
    const resolved = loadWavegridConfig({ cwd });
    const runMode = resolved.runMode;
    const services = servicesForMode(runMode);
    printPlan(resolved, findConfigFile(cwd), runMode);
    return { runMode, services, stop: () => {} };
  }

  const store = getStore();
  const project = await selectProject(opts);
  if (store.getActiveProject() !== project) store.setActiveProject(project);

  const resolved = loadWavegridConfig({ cwd });
  const runMode = resolved.runMode;
  const services = servicesForMode(runMode);
  printPlan(resolved, findConfigFile(cwd), runMode, project);

  // Wire the store-authoritative secrets + per-project paths into the env the
  // in-process server and receiver read (see runtime.ts for the why).
  applyServerEnv(store, project, resolved);
  applyReceiverEnv(store, project, resolved);

  // Imported lazily so dry-run / config tooling never loads the runtime.
  const { startServer } = await import('@wavegrid/server');
  const { startReceiver } = await import('@wavegrid/receiver');

  const serverHandle = startServer(resolved);
  // The receiver dials in only once the port is actually bound.
  await awaitBind(serverHandle);
  const receiverHandle = startReceiver(resolved);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    receiverHandle.stop();
    serverHandle.stop();
  };

  const onSignal = () => {
    console.log('\n  Shutting down...');
    stop();
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  console.log('');
  console.log(`  ${c.green('▶')} server + receiver up.  ${c.gray('Ctrl-C stops everything.')}`);
  console.log(`  → UI: ${c.cyan(`http://localhost:${resolved.config.server.port}`)}`);
  console.log('');

  return { runMode, services, stop };
}

function printPlan(
  resolved: ReturnType<typeof loadWavegridConfig>,
  configPath: string | null,
  runMode: RunMode,
  project?: string
): void {
  console.log('');
  console.log(c.bold('  Wavegrid · start'));
  if (project) console.log(`  → Project:  ${c.cyan(project)}`);
  console.log(`  → Config:   ${configPath ? c.cyan(configPath) : c.gray('(store + defaults + env)')}`);
  console.log(`  → Layout:   ${c.cyan(resolved.layout.name)} (${resolved.layout.topology}, ${resolved.layout.count} cannons)`);
  console.log(`  → Run mode: ${c.cyan(runMode)}`);
  if (runMode === 'distributed') {
    console.log(c.yellow('  → Distributed: set receiver.shard per-laptop (SHARD_START / SHARD_END).'));
  }
  console.log('');
}
