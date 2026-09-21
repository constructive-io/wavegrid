export function upstreamUrl(raw: string, key: string): string {
  if (!key) return raw;
  const u = new URL(raw);
  u.searchParams.set('key', key);
  return u.toString();
}
