import assert from "node:assert/strict";
import test from "node:test";
import {
  homePathForModules,
  isAppModule,
  normalizeAppModules,
} from "@/lib/users/modules";

test("normalizeAppModules filters unknowns", () => {
  assert.deepEqual(
    normalizeAppModules(["microsoft", "nope", "maringo", "microsoft"]),
    ["microsoft", "maringo"]
  );
});

test("isAppModule", () => {
  assert.equal(isAppModule("travel"), true);
  assert.equal(isAppModule("chat"), false);
});

test("homePathForModules priority", () => {
  assert.equal(homePathForModules(["finance", "travel"]), "/trips");
  assert.equal(homePathForModules(["finance", "microsoft"]), "/microsoft");
  assert.equal(homePathForModules(["maringo"]), "/maringo");
  assert.equal(homePathForModules([]), "/account");
});
