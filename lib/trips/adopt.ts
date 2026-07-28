import { getDb } from "@/lib/db/client";
import { fetchEcbExchangeRate } from "@/lib/finance-brain/exchange-rates";
import {
  addFinanceLedgerMember,
  addFinanceLedgerMemberFromUser,
  createFinanceExpense,
  createFinanceLedger,
  getFinanceLedgerByTripId,
  listFinanceLedgerMembers,
} from "@/lib/finance-brain/queries";
import {
  coerceTripEventType,
  type TripEventDraft,
} from "@/lib/trips/constants";
import {
  createTrip,
  createTripEvent,
  getTripById,
  listTripTravelers,
  type TripEventRow,
  type TripRow,
} from "@/lib/trips/queries";

export type AdoptFinanceInput = {
  /** Explicit opt-in — never implied. */
  include: boolean;
  amount?: number;
  currency?: string;
  description?: string | null;
  expenseDate?: string | null;
  documentId?: number | null;
  /** 0-based index into created events (after filtering). */
  linkToEventIndex?: number | null;
};

export type AdoptTripInput = {
  tripId?: number | null;
  newTripTitle?: string | null;
  drafts: TripEventDraft[];
  finance?: AdoptFinanceInput | null;
};

export type FinanceSuggestion = {
  amount: number;
  currency: string;
  description: string;
  expenseDate: string | null;
  documentId: number | null;
  source: "financial_item" | "travel_item";
};

export type AdoptTripResult = {
  trip: TripRow;
  events: TripEventRow[];
  ledgerId: number | null;
  expenseId: number | null;
  createdTrip: boolean;
  createdLedger: boolean;
};

function draftToEventInput(draft: TripEventDraft) {
  return {
    eventType: coerceTripEventType(draft.type),
    title: draft.title,
    startDate: draft.start_date ?? null,
    endDate: draft.end_date ?? null,
    startTime: draft.start_time ?? null,
    endTime: draft.end_time ?? null,
    location: draft.location ?? null,
    address: draft.address ?? null,
    provider: draft.provider ?? null,
    bookingReference: draft.booking_reference ?? null,
    notes: draft.notes ?? null,
    flightNumber: draft.flight_number ?? null,
    cabinClass: draft.cabin_class ?? null,
    departureAirport: draft.departure_airport ?? null,
    arrivalAirport: draft.arrival_airport ?? null,
    originPlace: draft.origin_place ?? null,
    destinationPlace: draft.destination_place ?? null,
    documentId: draft.document_id ?? null,
    travelItemId: draft.travel_item_id ?? null,
    guideId: draft.guide_id ?? null,
    noteId: draft.note_id ?? null,
    sourceExcerpt: draft.source_excerpt ?? null,
  };
}

export function suggestFinanceFromDrafts(
  drafts: TripEventDraft[]
): FinanceSuggestion | null {
  const db = getDb();
  const documentIds = [
    ...new Set(
      drafts
        .map((d) => d.document_id)
        .filter((id): id is number => typeof id === "number" && id > 0)
    ),
  ];
  const travelItemIds = [
    ...new Set(
      drafts
        .map((d) => d.travel_item_id)
        .filter((id): id is number => typeof id === "number" && id > 0)
    ),
  ];

  for (const documentId of documentIds) {
    const row = db
      .prepare(
        `SELECT amount, currency, vendor, description, invoice_date, due_date
         FROM financial_items
         WHERE document_id = ?
           AND amount IS NOT NULL AND amount > 0
         ORDER BY id DESC
         LIMIT 1`
      )
      .get(documentId) as
      | {
          amount: number;
          currency: string | null;
          vendor: string | null;
          description: string | null;
          invoice_date: string | null;
          due_date: string | null;
        }
      | undefined;
    if (row) {
      return {
        amount: row.amount,
        currency: (row.currency || "CHF").toUpperCase(),
        description:
          row.description?.trim() ||
          row.vendor?.trim() ||
          drafts[0]?.title ||
          "Reisekosten",
        expenseDate: row.invoice_date || row.due_date || null,
        documentId,
        source: "financial_item",
      };
    }
  }

  for (const travelItemId of travelItemIds) {
    const row = db
      .prepare(
        `SELECT price, currency, title, provider, start_date, document_id
         FROM travel_items
         WHERE id = ?
           AND price IS NOT NULL AND price > 0
         LIMIT 1`
      )
      .get(travelItemId) as
      | {
          price: number;
          currency: string | null;
          title: string | null;
          provider: string | null;
          start_date: string | null;
          document_id: number;
        }
      | undefined;
    if (row) {
      return {
        amount: row.price,
        currency: (row.currency || "CHF").toUpperCase(),
        description:
          row.title?.trim() ||
          row.provider?.trim() ||
          drafts[0]?.title ||
          "Reisekosten",
        expenseDate: row.start_date || null,
        documentId: row.document_id,
        source: "travel_item",
      };
    }
  }

  return null;
}

