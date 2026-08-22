/**
 * Buddy-domain agenda rows (Travel / Finanzen) for Kalender + Übersicht.
 */
import { getDb } from "@/lib/db/client";
import { publicAiIconUrl } from "@/lib/db/queries";
import { paymentMethodLabel } from "@/lib/finance/payment-methods";
import { eventAiImagePublicUrl } from "@/lib/trips/cover";
import { toSwissDate } from "@/lib/utils/dates";
import type { AgendaItem } from "@/lib/dashboard/overview";
import { SQL_DOC_NOT_BUSINESS } from "@/lib/documents/business";

export const CALENDAR_SOURCE_TRAVEL = "travel";
export const CALENDAR_SOURCE_INVOICES = "invoices";

function inRange(date: string | null | undefined, start: string, end: string) {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= start && d <= end;
}

/** Offene Rechnungen / Zahlungspipeline mit Datum im Fenster. */
export function listInvoiceAgendaItems(
  start: string,
  end: string,
  today: string,
  options?: { clampOverdueToToday?: boolean }
): AgendaItem[] {
  const clampOverdue = options?.clampOverdueToToday !== false;
  const db = getDb();
  const invoices = db
    .prepare(
      `SELECT d.id as document_id, d.title, d.correspondent_name,
              d.payment_planned_date, d.payment_method, d.ai_icon_path,
              f.id as finance_id, f.amount, f.currency, f.vendor,
              f.invoice_date, f.due_date, f.category
       FROM paperless_documents d
       LEFT JOIN financial_items f ON f.id = (
         SELECT f2.id FROM financial_items f2
         WHERE f2.document_id = d.id
         ORDER BY f2.id ASC LIMIT 1
       )
       WHERE COALESCE(d.sync_status, 'synced') != 'missing'
         AND d.zu_bezahlen = 1
         AND COALESCE(d.bezahlt, 0) = 0
         AND ${SQL_DOC_NOT_BUSINESS}`
    )
    .all() as Array<{
    document_id: number;
    title: string | null;
    correspondent_name: string | null;
    payment_planned_date: string | null;
    payment_method: string | null;
    ai_icon_path: string | null;
    finance_id: number | null;
    amount: number | null;
    currency: string | null;
    vendor: string | null;
    invoice_date: string | null;
    due_date: string | null;
    category: string | null;
  }>;

  const out: AgendaItem[] = [];
  for (const row of invoices) {
    const planned =
      row.payment_planned_date && row.payment_planned_date.trim()
        ? row.payment_planned_date.slice(0, 10)
        : null;
    const inPipeline = Boolean(planned && planned >= today);
    const dueRaw = (row.due_date || row.invoice_date || today).slice(0, 10);
    const rawDate = inPipeline ? planned! : dueRaw;
    let useDate: string | null = null;
    if (inRange(rawDate, start, end)) {
      useDate = rawDate;
    } else if (
      clampOverdue &&
      !inPipeline &&
      rawDate < today &&
      inRange(today, start, end)
    ) {
      useDate = today;
    }
    if (!useDate) continue;
    const methodLabel = paymentMethodLabel(row.payment_method);
    out.push({
      id: `inv-${row.document_id}`,
      kind: "invoice",
      date: useDate,
      title: row.vendor || row.title || `Rechnung #${row.document_id}`,
      subtitle: inPipeline
        ? [
            "In Zahlungspipeline",
            methodLabel,
            dueRaw !== planned
              ? `Fällig gewesen: ${toSwissDate(dueRaw)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : [row.correspondent_name, row.category].filter(Boolean).join(" · ") ||
          null,
      amount: row.amount,
      currency: row.currency || "CHF",
      documentId: row.document_id,
      href: `/documents/${row.document_id}`,
      badge: inPipeline ? "Zahlung" : "Rechnung",
      accentColor: "#0f766e",
      calendarId: CALENDAR_SOURCE_INVOICES,
      planningRelevant: true,
      aiIconUrl: publicAiIconUrl(row.ai_icon_path),
    });
  }
  return out;
}

/** TravelBuddy trip_events im Datumsfenster. */
export function listTravelAgendaItems(
  start: string,
  end: string
): AgendaItem[] {
  const db = getDb();
  const tripEvents = db
    .prepare(
      `SELECT e.id, e.trip_id, e.event_type, e.title, e.start_date, e.start_time,
              e.provider, e.origin_place, e.destination_place,
              e.departure_airport, e.arrival_airport, e.place_name, e.location,
              e.flight_number, e.airline, e.document_id, e.ai_image_path,
              t.title as trip_title
       FROM trip_events e
       JOIN trips t ON t.id = e.trip_id
       WHERE e.start_date IS NOT NULL
         AND e.start_date >= ?
         AND e.start_date <= ?
         AND COALESCE(t.status, 'planned') != 'cancelled'
       ORDER BY e.start_date ASC, COALESCE(e.start_time, '') ASC, e.sort_key ASC, e.id ASC`
    )
    .all(start, end) as Array<{
    id: number;
    trip_id: number;
    event_type: string;
    title: string;
    start_date: string;
    start_time: string | null;
    provider: string | null;
    origin_place: string | null;
    destination_place: string | null;
    departure_airport: string | null;
    arrival_airport: string | null;
    place_name: string | null;
    location: string | null;
    flight_number: string | null;
    airline: string | null;
    document_id: number | null;
    ai_image_path: string | null;
    trip_title: string;
  }>;

  return tripEvents.map((row) => {
    const route =
      (row.origin_place && row.destination_place
        ? `${row.origin_place} → ${row.destination_place}`
        : null) ||
      (row.departure_airport && row.arrival_airport
        ? `${row.departure_airport} → ${row.arrival_airport}`
        : null) ||
      row.place_name ||
      row.location;
    const carrier =
      [row.airline || row.provider, row.flight_number]
        .filter(Boolean)
        .join(" ") || null;
    return {
      id: `te-${row.id}`,
      kind: "travel" as const,
      date: row.start_date.slice(0, 10),
      title: row.title || row.event_type || "Reise",
      subtitle:
        [row.trip_title, carrier, route, row.start_time]
          .filter(Boolean)
          .join(" · ") || null,
      amount: null,
      currency: null,
      documentId: row.document_id,
      href: `/trips/${row.trip_id}`,
      badge: "Reise",
      time: row.start_time,
      location:
        row.place_name ||
        row.location ||
        row.destination_place ||
        row.arrival_airport ||
        null,
      accentColor: "#0284c7",
      calendarId: CALENDAR_SOURCE_TRAVEL,
      planningRelevant: true,
      aiIconUrl: eventAiImagePublicUrl(row.ai_image_path),
    };
  });
}
