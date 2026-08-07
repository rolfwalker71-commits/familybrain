/** Extract a video conference URL from calendar fields / free text. */
export function extractMeetUrl(...chunks: Array<string | null | undefined>): string | null {
  const text = chunks.filter(Boolean).join("\n");
  if (!text) return null;

  const patterns = [
    /https?:\/\/meet\.google\.com\/[a-z0-9-]+/i,
    /https?:\/\/[a-z0-9.-]*zoom\.us\/j\/\d+[^\s<)"]*/i,
    /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<)"]+/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[0]) return m[0].replace(/[.,;)]+$/, "");
  }
  return null;
}
