import type { ExpenseMailFields } from "@/lib/finance-brain/mail-templates";
import {
  getFinanceExpenseById,
  getFinanceLedgerByTripId,
  getFinanceLedgerMemberById,
  listExpenseShareDisplays,
  listFinanceExpenses,
  listLinkedExpensesForTripEvents,
} from "@/lib/finance-brain/queries";
import { getDb } from "@/lib/db/client";
import {
  getTripById,
  listCommentsForEvent,
  listTripEvents,
  listTripTravelers,
  type TripEventRow,
} from "@/lib/trips/queries";
import { getAppUserById } from "@/lib/users/queries";
import { nowIso } from "@/lib/utils/dates";

export type TravelDiaryComment = {
  commentId: number;
  authorName: string;
  body: string;
  createdAt: string;
  hasImage: boolean;
  imageCid: string;
  imagePath: string | null;
};

export type TravelDiaryExpense = ExpenseMailFields & {
  aiImagePath: string | null;
};

export type TravelDiaryEvent = {
  eventId: number;
  title: string;
  eventType: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  provider: string | null;
  notes: string | null;
  hasAiImage: boolean;
  aiCid: string;
  aiImagePath: string | null;
  comments: TravelDiaryComment[];
  expenses: TravelDiaryExpense[];
};

export type TravelDiaryModel = {
  tripId: number;
  tripTitle: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  exportedAt: string;
  events: TravelDiaryEvent[];
  orphanExpenses: TravelDiaryExpense[];
  ledgerTitle: string | null;
  baseCurrency: string | null;
};

export type TravelDiaryRecipient = {
  recipientKey: string;
  displayName: string;
  email: string;
};

function eventLocationLabel(event: TripEventRow): string | null {
  const parts = [
    event.place_name,
    event.location,
    event.origin_place && event.destination_place
      ? `${event.origin_place} → ${event.destination_place}`
      : event.origin_place || event.destination_place,
  ]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.some((u) => u.toLowerCase() === p.toLowerCase())) {
      unique.push(p);
    }
  }
  return unique.length ? unique.join(" · ") : null;
}

function expenseFieldsForId(
  expenseId: number,
  baseCurrency: string,
  activityLabel?: string | null
): TravelDiaryExpense | null {
  const expense = getFinanceExpenseById(expenseId);
  if (!expense) return null;
  if ((expense.direction || "expense") === "income") return null;
  const payer = getFinanceLedgerMemberById(expense.paid_by_member_id);
  const shares = listExpenseShareDisplays(
    expense.id,
    expense.paid_by_member_id
  ).map((s) => ({
    displayName: s.displayName,
    shareAmountBase: s.shareAmountBase,
    isPayer: s.isPayer,
    avatarCid: s.avatarPath ? `avatar-${s.memberId}` : undefined,
  }));
  return {
    expenseId: expense.id,
    description: expense.description,
    categoryLabel: expense.category_label,
    amount: expense.amount,
    currency: expense.currency,
    amountBase: expense.amount_base,
    baseCurrency,
    exchangeRate: expense.exchange_rate,
    paidByName: payer?.display_name || `#${expense.paid_by_member_id}`,
    placeName: expense.place_name,
    expenseDate: expense.expense_date,
    note: expense.note,
    hasAiImage: Boolean(expense.ai_image_path),
    aiCid: `expense-ai-${expense.id}`,
    aiImagePath: expense.ai_image_path,
    activityLabel: activityLabel ?? null,
    shares,
  };
}

export function buildTravelDiaryModel(tripId: number): TravelDiaryModel {
  const trip = getTripById(tripId);
  if (!trip) throw new Error("Reise nicht gefunden");

  const events = listTripEvents(tripId);
  const eventIds = events.map((e) => e.id);
  const linked = listLinkedExpensesForTripEvents(eventIds);
  const ledger = getFinanceLedgerByTripId(tripId);
  const baseCurrency = ledger?.base_currency ?? null;

  const diaryEvents: TravelDiaryEvent[] = events.map((event) => {
    const comments = listCommentsForEvent(event.id).map((c) => ({
      commentId: c.id,
      authorName: c.author_name,
      body: c.body,
      createdAt: c.created_at,
      hasImage: Boolean(c.image_path),
      imageCid: `comment-${c.id}`,
      imagePath: c.image_path,
    }));

    const expenseRows = linked.get(event.id) || [];
    const expenses: TravelDiaryExpense[] = [];
    for (const row of expenseRows) {
      const fields = expenseFieldsForId(
        row.id,
        row.base_currency || baseCurrency || row.currency,
        null
      );
      if (fields) expenses.push(fields);
    }

    return {
      eventId: event.id,
      title: event.title?.trim() || "Aktivität",
      eventType: event.event_type,
      startDate: event.start_date,
      endDate: event.end_date,
      startTime: event.start_time,
      endTime: event.end_time,
      location: eventLocationLabel(event),
      provider: event.provider,
      notes: event.notes,
      hasAiImage: Boolean(event.ai_image_path),
      aiCid: `event-ai-${event.id}`,
      aiImagePath: event.ai_image_path,
      comments,
      expenses,
    };
  });

  const orphanExpenses: TravelDiaryExpense[] = [];
  if (ledger) {
    const linkedIds = new Set(
      [...linked.values()].flatMap((list) => list.map((e) => e.id))
    );
    for (const expense of listFinanceExpenses(ledger.id)) {
      if (linkedIds.has(expense.id)) continue;
      if ((expense.direction || "expense") === "income") continue;
      const fields = expenseFieldsForId(expense.id, ledger.base_currency, null);
      if (fields) orphanExpenses.push(fields);
    }
  }

  return {
    tripId: trip.id,
    tripTitle: trip.title,
    destination: trip.destination,
    startDate: trip.start_date,
    endDate: trip.end_date,
    exportedAt: nowIso(),
    events: diaryEvents,
    orphanExpenses,
    ledgerTitle: ledger?.title ?? null,
    baseCurrency,
  };
}

/** Selectable recipients: travelers + trip-access users with email. */
export function listTravelDiaryRecipients(
  tripId: number
): TravelDiaryRecipient[] {
  const byLower = new Map<string, TravelDiaryRecipient>();

  function add(
    key: string,
    displayName: string,
    emailRaw: string | null | undefined
  ) {
    const email = emailRaw?.trim();
    if (!email || !email.includes("@")) return;
    const lower = email.toLowerCase();
    if (byLower.has(lower)) return;
    byLower.set(lower, {
      recipientKey: key,
      displayName: displayName.trim() || email,
      email,
    });
  }

  for (const traveler of listTripTravelers(tripId)) {
    if (traveler.email?.trim()) {
      add(`traveler:${traveler.id}`, traveler.display_name, traveler.email);
    }
    if (traveler.user_id != null) {
      const user = getAppUserById(traveler.user_id);
      if (user?.active && user.email?.trim()) {
        add(
          `user:${user.id}`,
          traveler.display_name || user.display_name || user.email,
          user.email
        );
      }
    }
  }

  const accessRows = getDb()
    .prepare(
      `SELECT u.id AS user_id, u.email AS email, u.display_name AS display_name
       FROM users u
       INNER JOIN user_trip_access uta ON uta.user_id = u.id
       WHERE uta.trip_id = ?
         AND u.active = 1
         AND TRIM(COALESCE(u.email, '')) != ''`
    )
    .all(tripId) as Array<{
    user_id: number;
    email: string;
    display_name: string | null;
  }>;
  for (const row of accessRows) {
    add(`user:${row.user_id}`, row.display_name || row.email, row.email);
  }

  return [...byLower.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "de")
  );
}
