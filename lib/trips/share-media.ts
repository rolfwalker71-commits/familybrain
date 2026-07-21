/** Rewrite authenticated trip media URLs to token-scoped share URLs. */
export function rewriteTripMediaUrlForShare(
  url: string | null | undefined,
  token: string
): string | null {
  if (!url) return null;
  const m = url.match(
    /^\/api\/trips\/media\/(cover|aircraft|map)\/([^/?#]+)/
  );
  if (!m) return url;
  return `/api/share/t/${encodeURIComponent(token)}/media/${m[1]}/${m[2]}`;
}
