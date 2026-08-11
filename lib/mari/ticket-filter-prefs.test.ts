import assert from "node:assert/strict";
import test from "node:test";
import { defaultMariTicketFilterPrefs } from "@/lib/mari/ticket-filter-prefs";
import {
  normalizeMariCardCode,
  parseCardCodesParam,
} from "@/lib/mari/customers";

test("normalizeMariCardCode accepts typical BP codes", () => {
  assert.equal(normalizeMariCardCode(" C12345 "), "C12345");
  assert.equal(normalizeMariCardCode("irugs.ch"), "irugs.ch");
  assert.equal(normalizeMariCardCode(""), null);
  assert.equal(normalizeMariCardCode("bad code!"), null);
});

test("parseCardCodesParam splits and dedupes", () => {
  assert.deepEqual(parseCardCodesParam("A,B,A"), ["A", "B"]);
  assert.deepEqual(parseCardCodesParam(""), []);
});

test("ticket filter prefs default to handler mode", () => {
  const d = defaultMariTicketFilterPrefs();
  assert.equal(d.filterMode, "handler");
  assert.deepEqual(d.customers, []);
  assert.equal(d.overdueOnly, false);
  assert.ok(d.statuses.length > 0);
});
