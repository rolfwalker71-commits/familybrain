import { randomBytes } from "crypto";
import fs from "fs";
import { getDb } from "@/lib/db/client";
import { getTripById } from "@/lib/trips/queries";
import { nowIso } from "@/lib/utils/dates";
import { DEFAULT_BASE_CURRENCY, type SplitMode } from "@/lib/finance-brain/constants";
import {
  computeEqualSplits,
  computeShareSplits,
  roundMoney,
  toBaseAmount,
  type BalanceInput,
} from "@/lib/finance-brain/settlement";

export type FinanceLedgerRow = {
  id: number;
  title: string;
  base_currency: string;
  trip_id: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type FinanceLedgerMemberRow = {
  id: number;
  ledger_id: number;
  display_name: string;
  email: string | null;
  invite_token: string;
  invite_revoked_at: string | null;
  created_at: string;
};

export type FinanceExpenseRow = {
  id: number;
  ledger_id: number;
  paid_by_member_id: number;
  created_by_member_id: number | null;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_base: number;
  description: string | null;
  expense_date: string | null;
  document_id: number | null;
  trip_event_id: number | null;
  receipt_path: string | null;
  category_label: string | null;
  category_tone: string | null;
  ai_image_path: string | null;
  ai_image_prompt: string | null;
  place_name: string | null;
  place_lat: number | null;
  place_lon: number | null;
  notified_at: string | null;
  split_mode: string;
  created_at: string;
  updated_at: string;
};

export type FinanceExpenseSplitRow = {
  expense_id: number;
  member_id: number;
  share_amount_base: number;
  share_units: number | null;
};

export type FinanceSettlementRow = {
  id: number;
  ledger_id: number;
  from_member_id: number;
  to_member_id: number;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_base: number;
  note: string | null;
  settled_at: string;
  created_by_member_id: number | null;
  notified_at: string | null;
  created_at: string;
};

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function listFinanceLedgers(): FinanceLedgerRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM finance_ledgers
       WHERE archived_at IS NULL
       ORDER BY updated_at DESC, id DESC`
    )
    .all() as FinanceLedgerRow[];
}

export function getFinanceLedgerById(id: number): FinanceLedgerRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM finance_ledgers WHERE id = ?`)
    .get(id) as FinanceLedgerRow | undefined;
  return row ?? null;
}

export function getFinanceLedgerByTripId(
  tripId: number
): FinanceLedgerRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM finance_ledgers
       WHERE trip_id = ? AND archived_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(tripId) as FinanceLedgerRow | undefined;
  return row ?? null;
}

export function createFinanceLedger(input: {
  title: string;
  baseCurrency?: string;
  tripId?: number | null;
  memberNames?: string[];
}): FinanceLedgerRow {
  const db = getDb();
  const ts = nowIso();
  const baseCurrency = (input.baseCurrency || DEFAULT_BASE_CURRENCY)
    .trim()
    .toUpperCase();
  if (input.tripId != null && !getTripById(input.tripId)) {
    throw new Error("Reise nicht gefunden");
  }
  const result = db
    .prepare(
      `INSERT INTO finance_ledgers (title, base_currency, trip_id, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, NULL)`
    )
    .run(
      input.title.trim(),
      baseCurrency,
      input.tripId ?? null,
      ts,
      ts
    );
  const ledgerId = Number(result.lastInsertRowid);
  const names = input.memberNames?.filter((n) => n.trim()) ?? [];
  for (const name of names) {
    addFinanceLedgerMember(ledgerId, { displayName: name });
  }
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) throw new Error("Abrechnung konnte nicht angelegt werden");
  return ledger;
}

