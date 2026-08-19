export interface CannonColor {
  h: number;
  s: number;
  b: number;
}

export interface Orientation {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface PlaylistState {
  active: boolean;
  currentStep: number;
  playlist: {
    steps: Array<{ type: string; name?: string; code?: string; duration: number }>;
    loop: boolean;
    transition: 'cut' | 'fade';
    transitionDuration: number;
  } | null;
}

export interface Settings {
  alpha: number;
  attack: number;
  speed: number;
  animation: string | null;
}

export interface SocketSnapshot {
  grid: CannonColor[];
  orientation: Orientation;
  playlistState: PlaylistState | null;
  settings: Settings | null;
  epoch: number;
  lastMessageAt: number;
}

// State is broadcast every frame by the brain, so 8 seconds allows temporary
// event-loop stalls without masking a genuinely dead socket.
export const SOCKET_FEED_STALE_MS = 8_000;

export function createSocketSnapshot(now = 0): SocketSnapshot {
  return {
    grid: [],
    orientation: { rotation: 0, flipH: false, flipV: false },
    playlistState: null,
    settings: null,
    epoch: 0,
    lastMessageAt: now
  };
}

/** Start a fresh connection epoch instead of carrying forward stale state. */
export function beginConnection(snapshot: SocketSnapshot, now = Date.now()): SocketSnapshot {
  return {
    ...createSocketSnapshot(now),
    epoch: snapshot.epoch + 1
  };
}

/** Apply one server message without mutating the previous connection snapshot. */
export function applySocketMessage(
  snapshot: SocketSnapshot,
  msg: unknown,
  onSyncConfig?: () => void,
  now = Date.now()
): SocketSnapshot {
  if (!msg || typeof msg !== 'object') return snapshot;
  const message = msg as Record<string, unknown>;
  switch (message.type) {
  case 'state':
    if (!Array.isArray(message.grid)) return snapshot;
    return { ...snapshot, grid: message.grid as CannonColor[], lastMessageAt: now };
  case 'orientation':
    return {
      ...snapshot,
      orientation: {
        rotation: message.rotation === 90 || message.rotation === 180 || message.rotation === 270 ? message.rotation : 0,
        flipH: !!message.flipH,
        flipV: !!message.flipV
      },
      lastMessageAt: now
    };
  case 'playlist_state':
    return {
      ...snapshot,
      playlistState: {
        active: !!message.active,
        currentStep: typeof message.currentStep === 'number' ? message.currentStep : 0,
        playlist: (message.playlist as PlaylistState['playlist']) ?? null
      },
      lastMessageAt: now
    };
  case 'settings':
    return {
      ...snapshot,
      settings: {
        alpha: typeof message.alpha === 'number' ? message.alpha : 0.06,
        attack: typeof message.attack === 'number' ? message.attack : 1.0,
        speed: typeof message.speed === 'number' ? message.speed : 1.0,
        animation: typeof message.animation === 'string' ? message.animation : null
      },
      lastMessageAt: now
    };
  case 'sync_update':
  case 'sync_state':
    onSyncConfig?.();
    return { ...snapshot, lastMessageAt: now };
  default:
    return snapshot;
  }
}

export function isFeedStale(
  snapshot: SocketSnapshot,
  now = Date.now(),
  thresholdMs = SOCKET_FEED_STALE_MS
): boolean {
  return now - snapshot.lastMessageAt > thresholdMs;
}
