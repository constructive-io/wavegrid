import { isProjectFile, PROJECT_FILE_EXTENSION } from '@wavegrid/settings';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import c from 'yanse';

import { type Flags, getStore, resolveProjectName } from '../project';

/**
 * `wavegrid projects open <file.wavegrid> [--name n] [--activate] [--overwrite]`
 *
 * Load a project file into the store. Re-running it on the same file refreshes
 * the project from the file (after a `git pull`, say); secrets, users and keys
 * stay as this machine has them.
 */
export function runProjectsOpen(flags: Flags, file: string | undefined): void {
  if (!file) {
    console.log(c.red(`  Usage: wavegrid projects open <file${PROJECT_FILE_EXTENSION}> [--name <name>] [--activate] [--overwrite]`));
    process.exitCode = 1;
    return;
  }
  const path = resolve(process.cwd(), file);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.log(c.red(`  Could not read/parse ${path}: ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }
  if (!isProjectFile(raw)) {
    console.log(c.red(`  ${path} is not a Wavegrid project file.`));
    console.log(c.gray('  For a bundle written by `wavegrid projects export`, use `wavegrid projects import`.'));
    process.exitCode = 1;
    return;
  }

  try {
    const store = getStore();
    const result = store.openProjectFile(path, raw, {
      name: typeof flags.name === 'string' ? flags.name : undefined,
      activate: flags.activate === true,
      overwrite: flags.overwrite === true
    });
    console.log('');
    console.log(c.green(`  ✓ ${result.created ? 'Opened' : 'Refreshed'} project ${c.bold(result.project)} from ${result.file}`));
    console.log(`  ${c.gray(`light maps: ${result.lightMapCount} · looks: ${result.lookCount} · devices: ${result.deviceCount}`)}`);
    if (result.generatedSecrets) {
      console.log(`  ${c.gray('Generated fresh secrets for this machine. Add UI users with `wavegrid projects users add`.')}`);
    }
    if (!result.created) {
      console.log(`  ${c.gray('A running show picks this up on its next start.')}`);
    }
    console.log('');
  } catch (err) {
    console.log(c.red(`  Open failed: ${(err as Error).message}`));
    process.exitCode = 1;
  }
}

/**
 * `wavegrid projects save [file] [--project p]`
 *
 * Write the project to its project file: the given path, else the file it was
 * opened from or last saved to.
 */
export function runProjectsSave(flags: Flags, file: string | undefined): void {
  try {
    const store = getStore();
    const project = resolveProjectName(store, flags);
    const target = file
      ? resolve(process.cwd(), file)
      : store.getProjectFileLink(project)?.path ?? resolve(process.cwd(), `${project}${PROJECT_FILE_EXTENSION}`);
    const result = store.saveProjectFile(project, { file: target });
    console.log('');
    console.log(c.green(`  ✓ Saved ${c.bold(project)} → ${result.file}`));
    for (const w of result.warnings) console.log(c.yellow(`  ⚠ ${w}`));
    console.log(`  ${c.gray('No secrets, users or keys are written — the file is safe to commit.')}`);
    console.log('');
  } catch (err) {
    console.log(c.red(`  Save failed: ${(err as Error).message}`));
    process.exitCode = 1;
  }
}