export function updateFinanceLedger(
  id: number,
  input: {
    title?: string;
    baseCurrency?: string;
    tripId?: number | null;
    archived?: boolean;
  }
): FinanceLedgerRow {
  const existing = getFinanceLedgerById(id);
  if (!existing) throw new Error("Abrechnung nicht gefunden");
  if (input.tripId !== undefined && input.tripId != null) {
    if (!getTripById(input.tripId)) throw new Error("Reise nicht gefunden");
  }
  const db = getDb();
  db.prepare(
    `UPDATE finance_ledgers SET
       title = ?,
       base_currency = ?,
       trip_id = ?,
       archived_at = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(
    input.title !== undefined ? input.title.trim() : existing.title,
    input.baseCurrency !== undefined
      ? input.baseCurrency.trim().toUpperCase()
      : existing.base_currency,
    input.tripId !== undefined ? input.tripId : existing.trip_id,
    input.archived === true
      ? nowIso()
      : input.archived === false
        ? null
        : existing.archived_at,
    nowIso(),
    id
  );
  return getFinanceLedgerById(id)!;
}

export function deleteFinanceLedger(id: number): void {
  const db = getDb();
  const existing = getFinanceLedgerById(id);
  if (!existing) throw new Error("Abrechnung nicht gefunden");
  db.prepare(`DELETE FROM finance_ledgers WHERE id = ?`).run(id);
}

export function listFinanceLedgerMembers(
  ledgerId: number
): FinanceLedgerMemberRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM finance_ledger_members
       WHERE ledger_id = ?
       ORDER BY display_name COLLATE NOCASE, id`
    )
    .all(ledgerId) as FinanceLedgerMemberRow[];
}

export function getFinanceLedgerMemberById(
  memberId: number
): FinanceLedgerMemberRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM finance_ledger_members WHERE id = ?`)
    .get(memberId) as FinanceLedgerMemberRow | undefined;
  return row ?? null;
}

export function getFinanceLedgerMemberByToken(
  token: string
): (FinanceLedgerMemberRow & { ledger: FinanceLedgerRow }) | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM finance_ledger_members
       WHERE invite_token = ? AND invite_revoked_at IS NULL`
    )
    .get(trimmed) as FinanceLedgerMemberRow | undefined;
  if (!row) return null;
  const ledger = getFinanceLedgerById(row.ledger_id);
  if (!ledger || ledger.archived_at) return null;
  return { ...row, ledger };
}

export function addFinanceLedgerMember(
  ledgerId: number,
  input: { displayName: string; email?: string | null }
): FinanceLedgerMemberRow {
  if (!getFinanceLedgerById(ledgerId)) {
    throw new Error("Abrechnung nicht gefunden");
  }
  const db = getDb();
  const token = newToken();
  const ts = nowIso();
  const result = db
    .prepare(
      `INSERT INTO finance_ledger_members
         (ledger_id, display_name, email, invite_token, invite_revoked_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`
    )
    .run(
      ledgerId,
      input.displayName.trim(),
      input.email?.trim() || null,
      token,
      ts
    );
  touchLedger(ledgerId);
  return db
    .prepare(`SELECT * FROM finance_ledger_members WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as FinanceLedgerMemberRow;
}

export function updateFinanceLedgerMember(
  memberId: number,
  input: { displayName?: string; email?: string | null }
): FinanceLedgerMemberRow {
  const existing = getFinanceLedgerMemberById(memberId);
  if (!existing) throw new Error("Teilnehmer nicht gefunden");
  const db = getDb();
  db.prepare(
    `UPDATE finance_ledger_members SET
       display_name = ?,
       email = ?
     WHERE id = ?`
  ).run(
    input.displayName !== undefined
      ? input.displayName.trim()
      : existing.display_name,
    input.email !== undefined ? input.email?.trim() || null : existing.email,
    memberId
  );
  touchLedger(existing.ledger_id);
  return getFinanceLedgerMemberById(memberId)!;
}

export function revokeFinanceLedgerMember(
  memberId: number
): FinanceLedgerMemberRow | null {
  const existing = getFinanceLedgerMemberById(memberId);
  if (!existing) return null;
  const db = getDb();
  db.prepare(
    `UPDATE finance_ledger_members SET invite_revoked_at = ? WHERE id = ?`
  ).run(nowIso(), memberId);
  touchLedger(existing.ledger_id);
  return getFinanceLedgerMemberById(memberId);
}

export function rotateFinanceLedgerMemberToken(
  memberId: number
): FinanceLedgerMemberRow {
  const existing = getFinanceLedgerMemberById(memberId);
  if (!existing) throw new Error("Teilnehmer nicht gefunden");
  const db = getDb();
  const token = newToken();
  db.prepare(
    `UPDATE finance_ledger_members SET
       invite_token = ?,
       invite_revoked_at = NULL
     WHERE id = ?`
  ).run(token, memberId);
  touchLedger(existing.ledger_id);
  return getFinanceLedgerMemberById(memberId)!;
}

function touchLedger(ledgerId: number) {
  getDb()
    .prepare(`UPDATE finance_ledgers SET updated_at = ? WHERE id = ?`)
    .run(nowIso(), ledgerId);
}

export function listFinanceExpenses(ledgerId: number): FinanceExpenseRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM finance_expenses
       WHERE ledger_id = ?
       ORDER BY COALESCE(expense_date, created_at) DESC, id DESC`
    )
    .all(ledgerId) as FinanceExpenseRow[];
}

