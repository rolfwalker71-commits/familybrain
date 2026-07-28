import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOjpTripResponse, pickBestTrip } from "@/lib/trips/ojp/parse-trip";
import {
  parseTrainEnrichment,
  trainEnrichmentRoutePath,
} from "@/lib/trips/train-enrichment";

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
