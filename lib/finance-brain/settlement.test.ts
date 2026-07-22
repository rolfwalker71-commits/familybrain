import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeEqualSplits,
  computeMemberBalances,
  simplifyDebts,
} from "./settlement";

describe("settlement", () => {
  it("computes net balances", () => {
    const rows = computeMemberBalances([
      {
        memberId: 1,
        displayName: "A",
        paidBase: 100,
        owedBase: 50,
        settlementsReceivedBase: 0,
        settlementsPaidBase: 0,
      },
      {
        memberId: 2,
        displayName: "B",
        paidBase: 0,
        owedBase: 50,
        settlementsReceivedBase: 0,
        settlementsPaidBase: 0,
      },
    ]);
    assert.equal(rows[0].net, 50);
    assert.equal(rows[1].net, -50);
  });

  it("simplifies debts between two people", () => {
    const balances = computeMemberBalances([
      {
        memberId: 1,
        displayName: "A",
        paidBase: 100,
        owedBase: 50,
        settlementsReceivedBase: 0,
        settlementsPaidBase: 0,
      },
      {
        memberId: 2,
        displayName: "B",
        paidBase: 0,
        owedBase: 50,
        settlementsReceivedBase: 0,
        settlementsPaidBase: 0,
      },
    ]);
    const debts = simplifyDebts(balances);
    assert.equal(debts.length, 1);
    assert.equal(debts[0].fromMemberId, 2);
    assert.equal(debts[0].toMemberId, 1);
    assert.equal(debts[0].amount, 50);
  });

  it("splits equally with remainder on last member", () => {
    const splits = computeEqualSplits(100, [1, 2, 3]);
    assert.equal(splits.get(1), 33.33);
    assert.equal(splits.get(2), 33.33);
    assert.equal(splits.get(3), 33.34);
  });
});
