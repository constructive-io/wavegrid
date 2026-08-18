import { Inquirerer } from 'inquirerer';
import c from 'yanse';

import { runConfigSet } from './commands/config-set';
import { runDevicesAssign, runDevicesList, runDevicesRemove, runDevicesRename } from './commands/devices';
import { runDoctor } from './commands/doctor';
import { runEnvExport } from './commands/env';
import { runInit } from './commands/init';
import { runKeysEnabled, runKeysList, runKeysNew, runKeysRemove } from './commands/keys';
import { pickCommand, pickSubcommand, printSubcommands, type SubCommand } from './commands/menu';
import { runOscSetup } from './commands/osc';
import {
  runSignalsListen,
  runSignalsProbe,
  runSignalsSend,
  SIGNALS_USAGE
} from './commands/osc-signals';
import { runPrintConfig } from './commands/print-config';
import { runProjectsExport, runProjectsImport } from './commands/project-io';
import { runProjects, runUse } from './commands/projects';
import { runReceiver } from './commands/receiver';
import { runSettingsClear } from './commands/reset';
import {
  printRoutingUsage,
  runRoutingClear,
  runRoutingGenerate,
  runRoutingImport,
  runRoutingShow
} from './commands/routing';
import { runSecretsInit, runSecretsList } from './commands/secrets';
import { runServer } from './commands/server';
import { runSettingsEnvironment, runSettingsInitialize } from './commands/settings';
import { runStart } from './commands/start';
import { runUsersAdd, runUsersList, runUsersRemove } from './commands/users';
import type { Flags } from './project';

const VERSION = 'wavegrid-cli@0.5.0';

const HELP = `
${c.bold('wavegrid')} — config-driven laser installation launcher

${c.bold('Usage')}
  wavegrid <command> [subcommand] [options]

${c.bold('Projects')} — manage and edit projects
  projects list                 List projects in the store
  projects create [name]        Create a project (generates secrets once)
  projects use <name>           Set the active project
  projects config               Print the resolved config + provenance
  projects config set <k> <v>   Set a field (layout, mode, port, host, ui-port)
  projects secrets list|init    List / generate the project's secrets
  projects users list|add|rm    Manage UI login users
  projects keys ls|new|rm       Named access keys (per-person or shared passphrases)
  projects devices list|assign  List / name / shard-assign devices that joined
  projects osc                  Set the OSC laser target (BEYOND/FB4) — wizard
  projects routing show|gen     One global routing spec → per-device configs
  projects export [--out f]     Write a portable project bundle
  projects import <file>        Restore a project from a bundle
  projects env export           Write a .env for the project

${c.bold('Settings')} — global store
  settings environment          Show the store location + environment
  settings initialize           Create/ensure the global store scaffold
  settings clear                Wipe the whole store — every project (confirm required)

${c.bold('Run')}
  start                         Run the active project — server + UI + receiver (one laptop)
  server                        Run the brain only — server + UI + API + WebSocket (no receiver)
  receiver                      Run a receiver only — connects to a brain, drives its shard
  doctor                        Diagnose this laptop + the whole installation

${c.bold('Signals')} — hand-driven OSC for debugging Pangolin
  signals send <addr> [args]    Send one OSC message to the configured target
  signals probe [--zones 0-11]  Light one zone/fixture at a time, to find the mapping
  signals listen [--port 7001]  Print every OSC message arriving on a port

${c.bold('Receiver options')}
  --server <ws-url>   Brain to connect to (e.g. ws://192.168.1.42:3333)
  --shard <a-b>       Cannon range this receiver drives (e.g. 0-24)
  --no-p2p            Don't self-promote to a brain when none is found on the LAN

${c.bold('Options')}
  --project <name>    Act on a specific project (else the active one)
  --print-config      Print the resolved config and exit
  -h, --help          Show this help
  -v, --version       Show version

${c.gray('Shortcuts: `init`, `config`, `secrets`, `users`, `devices`, `env` work as aliases for the `projects …` forms.')}
`;

