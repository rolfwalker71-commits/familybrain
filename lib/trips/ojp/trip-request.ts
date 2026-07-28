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
    // LocationInformation returns StopPlaceRef (DIDOK / SLOID).
    return `<PlaceRef>
        <StopPlaceRef>${ref}</StopPlaceRef>
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

/** Format a Zurich-local wall clock as OJP DepArrTime with offset. */
export function formatOjpDepArrTime(dateYmd: string, timeHm: string): string {
  const hhmm = timeHm.match(/^(\d{1,2}):(\d{2})/);
  if (!hhmm) throw new Error("Ungültige Abfahrtszeit.");
  const time = `${hhmm[1].padStart(2, "0")}:${hhmm[2]}:00`;

  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Zurich",
    timeZoneName: "longOffset",
    hour: "2-digit",
  })
    .formatToParts(new Date(`${dateYmd}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;

  let offset = "+01:00";
  if (offsetName) {
    const m = offsetName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (m) {
      offset = `${m[1]}${m[2].padStart(2, "0")}:${(m[3] || "00").padStart(2, "0")}`;
    } else if (/GMT/i.test(offsetName) && !/[+-]/.test(offsetName)) {
      offset = "+00:00";
    }
  }

  const iso = `${dateYmd}T${time}${offset}`;
  if (Number.isNaN(Date.parse(iso))) {
    throw new Error("Ungültiges Datum oder Abfahrtszeit.");
  }
  return iso;
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
