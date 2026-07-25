import type { BalanceInput, SimplifiedDebt } from "@/lib/finance-brain/settlement";
import {
  computeMemberBalances,
  roundMoney,
  simplifyDebts,
} from "@/lib/finance-brain/settlement";
import type {
  FinanceExpenseRow,
  FinanceExpenseSplitRow,
  FinanceLedgerCoupleRow,
  FinanceLedgerMemberRow,
  FinanceLedgerRow,
  FinanceSettlementRow,
} from "@/lib/finance-brain/queries";
import {
  collectBalanceInputs,
  collectOpenPayerDebts,
  listFinanceLedgerCouples,
  listFinanceLedgerMembers,
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

function mapDebt(d: SimplifiedDebt) {
  return {
    fromMemberId: d.fromMemberId,
    fromDisplayName: d.fromName,
    toMemberId: d.toMemberId,
    toDisplayName: d.toName,
    amount: d.amount,
  };
}

export function serializeLedger(ledger: FinanceLedgerRow) {
  const trip =
    ledger.trip_id != null ? getTripById(ledger.trip_id) : null;
  return {
    ...ledger,
    trip_title: trip?.title ?? null,
    cover_url: ledgerCoverPublicUrl(ledger.cover_path),
  };
}

export function serializeCouple(
  couple: FinanceLedgerCoupleRow,
  memberIds: number[]
) {
  return {
    id: couple.id,
    ledger_id: couple.ledger_id,
    name: couple.name,
    created_at: couple.created_at,
    memberIds,
  };
}

export function serializeMember(
  member: FinanceLedgerMemberRow,
  coupleName?: string | null
) {
  return {
    id: member.id,
    ledger_id: member.ledger_id,
    display_name: member.display_name,
    email: member.email,
    couple_id: member.couple_id ?? null,
    couple_name: coupleName ?? null,
    invite_revoked_at: member.invite_revoked_at,
    created_at: member.created_at,
    share_url: `/share/f/${member.invite_token}`,
  };
}

export function serializeMemberWithToken(
  member: FinanceLedgerMemberRow,
  coupleName?: string | null
) {
  return {
    ...serializeMember(member, coupleName),
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
  openDebts?: SimplifiedDebt[],
  coupleContext?: {
    couples: Array<{ id: number; name: string; memberIds: number[] }>;
  }
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
  /** Payer-oriented: share of each expense owed to who paid. */
  const simplifiedDebts = (openDebts || []).map(mapDebt);
  /** Min cash-flow: fewest transfers to zero all nets. */
  const minimalDebts = simplifyDebts(raw).map(mapDebt);

  const couples = coupleContext?.couples ?? [];
  const byMember = new Map(raw.map((b) => [b.memberId, b]));
  const coupleBalances = couples.map((c) => {
    let paidBase = 0;
    let owedBase = 0;
    let settlementsPaidBase = 0;
    let settlementsReceivedBase = 0;
    let netBalance = 0;
    for (const mid of c.memberIds) {
      const b = byMember.get(mid);
      if (!b) continue;
      paidBase += b.paidBase;
      owedBase += b.owedBase;
      settlementsPaidBase += b.settlementsPaidBase;
      settlementsReceivedBase += b.settlementsReceivedBase;
      netBalance += b.net;
    }
    return {
      coupleId: c.id,
      name: c.name,
      memberIds: c.memberIds,
      paidBase: roundMoney(paidBase),
      owedBase: roundMoney(owedBase),
      settlementsPaidBase: roundMoney(settlementsPaidBase),
      settlementsReceivedBase: roundMoney(settlementsReceivedBase),
      netBalance: roundMoney(netBalance),
    };
  });

  const coupleNodes = coupleBalances.map((c) => ({
    memberId: c.coupleId,
    displayName: c.name,
    paidBase: c.paidBase,
    owedBase: c.owedBase,
    settlementsReceivedBase: c.settlementsReceivedBase,
    settlementsPaidBase: c.settlementsPaidBase,
    net: c.netBalance,
  }));
  const rawCoupleDebts = simplifyDebts(coupleNodes);

  const coupleDebts = rawCoupleDebts.map((d) => {
    const fromCouple = coupleBalances.find((c) => c.coupleId === d.fromMemberId);
    const toCouple = coupleBalances.find((c) => c.coupleId === d.toMemberId);
    const fromMembers = (fromCouple?.memberIds ?? [])
      .map((id) => byMember.get(id))
      .filter(Boolean) as typeof raw;
    const toMembers = (toCouple?.memberIds ?? [])
      .map((id) => byMember.get(id))
      .filter(Boolean) as typeof raw;
    // Debtor couple: lowest net pays; creditor couple: highest net receives.
    const payer = [...fromMembers].sort((a, b) => a.net - b.net)[0];
    const payee = [...toMembers].sort((a, b) => b.net - a.net)[0];
    return {
      fromCoupleId: d.fromMemberId,
      fromCoupleName: d.fromName,
      toCoupleId: d.toMemberId,
      toCoupleName: d.toName,
      amount: d.amount,
      fromMemberId: payer?.memberId ?? d.fromMemberId,
      fromDisplayName: payer?.displayName ?? d.fromName,
      toMemberId: payee?.memberId ?? d.toMemberId,
      toDisplayName: payee?.displayName ?? d.toName,
    };
  });

  return {
    balances,
    simplifiedDebts,
    minimalDebts,
    couples,
    coupleBalances,
    coupleDebts,
  };
}

/** Saldo + beide Ausgleichsansichten für eine Abrechnung. */
export function buildLedgerBalancePayload(ledgerId: number) {
  const coupleRows = listFinanceLedgerCouples(ledgerId);
  const members = listFinanceLedgerMembers(ledgerId);
  const couples = coupleRows.map((c) => ({
    id: c.id,
    name: c.name,
    memberIds: members.filter((m) => m.couple_id === c.id).map((m) => m.id),
  }));
  return buildBalancePayload(
    collectBalanceInputs(ledgerId),
    collectOpenPayerDebts(ledgerId),
    { couples }
  );
}
