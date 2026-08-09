/**
 * OSC target hosts.
 *
 * OSC output is UDP, so a wrong host fails silently — nothing errors, the lasers
 * just stay dark. The classic version of that is `localhost`: it can resolve to
 * IPv6 `::1` while BEYOND/FB4 listens on IPv4, so every packet is dropped with
 * no indication. Loopback names are therefore normalized to the literal IPv4
 * address wherever a host is stored.
 */

/** Loopback in the form OSC targets actually listen on. */
export const LOOPBACK_HOST = '127.0.0.1';

const LOOPBACK_NAMES = new Set(['localhost', 'localhost.localdomain', '::1', '[::1]', 'ip6-localhost']);

/** Trim a host and rewrite any loopback alias to IPv4 loopback. */
export function normalizeOscHost(host: string): string {
  const trimmed = host.trim();
  return LOOPBACK_NAMES.has(trimmed.toLowerCase()) ? LOOPBACK_HOST : trimmed;
}

/** True when a host points at this machine. */
export function isLoopbackHost(host: string): boolean {
  return normalizeOscHost(host) === LOOPBACK_HOST;
}
