import { escapeXml } from "@/lib/trips/ojp/xml-utils";
import type { OjpTripRequestInput } from "@/lib/trips/ojp/types";

const REQUESTOR_REF = "FamilyBrain/1.0";

function renderPlaceRef(place: {
  lat?: number;
  lon?: number;
  name?: string;
  stopRef?: string;
}): string {
  if (place.stopRef?.trim()) {
    const ref = escapeXml(place.stopRef.trim());
    // OJP 2.0: prefer StopPointRef; also emit StopPlaceRef for DIDOK codes.
    const isDidok = /^\d{7}$/.test(place.stopRef.trim());
    return `<PlaceRef>
        ${
          isDidok
            ? `<StopPlaceRef>${ref}</StopPlaceRef>`
            : `<siri:StopPointRef>${ref}</siri:StopPointRef>`
        }
        ${
          place.name?.trim()
            ? `<Name><Text>${escapeXml(place.name.trim())}</Text></Name>`
            : ""
        }
      </PlaceRef>`;
  }
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
        ${
          place.name?.trim()
            ? `<Name><Text>${escapeXml(place.name.trim())}</Text></Name>`
            : ""
        }
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

/** OJP 2.0 trip request — default xmlns is VDV OJP, SIRI elements use siri: */
export function buildOjpTripRequestXml(input: OjpTripRequestInput): string {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const results = input.numberOfResults ?? 3;
  return `<?xml version="1.0" encoding="UTF-8"?>
<OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" version="2.0">
  <OJPRequest>
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
        </Params>
      </OJPTripRequest>
    </siri:ServiceRequest>
  </OJPRequest>
</OJP>`;
}
