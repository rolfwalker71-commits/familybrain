import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSINESS_KNOWLEDGE_AREA,
  sqlDocIsBusiness,
  sqlDocNotBusiness,
} from "./business.ts";

test("business knowledge area name", () => {
  assert.equal(BUSINESS_KNOWLEDGE_AREA, "Geschäftlich");
});

test("SQL fragments use document alias", () => {
  assert.match(sqlDocIsBusiness("d"), /document_tags/);
  assert.match(sqlDocIsBusiness("d"), /geschäftlich/);
  assert.match(sqlDocIsBusiness("pd"), /pd\.id/);
  assert.match(sqlDocNotBusiness("d"), /^NOT /);
});
