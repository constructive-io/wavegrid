import { randomBytes } from 'crypto';

import {
  projectSecretsFile,
  readJsonFile,
  type StorePaths,
  writeFileAtomic
} from './paths';

/** The secrets every install may need. Generated once, never defaulted at runtime. */
export interface ProjectSecrets {
  /** HMAC secret for signing UI JWTs. */
  jwtSecret: string;
  /** Shared key receivers must present to connect to the server over WebSocket. */
  receiverKey: string;
}

export type SecretName = keyof ProjectSecrets;

export const SECRET_NAMES: SecretName[] = ['jwtSecret', 'receiverKey'];

const FILE_MODE = 0o600;

function generateValue(): string {
  return randomBytes(32).toString('hex');
}

/** Read whatever secrets are stored for a project (may be partial or empty). */
export function readSecrets(paths: StorePaths, project: string): Partial<ProjectSecrets> {
  return readJsonFile<Partial<ProjectSecrets>>(projectSecretsFile(paths, project)) ?? {};
}

function writeSecrets(paths: StorePaths, project: string, secrets: Partial<ProjectSecrets>): void {
  writeFileAtomic(projectSecretsFile(paths, project), JSON.stringify(secrets, null, 2) + '\n', FILE_MODE);
}

export interface GenerateResult {
  generated: SecretName[];
  kept: SecretName[];
}

/**
 * Generate any missing secrets for a project — a one-time setup step. Existing
 * secrets are preserved unless `force` is set. This is the ONLY place secrets
 * are created; runtime code must call `requireSecret` and fail if absent.
 */
export function generateSecrets(
  paths: StorePaths,
  project: string,
  opts: { force?: boolean } = {}
): GenerateResult {
  const current = readSecrets(paths, project);
  const next: Partial<ProjectSecrets> = { ...current };
  const generated: SecretName[] = [];
  const kept: SecretName[] = [];
  for (const name of SECRET_NAMES) {
    if (opts.force || !current[name]) {
      next[name] = generateValue();
      generated.push(name);
    } else {
      kept.push(name);
    }
  }
  writeSecrets(paths, project, next);
  return { generated, kept };
}

export function hasSecret(paths: StorePaths, project: string, name: SecretName): boolean {
  return Boolean(readSecrets(paths, project)[name]);
}

export function setSecret(paths: StorePaths, project: string, name: SecretName, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Secret "${name}" cannot be empty.`);
  writeSecrets(paths, project, { ...readSecrets(paths, project), [name]: trimmed });
}

/**
 * Read a secret, throwing an explicit, actionable error when it is missing.
 * No implicit generation, no null return — callers get a value or an error.
 */
export function requireSecret(paths: StorePaths, project: string, name: SecretName): string {
  const value = readSecrets(paths, project)[name];
  if (!value) {
    throw new Error(
      `Missing secret "${name}" for project "${project}". ` +
        `Run \`wavegrid secrets init\` (or \`wavegrid init\`) to generate it.`
    );
  }
  return value;
}
