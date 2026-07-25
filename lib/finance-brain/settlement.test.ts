import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPayerOrientedDebts,
  capSettlementToCreditorNet,
  computeEqualSplits,
  computeMemberBalances,
  roundMoney,
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

  it("four people: Harald 386 + Rolf 192 equal split (payer-oriented)", () => {
    // Hotel: others owe Harald 96.50 each
    // Boat: others owe Rolf 48 each
    // Net Harald↔Rolf: Rolf owes Harald 48.50
    const ids = [1, 2, 3, 4];
    const hotel = computeEqualSplits(386, ids);
    const boat = computeEqualSplits(192, ids);
    const paid: Record<number, number> = { 1: 386, 2: 192, 3: 0, 4: 0 };
    const names = new Map<number, string>([
      [1, "Harald"],
      [2, "Rolf"],
      [3, "Eliane"],
      [4, "Valentyna"],
    ]);
    const rows = computeMemberBalances(
      ids.map((id) => ({
        memberId: id,
        displayName: names.get(id)!,
        paidBase: paid[id],
        owedBase: roundMoney((hotel.get(id) || 0) + (boat.get(id) || 0)),
        settlementsReceivedBase: 0,
        settlementsPaidBase: 0,
      }))
    );
    const byName = Object.fromEntries(rows.map((r) => [r.displayName, r.net]));
    assert.equal(byName.Harald, 241.5);
    assert.equal(byName.Rolf, 47.5);
    assert.equal(byName.Eliane, -144.5);
    assert.equal(byName.Valentyna, -144.5);

    const edges = [
      // hotel → Harald
      { fromMemberId: 2, toMemberId: 1, amount: hotel.get(2)! },
      { fromMemberId: 3, toMemberId: 1, amount: hotel.get(3)! },
      { fromMemberId: 4, toMemberId: 1, amount: hotel.get(4)! },
      // boat → Rolf
      { fromMemberId: 1, toMemberId: 2, amount: boat.get(1)! },
      { fromMemberId: 3, toMemberId: 2, amount: boat.get(3)! },
      { fromMemberId: 4, toMemberId: 2, amount: boat.get(4)! },
    ];
    const debts = buildPayerOrientedDebts(edges, [], names);
    const label = (d: { fromName: string; toName: string; amount: number }) =>
      `${d.fromName}->${d.toName}:${d.amount}`;
    const set = new Set(debts.map(label));
    assert.equal(set.has("Eliane->Harald:96.5"), true);
    assert.equal(set.has("Eliane->Rolf:48"), true);
    assert.equal(set.has("Valentyna->Harald:96.5"), true);
    assert.equal(set.has("Valentyna->Rolf:48"), true);
    assert.equal(set.has("Rolf->Harald:48.5"), true);
    assert.equal(debts.length, 5);

    const minDebts = simplifyDebts(rows);
    const minLabel = (d: { fromName: string; toName: string; amount: number }) =>
      `${d.fromName}->${d.toName}:${d.amount}`;
    const minSet = new Set(minDebts.map(minLabel));
    assert.equal(minSet.has("Eliane->Harald:144.5"), true);
    assert.equal(minSet.has("Valentyna->Harald:97"), true);
    assert.equal(minSet.has("Valentyna->Rolf:47.5"), true);
    assert.equal(minDebts.length, 3);
  });

  it("boat-share settlement of 48 overpays Rolf net by 0.50", () => {
    // After Valentyna→Rolf 48 (gross boat share), Rolf's net credit 47.50
    // flips to −0.50 and Valentyna still owes 96.50.
    const rows = computeMemberBalances([
      {
        memberId: 1,
        displayName: "Harald",
        paidBase: 386,
        owedBase: 144.5,
        settlementsReceivedBase: 0,
        settlementsPaidBase: 0,
      },
      {
        memberId: 2,
        displayName: "Rolf",
        paidBase: 192,
        owedBase: 144.5,
        settlementsReceivedBase: 48,
        settlementsPaidBase: 0,
      },
      {
        memberId: 3,
        displayName: "Eliane",
        paidBase: 0,
        owedBase: 144.5,
        settlementsReceivedBase: 0,
        settlementsPaidBase: 0,
      },
      {
        memberId: 4,
        displayName: "Valentyna",
        paidBase: 0,
        owedBase: 144.5,
        settlementsReceivedBase: 0,
        settlementsPaidBase: 48,
      },
    ]);
    const byName = Object.fromEntries(rows.map((r) => [r.displayName, r.net]));
    assert.equal(byName.Harald, 241.5);
    assert.equal(byName.Rolf, -0.5);
    assert.equal(byName.Eliane, -144.5);
    assert.equal(byName.Valentyna, -96.5);

    const minDebts = simplifyDebts(rows);
    const minLabel = (d: { fromName: string; toName: string; amount: number }) =>
      `${d.fromName}->${d.toName}:${d.amount}`;
    const minSet = new Set(minDebts.map(minLabel));
    assert.equal(minSet.has("Eliane->Harald:144.5"), true);
    assert.equal(minSet.has("Valentyna->Harald:96.5"), true);
    assert.equal(minSet.has("Rolf->Harald:0.5"), true);
    assert.equal(minDebts.length, 3);
  });

  it("caps settlement to creditor remaining net", () => {
    const full = capSettlementToCreditorNet(47.5, 47.5);
    assert.equal(full.capped, false);
    assert.equal(full.amount, 47.5);

    const over = capSettlementToCreditorNet(48, 47.5);
    assert.equal(over.capped, true);
    assert.equal(over.amount, 47.5);
    assert.equal(over.overpayBy, 0.5);
    assert.equal(over.creditorNet, 47.5);

    const zeroCreditor = capSettlementToCreditorNet(48, -0.5);
    assert.equal(zeroCreditor.capped, true);
    assert.equal(zeroCreditor.amount, 0);
  });

  it("splits equally with remainder on last member", () => {
    const splits = computeEqualSplits(100, [1, 2, 3]);
    assert.equal(splits.get(1), 33.33);
    assert.equal(splits.get(2), 33.33);
    assert.equal(splits.get(3), 33.34);
  });
});
