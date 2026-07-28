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

export function parseOjpLocationResponse(xml: string): OjpStopCandidate[] {
  const results: OjpStopCandidate[] = [];
  const seen = new Set<string>();

  for (const locationBlock of extractBlocks(xml, "Location")) {
    const place =
      extractFirstTag(locationBlock, "StopPlace") ||
      extractFirstTag(locationBlock, "StopPoint") ||
      locationBlock;
    const stopRef =
      extractTextValue(place, "StopPlaceRef") ||
      extractTextValue(place, "siri:StopPointRef") ||
      extractTextValue(place, "StopPointRef") ||
      extractTextValue(locationBlock, "StopPlaceRef") ||
      extractTextValue(locationBlock, "siri:StopPointRef") ||
      "";
    const name =
      extractTextValue(place, "StopPlaceName") ||
      extractTextValue(place, "StopPointName") ||
      extractTextValue(locationBlock, "LocationName") ||
      extractTextValue(locationBlock, "Name") ||
      "";
    const geo =
      extractGeoPositions(locationBlock)[0] || extractGeoPositions(place)[0];
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
