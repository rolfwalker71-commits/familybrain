import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceExpenseDirection,
  coerceLedgerKind,
} from "./queries";

describe("ledger kind & expense direction", () => {
  it("coerces ledger kinds with split default", () => {
    assert.equal(coerceLedgerKind("normal"), "normal");
    assert.equal(coerceLedgerKind("split"), "split");
    assert.equal(coerceLedgerKind(null), "split");
    assert.equal(coerceLedgerKind("other"), "split");
  });

  it("coerces expense directions with expense default", () => {
    assert.equal(coerceExpenseDirection("income"), "income");
    assert.equal(coerceExpenseDirection("expense"), "expense");
    assert.equal(coerceExpenseDirection(undefined), "expense");
    assert.equal(coerceExpenseDirection("other"), "expense");
  });
});
