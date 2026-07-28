import type { LatLng } from "@/lib/trips/ojp/types";

export type TrainEnrichmentStop = {
  name: string;
  arrival?: string;
  departure?: string;
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

export function isTrainEnrichmentStale(
  enrichmentJson: string | null | undefined,
  currentInputHash: string
): boolean {
  const data = parseTrainEnrichment(enrichmentJson);
  if (!data?.inputHash) return true;
  return data.inputHash !== currentInputHash;
}
