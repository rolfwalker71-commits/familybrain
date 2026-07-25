/** Rewrite authenticated trip media URLs to token-scoped share URLs. */
export function rewriteTripMediaUrlForShare(
  url: string | null | undefined,
  token: string
): string | null {
  if (!url) return null;
  const commentMatch = url.match(
    /^\/api\/trips\/media\/comment-image\/([^/?#]+)/
  );
  if (commentMatch) {
    return `/api/share/t/${encodeURIComponent(token)}/media/comment/${commentMatch[1]}`;
  }
  const m = url.match(
    /^\/api\/trips\/media\/(cover|aircraft|map|ai)\/([^/?#]+)/
  );
  if (!m) return url;
  return `/api/share/t/${encodeURIComponent(token)}/media/${m[1]}/${m[2]}`;
}
