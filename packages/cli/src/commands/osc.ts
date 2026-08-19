import {
  DEFAULT_BEYOND_PORT,
  DEFAULT_FB4_PORT,
  LOOPBACK_HOST,
  normalizeOscHost,
  type OscConfig,
  type WavegridConfig
} from '@wavegrid/layout';
import type { Inquirerer, Question } from 'inquirerer';
import c from 'yanse';

import { type Flags, getStore, resolveProjectName } from '../project';

/** Describe the currently-configured OSC target in one line. */
function describe(osc: OscConfig | undefined): string {
  if (osc?.beyond) return `BEYOND → ${osc.beyond.host}:${osc.beyond.port} (${osc.beyond.gridOrder})`;
  if (osc?.fb4) return `FB4 → ${osc.fb4.host}:${osc.fb4.port}`;
  if (osc?.routingConfig) return `routing file → ${osc.routingConfig}`;
  return 'none (console only — no lasers)';
}

function save(flags: Flags, mutate: (config: Partial<WavegridConfig>) => void): string {
  const store = getStore();
  const project = resolveProjectName(store, flags);
  const config = store.getProjectConfig(project) ?? {};
  mutate(config);
  store.saveProjectConfig(project, config);
  return project;
}

function confirm(project: string, osc: OscConfig | undefined): void {
  console.log('');
  console.log(c.green(`  ✓ ${project}: OSC target → ${describe(osc)}`));
  console.log(c.gray('  Run `wavegrid doctor` to verify, then `wavegrid start` to drive the hardware.'));
  console.log('');
}

const USAGE = [
  '  Usage:',
  '    wavegrid projects osc                      (interactive wizard)',
  `    wavegrid projects osc beyond --host <ip> [--port ${DEFAULT_BEYOND_PORT}] [--grid-order row|column]`,
  `    wavegrid projects osc fb4 --host <ip> [--port ${DEFAULT_FB4_PORT}]`,
  '    wavegrid projects osc routing --file <path-to-routing.json>',
  '    wavegrid projects osc show',
  '    wavegrid projects osc clear'
].join('\n');

