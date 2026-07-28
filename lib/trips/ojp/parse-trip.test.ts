import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompleteTripPath,
  parseOjpTripResponse,
  pickBestTrip,
} from "@/lib/trips/ojp/parse-trip";
import { parseOjpLocationResponse } from "@/lib/trips/ojp/location-request";
import {
  parseTrainEnrichment,
  trainEnrichmentRoutePath,
} from "@/lib/trips/train-enrichment";

const SAMPLE_LOCATION = `<?xml version="1.0" encoding="utf-8"?>
<OJP xmlns:siri="http://www.siri.org.uk/siri" version="2.0" xmlns="http://www.vdv.de/ojp">
  <OJPResponse>
    <siri:ServiceDelivery>
      <OJPLocationInformationDelivery>
        <PlaceResult>
          <Place>
            <StopPlace>
              <StopPlaceRef>ch:1:sloid:3016</StopPlaceRef>
              <StopPlaceName><Text xml:lang="de">Zürich Flughafen</Text></StopPlaceName>
            </StopPlace>
            <Name><Text xml:lang="de">Zürich Flughafen (Kloten)</Text></Name>
            <GeoPosition>
              <siri:Longitude>8.5624</siri:Longitude>
              <siri:Latitude>47.45039</siri:Latitude>
            </GeoPosition>
          </Place>
          <Complete>true</Complete>
          <Probability>0.8</Probability>
        </PlaceResult>
        <PlaceResult>
          <Place>
            <StopPlace>
              <StopPlaceRef>ch:1:sloid:80301</StopPlaceRef>
              <StopPlaceName><Text xml:lang="de">Zürich Flughafen, OPC</Text></StopPlaceName>
            </StopPlace>
            <Name><Text xml:lang="de">Zürich Flughafen, OPC (Kloten)</Text></Name>
            <GeoPosition>
              <siri:Longitude>8.56566</siri:Longitude>
              <siri:Latitude>47.45265</siri:Latitude>
            </GeoPosition>
          </Place>
        </PlaceResult>
      </OJPLocationInformationDelivery>
    </siri:ServiceDelivery>
  </OJPResponse>
</OJP>`;

const SAMPLE_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<OJPResponse>
  <Place>
    <StopPoint>
      <siri:StopPointRef>8503000</siri:StopPointRef>
    </StopPoint>
    <Name><Text>Zürich HB</Text></Name>
    <GeoPosition>
      <siri:Longitude>8.540</siri:Longitude>
      <siri:Latitude>47.378</siri:Latitude>
    </GeoPosition>
  </Place>
  <Place>
    <StopPoint>
      <siri:StopPointRef>8507000</siri:StopPointRef>
    </StopPoint>
    <Name><Text>Bern</Text></Name>
    <GeoPosition>
      <siri:Longitude>7.439</siri:Longitude>
      <siri:Latitude>46.949</siri:Latitude>
    </GeoPosition>
  </Place>
  <TripResult>
    <Trip>
      <Id>trip-1</Id>
      <StartTime>2026-08-15T06:30:00Z</StartTime>
      <EndTime>2026-08-15T07:00:00Z</EndTime>
      <Duration>PT30M</Duration>
      <Leg>
        <TimedLeg>
          <LegBoard>
            <siri:StopPointRef>8503000</siri:StopPointRef>
            <StopPointName><Text>Zürich HB</Text></StopPointName>
          </LegBoard>
          <LegIntermediate>
            <StopPointName><Text>Olten</Text></StopPointName>
          </LegIntermediate>
          <LegAlight>
            <siri:StopPointRef>8507000</siri:StopPointRef>
            <StopPointName><Text>Bern</Text></StopPointName>
          </LegAlight>
          <Service>
            <Mode><PtMode>rail</PtMode></Mode>
            <TrainNumber>IC8</TrainNumber>
          </Service>
        </TimedLeg>
        <LegProjection>
          <GeoPosition><siri:Latitude>47.378</siri:Latitude><siri:Longitude>8.540</siri:Longitude></GeoPosition>
          <GeoPosition><siri:Latitude>47.350</siri:Latitude><siri:Longitude>8.200</siri:Longitude></GeoPosition>
          <GeoPosition><siri:Latitude>46.949</siri:Latitude><siri:Longitude>7.439</siri:Longitude></GeoPosition>
        </LegProjection>
      </Leg>
    </Trip>
  </TripResult>
