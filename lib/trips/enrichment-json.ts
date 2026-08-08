/**
 * Keep trip_events.enrichment_json small.
 * Older flight enrichments stored the full AeroDataBox payload under `flight`,
 * which can be hundreds of KB and break API responses / proxies (HTML error pages).
 * Train OJP enrichments can be large due to routePath — subsample instead of truncating JSON.
 */

const PRUNE_MIN_CHARS = 6_000;
const MAX_TRAIN_PATH_POINTS = 160;

function subsamplePathPoints(path: unknown, maxPoints: number): unknown {
  if (!Array.isArray(path) || path.length <= maxPoints) return path;
  const out: unknown[] = [];
  const last = path.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    out.push(path[Math.round((i / (maxPoints - 1)) * last)]);
  }
  return out;
}

export function slimEnrichmentJson(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const text = raw.trim();
  if (!text) return null;

  const needsParse =
    text.length >= PRUNE_MIN_CHARS ||
    text.includes('"flight":') ||
    text.includes('"routePath":');
  if (!needsParse) return text;

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return text.length > PRUNE_MIN_CHARS
        ? `${text.slice(0, PRUNE_MIN_CHARS - 1)}…`
        : text;
    }
    const obj = { ...(parsed as Record<string, unknown>) };

    // OJP / Zug: Pfad verdichten, JSON intakt lassen (kein String-Abschneiden).
    if (obj.source === "ojp" || Array.isArray(obj.routePath)) {
      if (Array.isArray(obj.routePath)) {
        obj.routePath = subsamplePathPoints(
          obj.routePath,
          MAX_TRAIN_PATH_POINTS
        );
      }
      return JSON.stringify(obj);
    }

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
