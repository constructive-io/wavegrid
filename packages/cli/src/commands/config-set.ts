import { LAYOUT_SPEC_FORMS, parseLayoutSpec, resolveLayout, type WavegridConfig } from '@wavegrid/layout';
import type { Inquirerer, Question } from 'inquirerer';
import c from 'yanse';

import { knownPresets } from '../config-file';
import { type Flags, getStore, resolveProjectName } from '../project';

/** Settable config keys and how each maps into the stored project config. */
const SETTERS: Record<string, (config: Partial<WavegridConfig>, value: string) => void> = {
  layout: (config, value) => {
    // A preset id, or shorthand for a custom shape ("annulus:25@0.4").
    const spec = parseLayoutSpec(value);
    // Validate it actually resolves before persisting.
    resolveLayout(spec);
    config.layout = spec;
  },
  mode: (config, value) => {
    if (value !== 'auto' && value !== 'simple' && value !== 'distributed') {
      throw new Error(`Invalid mode "${value}". Use auto | simple | distributed.`);
    }
    config.mode = value;
  },
  port: (config, value) => {
    config.server = { ...config.server, port: intOrThrow('port', value) } as WavegridConfig['server'];
  },
  host: (config, value) => {
    config.server = { ...config.server, host: value } as WavegridConfig['server'];
  },
  'ui-port': (config, value) => {
    config.ui = { ...config.ui, port: intOrThrow('ui-port', value) } as WavegridConfig['ui'];
  },
  sync: (config, value) => {
    const on = boolOrThrow('sync', value);
    config.sync = { secrets: config.sync?.secrets ?? false, ...config.sync, enabled: on };
  }
};

// `preset` is an alias for `layout`.
SETTERS.preset = SETTERS.layout;

/** Canonical, user-facing keys (aliases like `preset` are accepted but hidden). */
const KEY_CHOICES = [
  { value: 'layout', description: 'Layout: a preset id or shorthand (grid/ring/annulus/rings)' },
  { value: 'mode', description: 'Run mode: auto | simple | distributed' },
  { value: 'port', description: 'Server port' },
  { value: 'host', description: 'Server host/bind address' },
  { value: 'ui-port', description: 'UI port' },
  { value: 'sync', description: 'Config sync across devices: true | false' }
];

function boolOrThrow(key: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === 'on' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === 'off' || v === '0' || v === 'no') return false;
  throw new Error(`${key} must be true or false, got "${value}".`);
}

function intOrThrow(key: string, value: string): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || String(n) !== value.trim()) {
    throw new Error(`${key} must be an integer, got "${value}".`);
  }
  return n;
}

/** Prompt for the value of a specific key, using the right input type. */
async function promptValue(prompter: Inquirerer, key: string): Promise<string> {
  let question: Question;
  if (key === 'layout' || key === 'preset') {
    question = {
      type: 'autocomplete',
      name: 'value',
      message: `Layout (preset, or ${LAYOUT_SPEC_FORMS.slice(1).join(' | ')})`,
      options: knownPresets(),
      required: true
    };
  } else if (key === 'mode') {
    question = { type: 'list', name: 'value', message: 'Run mode', options: ['auto', 'simple', 'distributed'], required: true };
  } else if (key === 'port' || key === 'ui-port') {
    question = { type: 'number', name: 'value', message: key === 'port' ? 'Server port' : 'UI port', required: true };
  } else if (key === 'sync') {
    question = { type: 'list', name: 'value', message: 'Config sync across devices', options: ['true', 'false'], required: true };
  } else {
    question = { type: 'text', name: 'value', message: 'Value', required: true };
  }
  const answer = (await prompter.prompt({}, [question])) as unknown as { value: unknown };
  return String(answer.value);
}

/**
 * `wavegrid config set [key] [value]` — update a single field in the active
 * (or `--project`) project's stored config. This is the supported way to
 * change layout/port/etc. after `init` without hand-editing the store JSON.
 * Missing key/value are prompted interactively; with no TTY, print usage.
 */
export async function runConfigSet(
  key: string | undefined,
  value: string | undefined,
  flags: Flags = {},
  prompter?: Inquirerer
): Promise<void> {
  let resolvedKey = key;
  if (!resolvedKey) {
    if (!prompter) {
      console.log(c.red(`  Usage: wavegrid config set <key> <value>`));
      console.log(`  Keys: ${c.cyan(KEY_CHOICES.map((k) => k.value).join(', '))}`);
      process.exitCode = 1;
      return;
    }
    const answer = (await prompter.prompt({}, [
      {
        // A fixed 5-item list: arrow-select is unambiguous (autocomplete
        // type-matching can mis-resolve short tokens like "mode"/"ui").
        type: 'list',
        name: 'key',
        message: 'Which field do you want to set?',
        options: KEY_CHOICES.map((k) => ({ name: `${c.cyan(k.value.padEnd(8))} ${c.gray(k.description)}`, value: k.value })),
        required: true
      }
    ])) as unknown as { key: string };
    resolvedKey = answer.key;
  }

  const setter = SETTERS[resolvedKey];
  if (!setter) {
    console.log(c.red(`  Unknown key "${resolvedKey}".`));
    console.log(`  Keys: ${c.cyan(KEY_CHOICES.map((k) => k.value).join(', '))}`);
    process.exitCode = 1;
    return;
  }

  let resolvedValue = value;
  if (resolvedValue == null || resolvedValue === '') {
    if (!prompter) {
      console.log(c.red(`  Missing value for "${resolvedKey}".`));
      process.exitCode = 1;
      return;
    }
    resolvedValue = await promptValue(prompter, resolvedKey);
  }

  const store = getStore();
  const project = resolveProjectName(store, flags);
  const config = store.getProjectConfig(project) ?? {};
  setter(config, resolvedValue);
  store.saveProjectConfig(project, config);

  console.log('');
  console.log(c.green(`  ✓ ${project}: set ${c.cyan(resolvedKey)} = ${c.cyan(resolvedValue)}`));
  console.log(c.gray(`  Run \`wavegrid config\` to see the resolved result.`));
  console.log('');
}
