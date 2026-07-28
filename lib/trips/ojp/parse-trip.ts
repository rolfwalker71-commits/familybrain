import {
  extractBlocks,
  extractFirstTag,
  extractGeoPositions,
  extractTextValue,
  mergePaths,
} from "@/lib/trips/ojp/xml-utils";
import type { LatLng, OjpLeg, OjpStop, OjpTrip } from "@/lib/trips/ojp/types";

export function buildCompleteTripPath(legs: OjpLeg[]): LatLng[] {
  const segments: LatLng[][] = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.path.length >= 2) {
      segments.push(leg.path);
    } else if (
      leg.board.lat != null &&
      leg.board.lon != null &&
      leg.alight.lat != null &&
      leg.alight.lon != null
    ) {
      segments.push([
        [leg.board.lat, leg.board.lon],
        [leg.alight.lat, leg.alight.lon],
      ]);
    }
    const next = legs[i + 1];
    if (
      next &&
      leg.alight.lat != null &&
      leg.alight.lon != null &&
      next.board.lat != null &&
      next.board.lon != null
    ) {
      segments.push([
        [leg.alight.lat, leg.alight.lon],
        [next.board.lat, next.board.lon],
      ]);
    }
  }
  return mergePaths(segments);
}

function parseDurationSeconds(raw: string | null): number | undefined {
  if (!raw?.trim()) return undefined;
  const match = raw.trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) return undefined;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseStopBlock(
  block: string,
  placeIndex: Map<string, { lat: number; lon: number; name?: string }>
): OjpStop {
  const stopRef =
    extractTextValue(block, "siri:StopPointRef") ||
    extractTextValue(block, "StopPointRef") ||
    extractTextValue(block, "StopPlaceRef") ||
    undefined;
  const name =
    extractTextValue(block, "StopPointName") ||
    extractTextValue(block, "Name") ||
    (stopRef ? placeIndex.get(stopRef)?.name : undefined) ||
    "";
  const coords = stopRef ? placeIndex.get(stopRef) : undefined;
  const geo = extractGeoPositions(block)[0];
  const lat = geo?.lat ?? coords?.lat;
  const lon = geo?.lon ?? coords?.lon;
  const arrival =
    extractTextValue(block, "TimetabledTime") ||
    extractTextValue(
      extractFirstTag(block, "ServiceArrival") || "",
      "TimetabledTime"
    ) ||
    undefined;
  const departure =
    extractTextValue(
      extractFirstTag(block, "ServiceDeparture") || "",
      "TimetabledTime"
    ) || undefined;
  return {
    name,
    stopRef,
    lat,
    lon,
    arrival,
    departure,
  };
}

function parsePlacesIndex(xml: string): Map<string, { lat: number; lon: number; name?: string }> {
  const index = new Map<string, { lat: number; lon: number; name?: string }>();
  for (const placeBlock of extractBlocks(xml, "Place")) {
    const geo = extractGeoPositions(placeBlock)[0];
    if (!geo) continue;
    const name = extractTextValue(placeBlock, "Name") || undefined;
    const refs = [
      extractTextValue(placeBlock, "siri:StopPointRef"),
      extractTextValue(placeBlock, "StopPointRef"),
      extractTextValue(placeBlock, "StopPlaceRef"),
    ].filter(Boolean) as string[];
    for (const ref of refs) {
      index.set(ref, { lat: geo.lat, lon: geo.lon, name });
    }
  }
  return index;
}

