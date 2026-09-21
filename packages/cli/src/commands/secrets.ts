import { SECRET_NAMES, type SecretName } from '@wavegrid/settings';
import type { Inquirerer } from 'inquirerer';
import c from 'yanse';

import { type Flags, getStore, resolveProjectName } from '../project';

/**
 * `wavegrid secrets list` — report every secret the current project requires
 * and whether it is set. Values are NEVER printed.
 */
export function runSecretsList(flags: Flags): void {
  const store = getStore();
  const project = resolveProjectName(store, flags);
  const required = store.requiredSecrets(project);

  console.log('');
  console.log(c.bold(`  Required secrets · ${project}`));
  for (const s of required) {
    const status = s.set ? c.green('set') : c.red('NOT SET');
    console.log(`  ${s.set ? c.green('✓') : c.red('✗')} ${s.name}  ${c.gray(`[${status}]`)}`);
    console.log(`      ${c.gray(s.description)}`);
  }
  const missing = required.filter((s) => !s.set);
  console.log('');
  if (missing.length) {
    console.log(c.yellow(`  ${missing.length} missing — run \`wavegrid secrets init\` to generate.`));
    console.log('');
  }
}

/**
 * `wavegrid secrets init` — generate any missing secrets (one-time). `--force`
 * rotates existing secrets. Values are never printed.
 */
export function runSecretsInit(flags: Flags): void {
  const store = getStore();
  const project = resolveProjectName(store, flags);
  const force = Boolean(flags.force);
  const result = store.generateSecrets(project, { force });

  console.log('');
  console.log(c.bold(`  Secrets · ${project}`));
  if (result.generated.length) {
    console.log(`  ${c.green('✓')} ${force ? 'rotated' : 'generated'}: ${result.generated.join(', ')}`);
  }
  if (result.kept.length) {
    console.log(`  ${c.gray('•')} kept: ${result.kept.join(', ')}`);
  }
  if (!result.generated.length && !result.kept.length) {
    console.log(c.gray('  (nothing to do)'));
  }
  console.log('');
}

export async function runSecretsSet(args: string[], flags: Flags, prompter?: Inquirerer): Promise<void> {
  const name = args[0];
  if (!name || !SECRET_NAMES.includes(name as SecretName)) {
    console.log(c.red(`  Unknown secret "${name ?? ''}". Valid names: ${SECRET_NAMES.join(', ')}`));
    process.exitCode = 1;
    return;
  }
  let value = args[1];
  if (value == null && prompter) {
    const answer = (await prompter.prompt({}, [{
      type: 'password',
      name: 'value',
      message: `Value for ${name}`,
      required: true
    }])) as unknown as { value: unknown };
    value = String(answer.value ?? '');
  }
  if (value == null || value.trim() === '') {
    console.log(c.red('  Missing secret value.'));
    process.exitCode = 1;
    return;
  }
  const store = getStore();
  const project = resolveProjectName(store, flags);
  store.setSecret(project, name as SecretName, value);
  console.log(`  ${c.green('✓')} ${name} set · ${project}`);
}
