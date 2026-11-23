import { DEFAULT_CONFIG, resolveLayout } from '@wavegrid/layout';
import { resolveStations } from '@wavegrid/stations';
import c from 'yanse';

import { type Flags, getStore, resolveProjectName } from '../project';

function relative(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

/** `wavegrid keys ls` — every access key with its role, state and last use. */
export function runKeysList(flags: Flags): void {
  const store = getStore();
  const project = resolveProjectName(store, flags);
  const keys = store.listAccessKeys(project);

  console.log('');
  console.log(c.bold(`  Access keys · ${project}`));
  if (keys.length === 0) {
    console.log(c.gray('  None — mint one with `wavegrid keys new <name>`'));
  } else {
    for (const k of keys) {
      const state = k.enabled ? c.green('enabled ') : c.yellow('disabled');
      const used = k.lastUsedAt ? relative(k.lastUsedAt) : 'never used';
      console.log(`  ${state}  ${c.bold(k.name.padEnd(20))} ${k.role.padEnd(9)} ${c.gray(used)}${k.station ? ` · station ${k.station}` : ''}`);
    }
  }
  console.log('');
}

/**
 * `wavegrid keys new <name> [--admin]` — mint a key and print its passphrase
 * once. Only the hash is stored. Re-minting an existing name replaces it.
 */
export function runKeysNew(flags: Flags, name: string | undefined): void {
  const store = getStore();
  const project = resolveProjectName(store, flags);
  if (!name) {
    console.log('');
    console.log(c.red('  A key name is required, e.g. `wavegrid keys new friday-guests`'));
    console.log('');
    process.exitCode = 1;
    return;
  }

  const role = flags.admin === true ? 'admin' : 'operator';
  try {
    const station = flags.station === undefined ? undefined : String(flags.station);
    if (station !== undefined) {
      const config = store.getProjectConfig(project);
      const layout = resolveLayout(config?.layout ?? DEFAULT_CONFIG.layout);
      if (flags.station === true || !resolveStations(config?.stations, layout).some(s => s.slug === station)) {
        throw new Error('Choose an enabled station slug with --station <slug>.');
      }
    }
    const existed = store.listAccessKeys(project).some((k) => k.name === name);
    const { passphrase } = store.mintAccessKey(project, name, role, station);

    console.log('');
    console.log(c.green(`  ✓ ${existed ? 'Re-minted' : 'Minted'} ${role} key "${name}" in ${project}`));
    console.log('');
    console.log(`  ${c.bold(c.cyan(passphrase))}`);
    console.log('');
    console.log(c.gray(`  Share this now — it is not shown again. It signs in as "${name}".`));
    console.log('');
  } catch (e) {
    console.log('');
    console.log(c.red(`  ${(e as Error).message}`));
    console.log('');
    process.exitCode = 1;
  }
}

/** `wavegrid keys enable|disable <name>` — flip logins, keeping the passphrase. */
export function runKeysEnabled(flags: Flags, name: string | undefined, enabled: boolean): void {
  const store = getStore();
  const project = resolveProjectName(store, flags);
  if (!name) {
    console.log('');
    console.log(c.red('  A key name is required.'));
    console.log('');
    process.exitCode = 1;
    return;
  }

  const key = store.setAccessKeyEnabled(project, name, enabled);
  console.log('');
  if (!key) {
    console.log(c.red(`  No access key "${name}" in ${project}`));
    process.exitCode = 1;
  } else {
    console.log(c.green(`  ✓ Key "${name}" ${key.enabled ? 'enabled' : 'disabled'} in ${project}`));
  }
  console.log('');
}

/** `wavegrid keys rm <name>` — revoke one key, or `--all` to revoke every key. */
export function runKeysRemove(flags: Flags, name: string | undefined): void {
  const store = getStore();
  const project = resolveProjectName(store, flags);

  console.log('');
  if (flags.all === true) {
    const removed = store.removeAllAccessKeys(project);
    console.log(c.green(`  ✓ Revoked ${removed} access key${removed === 1 ? '' : 's'} in ${project}`));
  } else if (!name) {
    console.log(c.red('  A key name is required, or pass --all to revoke every key.'));
    process.exitCode = 1;
  } else if (!store.removeAccessKey(project, name)) {
    console.log(c.red(`  No access key "${name}" in ${project}`));
    process.exitCode = 1;
  } else {
    console.log(c.green(`  ✓ Revoked key "${name}" in ${project}`));
  }
  console.log('');
}