function str(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function num(flags: Flags, key: string): number | undefined {
  const v = flags[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Non-interactive setters (no TTY / scripted). Return true on success. */
function applyFromFlags(flags: Flags, kind: string): boolean {
  if (kind === 'beyond') {
    const host = normalizeOscHost(str(flags, 'host') ?? '');
    if (!host) return false;
    const port = num(flags, 'port') ?? DEFAULT_BEYOND_PORT;
    const gridOrder = str(flags, 'grid-order') === 'column' ? 'column' : 'row';
    const project = save(flags, (config) => {
      config.osc = { beyond: { host, port, gridOrder } };
    });
    confirm(project, { beyond: { host, port, gridOrder } });
    return true;
  }
  if (kind === 'fb4') {
    const host = normalizeOscHost(str(flags, 'host') ?? '');
    if (!host) return false;
    const port = num(flags, 'port') ?? DEFAULT_FB4_PORT;
    const project = save(flags, (config) => {
      config.osc = { fb4: { host, port } };
    });
    confirm(project, { fb4: { host, port } });
    return true;
  }
  if (kind === 'routing') {
    const file = str(flags, 'file') ?? str(flags, 'routing');
    if (!file) return false;
    const project = save(flags, (config) => {
      config.osc = { routingConfig: file };
    });
    confirm(project, { routingConfig: file });
    return true;
  }
  return false;
}

async function wizardBeyond(prompter: Inquirerer, current?: OscConfig): Promise<OscConfig> {
  const answers = (await prompter.prompt({}, [
    {
      type: 'text',
      name: 'host',
      message: `BEYOND host \u2014 ${LOOPBACK_HOST} for this machine, or the LAN IP of the PC running BEYOND`,
      default: current?.beyond?.host ?? LOOPBACK_HOST,
      required: true
    } as Question,
    {
      type: 'number',
      name: 'port',
      message: 'BEYOND OSC port',
      default: current?.beyond?.port ?? DEFAULT_BEYOND_PORT,
      required: true
    } as Question,
    {
      type: 'list',
      name: 'gridOrder',
      message: 'Grid wiring order (how BEYOND enumerates the fixtures)',
      options: ['row', 'column'],
      default: current?.beyond?.gridOrder ?? 'row',
      required: true
    } as Question
  ])) as unknown as { host: string; port: number; gridOrder: 'row' | 'column' };
  return {
    beyond: {
      host: normalizeOscHost(answers.host),
      port: Number(answers.port),
      gridOrder: answers.gridOrder
    }
  };
}

async function wizardFb4(prompter: Inquirerer, current?: OscConfig): Promise<OscConfig> {
  const answers = (await prompter.prompt({}, [
    { type: 'text', name: 'host', message: 'FB4 host', default: current?.fb4?.host, required: true } as Question,
    { type: 'number', name: 'port', message: 'FB4 OSC port', default: current?.fb4?.port ?? 8000, required: true } as Question
  ])) as unknown as { host: string; port: number };
  return { fb4: { host: normalizeOscHost(answers.host), port: Number(answers.port) } };
}

async function wizardRouting(prompter: Inquirerer, current?: OscConfig): Promise<OscConfig> {
  const answer = (await prompter.prompt({}, [
    {
      type: 'text',
      name: 'file',
      message: 'Absolute path to the routing JSON file',
      default: current?.routingConfig,
      required: true
    } as Question
  ])) as unknown as { file: string };
  return { routingConfig: answer.file.trim() };
}

/**
 * `wavegrid projects osc [beyond|fb4|routing|show|clear]` — set the receiver's
 * OSC output target. Bare (interactive) launches a guided wizard that walks you
 * through picking BEYOND / FB4 / a routing file; with no TTY it is flag-driven
 * (see USAGE). This is the supported way to point Wavegrid at real hardware.
 */
export async function runOscSetup(
  action: string | undefined,
  flags: Flags = {},
  prompter?: Inquirerer
): Promise<void> {
  const store = getStore();
  const project = resolveProjectName(store, flags);
  const current = (store.getProjectConfig(project)?.osc ?? {}) as OscConfig;

  if (action === 'show') {
    console.log('');
    console.log(`  ${c.bold(project)} OSC target: ${describe(current)}`);
    console.log('');
    return;
  }

  if (action === 'clear' || action === 'none') {
    const p = save(flags, (config) => {
      config.osc = {};
    });
    confirm(p, {});
    return;
  }

  // Non-interactive path: a concrete kind + flags, or no TTY.
  if (!prompter) {
    if (action && applyFromFlags(flags, action)) return;
    console.log('');
    console.log(c.bold(`  ${project}`) + c.gray(` — current OSC target: ${describe(current)}`));
    console.log('');
    console.log(USAGE);
    process.exitCode = action ? 1 : 0;
    return;
  }

  // If a kind came with all needed flags, honor it even interactively.
  if (action && applyFromFlags(flags, action)) return;

  let kind = action;
  if (!kind || !['beyond', 'fb4', 'routing'].includes(kind)) {
    console.log('');
    console.log(c.gray(`  Current OSC target: ${describe(current)}`));
    const answer = (await prompter.prompt({}, [
      {
        type: 'list',
        name: 'kind',
        message: 'How should this project drive lasers?',
        options: [
          { name: `${c.cyan('BEYOND'.padEnd(8))} ${c.gray('Pangolin BEYOND over OSC (most common)')}`, value: 'beyond' },
          { name: `${c.cyan('FB4'.padEnd(8))} ${c.gray('Pangolin FB4 over OSC')}`, value: 'fb4' },
          { name: `${c.cyan('routing'.padEnd(8))} ${c.gray('Multi-target routing JSON file')}`, value: 'routing' },
          { name: `${c.cyan('none'.padEnd(8))} ${c.gray('Console only — no hardware')}`, value: 'none' }
        ],
        required: true
      } as Question
    ])) as unknown as { kind: string };
    kind = answer.kind;
  }

  if (kind === 'none') {
    const p = save(flags, (config) => {
      config.osc = {};
    });
    confirm(p, {});
    return;
  }

  let osc: OscConfig;
  if (kind === 'fb4') osc = await wizardFb4(prompter, current);
  else if (kind === 'routing') osc = await wizardRouting(prompter, current);
  else osc = await wizardBeyond(prompter, current);

  const p = save(flags, (config) => {
    config.osc = osc;
  });
  confirm(p, osc);
}
