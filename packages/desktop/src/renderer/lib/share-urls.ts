/**
 * Ordering for the LAN URLs a phone might open. Purely a presentation concern:
 * these URLs are derived from the running brain's interfaces every time status
 * is read, and are never stored.
 *
 * A laptop at a venue usually holds several IPv4 addresses — wifi, a wired
 * dock, a VPN, a virtualization bridge — and only one of them is the network
 * the audience's phones are on. Home/office wifi is overwhelmingly 192.168/16,
 * so that goes first; link-local means DHCP never completed and is worth
 * showing last rather than hiding, since it explains a failure.
 */
export function rankLanUrls(urls: string[]): string[] {
  return [...urls].sort((a, b) => rank(a) - rank(b));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function rank(url: string): number {
  const host = hostOf(url);
  if (host.startsWith('192.168.')) return 0;
  if (/^10\./.test(host)) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 2;
  // 169.254/16: self-assigned, no DHCP — reachable by nothing useful.
  if (host.startsWith('169.254.')) return 4;
  return 3;
}
