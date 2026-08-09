import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type ConnectionInfo,
  diagnoseConnection,
  OPEN_CONNECTION,
  retryDelay
} from '@/lib/connection';

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

export function useSocket(
  url: string | null,
  token: string | null,
  onSyncConfig?: () => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  // Keep the latest callback without re-subscribing the socket on every render.
  const onSyncConfigRef = useRef(onSyncConfig);
  onSyncConfigRef.current = onSyncConfig;
  const [connection, setConnection] = useState<ConnectionInfo>({
    state: 'connecting',
    cause: 'unknown',
    detail: '',
    code: null,
    attempts: 0
  });
  const [grid, setGrid] = useState<CannonColor[]>([]);
  const [orientation, setOrientation] = useState<Orientation>({ rotation: 0, flipH: false, flipV: false });
  const [playlistState, setPlaylistState] = useState<PlaylistState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    if (!token || !url) return;

    let disposed = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const probe = async (path: string) => {
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      return { ok: res.ok, status: res.status };
    };

    const connect = () => {
      const wsUrl = new URL(url);
      wsUrl.searchParams.set('token', token);
      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;
      setConnection((prev) => ({ ...prev, state: 'connecting', attempts }));

      ws.onopen = () => {
        attempts = 0;
        setConnection(OPEN_CONNECTION);
      };

      // A rejected handshake and a dropped connection both land here; the cause
      // comes from probing the origin, since the browser only reports 1006.
      ws.onclose = (e) => {
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        attempts += 1;
        setConnection({ state: 'down', cause: 'unknown', detail: '', code: e.code, attempts });
        void diagnoseConnection(probe, e.code, token).then(({ cause, detail }) => {
          if (!disposed) setConnection({ state: 'down', cause, detail, code: e.code, attempts });
        });
        retry = setTimeout(connect, retryDelay(attempts));
      };

      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'state' && Array.isArray(msg.grid)) {
            setGrid(msg.grid);
          } else if (msg.type === 'orientation') {
            setOrientation({ rotation: msg.rotation ?? 0, flipH: !!msg.flipH, flipV: !!msg.flipV });
          } else if (msg.type === 'playlist_state') {
            setPlaylistState({ active: !!msg.active, currentStep: msg.currentStep ?? 0, playlist: msg.playlist ?? null });
          } else if (msg.type === 'settings') {
            setSettings({
              alpha: msg.alpha ?? 0.06,
              attack: msg.attack ?? 1.0,
              speed: msg.speed ?? 1.0,
              animation: msg.animation ?? null
            });
          } else if (msg.type === 'sync_update' || msg.type === 'sync_state') {
            // A config change was replicated from another device — refetch it so
            // the browser reflects the new layout/light-map without a reload.
            onSyncConfigRef.current?.();
          }
        } catch {
          // ignore
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url, token]);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return {
    connected: connection.state === 'open',
    connection,
    grid,
    orientation,
    playlistState,
    settings,
    send
  };
}
