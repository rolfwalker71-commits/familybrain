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

  it("repayment from debtor to creditor reduces both nets toward zero", () => {
    // B owes A 50; B pays A 50 back.
    const rows = computeMemberBalances([
      {
        memberId: 1,
        displayName: "A",
        paidBase: 100,
        owedBase: 50,
        settlementsReceivedBase: 50,
        settlementsPaidBase: 0,
      },
      {
        memberId: 2,
        displayName: "B",
        paidBase: 0,
        owedBase: 50,
        settlementsReceivedBase: 0,
        settlementsPaidBase: 50,
      },
    ]);
    assert.equal(rows[0].net, 0);
    assert.equal(rows[1].net, 0);
    assert.equal(simplifyDebts(rows).length, 0);
  });

  it("partial repayment shrinks suggested debt", () => {
    const rows = computeMemberBalances([
      {
        memberId: 1,
        displayName: "Harald",
        paidBase: 400,
        owedBase: 100,
        settlementsReceivedBase: 100,
        settlementsPaidBase: 0,
      },
      {
        memberId: 2,
        displayName: "Rolf",
        paidBase: 0,
        owedBase: 300,
        settlementsReceivedBase: 0,
        settlementsPaidBase: 100,
      },
    ]);
    // Before repayment Harald +300 / Rolf -300; after 100 paid: +200 / -200
    assert.equal(rows[0].net, 200);
    assert.equal(rows[1].net, -200);
    const debts = simplifyDebts(rows);
    assert.equal(debts.length, 1);
    assert.equal(debts[0].fromMemberId, 2);
    assert.equal(debts[0].toMemberId, 1);
    assert.equal(debts[0].amount, 200);
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