function parseTimedLeg(
  legBlock: string,
  placeIndex: Map<string, { lat: number; lon: number; name?: string }>
): OjpLeg | null {
  const timedBlock = extractFirstTag(legBlock, "TimedLeg");
  if (!timedBlock) return null;

  const boardBlock = extractFirstTag(timedBlock, "LegBoard") || "";
  const alightBlock = extractFirstTag(timedBlock, "LegAlight") || "";
  const serviceBlock = extractFirstTag(timedBlock, "Service") || "";
  const mode =
    extractTextValue(extractFirstTag(serviceBlock, "Mode") || serviceBlock, "PtMode") ||
    extractTextValue(serviceBlock, "PtMode") ||
    "unknown";
  const trainNumber =
    extractTextValue(serviceBlock, "TrainNumber") ||
    extractTextValue(serviceBlock, "PublishedServiceName") ||
    undefined;
  const lineName =
    extractTextValue(serviceBlock, "PublishedServiceName") ||
    extractTextValue(serviceBlock, "PublicCode") ||
    undefined;

  const intermediateStops = extractBlocks(timedBlock, "LegIntermediate").map((block) =>
    parseStopBlock(block, placeIndex)
  );

  const legProjection = extractFirstTag(legBlock, "LegProjection") || "";
  let path: LatLng[] = extractGeoPositions(legProjection).map(
    (p) => [p.lat, p.lon] as LatLng
  );
  if (path.length === 0) {
    path = extractGeoPositions(timedBlock).map((p) => [p.lat, p.lon] as LatLng);
  }
  if (path.length === 0) {
    const stops = [
      parseStopBlock(boardBlock, placeIndex),
      ...intermediateStops,
      parseStopBlock(alightBlock, placeIndex),
    ].filter((s) => s.lat != null && s.lon != null) as Array<
      OjpStop & { lat: number; lon: number }
    >;
    path = stops.map((s) => [s.lat, s.lon]);
  }

  return {
    mode,
    trainNumber,
    lineName,
    board: parseStopBlock(boardBlock, placeIndex),
    alight: parseStopBlock(alightBlock, placeIndex),
    intermediateStops,
    path,
  };
}

function parseTripBlock(
  tripXml: string,
  placeIndex: Map<string, { lat: number; lon: number; name?: string }>
): OjpTrip {
  const id = extractTextValue(tripXml, "Id") || "trip";
  const startTime = extractTextValue(tripXml, "StartTime") || undefined;
  const endTime = extractTextValue(tripXml, "EndTime") || undefined;
  const durationSeconds = parseDurationSeconds(extractTextValue(tripXml, "Duration") || null);

  const legs: OjpLeg[] = [];
  for (const legBlock of extractBlocks(tripXml, "Leg")) {
    const leg = parseTimedLeg(legBlock, placeIndex);
    if (leg) legs.push(leg);
  }

  const path = buildCompleteTripPath(legs);
  return { id, startTime, endTime, durationSeconds, legs, path };
}

export function parseOjpTripResponse(xml: string): OjpTrip[] {
  const placeIndex = parsePlacesIndex(xml);
  const trips: OjpTrip[] = [];

  for (const resultBlock of extractBlocks(xml, "TripResult")) {
    const tripBlock = extractFirstTag(resultBlock, "Trip");
    if (!tripBlock) continue;
    trips.push(parseTripBlock(tripBlock, placeIndex));
  }

  if (trips.length === 0) {
    for (const tripBlock of extractBlocks(xml, "Trip")) {
      trips.push(parseTripBlock(tripBlock, placeIndex));
    }
  }

  return trips;
}

export function pickBestTrip(
  trips: OjpTrip[],
  opts: { trainNumber?: string | null; startTimeIso?: string | null }
): { trip: OjpTrip; warning?: string } | null {
  if (trips.length === 0) return null;

  const normalizedTrain = opts.trainNumber
    ?.replace(/\s+/g, "")
    .toUpperCase();

  if (normalizedTrain) {
    const matched = trips.find((trip) =>
      trip.legs.some((leg) =>
        leg.trainNumber?.replace(/\s+/g, "").toUpperCase().includes(normalizedTrain)
      )
    );
    if (matched) return { trip: matched };
  }

  if (opts.startTimeIso) {
    const target = Date.parse(opts.startTimeIso);
    if (Number.isFinite(target)) {
      let best: OjpTrip | null = null;
      let bestDelta = Infinity;
      for (const trip of trips) {
        if (!trip.startTime) continue;
        const delta = Math.abs(Date.parse(trip.startTime) - target);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = trip;
        }
      }
      if (best) return { trip: best };
    }
  }

  return {
    trip: trips[0],
    warning: normalizedTrain
      ? "Keine exakte Zugnummer gefunden — beste Verbindung übernommen."
      : undefined,
  };
}
