import { escapeXml } from "@/lib/trips/ojp/xml-utils";
import {
  extractBlocks,
  extractFirstTag,
  extractGeoPositions,
  extractTextValue,
} from "@/lib/trips/ojp/xml-utils";

export type OjpStopCandidate = {
  stopRef: string;
  name: string;
  lat: number;
  lon: number;
};

/** OJP 2.0 location information request. */
export function buildOjpLocationRequestXml(query: string): string {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const q = query.trim();
  return `<?xml version="1.0" encoding="UTF-8"?>
<OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" version="2.0">
  <OJPRequest>
    <siri:ServiceRequest>
      <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>
      <siri:RequestorRef>FamilyBrain/1.0</siri:RequestorRef>
      <OJPLocationInformationRequest>
        <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>
        <InitialInput>
          <Name>${escapeXml(q)}</Name>
        </InitialInput>
        <Restrictions>
          <Type>stop</Type>
          <NumberOfResults>8</NumberOfResults>
        </Restrictions>
      </OJPLocationInformationRequest>
    </siri:ServiceRequest>
  </OJPRequest>
</OJP>`;
}

function parsePlaceCandidate(block: string): OjpStopCandidate | null {
  const place =
    extractFirstTag(block, "Place") ||
    extractFirstTag(block, "Location") ||
    block;
  const stopPlace =
    extractFirstTag(place, "StopPlace") ||
    extractFirstTag(place, "StopPoint") ||
    place;
  const stopRef =
    extractTextValue(stopPlace, "StopPlaceRef") ||
    extractTextValue(stopPlace, "siri:StopPointRef") ||
    extractTextValue(stopPlace, "StopPointRef") ||
    extractTextValue(place, "StopPlaceRef") ||
    extractTextValue(place, "siri:StopPointRef") ||
    "";
  const name =
    extractTextValue(stopPlace, "StopPlaceName") ||
    extractTextValue(stopPlace, "StopPointName") ||
    extractTextValue(place, "Name") ||
    extractTextValue(place, "LocationName") ||
    extractTextValue(block, "Name") ||
    "";
  const geo =
    extractGeoPositions(place)[0] ||
    extractGeoPositions(stopPlace)[0] ||
    extractGeoPositions(block)[0];
  if (!name.trim() || !geo) return null;
  return {
    stopRef: stopRef || `${name.trim()}|${geo.lat}|${geo.lon}`,
    name: name.trim(),
    lat: geo.lat,
    lon: geo.lon,
  };
}

/**
 * OJP 2.0 returns `<PlaceResult><Place>…`, older docs mention `<Location>`.
 * Accept both.
 */
export function parseOjpLocationResponse(xml: string): OjpStopCandidate[] {
  const results: OjpStopCandidate[] = [];
  const seen = new Set<string>();

  const blocks = [
    ...extractBlocks(xml, "PlaceResult"),
    ...extractBlocks(xml, "Location"),
  ];

  for (const block of blocks) {
    const candidate = parsePlaceCandidate(block);
    if (!candidate) continue;
    const key = candidate.stopRef || `${candidate.name}|${candidate.lat}|${candidate.lon}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(candidate);
  }

  return results;
}
