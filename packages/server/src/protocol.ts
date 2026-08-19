/**
 * Wire protocol for system introspection (used by `wavegrid doctor`).
 *
 * These are additive to the existing state/command/layout messages: a receiver
 * announces itself with `hello` on connect, and any authenticated client can
 * ask the server for a `system_status` snapshot of the whole installation.
 */

import type { DivergentDevice, SyncEntry, SyncState } from '@wavegrid/settings';

import type { CoverageResult, ShardRange } from './coverage';
import type { LanVisitor } from './http-app';

export type ClientRole = 'receiver' | 'ui' | 'unknown';

/** Sent by a receiver immediately after it connects. */
export interface HelloMessage {
  type: 'hello';
  role: 'receiver';
  host: string;
  pid: number;
  version: string;
  layout: { id: string; count: number };
  mode: 'simple' | 'distributed';
  shard: ShardRange | null;
  /** Machine-local device id (stable per laptop). Optional for older receivers. */
  deviceId?: string;
  /** Friendly device name (user-editable, defaults to hostname). */
  deviceName?: string;
}

/** Per-connection view the server keeps for every socket. */
export interface ClientInfo {
  role: ClientRole;
  remote: string;
  connectedAt: number;
  lastSeen: number;
  sid?: string;
  username?: string;
  hello?: Omit<HelloMessage, 'type' | 'role'>;
}

/** Request → `{ type: 'system_status' }`. Response shape below. */
export interface SystemStatus {
  type: 'system_status';
  server: {
    version: string;
    layout: { id: string; name: string; count: number };
    mode: string;
    port: number;
    host: string;
    uptimeMs: number;
  };
  receivers: ClientInfo[];
  uiClients: number;
  coverage: CoverageResult;
  /** Devices that reached this brain over the network (never loopback) — the
   *  only proof from inside the show that the LAN URL is actually usable. */
  lanVisitors: LanVisitor[];
  /** Config-sync summary (absent for a fresh project with no synced edits). */
  sync?: {
    revision: number;
    divergent: DivergentDevice[];
  };
}

// ── Config synchronization (Phase D) ────────────────────────────────────────
//
// Server-mediated: a client pushes a change with the base revision it edited
// from; the server serializes writes, assigns the next revision, persists it,
// and broadcasts the accepted revision (`sync_update`) to every client. A
// newly-connected or reconnecting client requests the full snapshot
// (`sync_request` → `sync_state`) and acknowledges what it applied
// (`sync_ack`). See `@wavegrid/settings` `sync.ts` for the conflict policy.

/** Client → server: give me the current synced config (optionally since a rev). */
export interface SyncRequestMessage {
  type: 'sync_request';
  deviceId?: string;
  haveRevision?: number;
}

/** Server → client: the full replicated project document at `revision`. */
export interface SyncStateMessage {
  type: 'sync_state';
  revision: number;
  entries: SyncState['entries'];
}

/** Client → server: submit a config change for a scope, from `baseRevision`. */
export interface SyncPushMessage {
  type: 'sync_push';
  scope: string;
  config: unknown;
  deviceId?: string;
  baseRevision?: number;
}

/** Server → all clients: an accepted revision to apply. */
export interface SyncUpdateMessage {
  type: 'sync_update';
  revision: number;
  entry: SyncEntry;
  /** True when the author edited from a stale base — surfaced by doctor. */
  staleBase: boolean;
}

/** Client → server: I have applied up to `revision`. */
export interface SyncAckMessage {
  type: 'sync_ack';
  deviceId: string;
  revision: number;
}

/**
 * Client → server: hand over a full local sync document for reconciliation.
 * Sent by a transient coordinator that is re-homing to a dedicated brain, so
 * the edits it accepted while it was the authority are not lost. The server
 * merges it deterministically (highest revision per scope wins — never a silent
 * overwrite) and broadcasts the reconciled `sync_state` so everyone converges.
 */
export interface SyncMergeMessage {
  type: 'sync_merge';
  state: SyncState;
}
