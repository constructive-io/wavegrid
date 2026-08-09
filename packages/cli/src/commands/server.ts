/**
 * `wavegrid server` — run the brain only: server + UI + API + WebSocket on one
 * port, with NO local receiver. This is the host/brain laptop of a distributed
 * show; each receiver laptop runs `wavegrid receiver` and connects here.
 *
 * `wavegrid start` remains the fused one-laptop path (server + receiver in one
 * process). Splitting them out is the pay-as-you-go step for a bigger show.
 */
import { loadWavegridConfig } from '@wavegrid/layout';
import type { Inquirerer, Question } from 'inquirerer';
import c from 'yanse';

import { type Flags, getStore, resolveProjectName } from '../project';
import { applyServerEnv, awaitBind, printLanUrls } from './runtime';

export interface ServerOptions {
  cwd?: string;
  /** Resolve + print the plan but do not start anything (tests). */
  dryRun?: boolean;
  flags?: Flags;
  prompter?: Inquirerer;
}

export interface ServerResult {
  port: number;
  stop: () => void;
}

async function selectProject(opts: ServerOptions): Promise<string> {
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
          message: 'Project to serve',
          options: projects,
          default: store.getActiveProject() ?? projects[0]
        } as Question
      ])) as unknown as { project: string };
      if (answer.project) return answer.project;
    }
  }
  return resolveProjectName(store, flags);
}

export async function runServer(opts: ServerOptions = {}): Promise<ServerResult> {
  const cwd = opts.cwd ?? process.cwd();

  if (opts.dryRun) {
    const resolved = loadWavegridConfig({ cwd });
    printPlan(resolved);
    return { port: resolved.config.server.port, stop: () => {} };
  }

  const store = getStore();
  const project = await selectProject(opts);
  if (store.getActiveProject() !== project) store.setActiveProject(project);

  const resolved = loadWavegridConfig({ cwd });
  printPlan(resolved, project);

  applyServerEnv(store, project, resolved);

  const device = store.getDevice();
  const { startServer } = await import('@wavegrid/server');
  const serverHandle = startServer(resolved, {
    advertise: { project, deviceId: device.id, deviceName: device.name }
  });
  await awaitBind(serverHandle);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    serverHandle.stop();
  };

  const onSignal = () => {
    console.log('\n  Shutting down...');
    stop();
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const port = resolved.config.server.port;
  printLanUrls(port);
  console.log(`  ${c.green('▶')} brain up (server + UI + API + WebSocket).  ${c.gray('No local receiver — run `wavegrid receiver` on each laptop.')}`);
  console.log('');

  return { port, stop };
}

function printPlan(resolved: ReturnType<typeof loadWavegridConfig>, project?: string): void {
  console.log('');
  console.log(c.bold('  Wavegrid · server (brain only)'));
  if (project) console.log(`  → Project:  ${c.cyan(project)}`);
  console.log(`  → Layout:   ${c.cyan(resolved.layout.name)} (${resolved.layout.topology}, ${resolved.layout.count} cannons)`);
  console.log(`  → Port:     ${c.cyan(String(resolved.config.server.port))}`);
  console.log('');
}
