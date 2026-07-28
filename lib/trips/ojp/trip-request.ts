import { escapeXml } from "@/lib/trips/ojp/xml-utils";
import type { OjpTripRequestInput } from "@/lib/trips/ojp/types";

const REQUESTOR_REF = "FamilyBrain/1.0";

function renderPlaceRef(place: {
  lat?: number;
  lon?: number;
  name?: string;
}): string {
  if (
    place.lat != null &&
    place.lon != null &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lon)
  ) {
    return `<PlaceRef>
        <GeoPosition>
          <siri:Longitude>${place.lon}</siri:Longitude>
          <siri:Latitude>${place.lat}</siri:Latitude>
        </GeoPosition>
      </PlaceRef>`;
  }
  const name = place.name?.trim();
  if (name) {
    return `<PlaceRef>
        <Name>
          <Text>${escapeXml(name)}</Text>
        </Name>
      </PlaceRef>`;
  }
  throw new Error("Start oder Ziel fehlt (Ort oder Koordinaten).");
}

export function buildOjpTripRequestXml(input: OjpTripRequestInput): string {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const results = input.numberOfResults ?? 3;
  return `<?xml version="1.0" encoding="UTF-8"?>
<OJPRequest xmlns="http://www.siri.org.uk/siri" xmlns:ojp="http://www.vdv.de/ojp">
  <siri:ServiceRequest>
    <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>
    <siri:RequestorRef>${REQUESTOR_REF}</siri:RequestorRef>
    <OJPTripRequest>
      <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>
      <Origin>
        ${renderPlaceRef(input.origin)}
        <DepArrTime>${input.depArrTimeIso}</DepArrTime>
      </Origin>
      <Destination>
        ${renderPlaceRef(input.destination)}
      </Destination>
      <Params>
        <NumberOfResults>${results}</NumberOfResults>
        <IncludeTrackSections>true</IncludeTrackSections>
        <IncludeLegProjection>true</IncludeLegProjection>
        <IncludeIntermediateStops>true</IncludeIntermediateStops>
        <UseRealtimeData>none</UseRealtimeData>
        <OptimisationMethod>fastest</OptimisationMethod>
      </Params>
    </OJPTripRequest>
  </siri:ServiceRequest>
</OJPRequest>`;
}
