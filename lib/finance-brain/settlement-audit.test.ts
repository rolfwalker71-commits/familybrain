import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPayerOrientedDebts,
  roundMoney,
} from "./settlement";
import { explainPairDebt, type ShareMatrixExpense } from "./settlement-audit";

describe("explainPairDebt", () => {
  it("nets Eliane→Harald bookings and settlements like Nach Zahler", () => {
    const names = new Map([
      [1, "Harald"],
      [3, "Eliane"],
    ]);
    const expenses: ShareMatrixExpense[] = [
      {
        id: 1,
        description: "Restzahlung Kreuzfahrt",
        amount_base: 12563.76,
        paid_by_member_id: 1,
        splits: [{ member_id: 3, share_amount_base: 3140.94 }],
      },
      {
        id: 2,
        description: "Hotel Marriott",
        amount_base: 386,
        paid_by_member_id: 1,
        splits: [{ member_id: 3, share_amount_base: 96.5 }],
      },
      {
        id: 3,
        description: "Transfer",
        amount_base: 113.4,
        paid_by_member_id: 1,
        splits: [{ member_id: 3, share_amount_base: 28.35 }],
      },
      {
        id: 4,
        description: "Hotel Barcelona",
        amount_base: 825.5,
        paid_by_member_id: 3,
        splits: [{ member_id: 1, share_amount_base: 206.63 }],
      },
      {
        id: 5,
        description: "Karibik",
        amount_base: 5741.4,
        paid_by_member_id: 3,
        pre_settled: true,
        splits: [{ member_id: 1, share_amount_base: 1435.35 }],
      },
    ];
    const settlements = [
      {
        id: 10,
        fromMemberId: 1,
        toMemberId: 3,
        amountBase: 1435.35,
        note: "Auto-Ausgleich: Karibik",
      },
    ];

    const explained = explainPairDebt(expenses, settlements, 3, 1, names);
    assert.equal(explained.oweTotal, 3265.79);
    assert.equal(explained.creditTotal, roundMoney(206.63 + 1435.35));
    assert.equal(explained.settlementReceivedTotal, 1435.35);
    // Auto-Ausgleich Harald→Eliane cancels Karibik credit edge in net:
    // 3265.79 - 206.63 - 1435.35 + 1435.35 = 3059.16
    assert.equal(explained.netAmount, 3059.16);

    const edges = [
      { fromMemberId: 3, toMemberId: 1, amount: 3140.94 },
      { fromMemberId: 3, toMemberId: 1, amount: 96.5 },
      { fromMemberId: 3, toMemberId: 1, amount: 28.35 },
      { fromMemberId: 1, toMemberId: 3, amount: 206.63 },
      { fromMemberId: 1, toMemberId: 3, amount: 1435.35 },
    ];
    const debts = buildPayerOrientedDebts(
      edges,
      [{ fromMemberId: 1, toMemberId: 3, amount: 1435.35 }],
      names
    );
    const pair = debts.find(
      (d) => d.fromMemberId === 3 && d.toMemberId === 1
    );
    assert.equal(pair?.amount, explained.netAmount);
  });
});
