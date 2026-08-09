import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveMailAnalysisRange,
  mailAnalysisRangeKey,
  mailAnalysisRangeDayCount,
} from "@/lib/mail/mail-analysis-range";

test("default today-today", () => {
  const r = resolveMailAnalysisRange({});
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.fromYmd, r.toYmd);
  assert.equal(r.rangeKey, mailAnalysisRangeKey(r.fromYmd, r.toYmd));
  assert.equal(r.dayCount, 1);
});

test("from/to swap if inverted", () => {
  const r = resolveMailAnalysisRange({ from: "2026-08-09", to: "2026-08-05" });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.fromYmd, "2026-08-05");
  assert.equal(r.toYmd, "2026-08-09");
  assert.equal(mailAnalysisRangeDayCount(r.fromYmd, r.toYmd), 5);
});

test("max 7 days rejected", () => {
  const r = resolveMailAnalysisRange({ from: "2026-08-01", to: "2026-08-10" });
  assert.ok("error" in r);
});

test("legacy date", () => {
  const r = resolveMailAnalysisRange({ date: "2026-08-03" });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.rangeKey, "2026-08-03_2026-08-03");
});
