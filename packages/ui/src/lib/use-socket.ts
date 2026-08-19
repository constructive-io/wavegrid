import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type ConnectionInfo,
  diagnoseConnection,
  isSessionEndedCode,
  OPEN_CONNECTION,
  retryDelay
} from '@/lib/connection';
import {
  applySocketMessage,
  beginConnection,
  createSocketSnapshot,
  isSyncConfigMessage,
  SOCKET_FEED_STALE_MS,
  type SocketSnapshot
} from '@/lib/socket-state';

export type { CannonColor, Orientation, PlaylistState, Settings } from '@/lib/socket-state';

export function useSocket(
  url: string | null,
  token: string | null,
  onSyncConfig?: () => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  // Keep the latest callback without re-subscribing the socket on every render.
  const onSyncConfigRef = useRef(onSyncConfig);
  onSyncConfigRef.current = onSyncConfig;
  const lastMessageAtRef = useRef(0);
  const [connection, setConnection] = useState<ConnectionInfo>({
    state: 'connecting',
    cause: 'unknown',
    detail: '',
    code: null,
    attempts: 0
  });
  const [snapshot, setSnapshot] = useState<SocketSnapshot>(() => createSocketSnapshot());

  useEffect(() => {
    if (!token || !url) return;

    let disposed = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let watchdog: ReturnType<typeof setInterval> | null = null;

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
        lastMessageAtRef.current = Date.now();
        setSnapshot((prev) => beginConnection(prev, lastMessageAtRef.current));
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
        // A revoked session can only reconnect into the same rejection, so stop
        // hammering the brain and let the app hand back the login screen.
        if (!isSessionEndedCode(e.code)) retry = setTimeout(connect, retryDelay(attempts));
      };

      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const now = Date.now();
          lastMessageAtRef.current = now;
          setSnapshot((prev) => applySocketMessage(prev, msg, now));
          if (isSyncConfigMessage(msg)) onSyncConfigRef.current?.();
        } catch {
          // ignore
        }
      };
    };

    connect();
    watchdog = setInterval(() => {
      const ws = wsRef.current;
      if (
        ws?.readyState === WebSocket.OPEN &&
        Date.now() - lastMessageAtRef.current > SOCKET_FEED_STALE_MS
      ) ws.close();
    }, Math.min(1_000, SOCKET_FEED_STALE_MS));

    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      if (watchdog) clearInterval(watchdog);
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
    grid: snapshot.grid,
    orientation: snapshot.orientation,
    playlistState: snapshot.playlistState,
    settings: snapshot.settings,
    epoch: snapshot.epoch,
    send
  };
}
