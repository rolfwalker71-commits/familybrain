import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { getFinanceLedgerCoversDir } from "@/lib/finance-brain/cover";
import { getFinanceExpenseAiDir } from "@/lib/finance-brain/expense-image";
import { getFinanceReceiptsDir } from "@/lib/finance-brain/receipts";
import {
  addFinanceLedgerMember,
  addFinanceLedgerMemberFromUser,
  coerceExpenseDirection,
  coerceLedgerKind,
  createFinanceExpense,
  createFinanceLedger,
  createFinanceSettlement,
  listFinanceExpenseSplits,
  listFinanceExpenses,
  listFinanceLedgerMembers,
  listFinanceSettlements,
  setFinanceExpenseAiImage,
  setFinanceExpenseCategory,
  setFinanceExpenseReceiptPath,
  setFinanceLedgerCover,
  updateFinanceLedger,
  type FinanceExpenseRow,
  type FinanceLedgerMemberRow,
  type FinanceLedgerRow,
  type FinanceSettlementRow,
} from "@/lib/finance-brain/queries";
import { getTripById, listTrips } from "@/lib/trips/queries";
import {
  getAppUserByUsername,
  grantLedgerAccess,
} from "@/lib/users/queries";

export const FINANCEBRAIN_BACKUP_VERSION = 1;

type MediaBlob = {
  kind: "cover" | "receipt" | "ai";
  filename: string;
  base64: string;
};

type BackupTripRef = {
  title: string;
  start_date: string | null;
  end_date: string | null;
};

type BackupMember = {
  display_name: string;
  email: string | null;
  username: string | null;
  invite_revoked_at: string | null;
};

type BackupSplit = {
  member_display_name: string;
  share_amount_base: number;
  share_units: number | null;
};

type BackupExpense = {
  description: string | null;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_base: number;
  expense_date: string | null;
  direction: string;
  split_mode: string;
  note: string | null;
  category_label: string | null;
  category_tone: string | null;
  place_name: string | null;
  place_lat: number | null;
  place_lon: number | null;
  paid_by_display_name: string | null;
  paperless_id: number | null;
  ai_image_prompt: string | null;
  receipt: MediaBlob | null;
  ai_image: MediaBlob | null;
  splits: BackupSplit[];
};

type BackupSettlement = {
  from_display_name: string;
  to_display_name: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_base: number;
  note: string | null;
  settled_at: string;
};

type BackupLedger = {
  title: string;
  base_currency: string;
  ledger_kind: string;
  archived: boolean;
  trip: BackupTripRef | null;
  cover_prompt: string | null;
  cover: MediaBlob | null;
  members: BackupMember[];
  expenses: BackupExpense[];
  settlements: BackupSettlement[];
  access_usernames: string[];
};

export type FinanceBrainBackup = {
  version: number;
  exported_at: string;
  ledgers: BackupLedger[];
};

function fileToMedia(
  kind: MediaBlob["kind"],
  filePath: string | null
): MediaBlob | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return {
    kind,
    filename: path.basename(filePath),
    base64: fs.readFileSync(filePath).toString("base64"),
  };
}

function writeMediaBlob(kind: MediaBlob["kind"], blob: MediaBlob): string {
  const dir =
    kind === "cover"
      ? getFinanceLedgerCoversDir()
      : kind === "receipt"
        ? getFinanceReceiptsDir()
        : getFinanceExpenseAiDir();
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(blob.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const full = path.join(dir, `restore-${Date.now()}-${safe}`);
  fs.writeFileSync(full, Buffer.from(blob.base64, "base64"));
  return full;
}

function listAllLedgers(): FinanceLedgerRow[] {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT * FROM finance_ledgers ORDER BY id ASC`
      )
      .all() as FinanceLedgerRow[]
  ).map((row) => ({ ...row, ledger_kind: coerceLedgerKind(row.ledger_kind) }));
}

function memberUsername(member: FinanceLedgerMemberRow): string | null {
  if (member.user_id == null) return null;
  const db = getDb();
  const row = db
    .prepare(`SELECT username FROM users WHERE id = ?`)
    .get(member.user_id) as { username: string } | undefined;
  return row?.username ?? null;
}

function accessUsernamesForLedger(ledgerId: number): string[] {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT u.username
         FROM user_ledger_access a
         JOIN users u ON u.id = a.user_id
         WHERE a.ledger_id = ?
         ORDER BY u.username COLLATE NOCASE`
      )
      .all(ledgerId) as Array<{ username: string }>
  ).map((r) => r.username);
}