/** Top-level menu (bare `wavegrid`). */
const COMMANDS: SubCommand[] = [
  { value: 'projects', description: 'Manage projects: list, create, use, config, secrets, users, env' },
  { value: 'settings', description: 'Global store: environment, initialize, clear all' },
  { value: 'start', description: 'Run the active project — server + UI + receiver (one laptop)' },
  { value: 'server', description: 'Run the brain only — server + UI + API + WebSocket (no receiver)' },
  { value: 'receiver', description: 'Run a receiver only — connects to a brain, drives its shard' },
  { value: 'doctor', description: 'Diagnose this laptop + the whole installation' },
  { value: 'signals', description: 'Hand-driven OSC: send one message, probe zones, listen to a port' }
];

const SIGNALS_SUBS: SubCommand[] = [
  { value: 'send', description: 'Send one OSC message to the configured target (or --host/--port)' },
  { value: 'probe', description: 'Light one zone/fixture at a time to find which laser is which' },
  { value: 'listen', description: 'Print every OSC message arriving on a port' }
];

const PROJECTS_SUBS: SubCommand[] = [
  { value: 'list', description: 'List projects in the store' },
  { value: 'create', description: 'Create a project (generates secrets once)' },
  { value: 'use', description: 'Set the active project' },
  { value: 'config', description: 'Print or set the project config' },
  { value: 'secrets', description: 'List or generate the project secrets' },
  { value: 'users', description: 'List, add, or remove UI login users' },
  { value: 'keys', description: 'Named access keys — a passphrase per person, or one shared with a crowd' },
  { value: 'devices', description: 'List, rename, or forget devices that joined the project' },
  { value: 'osc', description: 'Set the OSC laser target (BEYOND/FB4/routing) — interactive wizard' },
  { value: 'routing', description: 'One global routing spec; each laptop\'s config is generated from it' },
  { value: 'export', description: 'Write a portable project bundle (no machine identity)' },
  { value: 'import', description: 'Restore a project from a portable bundle' },
  { value: 'env', description: 'Write a .env for the project' }
];

const SETTINGS_SUBS: SubCommand[] = [
  { value: 'environment', description: 'Show the store location + environment' },
  { value: 'initialize', description: 'Create/ensure the global store scaffold' },
  { value: 'clear', description: 'Clear all — wipe every project, secret and key (irreversible)' }
];

const CONFIG_SUBS: SubCommand[] = [
  { value: 'show', description: 'Print the resolved config + provenance (secrets masked)' },
  { value: 'set', description: 'Set a field: layout, mode, port, host, ui-port' }
];

const SECRETS_SUBS: SubCommand[] = [
  { value: 'list', description: 'List required secrets and whether each is set' },
  { value: 'init', description: 'Generate any missing secrets (--force to rotate)' }
];

const USERS_SUBS: SubCommand[] = [
  { value: 'list', description: 'List UI login users for the current project' },
  { value: 'add', description: 'Add/replace a UI login user (password prompted)' },
  { value: 'rm', description: 'Remove a UI login user' }
];

const KEYS_SUBS: SubCommand[] = [
  { value: 'ls', description: 'List access keys with role, state and last use' },
  { value: 'new', description: 'Mint a key (passphrase printed once) — add --admin for an admin key' },
  { value: 'enable', description: 'Enable a key' },
  { value: 'disable', description: 'Disable a key (passphrase kept)' },
  { value: 'rm', description: 'Revoke a key, or --all to revoke every key' }
];

const ROUTING_SUBS: SubCommand[] = [
  { value: 'show', description: 'The unified spec, and what each device would be given' },
  { value: 'import', description: 'Adopt a global routing JSON as the unified spec' },
  { value: 'generate', description: 'Write the per-device routing files (--device for one)' },
  { value: 'clear', description: 'Forget the unified spec' }
];

const DEVICES_SUBS: SubCommand[] = [
  { value: 'list', description: 'List devices that have joined the project' },
  { value: 'rename', description: 'Give a device a project-specific friendly name' },
  { value: 'assign', description: 'Assign a device its shard (cannon range) for the show' },
  { value: 'rm', description: 'Forget a device from the project registry' }
];

export interface ParsedArgs {
  command?: string;
  positionals: string[];
  flags: Flags;
}

