import { type StationGrant, stationSlug } from '@wavegrid/stations';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import fs from 'fs';
import path from 'path';

import { projectDir, readJsonFile, type StorePaths, writeFileAtomic } from './paths';
import { type UserInfo, type UserRole } from './users';

/**
 * Access keys: named passphrases an admin mints at runtime so someone can drive
 * the show without a personal username+password account. One key per person
 * ("dan-ipad"), or one shared with a crowd ("friday-guests") — they're the same
 * mechanism, so each is revocable on its own without disturbing the others.
 *
 * A key carries its own role, defaulting to `operator`; an `admin` key is
 * possible but deliberate. Keys are stored only as salted scrypt hashes, never
 * in plaintext — the cleartext is returned exactly once, when the key is minted,
 * for the admin to copy and hand over. A forgotten key is replaced, not
 * recovered. Disabling or deleting one takes effect on the holder's next token
 * refresh (same lifecycle as revoking a session; no sockets are touched).
 */

const KEYLEN = 64;
const FILE_MODE = 0o600;

/** Ambiguous characters (0/O, 1/l/I) are omitted so a key is easy to read aloud
 *  and type on a phone. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Key names double as the login identity, so they're constrained like usernames. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}$/;

interface StoredKey extends StationGrant {
  name: string;
  role: UserRole;
  enabled: boolean;
  salt: string;
  hash: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/** An access key as shown to admins — everything except the key material. */
export interface AccessKeyInfo extends StationGrant {
  name: string;
  role: UserRole;
  enabled: boolean;
  createdAt: number;
  /** Last successful login with this key (epoch ms), or null if never used. */
  lastUsedAt: number | null;
}

/** A freshly minted key: the cleartext is only ever available here. */
export interface MintedAccessKey {
  key: AccessKeyInfo;
  /** Cleartext passphrase — shown once, never stored or retrievable again. */
  passphrase: string;
}

function keysFile(paths: StorePaths, project: string): string {
  return path.join(projectDir(paths, project), 'access-keys.json');
}

function readKeys(paths: StorePaths, project: string): StoredKey[] {
  return readJsonFile<StoredKey[]>(keysFile(paths, project)) ?? [];
}

function writeKeys(paths: StorePaths, project: string, keys: StoredKey[]): void {
  if (keys.length === 0) {
    try {
      fs.rmSync(keysFile(paths, project));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return;
  }
  writeFileAtomic(keysFile(paths, project), JSON.stringify(keys, null, 2) + '\n', FILE_MODE);
}

function hashPassphrase(passphrase: string, salt: string): string {
  return scryptSync(passphrase, salt, KEYLEN).toString('hex');
}

/** A readable, dependency-free passphrase, e.g. `njkr-8p2q-wxst`. */
function generatePassphrase(): string {
  const groups = 3;
  const per = 4;
  const chars: string[] = [];
  // Rejection sampling keeps every character equally likely (a plain modulo of
  // 256 over a 31-char alphabet would bias the first few letters).
  const limit = 256 - (256 % ALPHABET.length);
  while (chars.length < groups * per) {
    for (const byte of randomBytes(groups * per)) {
      if (byte >= limit) continue;
      chars.push(ALPHABET[byte % ALPHABET.length]);
      if (chars.length === groups * per) break;
    }
  }
  const out: string[] = [];
  for (let g = 0; g < groups; g++) out.push(chars.slice(g * per, g * per + per).join(''));
  return out.join('-');
}

function info(key: StoredKey): AccessKeyInfo {
  return {
    name: key.name,
    role: key.role,
    enabled: key.enabled,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    ...(key.station !== undefined ? { station: key.station } : {})
  };
}

/** Every access key in the project, oldest first. No key material. */
export function listAccessKeys(paths: StorePaths, project: string): AccessKeyInfo[] {
  return readKeys(paths, project).map(info);
}

/** The role a key grants, or null when there's no enabled key by that name. */
export function getAccessKeyRole(
  paths: StorePaths,
  project: string,
  name: string
): UserRole | null {
  const key = readKeys(paths, project).find((k) => k.name === name);
  return key && key.enabled ? (key.station !== undefined ? 'operator' : key.role) : null;
}

/**
 * Mint a new key under `name` and return its cleartext passphrase once. Minting
 * over an existing name replaces that key's passphrase (the old one stops
 * working) and keeps its creation date.
 */
export function mintAccessKey(
  paths: StorePaths,
  project: string,
  name: string,
  role: UserRole = 'operator',
  station?: string | null
): MintedAccessKey {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      'Key names use lowercase letters, numbers and dashes (up to 31 characters), e.g. "friday-guests".'
    );
  }

  const passphrase = generatePassphrase();
  const salt = randomBytes(16).toString('hex');
  const keys = readKeys(paths, project);
  const existing = keys.find((k) => k.name === name);
  const grant = station === undefined ? existing?.station : station;
  if (grant != null && (!stationSlug.test(grant) || role !== 'operator')) {
    throw new Error('A station key must grant operator access to a valid station slug.');
  }

  const next: StoredKey = {
    name,
    role,
    enabled: true,
    salt,
    hash: hashPassphrase(passphrase, salt),
    createdAt: existing?.createdAt ?? Date.now(),
    lastUsedAt: null,
    ...(grant != null ? { station: grant } : {})
  };

  if (existing) keys[keys.indexOf(existing)] = next;
  else keys.push(next);
  writeKeys(paths, project, keys);

  return { key: info(next), passphrase };
}