function paperlessIdForDocument(documentId: number | null): number | null {
  if (documentId == null) return null;
  const db = getDb();
  const row = db
    .prepare(`SELECT paperless_id FROM paperless_documents WHERE id = ?`)
    .get(documentId) as { paperless_id: number } | undefined;
  return row?.paperless_id ?? null;
}

function localDocIdForPaperless(paperlessId: number): number | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT id FROM paperless_documents WHERE paperless_id = ?`)
    .get(paperlessId) as { id: number } | undefined;
  return row?.id ?? null;
}

function serializeExpense(
  expense: FinanceExpenseRow,
  membersById: Map<number, FinanceLedgerMemberRow>
): BackupExpense {
  const splits = listFinanceExpenseSplits(expense.id).map((s) => ({
    member_display_name:
      membersById.get(s.member_id)?.display_name || `member-${s.member_id}`,
    share_amount_base: s.share_amount_base,
    share_units: s.share_units,
  }));
  return {
    description: expense.description,
    amount: expense.amount,
    currency: expense.currency,
    exchange_rate: expense.exchange_rate,
    amount_base: expense.amount_base,
    expense_date: expense.expense_date,
    direction: expense.direction,
    split_mode: expense.split_mode,
    note: expense.note,
    category_label: expense.category_label,
    category_tone: expense.category_tone,
    place_name: expense.place_name,
    place_lat: expense.place_lat,
    place_lon: expense.place_lon,
    paid_by_display_name:
      membersById.get(expense.paid_by_member_id)?.display_name ?? null,
    paperless_id: paperlessIdForDocument(expense.document_id),
    ai_image_prompt: expense.ai_image_prompt,
    receipt: fileToMedia("receipt", expense.receipt_path),
    ai_image: fileToMedia("ai", expense.ai_image_path),
    splits,
  };
}

function serializeSettlement(
  settlement: FinanceSettlementRow,
  membersById: Map<number, FinanceLedgerMemberRow>
): BackupSettlement {
  return {
    from_display_name:
      membersById.get(settlement.from_member_id)?.display_name ||
      `member-${settlement.from_member_id}`,
    to_display_name:
      membersById.get(settlement.to_member_id)?.display_name ||
      `member-${settlement.to_member_id}`,
    amount: settlement.amount,
    currency: settlement.currency,
    exchange_rate: settlement.exchange_rate,
    amount_base: settlement.amount_base,
    note: settlement.note,
    settled_at: settlement.settled_at,
  };
}

function serializeLedger(ledger: FinanceLedgerRow): BackupLedger {
  const members = listFinanceLedgerMembers(ledger.id);
  const membersById = new Map(members.map((m) => [m.id, m]));
  const trip =
    ledger.trip_id != null ? getTripById(ledger.trip_id) : null;
  return {
    title: ledger.title,
    base_currency: ledger.base_currency,
    ledger_kind: ledger.ledger_kind,
    archived: Boolean(ledger.archived_at),
    trip: trip
      ? {
          title: trip.title,
          start_date: trip.start_date,
          end_date: trip.end_date,
        }
      : null,
    cover_prompt: ledger.cover_prompt,
    cover: fileToMedia("cover", ledger.cover_path),
    members: members.map((m) => ({
      display_name: m.display_name,
      email: m.email,
      username: memberUsername(m),
      invite_revoked_at: m.invite_revoked_at,
    })),
    expenses: listFinanceExpenses(ledger.id).map((e) =>
      serializeExpense(e, membersById)
    ),
    settlements: listFinanceSettlements(ledger.id).map((s) =>
      serializeSettlement(s, membersById)
    ),
    access_usernames: accessUsernamesForLedger(ledger.id),
  };
}

export function buildFinanceBrainBackup(): FinanceBrainBackup {
  return {
    version: FINANCEBRAIN_BACKUP_VERSION,
    exported_at: nowIso(),
    ledgers: listAllLedgers().map(serializeLedger),
  };
}

function findTripId(ref: BackupTripRef | null | undefined): number | null {
  if (!ref?.title?.trim()) return null;
  const trips = listTrips();
  const matches = trips.filter(
    (t) =>
      t.title === ref.title &&
      (t.start_date || null) === (ref.start_date || null) &&
      (t.end_date || null) === (ref.end_date || null)
  );
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    const byTitle = trips.filter((t) => t.title === ref.title);
    return byTitle[0]?.id ?? matches[0].id;
  }
  const byTitle = trips.filter((t) => t.title === ref.title);
  return byTitle[0]?.id ?? null;
}

function memberKey(name: string): string {
  return name.trim().toLowerCase();
}

export function importFinanceBrainBackup(payload: FinanceBrainBackup): {
  ledgersCreated: number;
  membersCreated: number;
  expensesCreated: number;
  settlementsCreated: number;
  accessRestored: number;
  warnings: string[];
} {
  if (!payload || payload.version !== FINANCEBRAIN_BACKUP_VERSION) {
    throw new Error(
      `Ungültige Backup-Version (erwartet ${FINANCEBRAIN_BACKUP_VERSION}).`
    );
  }
  if (!Array.isArray(payload.ledgers)) {
    throw new Error("Backup enthält keine Abrechnungen.");
  }

  let ledgersCreated = 0;
  let membersCreated = 0;
  let expensesCreated = 0;
  let settlementsCreated = 0;
  let accessRestored = 0;
  const warnings: string[] = [];

  for (const ledger of payload.ledgers) {
    const kind = coerceLedgerKind(ledger.ledger_kind);
    const tripId = findTripId(ledger.trip);
    if (ledger.trip && tripId == null) {
      warnings.push(
        `Reise «${ledger.trip.title}» für Abrechnung «${ledger.title}» nicht gefunden – ohne Verknüpfung importiert.`
      );
    }

    const created = createFinanceLedger({
      title: ledger.title || "Importierte Abrechnung",
      baseCurrency: ledger.base_currency || "CHF",
      ledgerKind: kind,
      tripId,
      // Members restored explicitly below (including normal solo).
      memberNames: kind === "normal" ? undefined : [],
    });
    ledgersCreated += 1;

    if (ledger.archived) {
      try {
        updateFinanceLedger(created.id, { archived: true });
      } catch {
        /* ignore */
      }
    }

    if (ledger.cover) {
      try {
        const coverPath = writeMediaBlob("cover", ledger.cover);
        setFinanceLedgerCover(created.id, {
          coverPath,
          coverPrompt: ledger.cover_prompt ?? null,
        });
      } catch (err) {
        warnings.push(
          `Cover «${ledger.title}»: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    } else if (ledger.cover_prompt) {
      try {
        setFinanceLedgerCover(created.id, {
          coverPath: null,
          coverPrompt: ledger.cover_prompt,
        });
      } catch {
        /* ignore */
      }
    }

    const memberIdByName = new Map<string, number>();

    if (kind === "normal") {
      const existing = listFinanceLedgerMembers(created.id);
      for (const m of existing) {
        memberIdByName.set(memberKey(m.display_name), m.id);
      }
    } else {
      for (const member of ledger.members || []) {
        try {
          let row;
          if (member.username) {
            const user = getAppUserByUsername(member.username);
            if (user) {
              row = addFinanceLedgerMemberFromUser(created.id, user.id);
            }
          }
          if (!row) {
            row = addFinanceLedgerMember(created.id, {
              displayName: member.display_name,
              email: member.email,
            });
          }
          membersCreated += 1;
          memberIdByName.set(memberKey(row.display_name), row.id);
          if (member.invite_revoked_at) {
            getDb()
              .prepare(
                `UPDATE finance_ledger_members SET invite_revoked_at = ? WHERE id = ?`
              )
              .run(member.invite_revoked_at, row.id);
          }
        } catch (err) {
          warnings.push(
            `Teilnehmer «${member.display_name}» / «${ledger.title}»: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    for (const expense of ledger.expenses || []) {
      try {
        const paidName = expense.paid_by_display_name;
        const paidByMemberId = paidName
          ? memberIdByName.get(memberKey(paidName))
          : null;

        const splitMemberIds: number[] = [];
        const exactAmounts: Array<{ memberId: number; amountBase: number }> =
          [];
        const shareUnits: Array<{ memberId: number; units: number }> = [];

        for (const split of expense.splits || []) {
          const mid = memberIdByName.get(memberKey(split.member_display_name));
          if (mid == null) {
            warnings.push(
              `Split-Teilnehmer «${split.member_display_name}» fehlt («${ledger.title}»).`
            );
            continue;
          }
          splitMemberIds.push(mid);
          exactAmounts.push({
            memberId: mid,
            amountBase: split.share_amount_base,
          });
          if (split.share_units != null) {
            shareUnits.push({ memberId: mid, units: split.share_units });
          }
        }

        let splitInput:
          | { mode: "equal"; memberIds: number[] }
          | {
              mode: "exact";
              amounts: Array<{ memberId: number; amountBase: number }>;
            }
          | {
              mode: "shares";
              shares: Array<{ memberId: number; units: number }>;
            };

        if (kind === "normal") {
          splitInput = {
            mode: "equal",
            memberIds: [...memberIdByName.values()],
          };
        } else if (
          expense.split_mode === "shares" &&
          shareUnits.length > 0
        ) {
          splitInput = { mode: "shares", shares: shareUnits };
        } else if (exactAmounts.length > 0) {
          splitInput = { mode: "exact", amounts: exactAmounts };
        } else if (splitMemberIds.length > 0) {
          splitInput = { mode: "equal", memberIds: splitMemberIds };
        } else {
          warnings.push(
            `Ausgabe «${expense.description || "?"}» ohne Splits übersprungen.`
          );
          continue;
        }

        const documentId =
          expense.paperless_id != null
            ? localDocIdForPaperless(expense.paperless_id)
            : null;
        if (expense.paperless_id != null && documentId == null) {
          warnings.push(
            `Beleg paperless_id=${expense.paperless_id} fehlt lokal («${ledger.title}»).`
          );
        }

        const createdExpense = createFinanceExpense(created.id, {
          paidByMemberId: paidByMemberId ?? undefined,
          amount: expense.amount,
          currency: expense.currency,
          exchangeRate: expense.exchange_rate,
          description: expense.description,
          expenseDate: expense.expense_date,
          documentId,
          placeName: expense.place_name,
          placeLat: expense.place_lat,
          placeLon: expense.place_lon,
          note: expense.note,
          direction: coerceExpenseDirection(expense.direction),
          split: splitInput,
        });
        expensesCreated += 1;

        if (expense.category_label && expense.category_tone) {
          setFinanceExpenseCategory(createdExpense.id, {
            categoryLabel: expense.category_label,
            categoryTone: expense.category_tone,
          });
        }

        if (expense.receipt) {
          try {
            const receiptPath = writeMediaBlob("receipt", expense.receipt);
            setFinanceExpenseReceiptPath(createdExpense.id, receiptPath);
          } catch (err) {
            warnings.push(
              `Belegbild «${expense.description || "?"}»: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }

        if (expense.ai_image) {
          try {
            const aiPath = writeMediaBlob("ai", expense.ai_image);
            setFinanceExpenseAiImage(createdExpense.id, {
              aiImagePath: aiPath,
              aiImagePrompt: expense.ai_image_prompt ?? null,
            });
          } catch (err) {
            warnings.push(
              `KI-Bild «${expense.description || "?"}»: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }
      } catch (err) {
        warnings.push(
          `Ausgabe «${expense.description || "?"}» / «${ledger.title}»: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    if (kind === "split") {
      for (const settlement of ledger.settlements || []) {
        try {
          const fromId = memberIdByName.get(
            memberKey(settlement.from_display_name)
          );
          const toId = memberIdByName.get(
            memberKey(settlement.to_display_name)
          );
          if (fromId == null || toId == null) {
            warnings.push(
              `Rückzahlung ${settlement.from_display_name}→${settlement.to_display_name} übersprungen (Teilnehmer fehlt).`
            );
            continue;
          }
          createFinanceSettlement(created.id, {
            fromMemberId: fromId,
            toMemberId: toId,
            amount: settlement.amount,
            currency: settlement.currency,
            exchangeRate: settlement.exchange_rate,
            note: settlement.note,
            settledAt: settlement.settled_at,
          });
          settlementsCreated += 1;
        } catch (err) {
          warnings.push(
            `Rückzahlung «${ledger.title}»: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    for (const username of ledger.access_usernames || []) {
      const user = getAppUserByUsername(username);
      if (!user) {
        warnings.push(
          `Kein App-User «${username}» für Abrechnungs-Zugriff («${ledger.title}»).`
        );
        continue;
      }
      try {
        grantLedgerAccess(user.id, created.id);
        accessRestored += 1;
      } catch (err) {
        warnings.push(
          `Zugriff «${username}» / «${ledger.title}»: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  return {
    ledgersCreated,
    membersCreated,
    expensesCreated,
    settlementsCreated,
    accessRestored,
    warnings,
  };
}
