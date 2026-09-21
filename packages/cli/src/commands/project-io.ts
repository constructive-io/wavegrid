import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import c from 'yanse';

import { type Flags, getStore, resolveProjectName } from '../project';

/**
 * `wavegrid projects export [--out file] [--include-secrets] [--no-users]`
 *
 * Writes a portable bundle: layout + config + every device's device-scoped
 * config + UI users. Machine-local identity and stale IPs never travel. Secrets
 * are excluded unless `--include-secrets` (they let another machine join the
 * SAME brain; the file is written 0600 and a warning is printed).
 */
export function runProjectsExport(flags: Flags): void {
  const store = getStore();
  const project = resolveProjectName(store, flags);

  const includeSecrets = flags['include-secrets'] === true;
  const includeUsers = flags.users !== false; // --no-users opts out
  const bundle = store.exportProject(project, { includeSecrets, includeUsers });

  const out = typeof flags.out === 'string' ? resolve(process.cwd(), flags.out) : resolve(process.cwd(), `${project}.wavegrid.json`);
  const json = JSON.stringify(bundle, null, 2) + '\n';

  if (flags.stdout === true) {
    process.stdout.write(json);
    return;
  }

  // Secrets in the file → owner-only perms.
  writeFileSync(out, json, includeSecrets ? { mode: 0o600 } : undefined);

  console.log('');
  console.log(c.green(`  ✓ Exported ${c.bold(project)} → ${out}`));
  console.log(`  ${c.gray(`devices: ${bundle.devices.length} · users: ${bundle.users?.length ?? 0}`)}`);
  if (includeSecrets) {
    console.log('');
    console.log(c.yellow('  ⚠ This file contains SECRETS (receiverKey/jwtSecret). Treat it like a password —'));
    console.log(c.yellow('    share only over a trusted channel; anyone with it can join this installation.'));
  } else {
    console.log(`  ${c.gray('No secrets included. On import, fresh secrets are generated — re-sync them with the brain,')}`);
    console.log(`  ${c.gray('or re-export with `--include-secrets` to carry the shared keys.')}`);
  }
  console.log('');
}

/**
 * `wavegrid projects import <file> [--name newname] [--activate] [--overwrite]`
 *
 * Restores a bundle into this store as a project. The importing machine keeps
 * its own machine-local identity and re-registers with its own IP, so two
 * laptops never collide just because they share a project.
 */
export function runProjectsImport(flags: Flags, file: string | undefined): void {
  if (!file) {
    console.log(c.red('  Usage: wavegrid projects import <file> [--name <name>] [--activate] [--overwrite]'));
    process.exitCode = 1;
    return;
  }
  const store = getStore();
  const path = resolve(process.cwd(), file);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.log(c.red(`  Could not read/parse ${path}: ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }

  try {
    const result = store.importProject(raw, {
      name: typeof flags.name === 'string' ? flags.name : undefined,
      activate: flags.activate === true,
      overwrite: flags.overwrite === true
    });
    console.log('');
    console.log(c.green(`  ✓ Imported project ${c.bold(result.project)}`));
    console.log(`  ${c.gray(`devices: ${result.deviceCount} · users: ${result.userCount}`)}`);
    if (result.keptLocalOsc) {
      console.log(`  ${c.gray('kept this machine’s OSC target — the bundle had none')}`);
    }
    if (result.generatedSecrets) {
      console.log('');
      console.log(c.yellow('  ⚠ The bundle had no secrets — fresh receiverKey/jwtSecret were generated.'));
      console.log(c.yellow('    This machine will NOT connect to the original brain until secrets match.'));
      console.log(`    ${c.gray('Re-export with `--include-secrets`, or copy secrets across via `wavegrid env export`.')}`);
    }
    console.log('');
  } catch (err) {
    console.log(c.red(`  Import failed: ${(err as Error).message}`));
    process.exitCode = 1;
  }
}
