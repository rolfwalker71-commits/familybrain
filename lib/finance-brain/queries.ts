import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db/client";
import { getTripById, getTripEventById } from "@/lib/trips/queries";
import { nowIso } from "@/lib/utils/dates";
import { DEFAULT_BASE_CURRENCY, EXPENSE_SETTLED_STATUS, NORMAL_SOLO_MEMBER_NAME, type ExpenseDirection, type LedgerKind, type SplitMode } from "@/lib/finance-brain/constants";
import {
  computeCoupleEqualSplits,
  computeEqualSplits,
  computeShareSplits,
  roundMoney,
  toBaseAmount,
  buildPayerOrientedDebts,
  type BalanceInput,
  type PayerDebtEdge,
  type SimplifiedDebt,
} from "@/lib/finance-brain/settlement";
import {
  getAppUserById,
  grantLedgerAccess,
} from "@/lib/users/queries";
import { appendActivityLog, logFieldChange } from "@/lib/activity-log";

export type FinanceLedgerRow = {
  id: number;
  title: string;
  base_currency: string;
  ledger_kind: LedgerKind;
  trip_id: number | null;
  cover_path: string | null;
  cover_prompt: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type FinanceLedgerMemberRow = {
  id: number;
  ledger_id: number;
  display_name: string;
  email: string | null;
  user_id: number | null;
  couple_id: number | null;
  invite_token: string;
  invite_revoked_at: string | null;
  created_at: string;
};

export type FinanceLedgerCoupleRow = {
  id: number;
  ledger_id: number;
  name: string;
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
  note: string | null;
  direction: ExpenseDirection;
  split_mode: string;
  pre_settled: number;
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
  related_expense_id: number | null;
  created_at: string;
};

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function coerceLedgerKind(
  raw: string | null | undefined
): LedgerKind {
  return raw === "normal" ? "normal" : "split";
}

export function coerceExpenseDirection(
  raw: string | null | undefined
): ExpenseDirection {
  return raw === "income" ? "income" : "expense";
}

export function isNormalLedger(ledger: FinanceLedgerRow): boolean {
  return coerceLedgerKind(ledger.ledger_kind) === "normal";
}

export function assertSplitLedgerFeatures(
  ledger: FinanceLedgerRow,
  feature: string
): void {
  if (isNormalLedger(ledger)) {
    throw new Error(`${feature} ist nur bei Split-Abrechnungen möglich`);
  }
}

/** Hidden solo member used for Normal cashbook FK/split integrity. */
export function ensureNormalSoloMember(
  ledgerId: number
): FinanceLedgerMemberRow {
  const members = listFinanceLedgerMembers(ledgerId);
  const existing = members.find(
    (m) => m.display_name === NORMAL_SOLO_MEMBER_NAME
  );
  if (existing) return existing;
  return addFinanceLedgerMember(ledgerId, {
    displayName: NORMAL_SOLO_MEMBER_NAME,
  });
}

export function listFinanceLedgers(
  sortDir: "asc" | "desc" = "desc"
): FinanceLedgerRow[] {
  const db = getDb();
  const sortSql = sortDir === "asc" ? "ASC" : "DESC";
  return (
    db
      .prepare(
        `SELECT * FROM finance_ledgers
         WHERE archived_at IS NULL
         ORDER BY updated_at ${sortSql}, id ${sortSql}`
      )
      .all() as FinanceLedgerRow[]
  ).map((row) => ({
    ...row,
    ledger_kind: coerceLedgerKind(row.ledger_kind),
  }));
}

export function getFinanceLedgerById(id: number): FinanceLedgerRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM finance_ledgers WHERE id = ?`)
    .get(id) as FinanceLedgerRow | undefined;
  if (!row) return null;
  return { ...row, ledger_kind: coerceLedgerKind(row.ledger_kind) };
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
  if (!row) return null;
  return { ...row, ledger_kind: coerceLedgerKind(row.ledger_kind) };
}

export function createFinanceLedger(input: {
  title: string;
  baseCurrency?: string;
  tripId?: number | null;
  memberNames?: string[];
  memberUserIds?: number[];
  ledgerKind?: LedgerKind;
}): FinanceLedgerRow {
  const db = getDb();
  const ts = nowIso();
  const baseCurrency = (input.baseCurrency || DEFAULT_BASE_CURRENCY)
    .trim()
    .toUpperCase();
  const ledgerKind = coerceLedgerKind(input.ledgerKind);
  if (input.tripId != null && !getTripById(input.tripId)) {
    throw new Error("Reise nicht gefunden");
  }
  // Trip-linked ledgers are always Split Abrechnung.
  const kind: LedgerKind =
    input.tripId != null ? "split" : ledgerKind;
  const result = db
    .prepare(
      `INSERT INTO finance_ledgers (title, base_currency, ledger_kind, trip_id, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      input.title.trim(),
      baseCurrency,
      kind,
      input.tripId ?? null,
      ts,
      ts
    );
  const ledgerId = Number(result.lastInsertRowid);
  if (kind === "normal") {
    ensureNormalSoloMember(ledgerId);
  } else {
    const names = input.memberNames?.filter((n) => n.trim()) ?? [];
    for (const name of names) {
      addFinanceLedgerMember(ledgerId, { displayName: name });
    }
    const userIds = [
      ...new Set(
        (input.memberUserIds ?? []).filter(
          (id) => Number.isInteger(id) && id > 0
        )
      ),
    ];
    for (const userId of userIds) {
      addFinanceLedgerMemberFromUser(ledgerId, userId);
    }
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

export function setFinanceLedgerCover(
  id: number,
  input: {
    coverPath: string | null;
    coverPrompt: string | null;
  }
): FinanceLedgerRow {
  const existing = getFinanceLedgerById(id);
  if (!existing) throw new Error("Abrechnung nicht gefunden");
  const db = getDb();
  db.prepare(
    `UPDATE finance_ledgers SET
       cover_path = ?,
       cover_prompt = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(input.coverPath, input.coverPrompt, nowIso(), id);
  const ledger = getFinanceLedgerById(id);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  return ledger;
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
  input: {
    displayName: string;
    email?: string | null;
    userId?: number | null;
  }
): FinanceLedgerMemberRow {
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) {
    throw new Error("Abrechnung nicht gefunden");
  }
  const displayName = input.displayName.trim();
  if (isNormalLedger(ledger)) {
    // Only the hidden solo member may exist on Normal ledgers.
    if (displayName !== NORMAL_SOLO_MEMBER_NAME) {
      throw new Error("Teilnehmer sind nur bei Split-Abrechnungen möglich");
    }
    const existing = listFinanceLedgerMembers(ledgerId);
    if (existing.length > 0) {
      throw new Error("Teilnehmer sind nur bei Split-Abrechnungen möglich");
    }
  }
  const db = getDb();
  const token = newToken();
  const ts = nowIso();
  const result = db
    .prepare(
      `INSERT INTO finance_ledger_members
         (ledger_id, display_name, email, user_id, invite_token, invite_revoked_at, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    )
    .run(
      ledgerId,
      displayName,
      input.email?.trim() || null,
      input.userId ?? null,
      token,
      ts
    );
  touchLedger(ledgerId);
  return db
    .prepare(`SELECT * FROM finance_ledger_members WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as FinanceLedgerMemberRow;
}

export function addFinanceLedgerMemberFromUser(
  ledgerId: number,
  userId: number
): FinanceLedgerMemberRow {
  const user = getAppUserById(userId);
  if (!user || !user.active) {
    throw new Error(`Benutzer ${userId} nicht gefunden`);
  }
  const existing = listFinanceLedgerMembers(ledgerId).find(
    (m) => m.user_id === userId
  );
  if (existing) {
    grantLedgerAccess(userId, ledgerId);
    return existing;
  }
  const member = addFinanceLedgerMember(ledgerId, {
    displayName: user.display_name || user.username,
    email: user.email,
    userId: user.id,
  });
  grantLedgerAccess(userId, ledgerId);
  return member;
}

export function updateFinanceLedgerMember(
  memberId: number,
  input: {
    displayName?: string;
    email?: string | null;
    coupleId?: number | null;
  }
): FinanceLedgerMemberRow {
  const existing = getFinanceLedgerMemberById(memberId);
  if (!existing) throw new Error("Teilnehmer nicht gefunden");

  let nextCoupleId =
    input.coupleId !== undefined ? input.coupleId : existing.couple_id;
  if (input.coupleId !== undefined) {
    const ledger = getFinanceLedgerById(existing.ledger_id);
    if (!ledger) throw new Error("Abrechnung nicht gefunden");
    assertSplitLedgerFeatures(ledger, "Paare");
    if (input.coupleId == null) {
      nextCoupleId = null;
    } else {
      const couple = getFinanceLedgerCoupleById(input.coupleId);
      if (!couple || couple.ledger_id !== existing.ledger_id) {
        throw new Error("Paar nicht gefunden");
      }
      const inCouple = listFinanceLedgerMembers(existing.ledger_id).filter(
        (m) => m.couple_id === input.coupleId && m.id !== memberId
      );
      if (inCouple.length >= 2) {
        throw new Error("Ein Paar kann höchstens zwei Personen haben");
      }
      nextCoupleId = input.coupleId;
    }
  }

  const db = getDb();
  db.prepare(
    `UPDATE finance_ledger_members SET
       display_name = ?,
       email = ?,
       couple_id = ?
     WHERE id = ?`
  ).run(
    input.displayName !== undefined
      ? input.displayName.trim()
      : existing.display_name,
    input.email !== undefined ? input.email?.trim() || null : existing.email,
    nextCoupleId ?? null,
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

export function listFinanceLedgerCouples(
  ledgerId: number
): FinanceLedgerCoupleRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM finance_ledger_couple_groups
       WHERE ledger_id = ?
       ORDER BY id ASC`
    )
    .all(ledgerId) as FinanceLedgerCoupleRow[];
}

export function getFinanceLedgerCoupleById(
  coupleId: number
): FinanceLedgerCoupleRow | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT * FROM finance_ledger_couple_groups WHERE id = ?`)
      .get(coupleId) as FinanceLedgerCoupleRow | undefined) ?? null
  );
}

export function createFinanceLedgerCouple(
  ledgerId: number,
  input: { name: string; memberIds?: number[] }
): FinanceLedgerCoupleRow {
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  assertSplitLedgerFeatures(ledger, "Paare");
  const name = input.name.trim();
  if (!name) throw new Error("Paar-Name erforderlich");
  const memberIds = [...new Set(input.memberIds ?? [])];
  if (memberIds.length > 2) {
    throw new Error("Ein Paar kann höchstens zwei Personen haben");
  }
  for (const id of memberIds) {
    const m = getFinanceLedgerMemberById(id);
    if (!m || m.ledger_id !== ledgerId) {
      throw new Error("Teilnehmer nicht in dieser Abrechnung");
    }
    if (m.couple_id != null) {
      throw new Error(`${m.display_name} ist bereits einem Paar zugeordnet`);
    }
  }
  const db = getDb();
  const ts = nowIso();
  const result = db
    .prepare(
      `INSERT INTO finance_ledger_couple_groups (ledger_id, name, created_at)
       VALUES (?, ?, ?)`
    )
    .run(ledgerId, name, ts);
  const coupleId = Number(result.lastInsertRowid);
  for (const id of memberIds) {
    db.prepare(
      `UPDATE finance_ledger_members SET couple_id = ? WHERE id = ?`
    ).run(coupleId, id);
  }
  touchLedger(ledgerId);
  return getFinanceLedgerCoupleById(coupleId)!;
}

export function updateFinanceLedgerCouple(
  coupleId: number,
  input: { name?: string }
): FinanceLedgerCoupleRow {
  const existing = getFinanceLedgerCoupleById(coupleId);
  if (!existing) throw new Error("Paar nicht gefunden");
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Paar-Name erforderlich");
    getDb()
      .prepare(`UPDATE finance_ledger_couple_groups SET name = ? WHERE id = ?`)
      .run(name, coupleId);
    touchLedger(existing.ledger_id);
  }
  return getFinanceLedgerCoupleById(coupleId)!;
}

export function deleteFinanceLedgerCouple(coupleId: number): void {
  const existing = getFinanceLedgerCoupleById(coupleId);
  if (!existing) throw new Error("Paar nicht gefunden");
  const db = getDb();
  db.prepare(
    `UPDATE finance_ledger_members SET couple_id = NULL WHERE couple_id = ?`
  ).run(coupleId);
  db.prepare(`DELETE FROM finance_ledger_couple_groups WHERE id = ?`).run(
    coupleId
  );
  touchLedger(existing.ledger_id);
}

/** Default label from two display names. */
export function defaultCoupleName(names: string[]): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return "Paar";
  if (cleaned.length === 1) return cleaned[0];
  return `${cleaned[0]} & ${cleaned[1]}`;
}

function touchLedger(ledgerId: number) {
  getDb()
    .prepare(`UPDATE finance_ledgers SET updated_at = ? WHERE id = ?`)
    .run(nowIso(), ledgerId);
}

export function listFinanceExpenses(
  ledgerId: number,
  sortDir: "asc" | "desc" = "desc"
): FinanceExpenseRow[] {
  const db = getDb();
  const sortSql = sortDir === "asc" ? "ASC" : "DESC";
  return (
    db
      .prepare(
        `SELECT * FROM finance_expenses
         WHERE ledger_id = ?
         ORDER BY COALESCE(expense_date, created_at) ${sortSql}, id ${sortSql}`
      )
      .all(ledgerId) as FinanceExpenseRow[]
  ).map((row) => ({
    ...row,
    direction: coerceExpenseDirection(row.direction),
    pre_settled: Number(row.pre_settled) || 0,
  }));
}

export type TripEventLinkedExpense = {
  id: number;
  ledger_id: number;
  ledger_title: string;
  description: string | null;
  expense_date: string | null;
  amount: number;
  currency: string;
  exchange_rate: number | null;
  amount_base: number;
  base_currency: string;
  paid_by_name: string;
  category_label: string | null;
};

/** Expenses linked to the given trip events (for TravelBuddy cards). */
export function listLinkedExpensesForTripEvents(
  eventIds: number[]
): Map<number, TripEventLinkedExpense[]> {
  const map = new Map<number, TripEventLinkedExpense[]>();
  if (eventIds.length === 0) return map;
  const db = getDb();
  const placeholders = eventIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT
         e.id,
         e.ledger_id,
         e.trip_event_id,
         e.description,
         e.expense_date,
         e.amount,
         e.currency,
         e.exchange_rate,
         e.amount_base,
         e.category_label,
         l.title AS ledger_title,
         l.base_currency,
         m.display_name AS paid_by_name
       FROM finance_expenses e
       JOIN finance_ledgers l ON l.id = e.ledger_id
       JOIN finance_ledger_members m ON m.id = e.paid_by_member_id
       WHERE e.trip_event_id IN (${placeholders})
         AND l.archived_at IS NULL
       ORDER BY COALESCE(e.expense_date, e.created_at) ASC, e.id ASC`
    )
    .all(...eventIds) as Array<{
    id: number;
    ledger_id: number;
    trip_event_id: number;
    description: string | null;
    expense_date: string | null;
    amount: number;
    currency: string;
    exchange_rate: number | null;
    amount_base: number;
    category_label: string | null;
    ledger_title: string;
    base_currency: string;
    paid_by_name: string;
  }>;

  for (const row of rows) {
    const list = map.get(row.trip_event_id) || [];
    list.push({
      id: row.id,
      ledger_id: row.ledger_id,
      ledger_title: row.ledger_title,
      description: row.description,
      expense_date: row.expense_date,
      amount: row.amount,
      currency: row.currency,
      exchange_rate: row.exchange_rate,
      amount_base: row.amount_base,
      base_currency: row.base_currency,
      paid_by_name: row.paid_by_name,
      category_label: row.category_label,
    });
    map.set(row.trip_event_id, list);
  }
  return map;
}

export function getFinanceExpenseById(
  expenseId: number
): FinanceExpenseRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM finance_expenses WHERE id = ?`)
    .get(expenseId) as FinanceExpenseRow | undefined;
  if (!row) return null;
  return {
    ...row,
    direction: coerceExpenseDirection(row.direction),
    pre_settled: Number(row.pre_settled) || 0,
  };
}

export function listFinanceExpenseSplits(
  expenseId: number
): FinanceExpenseSplitRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM finance_expense_splits WHERE expense_id = ?`)
    .all(expenseId) as FinanceExpenseSplitRow[];
}

