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

export function buildOjpLocationRequestXml(query: string): string {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const q = query.trim();
  return `<?xml version="1.0" encoding="UTF-8"?>
<OJPRequest xmlns="http://www.siri.org.uk/siri" xmlns:ojp="http://www.vdv.de/ojp">
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
</OJPRequest>`;
}

export function parseOjpLocationResponse(xml: string): OjpStopCandidate[] {
  const results: OjpStopCandidate[] = [];
  const seen = new Set<string>();

  for (const locationBlock of extractBlocks(xml, "Location")) {
    const inner = extractFirstTag(locationBlock, "Location") || locationBlock;
    const stopPlace = extractFirstTag(inner, "StopPlace") || inner;
    const stopRef =
      extractTextValue(stopPlace, "StopPlaceRef") ||
      extractTextValue(stopPlace, "siri:StopPointRef") ||
      extractTextValue(stopPlace, "StopPointRef") ||
      "";
    const name =
      extractTextValue(stopPlace, "StopPlaceName") ||
      extractTextValue(inner, "LocationName") ||
      extractTextValue(locationBlock, "Name") ||
      "";
    const geo =
      extractGeoPositions(inner)[0] || extractGeoPositions(stopPlace)[0];
    if (!name.trim() || !geo) continue;
    const key = stopRef || `${name}|${geo.lat}|${geo.lon}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      stopRef: stopRef || key,
      name: name.trim(),
      lat: geo.lat,
      lon: geo.lon,
    });
  }

  return results;
}