/** Turn one key on or off without changing its passphrase. */
export function setAccessKeyEnabled(
  paths: StorePaths,
  project: string,
  name: string,
  enabled: boolean
): AccessKeyInfo | null {
  const keys = readKeys(paths, project);
  const key = keys.find((k) => k.name === name);
  if (!key) return null;
  key.enabled = enabled;
  writeKeys(paths, project, keys);
  return info(key);
}

/** Change the role a key grants. */
export function setAccessKeyRole(
  paths: StorePaths,
  project: string,
  name: string,
  role: UserRole
): AccessKeyInfo | null {
  const keys = readKeys(paths, project);
  const key = keys.find((k) => k.name === name);
  if (!key) return null;
  if (role === 'admin' && key.station !== undefined) throw new Error('A station key cannot grant admin access.');
  key.role = role;
  writeKeys(paths, project, keys);
  return info(key);
}

/** Revoke a single key. Returns false when no such key existed. */
export function removeAccessKey(paths: StorePaths, project: string, name: string): boolean {
  const keys = readKeys(paths, project);
  const remaining = keys.filter((k) => k.name !== name);
  if (remaining.length === keys.length) return false;
  writeKeys(paths, project, remaining);
  return true;
}

/** Revoke every key at once. Returns how many were removed. */
export function removeAllAccessKeys(paths: StorePaths, project: string): number {
  const count = readKeys(paths, project).length;
  writeKeys(paths, project, []);
  return count;
}

/**
 * Constant-time check of a candidate passphrase against every enabled key.
 * Returns the identity it grants (the key's name as the username) and stamps
 * `lastUsedAt`, or null when nothing matches.
 *
 * The name typed at the login prompt is ignored: a shared key is handed around
 * as a passphrase alone, so it must work regardless of what the holder types.
 */
export function authenticateAccessKey(
  paths: StorePaths,
  project: string,
  passphrase: string
): (UserInfo & StationGrant) | null {
  const keys = readKeys(paths, project);
  for (const key of keys) {
    if (!key.enabled) continue;
    const expected = Buffer.from(key.hash, 'hex');
    const actual = Buffer.from(hashPassphrase(passphrase, key.salt), 'hex');
    if (expected.length !== actual.length) continue;
    if (!timingSafeEqual(expected, actual)) continue;

    key.lastUsedAt = Date.now();
    writeKeys(paths, project, keys);
    return key.station !== undefined
      ? { username: key.name, role: 'operator', station: key.station }
      : { username: key.name, role: key.role };
  }
  return null;
}
