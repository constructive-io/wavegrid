export const OPEN_READY_STATE = 1;

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
export function fanout(
  sockets: Iterable<HubSocket>,
  payload: string,
  onFailure: (socket: HubSocket, error: unknown) => void
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
export function sweepLiveness(
  sockets: Map<HubSocket, LivenessState>,
  onDead: (socket: HubSocket) => void,
  onPingFailure: (socket: HubSocket, error: unknown) => void
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
export function selectRevokedSockets<T extends { sid?: string }>(
  clients: Iterable<[HubSocket, T]>,
  isSessionLive: (sid: string) => boolean
): HubSocket[] {
  const revoked: HubSocket[] = [];
  for (const [socket, info] of clients) {
    if (info.sid && !isSessionLive(info.sid)) revoked.push(socket);
  }
  return revoked;
}