export function getFinanceExpenseById(
  expenseId: number
): FinanceExpenseRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM finance_expenses WHERE id = ?`)
    .get(expenseId) as FinanceExpenseRow | undefined;
  return row ?? null;
}

export function listFinanceExpenseSplits(
  expenseId: number
): FinanceExpenseSplitRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM finance_expense_splits WHERE expense_id = ?`)
    .all(expenseId) as FinanceExpenseSplitRow[];
}

export type ExpenseSplitInput =
  | { mode: "equal"; memberIds: number[] }
  | { mode: "exact"; amounts: Array<{ memberId: number; amountBase: number }> }
  | {
      mode: "shares";
      shares: Array<{ memberId: number; units: number }>;
    };

export function createFinanceExpense(
  ledgerId: number,
  input: {
    paidByMemberId: number;
    createdByMemberId?: number | null;
    amount: number;
    currency: string;
    exchangeRate?: number;
    description?: string | null;
    expenseDate?: string | null;
    documentId?: number | null;
    tripEventId?: number | null;
    placeName?: string | null;
    placeLat?: number | null;
    placeLon?: number | null;
    split: ExpenseSplitInput;
  }
): FinanceExpenseRow {
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  const payer = getFinanceLedgerMemberById(input.paidByMemberId);
  if (!payer || payer.ledger_id !== ledgerId) {
    throw new Error("Zahler nicht in dieser Abrechnung");
  }

  const currency = input.currency.trim().toUpperCase();
  const exchangeRate =
    currency === ledger.base_currency ? 1 : (input.exchangeRate ?? 1);
  const amountBase = toBaseAmount(
    input.amount,
    currency,
    ledger.base_currency,
    exchangeRate
  );

  const splitMap = buildSplitMap(amountBase, input.split, ledgerId);
  validateSplitTotal(amountBase, splitMap);

  const db = getDb();
  const ts = nowIso();
  const result = db
    .prepare(
      `INSERT INTO finance_expenses (
         ledger_id, paid_by_member_id, created_by_member_id,
         amount, currency, exchange_rate, amount_base,
         description, expense_date, document_id, trip_event_id,
         place_name, place_lat, place_lon,
         split_mode, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      ledgerId,
      input.paidByMemberId,
      input.createdByMemberId ?? null,
      input.amount,
      currency,
      exchangeRate,
      amountBase,
      input.description?.trim() || null,
      input.expenseDate || null,
      input.documentId ?? null,
      input.tripEventId ?? null,
      input.placeName?.trim() || null,
      input.placeLat ?? null,
      input.placeLon ?? null,
      input.split.mode,
      ts,
      ts
    );
  const expenseId = Number(result.lastInsertRowid);
  insertSplits(expenseId, input.split, splitMap);
  touchLedger(ledgerId);
  return getFinanceExpenseById(expenseId)!;
}

function buildSplitMap(
  amountBase: number,
  split: ExpenseSplitInput,
  ledgerId: number
): Map<number, number> {
  const members = listFinanceLedgerMembers(ledgerId);
  const memberSet = new Set(members.map((m) => m.id));

  if (split.mode === "equal") {
    const ids = split.memberIds.length
      ? split.memberIds
      : members.map((m) => m.id);
    for (const id of ids) {
      if (!memberSet.has(id)) throw new Error("Ungültiger Teilnehmer");
    }
    return computeEqualSplits(amountBase, ids);
  }
  if (split.mode === "exact") {
    const out = new Map<number, number>();
    for (const row of split.amounts) {
      if (!memberSet.has(row.memberId)) throw new Error("Ungültiger Teilnehmer");
      out.set(row.memberId, roundMoney(row.amountBase));
    }
    return out;
  }
  for (const s of split.shares) {
    if (!memberSet.has(s.memberId)) throw new Error("Ungültiger Teilnehmer");
    if (s.units <= 0) throw new Error("Anteile müssen positiv sein");
  }
  return computeShareSplits(amountBase, split.shares);
}

function validateSplitTotal(amountBase: number, splitMap: Map<number, number>) {
  const sum = [...splitMap.values()].reduce((a, b) => a + b, 0);
  if (Math.abs(sum - amountBase) > 0.02) {
    throw new Error("Aufteilung summiert sich nicht zum Gesamtbetrag");
  }
}

function insertSplits(
  expenseId: number,
  split: ExpenseSplitInput,
  splitMap: Map<number, number>
) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO finance_expense_splits (expense_id, member_id, share_amount_base, share_units)
     VALUES (?, ?, ?, ?)`
  );
  const shareUnits =
    split.mode === "shares"
      ? new Map(split.shares.map((s) => [s.memberId, s.units]))
      : null;
  for (const [memberId, shareAmount] of splitMap) {
    insert.run(
      expenseId,
      memberId,
      shareAmount,
      shareUnits?.get(memberId) ?? null
    );
  }
}

