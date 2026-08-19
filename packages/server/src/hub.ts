export const OPEN_READY_STATE = 1;

/** Application close code for "your session is gone". An application code
 *  survives where a rejected handshake doesn't: browsers flatten those to 1006,
 *  so only a post-handshake close can tell the client why it was dropped. */
export const WS_CLOSE_SESSION_REVOKED = 4001;
export const WS_REASON_SESSION_REVOKED = 'session revoked';

export interface HubSocket {
  readyState: number;
  send(payload: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  ping(): void;
}

export interface LivenessState {
  alive: boolean;
}

/** Send to every open socket without letting one broken peer stop the fanout. */
export function fanout<T extends HubSocket>(
  sockets: Iterable<T>,
  payload: string,
  onFailure: (socket: T, error: unknown) => void
): number {
  let delivered = 0;
  for (const socket of sockets) {
    if (socket.readyState !== OPEN_READY_STATE) continue;
    try {
      socket.send(payload);
      delivered++;
    } catch (error) {
      onFailure(socket, error);
    }
  }
  return delivered;
}

/**
 * Mark responsive sockets for the next sweep and terminate peers that missed
 * the previous ping.
 */
export function sweepLiveness<T extends HubSocket>(
  sockets: Map<T, LivenessState>,
  onDead: (socket: T) => void,
  onPingFailure: (socket: T, error: unknown) => void
): void {
  for (const [socket, state] of sockets) {
    if (!state.alive) {
      onDead(socket);
      continue;
    }
    state.alive = false;
    try {
      socket.ping();
    } catch (error) {
      onPingFailure(socket, error);
    }
  }
}

/** Select authenticated sockets whose server-side sessions are no longer live. */
export function selectRevokedSockets<T extends HubSocket, C extends { sid?: string }>(
  clients: Iterable<[T, C]>,
  isSessionLive: (sid: string) => boolean
): T[] {
  const revoked: T[] = [];
  for (const [socket, info] of clients) {
    if (info.sid && !isSessionLive(info.sid)) revoked.push(socket);
  }
  return revoked;
}
