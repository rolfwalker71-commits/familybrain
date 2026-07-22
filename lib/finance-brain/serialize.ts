import type { BalanceInput } from "@/lib/finance-brain/settlement";
import {
  computeMemberBalances,
  simplifyDebts,
} from "@/lib/finance-brain/settlement";
import type {
  FinanceExpenseRow,
  FinanceExpenseSplitRow,
  FinanceLedgerMemberRow,
  FinanceLedgerRow,
  FinanceSettlementRow,
} from "@/lib/finance-brain/queries";
import {
  receiptPublicUrl,
  receiptSharePublicUrl,
} from "@/lib/finance-brain/receipts";
import {
  expenseAiImagePublicUrl,
  expenseAiImageSharePublicUrl,
} from "@/lib/finance-brain/expense-image";
import { getTripById } from "@/lib/trips/queries";

export function serializeLedger(ledger: FinanceLedgerRow) {
  const trip =
    ledger.trip_id != null ? getTripById(ledger.trip_id) : null;
  return {
    ...ledger,
    trip_title: trip?.title ?? null,
  };
}

export function serializeMember(member: FinanceLedgerMemberRow) {
  return {
    id: member.id,
    ledger_id: member.ledger_id,
    display_name: member.display_name,
    email: member.email,
    invite_revoked_at: member.invite_revoked_at,
    created_at: member.created_at,
    share_url: `/share/f/${member.invite_token}`,
  };
}

export function serializeMemberWithToken(member: FinanceLedgerMemberRow) {
  return {
    ...serializeMember(member),
    invite_token: member.invite_token,
  };
}

export function serializeExpense(
  expense: FinanceExpenseRow,
  splits: FinanceExpenseSplitRow[],
  options?: { shareToken?: string }
) {
  const { receipt_path, ai_image_path, ai_image_prompt: _prompt, ...rest } =
    expense;
  const receipt_url = options?.shareToken
    ? receiptSharePublicUrl(options.shareToken, receipt_path)
    : receiptPublicUrl(receipt_path);
  const ai_image_url = options?.shareToken
    ? expenseAiImageSharePublicUrl(options.shareToken, ai_image_path)
    : expenseAiImagePublicUrl(ai_image_path);
  return {
    ...rest,
    has_receipt: Boolean(receipt_path),
    receipt_url,
    has_ai_image: Boolean(ai_image_path),
    ai_image_url,
    splits,
  };
}

export function serializeSettlement(settlement: FinanceSettlementRow) {
  return settlement;
}

export function buildBalancePayload(inputs: BalanceInput[]) {
  const raw = computeMemberBalances(inputs);
  const balances = raw.map((b) => ({
    memberId: b.memberId,
    displayName: b.displayName,
    paidBase: b.paidBase,
    owedBase: b.owedBase,
    settlementsReceivedBase: b.settlementsReceivedBase,
    settlementsPaidBase: b.settlementsPaidBase,
    netBalance: b.net,
  }));
  const simplifiedDebts = simplifyDebts(raw).map((d) => ({
    fromMemberId: d.fromMemberId,
    fromDisplayName: d.fromName,
    toMemberId: d.toMemberId,
    toDisplayName: d.toName,
    amount: d.amount,
  }));
  return { balances, simplifiedDebts };
}
