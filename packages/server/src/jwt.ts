import type { BrainPrincipal } from '@wavegrid/extensions';
import type { StationGrant } from '@wavegrid/stations';
import { createHmac } from 'crypto';

function getSecret(): string {
  const secret = process.env.WG_JWT_SECRET;
  if (!secret) throw new Error('WG_JWT_SECRET env var is not set');
  return secret;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export type Role = 'admin' | 'operator';

export interface JwtPayload extends BrainPrincipal, StationGrant {
  /** Subject — the username. */
  sub: string;
  /** Issued-at (seconds). */
  iat: number;
  /** Expiry (seconds). Absent on legacy tokens → treated as non-expiring. */
  exp?: number;
  /** Session id — ties the token to a server-side session record. */
  sid?: string;
  /** Privilege level carried for convenience; the store remains authoritative. */
  role?: Role;
}

export interface SignOptions extends StationGrant {
  /** Session id to embed (`sid`). */
  sid?: string;
  /** Role to embed. */
  role?: Role;
  /** Lifetime in seconds; when set, an `exp` claim is added. */
  ttlSec?: number;
}

export function signJwt(sub: string, opts: SignOptions = {}): string {
  const secret = getSecret();
  const iat = Math.floor(Date.now() / 1000);
  const claims: JwtPayload = { sub, iat };
  if (opts.ttlSec != null) claims.exp = iat + opts.ttlSec;
  if (opts.sid) claims.sid = opts.sid;
  if (opts.role) claims.role = opts.role;
  if (opts.station !== undefined) claims.station = opts.station;
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify(claims)));
  const data = `${header}.${payload}`;
  const sig = base64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const secret = getSecret();
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const data = `${parts[0]}.${parts[1]}`;
    const expectedSig = base64url(createHmac('sha256', secret).update(data).digest());
    if (expectedSig !== parts[2]) return null;
    const payload: JwtPayload = JSON.parse(base64urlDecode(parts[1]));
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
