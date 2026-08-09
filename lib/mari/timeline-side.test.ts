import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTimelineSide,
  timelineSideLabel,
} from "@/lib/mari/timeline-side";

test("resolveTimelineSide maps reply/note to support", () => {
  assert.equal(
    resolveTimelineSide({ kind: "reply", posType: 1, actor: "M1010" }),
    "support"
  );
  assert.equal(
    resolveTimelineSide({ kind: "note", posType: 5, internalOnly: true }),
    "support"
  );
});

test("resolveTimelineSide maps inbound/customer to customer", () => {
  assert.equal(
    resolveTimelineSide({ kind: "inbound", posType: 3 }),
    "customer"
  );
  assert.equal(
    resolveTimelineSide({ kind: "customer", posType: 8 }),
    "customer"
  );
  assert.equal(
    resolveTimelineSide({ kind: "attachment", posType: 3 }),
    "customer"
  );
});

test("resolveTimelineSide maps change/system", () => {
  assert.equal(resolveTimelineSide({ kind: "change" }), "system");
  assert.equal(resolveTimelineSide({ kind: "system", posType: 4 }), "system");
  assert.equal(timelineSideLabel("support"), "Support (wir)");
  assert.equal(timelineSideLabel("customer"), "Kunde");
});
