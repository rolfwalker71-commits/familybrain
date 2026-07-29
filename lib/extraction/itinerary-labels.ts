/**
 * Itinerary stop labels for important_dates / trip events.
 * Avoid cruise jargon («Anlaufhafen») for trains and ports alike.
 */

const LEGACY_STOP_PREFIX =
  /^(Anlaufhafen|Port of Call|Ports of Call|Halt|Station)\s*:\s*/i;

/** Label stored for a new itinerary stop (location only). */
export function itineraryStopLabel(location: string): string {
  return location.replace(/\s+/g, " ").trim();
}

/** Strip legacy «Anlaufhafen:» (and similar) for display — no re-analysis needed. */
export function displayImportantDateLabel(
  label: string | null | undefined
): string {
  if (!label) return "";
  const stripped = label.replace(LEGACY_STOP_PREFIX, "").trim();
  return stripped || label.trim();
}

export function importantDateKey(
  date: string | null | undefined,
  label: string | null | undefined
): string {
  return `${date || ""}|${displayImportantDateLabel(label).toLowerCase()}`;
}
