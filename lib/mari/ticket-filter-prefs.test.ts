import assert from "node:assert/strict";
import test from "node:test";
import { defaultMariTicketFilterPrefs } from "@/lib/mari/ticket-filter-prefs";
import {
  normalizeCustomerSearchQuery,
  normalizeMariCardCode,
  parseCardCodesParam,
} from "@/lib/mari/customers";
import { parseMariTicketFilterPrefsPatch } from "@/lib/mari/ticket-filter-prefs-shared";

test("normalizeCustomerSearchQuery strips wildcards", () => {
  assert.equal(normalizeCustomerSearchQuery("*Bübchen*"), "Bübchen");
  assert.equal(normalizeCustomerSearchQuery("%foo%"), "foo");
  assert.equal(normalizeCustomerSearchQuery("  bar  "), "bar");
});

test("normalizeMariCardCode accepts typical BP codes", () => {
  assert.equal(normalizeMariCardCode(" C12345 "), "C12345");
  assert.equal(normalizeMariCardCode("irugs.ch"), "irugs.ch");
  assert.equal(normalizeMariCardCode(""), null);
  assert.equal(normalizeMariCardCode("a,b"), null);
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
  assert.equal(d.timelineSort, "oldest");
  assert.equal(d.listSort, "newest");
  assert.deepEqual(d.listMetaFields, [
    "kunde",
    "projekt",
    "vertrag",
    "aktivitaet",
  ]);
  assert.ok(d.statuses.length > 0);
});

test("parseMariTicketFilterPrefsPatch keeps custom status selection", () => {
  const patch = parseMariTicketFilterPrefsPatch({
    statuses: [7, 10, 4, 14, 16, 7],
    overdueOnly: true,
    filterMode: "handler",
  });
  assert.ok(patch);
  assert.deepEqual(patch!.statuses, [4, 7, 10, 14, 16]);
  assert.equal(patch!.overdueOnly, true);
  assert.equal(patch!.filterMode, "handler");
});

test("parseMariTicketFilterPrefsPatch ignores empty garbage", () => {
  assert.equal(parseMariTicketFilterPrefsPatch(null), null);
  assert.equal(parseMariTicketFilterPrefsPatch({ statuses: [] }), null);
  assert.equal(parseMariTicketFilterPrefsPatch({ filterMode: "nope" }), null);
});
