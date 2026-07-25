import type { BalanceInput, SimplifiedDebt } from "@/lib/finance-brain/settlement";
import { computeMemberBalances } from "@/lib/finance-brain/settlement";
import type {
  FinanceExpenseRow,
  FinanceExpenseSplitRow,
  FinanceLedgerMemberRow,
  FinanceLedgerRow,
  FinanceSettlementRow,
} from "@/lib/finance-brain/queries";
import {
  collectBalanceInputs,
  collectOpenPayerDebts,
} from "@/lib/finance-brain/queries";
import {
  receiptPublicUrl,
  receiptSharePublicUrl,
} from "@/lib/finance-brain/receipts";
import {
  expenseAiImagePublicUrl,
  expenseAiImageSharePublicUrl,
} from "@/lib/finance-brain/expense-image";
import { ledgerCoverPublicUrl } from "@/lib/finance-brain/cover";
import { getTripById, getTripEventById } from "@/lib/trips/queries";
import { getDocumentById } from "@/lib/db/queries";

export function serializeLedger(ledger: FinanceLedgerRow) {
  const trip =
    ledger.trip_id != null ? getTripById(ledger.trip_id) : null;
  return {
    ...ledger,
    trip_title: trip?.title ?? null,
    cover_url: ledgerCoverPublicUrl(ledger.cover_path),
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
  const linkedDoc =
    expense.document_id != null
      ? getDocumentById(expense.document_id)?.document
      : null;
  const tripEvent =
    expense.trip_event_id != null
      ? getTripEventById(expense.trip_event_id)
      : null;
  const tripEventTrip =
    tripEvent != null ? getTripById(tripEvent.trip_id) : null;
  return {
    ...rest,
    has_receipt: Boolean(receipt_path),
    receipt_url,
    has_ai_image: Boolean(ai_image_path),
    ai_image_url,
    document: linkedDoc
      ? {
          id: linkedDoc.id,
          paperless_id: linkedDoc.paperless_id,
          title: linkedDoc.title,
          original_file_name: linkedDoc.original_file_name,
        }
      : null,
    trip_event: tripEvent
      ? {
          id: tripEvent.id,
          trip_id: tripEvent.trip_id,
          trip_title: tripEventTrip?.title ?? null,
          title: tripEvent.title,
          start_date: tripEvent.start_date,
          start_time: tripEvent.start_time,
        }
      : null,
    splits,
  };
}

export function serializeSettlement(settlement: FinanceSettlementRow) {
  return settlement;
}

export function buildBalancePayload(
  inputs: BalanceInput[],
  openDebts?: SimplifiedDebt[]
) {
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
  const simplifiedDebts = (openDebts || []).map((d) => ({
    fromMemberId: d.fromMemberId,
    fromDisplayName: d.fromName,
    toMemberId: d.toMemberId,
    toDisplayName: d.toName,
    amount: d.amount,
  }));
  return { balances, simplifiedDebts };
}

/** Saldo + offene Schulden (pro Zahler) für eine Abrechnung. */
export function buildLedgerBalancePayload(ledgerId: number) {
  return buildBalancePayload(
    collectBalanceInputs(ledgerId),
    collectOpenPayerDebts(ledgerId)
  );
}