export function setFinanceExpenseCategory(
  expenseId: number,
  input: { categoryLabel: string; categoryTone: string }
): FinanceExpenseRow {
  const existing = getFinanceExpenseById(expenseId);
  if (!existing) throw new Error("Ausgabe nicht gefunden");
  const db = getDb();
  db.prepare(
    `UPDATE finance_expenses SET
       category_label = ?,
       category_tone = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(input.categoryLabel, input.categoryTone, nowIso(), expenseId);
  touchLedger(existing.ledger_id);
  return getFinanceExpenseById(expenseId)!;
}

/** Update metadata only — amount/currency/splits stay fixed. */
export function updateFinanceExpense(
  expenseId: number,
  input: {
    description?: string | null;
    expenseDate?: string | null;
    paidByMemberId?: number;
    placeName?: string | null;
    placeLat?: number | null;
    placeLon?: number | null;
  }
): FinanceExpenseRow {
  const existing = getFinanceExpenseById(expenseId);
  if (!existing) throw new Error("Ausgabe nicht gefunden");

  const paidByMemberId = input.paidByMemberId ?? existing.paid_by_member_id;
  const payer = getFinanceLedgerMemberById(paidByMemberId);
  if (!payer || payer.ledger_id !== existing.ledger_id) {
    throw new Error("Zahler nicht in dieser Abrechnung");
  }

  const description =
    input.description !== undefined
      ? input.description?.trim() || null
      : existing.description;
  const expenseDate =
    input.expenseDate !== undefined
      ? input.expenseDate || null
      : existing.expense_date;

  let placeName = existing.place_name;
  let placeLat = existing.place_lat;
  let placeLon = existing.place_lon;
  if (input.placeName !== undefined) {
    placeName = input.placeName?.trim() || null;
    if (input.placeLat !== undefined || input.placeLon !== undefined) {
      placeLat = input.placeLat ?? null;
      placeLon = input.placeLon ?? null;
    } else if (!placeName) {
      placeLat = null;
      placeLon = null;
    }
  } else if (input.placeLat !== undefined || input.placeLon !== undefined) {
    placeLat = input.placeLat ?? null;
    placeLon = input.placeLon ?? null;
  }

  const db = getDb();
  db.prepare(
    `UPDATE finance_expenses SET
       paid_by_member_id = ?,
       description = ?,
       expense_date = ?,
       place_name = ?,
       place_lat = ?,
       place_lon = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(
    paidByMemberId,
    description,
    expenseDate,
    placeName,
    placeLat,
    placeLon,
    nowIso(),
    expenseId
  );
  touchLedger(existing.ledger_id);
  return getFinanceExpenseById(expenseId)!;
}

export function setFinanceExpenseAiImage(
  expenseId: number,
  input: { aiImagePath: string | null; aiImagePrompt: string | null }
): FinanceExpenseRow {
  const existing = getFinanceExpenseById(expenseId);
  if (!existing) throw new Error("Ausgabe nicht gefunden");
  const db = getDb();
  db.prepare(
    `UPDATE finance_expenses SET
       ai_image_path = ?,
       ai_image_prompt = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(input.aiImagePath, input.aiImagePrompt, nowIso(), expenseId);
  touchLedger(existing.ledger_id);
  return getFinanceExpenseById(expenseId)!;
}

export function setFinanceExpenseReceiptPath(
  expenseId: number,
  receiptPath: string | null
): FinanceExpenseRow {
  const existing = getFinanceExpenseById(expenseId);
  if (!existing) throw new Error("Ausgabe nicht gefunden");
  const db = getDb();
  db.prepare(
    `UPDATE finance_expenses SET receipt_path = ?, updated_at = ? WHERE id = ?`
  ).run(receiptPath, nowIso(), expenseId);
  touchLedger(existing.ledger_id);
  return getFinanceExpenseById(expenseId)!;
}

export function deleteFinanceExpense(expenseId: number): void {
  const existing = getFinanceExpenseById(expenseId);
  if (!existing) throw new Error("Ausgabe nicht gefunden");
  const db = getDb();
  db.prepare(`DELETE FROM finance_expense_splits WHERE expense_id = ?`).run(
    expenseId
  );
  db.prepare(`DELETE FROM finance_expenses WHERE id = ?`).run(expenseId);
  touchLedger(existing.ledger_id);
  for (const p of [existing.receipt_path, existing.ai_image_path]) {
    if (p && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

export function listFinanceSettlements(
  ledgerId: number
): FinanceSettlementRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM finance_settlements
       WHERE ledger_id = ?
       ORDER BY settled_at DESC, id DESC`
    )
    .all(ledgerId) as FinanceSettlementRow[];
}

export function createFinanceSettlement(
  ledgerId: number,
  input: {
    fromMemberId: number;
    toMemberId: number;
    amount: number;
    currency: string;
    exchangeRate?: number;
    note?: string | null;
    settledAt?: string | null;
    createdByMemberId?: number | null;
  }
): FinanceSettlementRow {
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  if (input.fromMemberId === input.toMemberId) {
    throw new Error("Absender und Empfänger müssen unterschiedlich sein");
  }
  const from = getFinanceLedgerMemberById(input.fromMemberId);
  const to = getFinanceLedgerMemberById(input.toMemberId);
  if (!from || !to || from.ledger_id !== ledgerId || to.ledger_id !== ledgerId) {
    throw new Error("Teilnehmer nicht in dieser Abrechnung");
  }

  const currency = input.currency.trim().toUpperCase();
  const exchangeRate =
    currency === ledger.base_currency ? 1 : (input.exchangeRate ?? 1);
  const amountBase = toBaseAmount(
    input.amount,
    currency,
    ledger.base_currency,
    exchangeRate
  );

  const db = getDb();
  const ts = nowIso();
  const result = db
    .prepare(
      `INSERT INTO finance_settlements (
         ledger_id, from_member_id, to_member_id,
         amount, currency, exchange_rate, amount_base,
         note, settled_at, created_by_member_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      ledgerId,
      input.fromMemberId,
      input.toMemberId,
      input.amount,
      currency,
      exchangeRate,
      amountBase,
      input.note?.trim() || null,
      input.settledAt || ts.slice(0, 10),
      input.createdByMemberId ?? null,
      ts
    );
  touchLedger(ledgerId);
  return db
    .prepare(`SELECT * FROM finance_settlements WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as FinanceSettlementRow;
}

export function getFinanceSettlementById(
  settlementId: number
): FinanceSettlementRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM finance_settlements WHERE id = ?`)
    .get(settlementId) as FinanceSettlementRow | undefined;
  return row ?? null;
}

export function markFinanceExpenseNotified(expenseId: number): void {
  const existing = getFinanceExpenseById(expenseId);
  if (!existing) return;
  getDb()
    .prepare(
      `UPDATE finance_expenses SET notified_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(nowIso(), nowIso(), expenseId);
  touchLedger(existing.ledger_id);
}

export function markFinanceSettlementNotified(settlementId: number): void {
  const existing = getFinanceSettlementById(settlementId);
  if (!existing) return;
  if (existing.notified_at) return;
  getDb()
    .prepare(`UPDATE finance_settlements SET notified_at = ? WHERE id = ?`)
    .run(nowIso(), settlementId);
  touchLedger(existing.ledger_id);
}

export function updateFinanceSettlement(
  settlementId: number,
  input: {
    fromMemberId?: number;
    toMemberId?: number;
    amount?: number;
    currency?: string;
    exchangeRate?: number;
    note?: string | null;
    settledAt?: string | null;
  }
): FinanceSettlementRow {
  const existing = getFinanceSettlementById(settlementId);
  if (!existing) throw new Error("Rückzahlung nicht gefunden");
  const ledger = getFinanceLedgerById(existing.ledger_id);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");

  const fromMemberId = input.fromMemberId ?? existing.from_member_id;
  const toMemberId = input.toMemberId ?? existing.to_member_id;
  if (fromMemberId === toMemberId) {
    throw new Error("Absender und Empfänger müssen unterschiedlich sein");
  }
  const from = getFinanceLedgerMemberById(fromMemberId);
  const to = getFinanceLedgerMemberById(toMemberId);
  if (
    !from ||
    !to ||
    from.ledger_id !== existing.ledger_id ||
    to.ledger_id !== existing.ledger_id
  ) {
    throw new Error("Teilnehmer nicht in dieser Abrechnung");
  }

  const currency = (input.currency ?? existing.currency).trim().toUpperCase();
  const exchangeRate =
    currency === ledger.base_currency
      ? 1
      : (input.exchangeRate ?? existing.exchange_rate);
  const amount = input.amount ?? existing.amount;
  if (!(amount > 0)) throw new Error("Betrag muss positiv sein");
  const amountBase = toBaseAmount(
    amount,
    currency,
    ledger.base_currency,
    exchangeRate
  );
  const note =
    input.note !== undefined ? input.note?.trim() || null : existing.note;
  const settledAt =
    input.settledAt !== undefined
      ? input.settledAt || existing.settled_at
      : existing.settled_at;

  const db = getDb();
  db.prepare(
    `UPDATE finance_settlements SET
       from_member_id = ?,
       to_member_id = ?,
       amount = ?,
       currency = ?,
       exchange_rate = ?,
       amount_base = ?,
       note = ?,
       settled_at = ?
     WHERE id = ?`
  ).run(
    fromMemberId,
    toMemberId,
    amount,
    currency,
    exchangeRate,
    amountBase,
    note,
    settledAt,
    settlementId
  );
  touchLedger(existing.ledger_id);
  return getFinanceSettlementById(settlementId)!;
}

export function deleteFinanceSettlement(settlementId: number): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM finance_settlements WHERE id = ?`)
    .get(settlementId) as FinanceSettlementRow | undefined;
  if (!row) throw new Error("Rückzahlung nicht gefunden");
  db.prepare(`DELETE FROM finance_settlements WHERE id = ?`).run(settlementId);
  touchLedger(row.ledger_id);
}

export function collectBalanceInputs(ledgerId: number): BalanceInput[] {
  const members = listFinanceLedgerMembers(ledgerId);
  const paid = new Map<number, number>();
  const owed = new Map<number, number>();
  const received = new Map<number, number>();
  const paidOut = new Map<number, number>();

  for (const m of members) {
    paid.set(m.id, 0);
    owed.set(m.id, 0);
    received.set(m.id, 0);
    paidOut.set(m.id, 0);
  }

  for (const exp of listFinanceExpenses(ledgerId)) {
    paid.set(
      exp.paid_by_member_id,
      (paid.get(exp.paid_by_member_id) ?? 0) + exp.amount_base
    );
    for (const sp of listFinanceExpenseSplits(exp.id)) {
      owed.set(sp.member_id, (owed.get(sp.member_id) ?? 0) + sp.share_amount_base);
    }
  }

  for (const s of listFinanceSettlements(ledgerId)) {
    paidOut.set(
      s.from_member_id,
      (paidOut.get(s.from_member_id) ?? 0) + s.amount_base
    );
    received.set(
      s.to_member_id,
      (received.get(s.to_member_id) ?? 0) + s.amount_base
    );
  }

  return members.map((m) => ({
    memberId: m.id,
    displayName: m.display_name,
    paidBase: roundMoney(paid.get(m.id) ?? 0),
    owedBase: roundMoney(owed.get(m.id) ?? 0),
    settlementsReceivedBase: roundMoney(received.get(m.id) ?? 0),
    settlementsPaidBase: roundMoney(paidOut.get(m.id) ?? 0),
  }));
}

export type TripDocumentImportRow = {
  document_id: number;
  paperless_id: number;
  title: string | null;
  amount: number | null;
  currency: string | null;
  vendor: string | null;
  invoice_date: string | null;
  trip_event_id: number | null;
  trip_event_title: string | null;
};

/** Documents linked to a trip's events, with optional financial_items hint. */
export function listTripDocumentsForImport(
  tripId: number
): TripDocumentImportRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT
         pd.id AS document_id,
         pd.paperless_id,
         pd.title,
         ted.trip_event_id,
         te.title AS trip_event_title,
         (
           SELECT fi.amount FROM financial_items fi
           WHERE fi.document_id = pd.id AND fi.amount IS NOT NULL
           ORDER BY fi.id LIMIT 1
         ) AS fi_amount,
         (
           SELECT fi.currency FROM financial_items fi
           WHERE fi.document_id = pd.id AND fi.currency IS NOT NULL
           ORDER BY fi.id LIMIT 1
         ) AS fi_currency,
         (
           SELECT fi.vendor FROM financial_items fi
           WHERE fi.document_id = pd.id
           ORDER BY fi.id LIMIT 1
         ) AS fi_vendor,
         (
           SELECT fi.invoice_date FROM financial_items fi
           WHERE fi.document_id = pd.id AND fi.invoice_date IS NOT NULL
           ORDER BY fi.id LIMIT 1
         ) AS fi_invoice_date
       FROM trip_event_documents ted
       JOIN trip_events te ON te.id = ted.trip_event_id
       JOIN paperless_documents pd ON pd.id = ted.document_id
       WHERE te.trip_id = ?
       ORDER BY pd.title COLLATE NOCASE`
    )
    .all(tripId) as Array<{
    document_id: number;
    paperless_id: number;
    title: string | null;
    trip_event_id: number;
    trip_event_title: string | null;
    fi_amount: number | null;
    fi_currency: string | null;
    fi_vendor: string | null;
    fi_invoice_date: string | null;
  }>;

  return rows.map((r) => ({
    document_id: r.document_id,
    paperless_id: r.paperless_id,
    title: r.title,
    amount: r.fi_amount,
    currency: r.fi_currency,
    vendor: r.fi_vendor,
    invoice_date: r.fi_invoice_date,
    trip_event_id: r.trip_event_id,
    trip_event_title: r.trip_event_title,
  }));
}

