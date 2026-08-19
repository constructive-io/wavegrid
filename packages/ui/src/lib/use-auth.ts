import { useCallback, useEffect, useState } from 'react';

import {
  clearCredentials,
  readLastUser,
  readToken,
  saveCredentials
} from '@/lib/auth-storage';

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

/**
 * A session handed to us in the address fragment by a trusted embedder (the
 * desktop app, which owns the store this token was minted from). Consumed once
 * and erased from the address — the token stays the only credential, so this is
 * transport, not a privilege: the server validates it exactly as it would a
 * token from the login form.
 */
export function takeTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  const match = /(?:^|&)wg_token=([^&]+)/.exec(hash);
  if (!match) return null;
  const rest = hash.replace(/(?:^|&)wg_token=[^&]+/, '').replace(/^&/, '');
  window.history.replaceState(null, '', window.location.pathname + window.location.search + (rest ? `#${rest}` : ''));
  return decodeURIComponent(match[1]);
}

/**
 * Ask the brain to revoke this session. Best effort: the client is signing out
 * regardless, and a device that just lost the network must still land on the
 * login screen rather than hang on a failed request.
 */
export async function endSessionOnServer(
  token: string,
  post: typeof fetch = fetch
): Promise<void> {
  try {
    await post('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // ignore
  }
}

export function useAuth() {
  const [user, setUser] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  /** Set when a signed-in session stopped being valid, so the login screen can
   *  say why it is showing rather than looking like a random logout. */
  const [endedSession, setEndedSession] = useState(false);

  useEffect(() => {
    const handed = takeTokenFromUrl();
    if (handed) {
      const payload = decodePayload(handed);
      if (payload) {
        saveCredentials(payload.sub, handed);
        setUser(payload.sub);
        setToken(handed);
        setChecked(true);
        return;
      }
    }
    const stored = readToken();
    if (stored) {
      const payload = decodePayload(stored);
      if (payload) {
        setUser(payload.sub);
        setToken(stored);
      } else {
        clearCredentials();
      }
    }
    setChecked(true);
  }, []);

  const login = useCallback((username: string, jwt: string) => {
    saveCredentials(username, jwt);
    setToken(jwt);
    setUser(username);
    setEndedSession(false);
  }, []);

  const clear = useCallback((ended: boolean) => {
    clearCredentials();
    setToken(null);
    setUser(null);
    setEndedSession(ended);
  }, []);

  /** Sign out here and end the session on the brain, so neither the token nor
   *  the socket it opened outlives the button press. */
  const logout = useCallback(() => {
    if (token) void endSessionOnServer(token);
    clear(false);
  }, [clear, token]);

  /** Drop a token the server no longer accepts (expired, revoked, or issued for
   *  another project) and fall back to the login screen — a dead token can only
   *  ever reconnect into the same error. */
  const sessionEnded = useCallback(() => clear(true), [clear]);

  const lastUser = readLastUser();

  return { user, token, checked, endedSession, lastUser, login, logout, sessionEnded };
}