/**
 * Minimal argv parser: bare tokens are positionals (first is the command),
 * `--key value` / `--flag` become flags. Kept dependency-free so the CLI
 * stays small.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Flags = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('-')) {
        flags[key] = coerce(next);
        i++;
      } else {
        flags[key] = true;
      }
    } else if (tok.startsWith('-')) {
      for (const ch of tok.slice(1)) flags[ch] = true;
    } else {
      positionals.push(tok);
    }
  }
  return { command: positionals[0], positionals, flags };
}

function coerce(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

const KNOWN_COMMANDS = [
  'init',
  'start',
  'server',
  'receiver',
  'projects',
  'settings',
  'config',
  'print-config',
  'secrets',
  'users',
  'keys',
  'devices',
  'env',
  'doctor',
  'signals'
];

/**
 * Resolve a command-group subcommand: use the one given on the CLI, else prompt
 * a menu (interactive), else print the subcommand list (no TTY). The passed
 * prompter is the shared one for the whole run — a follow-up action prompt
 * (e.g. `users add`) reuses it rather than opening a second Inquirerer, which
 * would leave stdin in a bad state and hang.
 */
async function resolveSub(
  given: string | undefined,
  group: string,
  subs: SubCommand[],
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<string | null> {
  if (given != null) return given;
  const chosen = await pickSubcommand(nonInteractive ? undefined : prompter, group, subs);
  if (chosen == null) printSubcommands(group, subs);
  return chosen;
}

function unknownSub(group: string, sub: string): void {
  console.log(c.red(`Unknown ${group} subcommand: ${sub}`));
  process.exitCode = 1;
}

// ── Per-group dispatchers ─────────────────────────────────────────────────
// Each takes the positionals *after* its group token, so the same dispatcher
// serves both the grouped form (`projects config set …`) and the top-level
// alias (`config set …`).

async function dispatchConfig(
  args: string[],
  flags: Flags,
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<void> {
  // Scripts running bare `config` still get the config printed (safe default).
  let given = args[0];
  if (given == null && nonInteractive) given = 'show';
  const sub = (await resolveSub(given, 'config', CONFIG_SUBS, prompter, nonInteractive)) ?? undefined;
  if (sub == null) return;
  if (sub === 'set') {
    await runConfigSet(args[1], args[2], flags, nonInteractive ? undefined : prompter);
  } else if (sub === 'show' || sub === 'print') {
    runPrintConfig(process.cwd(), flags);
  } else unknownSub('config', sub);
}

async function dispatchSecrets(
  args: string[],
  flags: Flags,
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<void> {
  const sub = (await resolveSub(args[0], 'secrets', SECRETS_SUBS, prompter, nonInteractive)) ?? undefined;
  if (sub == null) return;
  if (sub === 'init') runSecretsInit(flags);
  else if (sub === 'list') runSecretsList(flags);
  else unknownSub('secrets', sub);
}

async function dispatchUsers(
  args: string[],
  flags: Flags,
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<void> {
  const sub = (await resolveSub(args[0], 'users', USERS_SUBS, prompter, nonInteractive)) ?? undefined;
  if (sub == null) return;
  if (sub === 'add') await runUsersAdd(flags, args[1], prompter);
  else if (sub === 'rm' || sub === 'remove') {
    await runUsersRemove(flags, args[1], nonInteractive ? undefined : prompter);
  } else if (sub === 'list') runUsersList(flags);
  else unknownSub('users', sub);
}

async function dispatchKeys(
  args: string[],
  flags: Flags,
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<void> {
  // Bare `keys` in a script lists them (safe, read-only default).
  let given = args[0];
  if (given == null && nonInteractive) given = 'ls';
  const sub = (await resolveSub(given, 'keys', KEYS_SUBS, prompter, nonInteractive)) ?? undefined;
  if (sub == null) return;
  if (sub === 'ls' || sub === 'list') runKeysList(flags);
  else if (sub === 'new' || sub === 'add' || sub === 'mint') runKeysNew(flags, args[1]);
  else if (sub === 'enable' || sub === 'on') runKeysEnabled(flags, args[1], true);
  else if (sub === 'disable' || sub === 'off') runKeysEnabled(flags, args[1], false);
  else if (sub === 'rm' || sub === 'remove' || sub === 'revoke') runKeysRemove(flags, args[1]);
  else unknownSub('keys', sub);
}

async function dispatchRouting(
  args: string[],
  flags: Flags,
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<void> {
  // Bare `routing` in a script shows the spec (read-only default).
  let given = args[0];
  if (given == null && nonInteractive) given = 'show';
  const sub = (await resolveSub(given, 'routing', ROUTING_SUBS, prompter, nonInteractive)) ?? undefined;
  if (sub == null) return;
  if (sub === 'show' || sub === 'ls' || sub === 'list') runRoutingShow(flags);
  else if (sub === 'import' || sub === 'adopt') runRoutingImport(flags, args[1]);
  else if (sub === 'generate' || sub === 'gen') runRoutingGenerate(flags);
  else if (sub === 'clear' || sub === 'rm') runRoutingClear(flags);
  else if (sub === 'help') printRoutingUsage();
  else unknownSub('routing', sub);
}

async function dispatchDevices(
  args: string[],
  flags: Flags,
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<void> {
  const sub = (await resolveSub(args[0], 'devices', DEVICES_SUBS, prompter, nonInteractive)) ?? undefined;
  if (sub == null) return;
  if (sub === 'list') runDevicesList(flags);
  else if (sub === 'rename' || sub === 'name') {
    await runDevicesRename(flags, args[1], args[2], nonInteractive ? undefined : prompter);
  } else if (sub === 'assign' || sub === 'shard') {
    await runDevicesAssign(flags, args[1], args[2], nonInteractive ? undefined : prompter);
  } else if (sub === 'rm' || sub === 'remove' || sub === 'forget') {
    await runDevicesRemove(flags, args[1], nonInteractive ? undefined : prompter);
  } else unknownSub('devices', sub);
}

async function dispatchSignals(
  args: string[],
  flags: Flags,
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<void> {
  const sub = (await resolveSub(args[0], 'signals', SIGNALS_SUBS, prompter, nonInteractive)) ?? undefined;
  if (sub == null) return;
  if (sub === 'send') await runSignalsSend(args.slice(1), flags);
  else if (sub === 'probe' || sub === 'walk') await runSignalsProbe(flags);
  else if (sub === 'listen' || sub === 'watch') await runSignalsListen(flags);
  else if (sub === 'help') console.log(SIGNALS_USAGE);
  else unknownSub('signals', sub);
}

function dispatchEnv(args: string[], flags: Flags): void {
  const sub = args[0];
  // `env` has a single action (export); a bare `env` runs it deliberately.
  if (sub === 'export' || sub == null) runEnvExport(flags);
  else unknownSub('env', sub);
}

async function dispatchSettings(
  args: string[],
  flags: Flags,
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<void> {
  const sub = (await resolveSub(args[0], 'settings', SETTINGS_SUBS, prompter, nonInteractive)) ?? undefined;
  if (sub == null) return;
  if (sub === 'environment' || sub === 'env') runSettingsEnvironment();
  else if (sub === 'initialize' || sub === 'init') runSettingsInitialize();
  else if (sub === 'clear' || sub === 'reset') {
    await runSettingsClear(flags, nonInteractive ? undefined : prompter);
  } else unknownSub('settings', sub);
}

async function dispatchProjects(
  args: string[],
  flags: Flags,
  prompter: Inquirerer,
  nonInteractive: boolean
): Promise<void> {
  const sub = (await resolveSub(args[0], 'projects', PROJECTS_SUBS, prompter, nonInteractive)) ?? undefined;
  if (sub == null) return;
  const rest = args.slice(1);
  switch (sub) {
  case 'list':
    runProjects();
    break;
  case 'create':
  case 'add':
    if (rest[0]) flags.project = rest[0];
    await runInit(flags, prompter);
    break;
  case 'use':
  case 'set':
    await runUse(rest[0], nonInteractive ? undefined : prompter);
    break;
  case 'config':
    await dispatchConfig(rest, flags, prompter, nonInteractive);
    break;
  case 'secrets':
    await dispatchSecrets(rest, flags, prompter, nonInteractive);
    break;
  case 'users':
    await dispatchUsers(rest, flags, prompter, nonInteractive);
    break;
  case 'keys':
    await dispatchKeys(rest, flags, prompter, nonInteractive);
    break;
  case 'devices':
    await dispatchDevices(rest, flags, prompter, nonInteractive);
    break;
  case 'osc':
    await runOscSetup(rest[0], flags, nonInteractive ? undefined : prompter);
    break;
  case 'routing':
    await dispatchRouting(rest, flags, prompter, nonInteractive);
    break;
  case 'export':
    runProjectsExport(flags);
    break;
  case 'import':
    runProjectsImport(flags, rest[0]);
    break;
  case 'env':
    dispatchEnv(rest, flags);
    break;
  default:
    unknownSub('projects', sub);
  }
}

export async function run(argvInput: string[] = process.argv.slice(2)): Promise<void> {
  const { command: given, positionals, flags } = parseArgs(argvInput);

  if (flags.version || flags.v) {
    console.log(VERSION);
    return;
  }
  if (flags['print-config']) {
    runPrintConfig(process.cwd(), flags);
    return;
  }

  const showHelp = flags.help || flags.h;
  // Explicit help, or an unknown command with --help, just prints usage.
  if (showHelp && (!given || !KNOWN_COMMANDS.includes(given))) {
    console.log(HELP);
    return;
  }

  // One prompter for the whole run: a top-level menu chains into a command's
  // own prompts on the SAME instance (closing + reopening hangs stdin).
  const nonInteractive = !process.stdin.isTTY;
  const prompter = new Inquirerer({ noTty: nonInteractive, useDefaults: nonInteractive });
  // `start` runs a long-lived server; leave its interactive prompter attached
  // (closing it mid-run interferes with Ctrl-C handling of the running server).
  let keepOpen = false;

  try {
    let command = given;
    if (!command) {
      // Bare `wavegrid`: interactive menu, or usage when there's no TTY.
      if (nonInteractive) {
        console.log(HELP);
        return;
      }
      command = (await pickCommand(prompter, COMMANDS)) ?? undefined;
      if (!command) {
        console.log(HELP);
        return;
      }
    }

    switch (command) {
    // `init` is a shortcut alias for `projects create`.
    case 'init': {
      if (positionals[1]) flags.project = positionals[1];
      await runInit(flags, prompter);
      break;
    }
    case 'start': {
      keepOpen = !nonInteractive;
      await runStart({ flags, prompter: nonInteractive ? undefined : prompter });
      break;
    }
    case 'server': {
      keepOpen = !nonInteractive;
      await runServer({ flags, prompter: nonInteractive ? undefined : prompter });
      break;
    }
    case 'receiver': {
      keepOpen = !nonInteractive;
      await runReceiver({ flags, prompter: nonInteractive ? undefined : prompter });
      break;
    }
    case 'projects':
      await dispatchProjects(positionals.slice(1), flags, prompter, nonInteractive);
      break;
    case 'settings':
      await dispatchSettings(positionals.slice(1), flags, prompter, nonInteractive);
      break;
    case 'print-config':
      runPrintConfig(process.cwd(), flags);
      break;
    case 'config':
      await dispatchConfig(positionals.slice(1), flags, prompter, nonInteractive);
      break;
    case 'secrets':
      await dispatchSecrets(positionals.slice(1), flags, prompter, nonInteractive);
      break;
    case 'users':
      await dispatchUsers(positionals.slice(1), flags, prompter, nonInteractive);
      break;
    case 'keys':
      await dispatchKeys(positionals.slice(1), flags, prompter, nonInteractive);
      break;
    case 'devices':
      await dispatchDevices(positionals.slice(1), flags, prompter, nonInteractive);
      break;
    case 'env':
      dispatchEnv(positionals.slice(1), flags);
      break;
    case 'doctor':
      await runDoctor(flags);
      break;
    case 'signals':
      // `listen` runs until Ctrl-C; keep the prompter attached so the signal
      // handling isn't fighting a half-closed stdin.
      keepOpen = !nonInteractive && positionals[1] === 'listen';
      await dispatchSignals(positionals.slice(1), flags, prompter, nonInteractive);
      break;
    default:
      console.log(c.red(`Unknown command: ${command}`));
      console.log(HELP);
      process.exitCode = 1;
    }
  } finally {
    if (!keepOpen) prompter.close();
  }
}