export type ExpenseShareDisplay = {
  memberId: number;
  displayName: string;
  shareAmountBase: number;
  isPayer: boolean;
  avatarUrl: string | null;
  avatarPath: string | null;
};

/** Split participants for mail/PDF (sorted by name). */
export function listExpenseShareDisplays(
  expenseId: number,
  paidByMemberId: number
): ExpenseShareDisplay[] {
  return listFinanceExpenseSplits(expenseId)
    .map((s) => {
      const m = getFinanceLedgerMemberById(s.member_id);
      const user = m?.user_id != null ? getAppUserById(m.user_id) : null;
      return {
        memberId: s.member_id,
        displayName: m?.display_name || `#${s.member_id}`,
        shareAmountBase: s.share_amount_base,
        isPayer: s.member_id === paidByMemberId,
        avatarUrl: user?.avatar_path
          ? `/api/users/media/avatar/${encodeURIComponent(
              path.basename(user.avatar_path)
            )}`
          : null,
        avatarPath: user?.avatar_path ?? null,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
}

export type ExpenseSplitInput =
  | { mode: "equal"; memberIds: number[] }
  | { mode: "coupleEqual"; coupleIds: number[] }
  | { mode: "exact"; amounts: Array<{ memberId: number; amountBase: number }> }
  | {
      mode: "shares";
      shares: Array<{ memberId: number; units: number }>;
    };

/** Validate optional trip-event link for an expense on this ledger. */
export function resolveExpenseTripEventId(
  ledger: FinanceLedgerRow,
  tripEventId: number | null | undefined
): number | null {
  if (tripEventId == null) return null;
  const event = getTripEventById(tripEventId);
  if (!event) throw new Error("Reise-Aktivität nicht gefunden");
  if (ledger.trip_id != null && event.trip_id !== ledger.trip_id) {
    throw new Error("Aktivität gehört nicht zur verknüpften Reise");
  }
  return event.id;
}

export function createFinanceExpense(
  ledgerId: number,
  input: {
    paidByMemberId?: number | null;
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
    note?: string | null;
    direction?: ExpenseDirection;
    split?: ExpenseSplitInput;
    /** Counts in trip totals; auto-settles shares back to payer so nets stay neutral. */
    preSettled?: boolean;
  }
): FinanceExpenseRow {
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  const direction = coerceExpenseDirection(input.direction);
  const normal = isNormalLedger(ledger);
  const preSettled = Boolean(input.preSettled) && !normal;

  let paidByMemberId = input.paidByMemberId ?? null;
  let split: ExpenseSplitInput;
  if (normal) {
    const solo = ensureNormalSoloMember(ledgerId);
    paidByMemberId = solo.id;
    split = { mode: "equal", memberIds: [solo.id] };
  } else {
    if (paidByMemberId == null) {
      throw new Error("Zahler ist erforderlich");
    }
    if (!input.split) {
      throw new Error("Aufteilung ist erforderlich");
    }
    split = input.split;
    const payer = getFinanceLedgerMemberById(paidByMemberId);
    if (!payer || payer.ledger_id !== ledgerId) {
      throw new Error("Zahler nicht in dieser Abrechnung");
    }
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

  const splitMap = buildSplitMap(amountBase, split, ledgerId);
  validateSplitTotal(amountBase, splitMap);
  const tripEventId = resolveExpenseTripEventId(ledger, input.tripEventId);

  let note = input.note?.trim() || null;
  if (preSettled) {
    const tag = "Bereits ausgeglichen (nacherfasst)";
    note = note ? `${note}\n${tag}` : tag;
  }

  const db = getDb();
  const ts = nowIso();
  const result = db
    .prepare(
      `INSERT INTO finance_expenses (
         ledger_id, paid_by_member_id, created_by_member_id,
         amount, currency, exchange_rate, amount_base,
         description, expense_date, document_id, trip_event_id,
         place_name, place_lat, place_lon, note, direction,
         split_mode, pre_settled, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      ledgerId,
      paidByMemberId,
      input.createdByMemberId ?? null,
      input.amount,
      currency,
      exchangeRate,
      amountBase,
      input.description?.trim() || null,
      input.expenseDate || null,
      input.documentId ?? null,
      tripEventId,
      input.placeName?.trim() || null,
      input.placeLat ?? null,
      input.placeLon ?? null,
      note,
      direction,
      split.mode,
      preSettled ? EXPENSE_SETTLED_STATUS.preSettled : EXPENSE_SETTLED_STATUS.open,
      ts,
      ts
    );
  const expenseId = Number(result.lastInsertRowid);
  insertSplits(expenseId, split, splitMap);
  if (preSettled && paidByMemberId != null) {
    settleExpenseSharesToPayer(expenseId);
  }
  touchLedger(ledgerId);
  const created = getFinanceExpenseById(expenseId)!;
  try {
    const label =
      created.description?.trim() ||
      `${created.amount} ${created.currency}`;
    appendActivityLog({
      entityType: "finance_expense",
      entityId: expenseId,
      action: "created",
      summary: `Ausgabe angelegt: ${label}`,
      source: "finance-expense",
      newValue: label,
    });
  } catch {
    /* optional */
  }
  return created;
}

/**
 * Book share repayments to the payer so a pre-settled expense stays net-neutral
 * while still counting toward trip totals.
 */
export function settleExpenseSharesToPayer(
  expenseId: number,
  options?: { notePrefix?: string }
): FinanceSettlementRow[] {
  const expense = getFinanceExpenseById(expenseId);
  if (!expense) throw new Error("Ausgabe nicht gefunden");
  const ledger = getFinanceLedgerById(expense.ledger_id);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  const payerId = expense.paid_by_member_id;
  const label =
    expense.description?.trim() ||
    `Ausgabe #${expense.id}`;
  const notePrefix = options?.notePrefix?.trim() || "Auto-Ausgleich";
  const created: FinanceSettlementRow[] = [];
  for (const split of listFinanceExpenseSplits(expenseId)) {
    if (split.member_id === payerId) continue;
    if (!(split.share_amount_base > 0.004)) continue;
    created.push(
      createFinanceSettlement(expense.ledger_id, {
        fromMemberId: split.member_id,
        toMemberId: payerId,
        amount: split.share_amount_base,
        currency: ledger.base_currency,
        exchangeRate: 1,
        note: `${notePrefix}: ${label}`,
        settledAt: expense.expense_date || null,
        createdByMemberId: expense.created_by_member_id,
        relatedExpenseId: expenseId,
      })
    );
  }
  return created;
}

export type CoupleExpenseSettlePreview = {
  fromMemberId: number;
  fromName: string;
  toMemberId: number;
  toName: string;
  amountBase: number;
};

/**
 * True when the expense has exactly two positive shares and both members
 * belong to the same couple, with one of them as payer.
 */
export function getCoupleExpenseSettlePreview(
  expenseId: number
): CoupleExpenseSettlePreview | null {
  const expense = getFinanceExpenseById(expenseId);
  if (!expense) return null;
  if (coerceExpenseDirection(expense.direction) !== "expense") return null;
  if (Number(expense.pre_settled) !== EXPENSE_SETTLED_STATUS.open) return null;

  const payerId = expense.paid_by_member_id;
  if (payerId == null) return null;

  const positive = listFinanceExpenseSplits(expenseId).filter(
    (s) => s.share_amount_base > 0.004
  );
  if (positive.length !== 2) return null;

  const payerSplit = positive.find((s) => s.member_id === payerId);
  const partnerSplit = positive.find((s) => s.member_id !== payerId);
  if (!payerSplit || !partnerSplit) return null;

  const payer = getFinanceLedgerMemberById(payerId);
  const partner = getFinanceLedgerMemberById(partnerSplit.member_id);
  if (!payer || !partner) return null;
  if (payer.ledger_id !== expense.ledger_id || partner.ledger_id !== expense.ledger_id) {
    return null;
  }
  if (
    payer.couple_id == null ||
    partner.couple_id == null ||
    payer.couple_id !== partner.couple_id
  ) {
    return null;
  }

  return {
    fromMemberId: partner.id,
    fromName: partner.display_name,
    toMemberId: payer.id,
    toName: payer.display_name,
    amountBase: roundMoney(partnerSplit.share_amount_base),
  };
}

/**
 * Book the partner's share as repayment and mark the expense
 * «Manuell ausgeglichen» (pre_settled = 2).
 */
export function settleCoupleExpenseManually(expenseId: number): {
  expense: FinanceExpenseRow;
  settlements: FinanceSettlementRow[];
  preview: CoupleExpenseSettlePreview;
} {
  const preview = getCoupleExpenseSettlePreview(expenseId);
  if (!preview) {
    throw new Error(
      "Paar-Ausgleich nur möglich, wenn genau ein Paar beteiligt ist und die Buchung noch offen ist."
    );
  }

  const settlements = settleExpenseSharesToPayer(expenseId, {
    notePrefix: "Manueller Paar-Ausgleich",
  });

  const db = getDb();
  db.prepare(
    `UPDATE finance_expenses SET pre_settled = ?, updated_at = ? WHERE id = ?`
  ).run(EXPENSE_SETTLED_STATUS.manualCouple, nowIso(), expenseId);

  const expense = getFinanceExpenseById(expenseId);
  if (!expense) throw new Error("Ausgabe nicht gefunden");
  touchLedger(expense.ledger_id);
  return { expense, settlements, preview };
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
    if (ids.length === 0) {
      throw new Error("Mindestens eine beteiligte Person wählen");
    }
    for (const id of ids) {
      if (!memberSet.has(id)) throw new Error("Ungültiger Teilnehmer");
    }
    return computeEqualSplits(amountBase, ids);
  }
  if (split.mode === "coupleEqual") {
    const couples = listFinanceLedgerCouples(ledgerId);
    const coupleSet = new Set(couples.map((c) => c.id));
    const ids = split.coupleIds.length
      ? split.coupleIds
      : couples.map((c) => c.id);
    if (ids.length === 0) {
      throw new Error("Mindestens ein Paar wählen");
    }
    for (const id of ids) {
      if (!coupleSet.has(id)) throw new Error("Ungültiges Paar");
    }
    const groups = ids.map((coupleId) => ({
      coupleId,
      memberIds: members
        .filter((m) => m.couple_id === coupleId)
        .map((m) => m.id),
    }));
    if (groups.some((g) => g.memberIds.length === 0)) {
      throw new Error("Gewähltes Paar hat keine Teilnehmer");
    }
    return computeCoupleEqualSplits(amountBase, groups);
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

/** Update expense metadata and optionally amount/currency/split participants. */
export function updateFinanceExpense(
  expenseId: number,
  input: {
    description?: string | null;
    expenseDate?: string | null;
    paidByMemberId?: number;
    placeName?: string | null;
    placeLat?: number | null;
    placeLon?: number | null;
    note?: string | null;
    amount?: number;
    currency?: string;
    exchangeRate?: number;
    direction?: ExpenseDirection;
    documentId?: number | null;
    tripEventId?: number | null;
    /** When set, rebuilds splits (equal among these members, or full split input). */
    split?: ExpenseSplitInput;
  }
): FinanceExpenseRow {
  const existing = getFinanceExpenseById(expenseId);
  if (!existing) throw new Error("Ausgabe nicht gefunden");
  const ledger = getFinanceLedgerById(existing.ledger_id);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  const normal = isNormalLedger(ledger);

  let paidByMemberId = input.paidByMemberId ?? existing.paid_by_member_id;
  if (normal) {
    paidByMemberId = ensureNormalSoloMember(existing.ledger_id).id;
  } else {
    const payer = getFinanceLedgerMemberById(paidByMemberId);
    if (!payer || payer.ledger_id !== existing.ledger_id) {
      throw new Error("Zahler nicht in dieser Abrechnung");
    }
  }

  const direction =
    input.direction !== undefined
      ? coerceExpenseDirection(input.direction)
      : coerceExpenseDirection(existing.direction);

  let documentId = existing.document_id;
  if (input.documentId !== undefined) {
    if (input.documentId == null) {
      documentId = null;
    } else {
      const doc = getDb()
        .prepare(`SELECT id FROM paperless_documents WHERE id = ?`)
        .get(input.documentId) as { id: number } | undefined;
      if (!doc) throw new Error("Paperless-Dokument nicht gefunden");
      documentId = input.documentId;
    }
  }

  const tripEventId =
    input.tripEventId !== undefined
      ? resolveExpenseTripEventId(ledger, input.tripEventId)
      : existing.trip_event_id;

  const description =
    input.description !== undefined
      ? input.description?.trim() || null
      : existing.description;
  const expenseDate =
    input.expenseDate !== undefined
      ? input.expenseDate || null
      : existing.expense_date;
  const note =
    input.note !== undefined ? input.note?.trim() || null : existing.note;

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

  const amount = input.amount ?? existing.amount;
  if (!(amount > 0)) throw new Error("Betrag muss positiv sein");
  const currency = (input.currency ?? existing.currency).trim().toUpperCase();
  const exchangeRate =
    currency === ledger.base_currency.trim().toUpperCase()
      ? 1
      : (input.exchangeRate ?? existing.exchange_rate);
  if (!(exchangeRate > 0)) throw new Error("Wechselkurs muss positiv sein");
  const amountBase = toBaseAmount(
    amount,
    currency,
    ledger.base_currency,
    exchangeRate
  );

  const moneyChanged =
    amount !== existing.amount ||
    currency !== existing.currency.trim().toUpperCase() ||
    exchangeRate !== existing.exchange_rate ||
    amountBase !== existing.amount_base;

  const splitChanged = input.split !== undefined;
  const rebuildSplits = moneyChanged || splitChanged;

  let nextSplitMode = existing.split_mode;
  if (rebuildSplits) {
    const existingSplits = listFinanceExpenseSplits(expenseId);
    const memberIds =
      existingSplits.length > 0
        ? existingSplits.map((s) => s.member_id)
        : listFinanceLedgerMembers(existing.ledger_id).map((m) => m.id);
    const splitInput: ExpenseSplitInput = input.split
      ? input.split
      : existing.split_mode === "shares" &&
          existingSplits.some((s) => s.share_units != null && s.share_units > 0)
        ? {
            mode: "shares",
            shares: existingSplits.map((s) => ({
              memberId: s.member_id,
              units: s.share_units && s.share_units > 0 ? s.share_units : 1,
            })),
          }
        : existing.split_mode === "exact"
          ? {
              mode: "exact",
              amounts: (() => {
                const oldBase = existing.amount_base || 1;
                return existingSplits.map((s) => ({
                  memberId: s.member_id,
                  amountBase: roundMoney(
                    (s.share_amount_base / oldBase) * amountBase
                  ),
                }));
              })(),
            }
          : { mode: "equal", memberIds };

    if (
      splitInput.mode === "equal" &&
      (!splitInput.memberIds || splitInput.memberIds.length === 0)
    ) {
      throw new Error("Mindestens eine beteiligte Person wählen");
    }

    const splitMap = buildSplitMap(amountBase, splitInput, existing.ledger_id);
    // Fix rounding drift for exact proportional rescale
    if (splitInput.mode === "exact" && splitMap.size > 0) {
      const sum = [...splitMap.values()].reduce((a, b) => a + b, 0);
      const drift = roundMoney(amountBase - sum);
      if (drift !== 0) {
        const firstId = [...splitMap.keys()][0];
        splitMap.set(firstId, roundMoney((splitMap.get(firstId) ?? 0) + drift));
      }
    }
    validateSplitTotal(amountBase, splitMap);
    nextSplitMode = splitInput.mode;

    const db = getDb();
    db.prepare(
      `UPDATE finance_expenses SET
         paid_by_member_id = ?,
         amount = ?,
         currency = ?,
         exchange_rate = ?,
         amount_base = ?,
         description = ?,
         expense_date = ?,
         place_name = ?,
         place_lat = ?,
         place_lon = ?,
         note = ?,
         direction = ?,
         document_id = ?,
         trip_event_id = ?,
         split_mode = ?,
         updated_at = ?
       WHERE id = ?`
    ).run(
      paidByMemberId,
      amount,
      currency,
      exchangeRate,
      amountBase,
      description,
      expenseDate,
      placeName,
      placeLat,
      placeLon,
      note,
      direction,
      documentId,
      tripEventId,
      nextSplitMode,
      nowIso(),
      expenseId
    );
    db.prepare(`DELETE FROM finance_expense_splits WHERE expense_id = ?`).run(
      expenseId
    );
    insertSplits(expenseId, splitInput, splitMap);
  } else {
    const db = getDb();
    db.prepare(
      `UPDATE finance_expenses SET
         paid_by_member_id = ?,
         amount = ?,
         currency = ?,
         exchange_rate = ?,
         amount_base = ?,
         description = ?,
         expense_date = ?,
         place_name = ?,
         place_lat = ?,
         place_lon = ?,
         note = ?,
         direction = ?,
         document_id = ?,
         trip_event_id = ?,
         updated_at = ?
       WHERE id = ?`
    ).run(
      paidByMemberId,
      amount,
      currency,
      exchangeRate,
      amountBase,
      description,
      expenseDate,
      placeName,
      placeLat,
      placeLon,
      note,
      direction,
      documentId,
      tripEventId,
      nowIso(),
      expenseId
    );
  }

  touchLedger(existing.ledger_id);
  if (Number(existing.pre_settled)) {
    const db = getDb();
    db.prepare(
      `DELETE FROM finance_settlements WHERE related_expense_id = ?`
    ).run(expenseId);
    const notePrefix =
      Number(existing.pre_settled) === EXPENSE_SETTLED_STATUS.manualCouple
        ? "Manueller Paar-Ausgleich"
        : "Auto-Ausgleich";
    settleExpenseSharesToPayer(expenseId, { notePrefix });
  }
  const updated = getFinanceExpenseById(expenseId)!;
  try {
    const tracked: Array<{
      changed: boolean;
      field: string;
      label: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [
      {
        changed: input.description !== undefined,
        field: "description",
        label: "Beschreibung",
        oldValue: existing.description,
        newValue: updated.description,
      },
      {
        changed: input.expenseDate !== undefined,
        field: "expense_date",
        label: "Datum",
        oldValue: existing.expense_date,
        newValue: updated.expense_date,
      },
      {
        changed: input.amount !== undefined,
        field: "amount",
        label: "Betrag",
        oldValue: existing.amount,
        newValue: updated.amount,
      },
      {
        changed: input.currency !== undefined,
        field: "currency",
        label: "Währung",
        oldValue: existing.currency,
        newValue: updated.currency,
      },
      {
        changed: input.placeName !== undefined,
        field: "place_name",
        label: "Ort",
        oldValue: existing.place_name,
        newValue: updated.place_name,
      },
      {
        changed: input.note !== undefined,
        field: "note",
        label: "Notiz",
        oldValue: existing.note,
        newValue: updated.note,
      },
      {
        changed: input.paidByMemberId !== undefined,
        field: "paid_by_member_id",
        label: "Zahler",
        oldValue: existing.paid_by_member_id,
        newValue: updated.paid_by_member_id,
      },
      {
        changed: input.direction !== undefined,
        field: "direction",
        label: "Richtung",
        oldValue: existing.direction,
        newValue: updated.direction,
      },
    ];
    for (const t of tracked) {
      if (!t.changed) continue;
      logFieldChange({
        entityType: "finance_expense",
        entityId: expenseId,
        fieldName: t.field,
        label: t.label,
        oldValue: t.oldValue,
        newValue: t.newValue,
        source: "finance-expense",
      });
    }
  } catch {
    /* optional */
  }
  return updated;
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
  const updated = getFinanceExpenseById(expenseId)!;
  try {
    const had = Boolean(existing.ai_image_path);
    const has = Boolean(updated.ai_image_path);
    if (had !== has || existing.ai_image_path !== updated.ai_image_path) {
      appendActivityLog({
        entityType: "finance_expense",
        entityId: expenseId,
        action: "ai_image",
        summary: !has
          ? "KI-Bild entfernt"
          : had
            ? "KI-Bild neu erzeugt"
            : "KI-Bild erzeugt",
        source: "finance-expense",
      });
    }
  } catch {
    /* optional */
  }
  return updated;
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
  db.prepare(
    `DELETE FROM finance_settlements WHERE related_expense_id = ?`
  ).run(expenseId);
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
  try {
    const label =
      existing.description?.trim() ||
      `${existing.amount} ${existing.currency}`;
    appendActivityLog({
      entityType: "finance_expense",
      entityId: expenseId,
      action: "deleted",
      summary: `Ausgabe gelöscht: ${label}`,
      source: "finance-expense",
      oldValue: label,
    });
  } catch {
    /* optional */
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
    relatedExpenseId?: number | null;
  }
): FinanceSettlementRow {
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) throw new Error("Abrechnung nicht gefunden");
  assertSplitLedgerFeatures(ledger, "Rückzahlungen");
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
         note, settled_at, created_by_member_id, related_expense_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      input.relatedExpenseId ?? null,
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
  assertSplitLedgerFeatures(ledger, "Rückzahlungen");

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
    if (coerceExpenseDirection(exp.direction) !== "expense") continue;
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

/**
 * Open debts: each participant owes the payer their share (minus recorded
 * settlements). Directions between the same pair are netted.
 */
export function collectOpenPayerDebts(ledgerId: number): SimplifiedDebt[] {
  const members = listFinanceLedgerMembers(ledgerId);
  const nameById = new Map(members.map((m) => [m.id, m.display_name]));
  const expenseEdges: PayerDebtEdge[] = [];

  for (const exp of listFinanceExpenses(ledgerId)) {
    if (coerceExpenseDirection(exp.direction) !== "expense") continue;
    const payerId = exp.paid_by_member_id;
    for (const sp of listFinanceExpenseSplits(exp.id)) {
      if (sp.member_id === payerId) continue;
      if (sp.share_amount_base <= 0) continue;
      expenseEdges.push({
        fromMemberId: sp.member_id,
        toMemberId: payerId,
        amount: sp.share_amount_base,
      });
    }
  }

  const settlements: PayerDebtEdge[] = listFinanceSettlements(ledgerId).map(
    (s) => ({
      fromMemberId: s.from_member_id,
      toMemberId: s.to_member_id,
      amount: s.amount_base,
    })
  );

  return buildPayerOrientedDebts(expenseEdges, settlements, nameById);
}

/** Cashbook totals for Normal ledgers (income − expense in base currency). */
export function collectCashbookTotals(ledgerId: number): {
  expenseTotalBase: number;
  incomeTotalBase: number;
  netBase: number;
} {
  let expenseTotalBase = 0;
  let incomeTotalBase = 0;
  for (const exp of listFinanceExpenses(ledgerId)) {
    if (coerceExpenseDirection(exp.direction) === "income") {
      incomeTotalBase += exp.amount_base;
    } else {
      expenseTotalBase += exp.amount_base;
    }
  }
  return {
    expenseTotalBase: roundMoney(expenseTotalBase),
    incomeTotalBase: roundMoney(incomeTotalBase),
    netBase: roundMoney(incomeTotalBase - expenseTotalBase),
  };
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
