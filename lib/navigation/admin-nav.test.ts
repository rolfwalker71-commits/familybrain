import assert from "node:assert/strict";
import test from "node:test";
import { inferAdminNavMode, isMyBrainPath } from "./admin-nav.ts";

test("inferAdminNavMode maps buddy areas", () => {
  assert.equal(inferAdminNavMode("/trips"), "travelbuddy");
  assert.equal(inferAdminNavMode("/trips/12"), "travelbuddy");
  assert.equal(inferAdminNavMode("/finance-brain"), "finanzbuddy");
  assert.equal(inferAdminNavMode("/finance-brain/3"), "finanzbuddy");
  assert.equal(inferAdminNavMode("/dashboard"), "mybrain");
  assert.equal(inferAdminNavMode("/documents/9"), "mybrain");
  assert.equal(inferAdminNavMode("/login"), null);
});

test("isMyBrainPath excludes buddy apps", () => {
  assert.equal(isMyBrainPath("/knowledge"), true);
  assert.equal(isMyBrainPath("/trips"), false);
  assert.equal(isMyBrainPath("/finance-brain"), false);
});
