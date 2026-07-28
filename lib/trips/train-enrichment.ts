import type { LatLng } from "@/lib/trips/ojp/types";

export type TrainStopKind =
  | "origin"
  | "intermediate"
  | "transfer"
  | "destination";

export type TrainEnrichmentStop = {
  name: string;
  kind?: TrainStopKind;
  /** ISO timestamp from OJP */
  arrival?: string;
  /** ISO timestamp from OJP */
  departure?: string;
  trainNumber?: string;
};

export type TrainEnrichmentData = {
  status: "complete" | "route_only";
  source: "ojp";
  fetchedAt: string;
  inputHash: string;
  tripId?: string;
  trainNumber?: string;
  from?: { name: string; stopRef?: string; lat?: number; lon?: number };
  to?: { name: string; stopRef?: string; lat?: number; lon?: number };
  /** Full itinerary including origin, intermediates, transfers, destination. */
  routeStops?: TrainEnrichmentStop[];
  /** @deprecated Prefer routeStops; kept for older enrichments. */
  intermediateStops?: TrainEnrichmentStop[];
  routePath?: LatLng[];
  legCount?: number;
  warning?: string;
  originStopRef?: string;
  destinationStopRef?: string;
};

export function parseTrainEnrichment(
  enrichmentJson: string | null | undefined
): TrainEnrichmentData | null {
  if (!enrichmentJson?.trim()) return null;
  try {
    const parsed = JSON.parse(enrichmentJson) as TrainEnrichmentData;
    if (parsed?.source !== "ojp") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function trainEnrichmentRoutePath(
  enrichmentJson: string | null | undefined
): LatLng[] | null {
  const data = parseTrainEnrichment(enrichmentJson);
  if (!data?.routePath || data.routePath.length < 2) return null;
  return data.routePath;
}

/** Prefer full routeStops; fall back to legacy intermediateStops. */
export function trainEnrichmentStops(
  enrichmentJson: string | null | undefined
): TrainEnrichmentStop[] {
  const data = parseTrainEnrichment(enrichmentJson);
  if (!data) return [];
  if (data.routeStops && data.routeStops.length > 0) return data.routeStops;
  return data.intermediateStops || [];
}

export function formatZurichClock(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function isTrainEnrichmentStale(
  enrichmentJson: string | null | undefined,
  currentInputHash: string
): boolean {
  const data = parseTrainEnrichment(enrichmentJson);
  if (!data?.inputHash) return true;
  return data.inputHash !== currentInputHash;
}
