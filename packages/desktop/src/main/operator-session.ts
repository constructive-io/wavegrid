/**
 * Signing the embedded artist UI in, so switching projects doesn't ask the
 * operator for a password every time.
 *
 * Sessions are per project by design (a token minted for project A is not
 * valid once B is active) and that stays true for anything reaching the brain
 * over the network. This shortcut applies only to the UI embedded in this
 * desktop app: whoever is at the keyboard already owns the store — they can
 * read its secrets, add users and mint access keys — so requiring them to
 * re-type a password into their own machine protects nothing.
 *
 * The session is a real store session with a recognisable user agent, so it
 * appears in Access → Sessions and can be revoked like any other.
 */
import { signJwt } from '@wavegrid/server';
import { openStore } from '@wavegrid/settings';

const DESKTOP_USER_AGENT = 'wavegrid-desktop (this laptop)';
const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * A token for the project's admin, or null when the project has no accounts
 * yet — the embedded UI then shows its normal login screen.
 */
export function operatorToken(project: string): string | null {
  const store = openStore();
  if (!store.hasProject(project)) return null;
  const users = store.listUserInfos(project);
  const account = users.find((u) => u.role === 'admin') ?? users[0];
  if (!account) return null;

  // The brain sets this when it starts; set it anyway so a token minted before
  // the first start is signed with the same project's secret.
  process.env.WG_JWT_SECRET = store.requireSecret(project, 'jwtSecret');

  const session = store.createSession(project, {
    username: account.username,
    role: account.role,
    ip: '127.0.0.1',
    userAgent: DESKTOP_USER_AGENT,
    ttlMs: TTL_MS
  });
  return signJwt(account.username, {
    sid: session.id,
    role: account.role,
    ttlSec: Math.floor(TTL_MS / 1000)
  });
}

/**
 * The URL the embedded view should load: the brain's own URL, carrying a
 * one-shot token in the fragment. A fragment (never a query) keeps the token
 * out of the server's logs, and the UI strips it from the address on arrival.
 */
export function embeddedUrl(url: string, project: string | null): string {
  if (!project) return url;
  const token = operatorToken(project);
  return token ? `${url}#wg_token=${encodeURIComponent(token)}` : url;
}