async function ensureTripLedger(tripId: number): Promise<{
  ledgerId: number;
  created: boolean;
}> {
  const existing = getFinanceLedgerByTripId(tripId);
  if (existing) return { ledgerId: existing.id, created: false };

  const trip = getTripById(tripId);
  if (!trip) throw new Error("Reise nicht gefunden");

  const ledger = createFinanceLedger({
    title: trip.title,
    tripId,
    ledgerKind: "split",
  });
  const travelers = listTripTravelers(tripId);
  for (const t of travelers) {
    if (t.user_id) {
      addFinanceLedgerMemberFromUser(ledger.id, t.user_id);
    } else {
      addFinanceLedgerMember(ledger.id, {
        displayName: t.display_name,
        email: t.email,
      });
    }
  }
  let members = listFinanceLedgerMembers(ledger.id);
  if (members.length === 0) {
    addFinanceLedgerMember(ledger.id, { displayName: "Reisende" });
    members = listFinanceLedgerMembers(ledger.id);
  }
  return { ledgerId: ledger.id, created: true };
}

export async function adoptDraftsToTrip(
  input: AdoptTripInput
): Promise<AdoptTripResult> {
  const drafts = input.drafts.filter((d) => d.title?.trim());
  if (drafts.length === 0) {
    throw new Error("Keine Ereignisse zum Hinzufügen.");
  }

  let trip: TripRow | null = null;
  let createdTrip = false;
  if (input.tripId && Number.isInteger(input.tripId) && input.tripId > 0) {
    trip = getTripById(input.tripId);
    if (!trip) throw new Error("Reise nicht gefunden");
  } else if (input.newTripTitle?.trim()) {
    const dates = drafts
      .map((d) => d.start_date)
      .filter((d): d is string => Boolean(d))
      .sort();
    const endDates = drafts
      .map((d) => d.end_date || d.start_date)
      .filter((d): d is string => Boolean(d))
      .sort();
    trip = createTrip({
      title: input.newTripTitle.trim(),
      startDate: dates[0] || null,
      endDate: endDates[endDates.length - 1] || null,
      status: "planned",
    });
    createdTrip = true;
  } else {
    throw new Error("Bitte Reise wählen oder neu anlegen.");
  }

  const events = drafts.map((draft) =>
    createTripEvent(trip!.id, draftToEventInput(draft))
  );

  let ledgerId: number | null = null;
  let expenseId: number | null = null;
  let createdLedger = false;

  if (input.finance?.include) {
    const suggestion =
      input.finance.amount && input.finance.amount > 0
        ? null
        : suggestFinanceFromDrafts(drafts);
    const amount = input.finance.amount ?? suggestion?.amount;
    const currency = (
      input.finance.currency ||
      suggestion?.currency ||
      "CHF"
    ).toUpperCase();
    if (!amount || amount <= 0) {
      throw new Error("Betrag für Kostenübernahme fehlt.");
    }

    const ensured = await ensureTripLedger(trip.id);
    ledgerId = ensured.ledgerId;
    createdLedger = ensured.created;

    const members = listFinanceLedgerMembers(ledgerId);
    if (members.length === 0) {
      addFinanceLedgerMember(ledgerId, { displayName: "Reisende" });
    }
    const payerMembers = listFinanceLedgerMembers(ledgerId);
    const payer = payerMembers[0];
    if (!payer) throw new Error("Keine Mitglieder in der Abrechnung");

    const ledger = getFinanceLedgerByTripId(trip.id);
    let exchangeRate = 1;
    if (ledger && currency !== ledger.base_currency) {
      const rate = await fetchEcbExchangeRate({
        from: currency,
        to: ledger.base_currency,
        date: input.finance.expenseDate || suggestion?.expenseDate,
      });
      exchangeRate = rate.rate;
    }

    const linkIndex = input.finance.linkToEventIndex;
    const tripEventId =
      linkIndex != null &&
      Number.isInteger(linkIndex) &&
      linkIndex >= 0 &&
      linkIndex < events.length
        ? events[linkIndex].id
        : events[0]?.id ?? null;

    const expense = createFinanceExpense(ledgerId, {
      paidByMemberId: payer.id,
      amount,
      currency,
      exchangeRate,
      description:
        input.finance.description?.trim() ||
        suggestion?.description ||
        drafts[0]?.title ||
        "Reisekosten",
      expenseDate:
        input.finance.expenseDate ||
        suggestion?.expenseDate ||
        drafts[0]?.start_date ||
        null,
      documentId:
        input.finance.documentId ??
        suggestion?.documentId ??
        drafts.find((d) => d.document_id)?.document_id ??
        null,
      tripEventId,
      split: {
        mode: "equal",
        memberIds: payerMembers.map((m) => m.id),
      },
    });
    expenseId = expense.id;
  }

  return {
    trip,
    events,
    ledgerId,
    expenseId,
    createdTrip,
    createdLedger,
  };
}

export function suggestFinanceFromIds(input: {
  documentIds?: number[];
  travelItemIds?: number[];
  fallbackTitle?: string | null;
}): FinanceSuggestion | null {
  const drafts: TripEventDraft[] = [];
  for (const documentId of input.documentIds || []) {
    drafts.push({
      type: "Ausflug",
      title: input.fallbackTitle || "Reise",
      document_id: documentId,
    });
  }
  for (const travelItemId of input.travelItemIds || []) {
    drafts.push({
      type: "Ausflug",
      title: input.fallbackTitle || "Reise",
      travel_item_id: travelItemId,
    });
  }
  return suggestFinanceFromDrafts(drafts);
}
