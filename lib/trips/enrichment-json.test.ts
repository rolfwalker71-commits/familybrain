import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slimEnrichmentJson } from "./enrichment-json.ts";

describe("slimEnrichmentJson", () => {
  it("leaves small payloads alone", () => {
    const raw = JSON.stringify({ status: "route_only", notice: "x" });
    assert.equal(slimEnrichmentJson(raw), raw);
  });

  it("strips nested flight objects", () => {
    const raw = JSON.stringify({
      status: "complete",
      source: "aerodatabox",
      flight: { number: "LX1952", airline: { name: "SWISS" }, pad: "x".repeat(7000) },
    });
    const slim = slimEnrichmentJson(raw);
    assert.ok(slim);
    assert.ok(!slim.includes('"flight":'));
    const parsed = JSON.parse(slim) as {
      status: string;
      flightNumber?: string;
      flightPruned?: boolean;
    };
    assert.equal(parsed.status, "complete");
    assert.equal(parsed.flightNumber, "LX1952");
    assert.equal(parsed.flightPruned, true);
    assert.ok(slim.length < raw.length);
  });
});
