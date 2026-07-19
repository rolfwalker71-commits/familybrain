import assert from "node:assert/strict";
import test from "node:test";
import {
  clampSchedulerIntervalMinutes,
  DELTA_OVERLAP_MS,
  parseSchedulerEnabled,
} from "./constants.ts";

test("clampSchedulerIntervalMinutes enforces 5..1440", () => {
  assert.equal(clampSchedulerIntervalMinutes(1), 5);
  assert.equal(clampSchedulerIntervalMinutes(30), 30);
  assert.equal(clampSchedulerIntervalMinutes(2000), 1440);
  assert.equal(clampSchedulerIntervalMinutes("45"), 45);
  assert.equal(clampSchedulerIntervalMinutes("nope"), 30);
});

test("parseSchedulerEnabled defaults to true", () => {
  assert.equal(parseSchedulerEnabled(null), true);
  assert.equal(parseSchedulerEnabled(""), true);
  assert.equal(parseSchedulerEnabled("0"), false);
  assert.equal(parseSchedulerEnabled("false"), false);
  assert.equal(parseSchedulerEnabled("1"), true);
});

test("delta overlap is two hours", () => {
  assert.equal(DELTA_OVERLAP_MS, 2 * 60 * 60 * 1000);
});