export type PaperlessImportRow = {
  document_id: number;
  paperless_id: number;
  title: string | null;
  amount: number | null;
  currency: string | null;
  vendor: string | null;
  invoice_date: string | null;
};

/** Recent financial_items from Paperless suitable for ledger import. */
export function listPaperlessFinancialItemsForImport(
  limit = 100
): PaperlessImportRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         pd.id AS document_id,
         pd.paperless_id,
         pd.title,
         fi.amount,
         fi.currency,
         fi.vendor,
         fi.invoice_date
       FROM financial_items fi
       JOIN paperless_documents pd ON pd.id = fi.document_id
       WHERE fi.amount IS NOT NULL
         AND COALESCE(fi.counts_in_stats, 1) = 1
       ORDER BY COALESCE(fi.invoice_date, fi.created_at) DESC, fi.id DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    document_id: number;
    paperless_id: number;
    title: string | null;
    amount: number | null;
    currency: string | null;
    vendor: string | null;
    invoice_date: string | null;
  }>;

  return rows.map((r) => ({
    document_id: r.document_id,
    paperless_id: r.paperless_id,
    title: r.title,
    amount: r.amount,
    currency: r.currency,
    vendor: r.vendor,
    invoice_date: r.invoice_date,
  }));
}

export function countFinanceLedgers(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM finance_ledgers WHERE archived_at IS NULL`
    )
    .get() as { c: number };
  return row.c;
}
