/**
 * Where this device keeps its credential. The JWT is the whole credential, so
 * "signed in" means nothing more than "a token is in local storage" — signing
 * out or losing a session has to remove it, or the next reload walks straight
 * back into a dead session.
 */

const TOKEN_KEY = 'wg_token';
/** Older builds cached the username alongside the token; still cleared. */
const LEGACY_USER_KEY = 'wg_user';
/** Last username signed in on this device — prefilled after a session ends so
 *  getting back in is one field, not two. */
const LAST_USER_KEY = 'wg_last_user';

/** The slice of `localStorage` this module needs, so tests can pass a fake. */
export interface CredentialStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStore(): CredentialStore | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function saveCredentials(
  username: string,
  token: string,
  store: CredentialStore | null = browserStore()
): void {
  if (!store) return;
  store.setItem(TOKEN_KEY, token);
  store.setItem(LAST_USER_KEY, username);
  store.removeItem(LEGACY_USER_KEY);
}

/** Forget the credential, keeping only the username to prefill the login form. */
export function clearCredentials(store: CredentialStore | null = browserStore()): void {
  if (!store) return;
  store.removeItem(TOKEN_KEY);
  store.removeItem(LEGACY_USER_KEY);
}

export function readToken(store: CredentialStore | null = browserStore()): string | null {
  return store?.getItem(TOKEN_KEY) ?? null;
}

export function readLastUser(store: CredentialStore | null = browserStore()): string {
  return store?.getItem(LAST_USER_KEY) ?? '';
}
