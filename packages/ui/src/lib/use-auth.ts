import { useCallback, useEffect, useState } from 'react';

function decodePayload(token: string): { sub: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    const payload = JSON.parse(json);
    if (!payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Last username signed in on this device — prefilled after a session ends so
 *  getting back in is one field, not two. */
const LAST_USER_KEY = 'wg_last_user';

export function useAuth() {
  const [user, setUser] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  /** Set when a signed-in session stopped being valid, so the login screen can
   *  say why it is showing rather than looking like a random logout. */
  const [endedSession, setEndedSession] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('wg_token');
    if (stored) {
      const payload = decodePayload(stored);
      if (payload) {
        setUser(payload.sub);
        setToken(stored);
      } else {
        localStorage.removeItem('wg_token');
        localStorage.removeItem('wg_user');
      }
    }
    setChecked(true);
  }, []);

  const login = useCallback((username: string, jwt: string) => {
    localStorage.setItem('wg_token', jwt);
    localStorage.setItem(LAST_USER_KEY, username);
    localStorage.removeItem('wg_user');
    setToken(jwt);
    setUser(username);
    setEndedSession(false);
  }, []);

  const clear = useCallback((ended: boolean) => {
    localStorage.removeItem('wg_token');
    localStorage.removeItem('wg_user');
    setToken(null);
    setUser(null);
    setEndedSession(ended);
  }, []);

  const logout = useCallback(() => clear(false), [clear]);

  /** Drop a token the server no longer accepts (expired, revoked, or issued for
   *  another project) and fall back to the login screen — a dead token can only
   *  ever reconnect into the same error. */
  const sessionEnded = useCallback(() => clear(true), [clear]);

  const lastUser = typeof window === 'undefined' ? '' : localStorage.getItem(LAST_USER_KEY) ?? '';

  return { user, token, checked, endedSession, lastUser, login, logout, sessionEnded };
}