</OJPResponse>`;

describe("parseOjpLocationResponse", () => {
  it("parses PlaceResult stops from OJP 2.0", () => {
    const stops = parseOjpLocationResponse(SAMPLE_LOCATION);
    assert.equal(stops.length, 2);
    assert.equal(stops[0].stopRef, "ch:1:sloid:3016");
    assert.equal(stops[0].name, "Zürich Flughafen");
    assert.equal(stops[0].lat, 47.45039);
    assert.equal(stops[0].lon, 8.5624);
  });
});

describe("buildCompleteTripPath", () => {
  it("connects multi-leg trips including transfer gaps", () => {
    const path = buildCompleteTripPath([
      {
        mode: "rail",
        board: { name: "Altdorf", lat: 46.88, lon: 8.64 },
        alight: { name: "Zürich HB", lat: 47.37, lon: 8.54 },
        intermediateStops: [],
        path: [
          [46.88, 8.64],
          [47.37, 8.54],
        ],
      },
      {
        mode: "rail",
        board: { name: "Zürich HB", lat: 47.37, lon: 8.54 },
        alight: { name: "Flughafen", lat: 47.45, lon: 8.56 },
        intermediateStops: [],
        path: [],
      },
    ]);
    assert.equal(path.length, 3);
    assert.deepEqual(path[0], [46.88, 8.64]);
    assert.deepEqual(path[path.length - 1], [47.45, 8.56]);
  });
});

describe("parseOjpTripResponse", () => {
  it("extracts trip path and stops", () => {
    const trips = parseOjpTripResponse(SAMPLE_RESPONSE);
    assert.equal(trips.length, 1);
    assert.equal(trips[0].legs.length, 1);
    assert.equal(trips[0].legs[0].board.name, "Zürich HB");
    assert.equal(trips[0].legs[0].alight.name, "Bern");
    assert.equal(trips[0].path.length, 3);
    assert.equal(trips[0].legs[0].intermediateStops[0]?.name, "Olten");
  });

  it("parses namespaced OJP 2.0 tags", () => {
    const namespaced = `<?xml version="1.0"?>
<ojp:OJP xmlns:ojp="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri">
  <ojp:TripResult>
    <ojp:Trip>
      <ojp:Id>ns-1</ojp:Id>
      <ojp:StartTime>2026-08-15T06:30:00Z</ojp:StartTime>
      <ojp:EndTime>2026-08-15T07:00:00Z</ojp:EndTime>
      <ojp:Duration>PT30M</ojp:Duration>
      <ojp:Leg>
        <ojp:TimedLeg>
          <ojp:LegBoard>
            <siri:StopPointRef>8503000</siri:StopPointRef>
            <ojp:StopPointName><ojp:Text>Zürich HB</ojp:Text></ojp:StopPointName>
          </ojp:LegBoard>
          <ojp:LegAlight>
            <siri:StopPointRef>8507000</siri:StopPointRef>
            <ojp:StopPointName><ojp:Text>Bern</ojp:Text></ojp:StopPointName>
          </ojp:LegAlight>
          <ojp:Service>
            <ojp:Mode><ojp:PtMode>rail</ojp:PtMode></ojp:Mode>
            <ojp:TrainNumber>IC8</ojp:TrainNumber>
          </ojp:Service>
        </ojp:TimedLeg>
        <ojp:LegProjection>
          <ojp:GeoPosition><siri:Latitude>47.378</siri:Latitude><siri:Longitude>8.540</siri:Longitude></ojp:GeoPosition>
          <ojp:GeoPosition><siri:Latitude>46.949</siri:Latitude><siri:Longitude>7.439</siri:Longitude></ojp:GeoPosition>
        </ojp:LegProjection>
      </ojp:Leg>
    </ojp:Trip>
  </ojp:TripResult>
</ojp:OJP>`;
    const trips = parseOjpTripResponse(namespaced);
    assert.equal(trips.length, 1);
    assert.equal(trips[0].id, "ns-1");
    assert.equal(trips[0].path.length, 2);
  });
});

describe("pickBestTrip", () => {
  it("prefers train number match", () => {
    const trips = parseOjpTripResponse(SAMPLE_RESPONSE);
    const picked = pickBestTrip(trips, { trainNumber: "IC8" });
    assert.ok(picked);
    assert.equal(picked.trip.id, "trip-1");
  });
});

describe("train enrichment helpers", () => {
  it("reads route path from enrichment json", () => {
    const json = JSON.stringify({
      status: "complete",
      source: "ojp",
      fetchedAt: "2026-01-01T00:00:00Z",
      inputHash: "abc",
      routePath: [
        [47.37, 8.54],
        [46.95, 7.44],
      ],
    });
    const data = parseTrainEnrichment(json);
    assert.equal(data?.source, "ojp");
    assert.deepEqual(trainEnrichmentRoutePath(json), [
      [47.37, 8.54],
      [46.95, 7.44],
    ]);
  });
});
