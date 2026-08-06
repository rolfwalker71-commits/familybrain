/**
 * Keep trip_events.enrichment_json small.
 * Older flight enrichments stored the full AeroDataBox payload under `flight`,
 * which can be hundreds of KB and break API responses / proxies (HTML error pages).
 */

const PRUNE_MIN_CHARS = 6_000;

export function slimEnrichmentJson(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const text = raw.trim();
  if (!text) return null;

  const needsParse =
    text.length >= PRUNE_MIN_CHARS || text.includes('"flight":');
  if (!needsParse) return text;

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return text.length > PRUNE_MIN_CHARS
        ? `${text.slice(0, PRUNE_MIN_CHARS - 1)}…`
        : text;
    }
    const obj = parsed as Record<string, unknown>;
    if (!("flight" in obj)) {
      return text.length > 12_000 ? `${text.slice(0, 11_999)}…` : text;
    }

    const flight = obj.flight;
    const { flight: _drop, ...rest } = obj;
    let flightNumber: string | null = null;
    if (flight && typeof flight === "object" && !Array.isArray(flight)) {
      const num = (flight as Record<string, unknown>).number;
      if (typeof num === "string" && num.trim()) flightNumber = num.trim();
    }

    return JSON.stringify({
      ...rest,
      ...(flightNumber ? { flightNumber } : {}),
      flightPruned: true,
    });
  } catch {
    return text.length > PRUNE_MIN_CHARS
      ? `${text.slice(0, PRUNE_MIN_CHARS - 1)}…`
      : text;
  }
}

/** Persist a slimmed copy when the stored blob still contains raw `flight`. */
export function pruneStoredEnrichmentJsonIfNeeded(
  eventId: number,
  enrichmentJson: string | null,
  update: (eventId: number, slim: string) => void
): string | null {
  if (!enrichmentJson?.includes('"flight":')) return enrichmentJson;
  const slim = slimEnrichmentJson(enrichmentJson);
  if (!slim || slim === enrichmentJson) return enrichmentJson;
  try {
    update(eventId, slim);
  } catch {
    /* optional */
  }
  return slim;
}
