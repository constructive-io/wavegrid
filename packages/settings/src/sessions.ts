import { randomBytes } from 'crypto';
import path from 'path';

import { projectDir, readJsonFile, type StorePaths, writeFileAtomic } from './paths';
import type { UserRole } from './users';

/**
 * A lightweight, server-visible record of a logged-in UI user. This is *not* a
 * new auth protocol — the JWT minted at login stays the credential. A session
 * is just a cheap, bounded row so an admin can answer "who's logged in?" and
 * revoke access. Deleting the row is what revocation means: the server rejects
 * requests carrying the matching `sid` and closes the socket opened with it.
 */
export interface Session {
  /** Opaque session id; also carried as the JWT `sid` claim. */
  id: string;
  username: string;
  role: UserRole;
  /** Remote address at login. Sensitive — never exported or shown to non-admins. */
  ip: string;
  /** Client user-agent at login (best effort). */
  userAgent: string;
  issuedAt: number;
  lastSeen: number;
  expiresAt: number;
}

const FILE_MODE = 0o600;
/** Default session lifetime: short so revocation bites on refresh. */
export const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutes

function sessionsFile(paths: StorePaths, project: string): string {
  return path.join(projectDir(paths, project), 'sessions.json');
}

function readAll(paths: StorePaths, project: string): Session[] {
  return readJsonFile<Session[]>(sessionsFile(paths, project)) ?? [];
}

function writeAll(paths: StorePaths, project: string, sessions: Session[]): void {
  writeFileAtomic(sessionsFile(paths, project), JSON.stringify(sessions, null, 2) + '\n', FILE_MODE);
}

function notExpired(now: number) {
  return (s: Session) => s.expiresAt > now;
}

/** Drop expired rows from disk. Returns the surviving sessions. */
export function pruneSessions(paths: StorePaths, project: string, now = Date.now()): Session[] {
  const all = readAll(paths, project);
  const live = all.filter(notExpired(now));
  if (live.length !== all.length) writeAll(paths, project, live);
  return live;
}

export interface CreateSessionInput {
  username: string;
  role: UserRole;
  ip?: string;
  userAgent?: string;
  ttlMs?: number;
  now?: number;
}

/** Record a new session (prunes expired ones as a side effect). */
export function createSession(paths: StorePaths, project: string, input: CreateSessionInput): Session {
  const now = input.now ?? Date.now();
  const ttl = input.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const session: Session = {
    id: randomBytes(16).toString('hex'),
    username: input.username,
    role: input.role,
    ip: input.ip ?? 'unknown',
    userAgent: input.userAgent ?? 'unknown',
    issuedAt: now,
    lastSeen: now,
    expiresAt: now + ttl
  };
  const live = readAll(paths, project).filter(notExpired(now));
  live.push(session);
  writeAll(paths, project, live);
  return session;
}

/** Active (non-expired) sessions, newest first. */
export function listSessions(paths: StorePaths, project: string, now = Date.now()): Session[] {
  return pruneSessions(paths, project, now).sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Look up a single active session by id, or null if missing/expired. */
export function getSession(
  paths: StorePaths,
  project: string,
  id: string,
  now = Date.now()
): Session | null {
  return pruneSessions(paths, project, now).find((s) => s.id === id) ?? null;
}

/** Refresh a session's lastSeen. Returns the session, or null if unknown. */
export function touchSession(
  paths: StorePaths,
  project: string,
  id: string,
  now = Date.now()
): Session | null {
  const all = readAll(paths, project).filter(notExpired(now));
  const target = all.find((s) => s.id === id);
  if (!target) {
    writeAll(paths, project, all);
    return null;
  }
  target.lastSeen = now;
  writeAll(paths, project, all);
  return target;
}

/** Revoke a single session by id. Returns true if one was removed. */
export function revokeSession(paths: StorePaths, project: string, id: string): boolean {
  const all = readAll(paths, project);
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  writeAll(paths, project, next);
  return true;
}

/** Revoke every session belonging to a user. Returns the count removed. */
export function revokeUserSessions(paths: StorePaths, project: string, username: string): number {
  const all = readAll(paths, project);
  const next = all.filter((s) => s.username !== username);
  writeAll(paths, project, next);
  return all.length - next.length;
}
