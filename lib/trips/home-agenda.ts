import { getDb } from "@/lib/db/client";
import {
  listOpenUnpaidInvoices,
  type OpenUnpaidInvoice,
} from "@/lib/db/queries";
import { listTrips, type TripEventRow, type TripRow } from "@/lib/trips/queries";
import { listUserTripIds } from "@/lib/users/queries";
import { toTimeInputValue } from "@/lib/utils/dates";

export type HomeAgendaEvent = {
  id: number;
  trip_id: number;
  trip_title: string;
  event_type: string;
  title: string;
  start_date: string | null;
  start_time: string | null;
  end_time: string | null;
  provider: string | null;
  flight_number: string | null;
  airline: string | null;
  booking_reference: string | null;
};

export type HomeAgendaDay = {
  iso: string;
  isToday: boolean;
  events: HomeAgendaEvent[];
};

export type HomeDueInvoice = {
  id: number;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string;
  description: string | null;
  document_local_id: number;
  document_title: string | null;
  overdue: boolean;
  paperless_id?: number;
  correspondent_name?: string | null;
  document_type_name?: string | null;
  created_date?: string | null;
  zu_bezahlen?: number | null;
  bezahlt?: number | null;
  tags?: string[];
};

export type HomeAgendaPayload = {
  todayIso: string;
  activeTrip: (TripRow & { cover_url?: string | null }) | null;
  upcomingTrips: TripRow[];
  days: HomeAgendaDay[];
  dueInvoices: HomeDueInvoice[];
  openUnpaidInvoices: OpenUnpaidInvoice[];
};

function todayIsoLocal(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, "0"),
    String(dt.getDate()).padStart(2, "0"),
  ].join("-");
}

function pickActiveTrip(trips: TripRow[], today: string): TripRow | null {
  const active = trips.filter((t) => t.status === "active");
  if (active.length === 1) return active[0];
  if (active.length > 1) {
    return (
      active.find(
        (t) =>
          (!t.start_date || t.start_date <= today) &&
          (!t.end_date || t.end_date >= today)
      ) || active[0]
    );
  }

  const planned = trips
    .filter((t) => t.status === "planned")
    .filter((t) => {
      if (t.start_date && t.end_date) {
        return t.start_date <= today && t.end_date >= today;
      }
      if (t.start_date) return t.start_date <= addDaysIso(today, 14);
      return false;
    })
    .sort((a, b) =>
      (a.start_date || "").localeCompare(b.start_date || "")
    );
  return planned[0] ?? null;
}

function listAgendaEventsForTrips(
  tripIds: number[],
  fromIso: string,
  toIso: string
): Array<TripEventRow & { trip_title: string }> {
  if (tripIds.length === 0) return [];
  const db = getDb();
  const placeholders = tripIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT e.*, t.title AS trip_title
       FROM trip_events e
       JOIN trips t ON t.id = e.trip_id
       WHERE e.trip_id IN (${placeholders})
         AND e.start_date IS NOT NULL
         AND e.start_date >= ?
         AND e.start_date <= ?
       ORDER BY e.start_date ASC,
         COALESCE(e.start_time, '') ASC,
         e.sort_key ASC,
         e.id ASC`
    )
    .all(...tripIds, fromIso, toIso) as Array<
    TripEventRow & { trip_title: string }
  >;
}

function listUpcomingDueInvoices(today: string, horizonDays = 7): HomeDueInvoice[] {
  const db = getDb();
  const until = addDaysIso(today, horizonDays);
  const rows = db
    .prepare(
      `SELECT f.id, f.vendor, f.amount, f.currency, f.due_date, f.description,
              d.id AS document_local_id, d.title AS document_title
       FROM financial_items f
       JOIN paperless_documents d ON d.id = f.document_id
       WHERE f.due_date IS NOT NULL AND TRIM(f.due_date) != ''
         AND f.due_date <= ?
         AND COALESCE(f.counts_in_stats, 1) = 1
         AND COALESCE(d.bezahlt, 0) = 0
       ORDER BY f.due_date ASC
       LIMIT 8`
    )
    .all(until) as Array<{
    id: number;
    vendor: string | null;
    amount: number | null;
    currency: string | null;
    due_date: string;
    description: string | null;
    document_local_id: number;
    document_title: string | null;
  }>;

  return rows
    .filter((r) => r.due_date >= addDaysIso(today, -30) || r.due_date >= today)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      vendor: r.vendor,
      amount: r.amount,
      currency: r.currency,
      due_date: r.due_date,
      description: r.description,
      document_local_id: r.document_local_id,
      document_title: r.document_title,
      overdue: r.due_date < today,
    }));
}

export function getHomeAgenda(input: {
  isAdmin: boolean;
  userId: number | null;
  includeDueInvoices: boolean;
}): HomeAgendaPayload {
  const today = todayIsoLocal();
  let trips = listTrips().filter((t) => t.status !== "cancelled");
  if (!input.isAdmin && input.userId) {
    const allowed = new Set(listUserTripIds(input.userId));
    trips = trips.filter((t) => allowed.has(t.id));
  }

  const activeTrip = pickActiveTrip(trips, today);
  const focusTripIds = activeTrip
    ? [activeTrip.id]
    : trips
        .filter((t) => t.status === "active" || t.status === "planned")
        .slice(0, 8)
        .map((t) => t.id);

  const toIso = addDaysIso(today, 2);
  const rawEvents = listAgendaEventsForTrips(focusTripIds, today, toIso);

  const byDay = new Map<string, HomeAgendaEvent[]>();
  for (const event of rawEvents) {
    const iso = event.start_date;
    if (!iso) continue;
    const list = byDay.get(iso) || [];
    list.push({
      id: event.id,
      trip_id: event.trip_id,
      trip_title: event.trip_title,
      event_type: event.event_type,
      title: event.title,
      start_date: event.start_date,
      start_time: event.start_time,
      end_time: event.end_time,
      provider: event.provider,
      flight_number: event.flight_number,
      airline: event.airline,
      booking_reference: event.booking_reference,
    });
    byDay.set(iso, list);
  }

  const days: HomeAgendaDay[] = [...byDay.keys()]
    .sort()
    .map((iso) => ({
      iso,
      isToday: iso === today,
      events: (byDay.get(iso) || []).sort((a, b) =>
        (toTimeInputValue(a.start_time) || "").localeCompare(
          toTimeInputValue(b.start_time) || ""
        )
      ),
    }));

  const upcomingTrips = trips
    .filter((t) => t.id !== activeTrip?.id)
    .filter((t) => t.status === "active" || t.status === "planned")
    .filter((t) => !t.start_date || t.start_date >= today)
    .slice(0, 3);

  return {
    todayIso: today,
    activeTrip,
    upcomingTrips,
    days,
    dueInvoices: input.includeDueInvoices
      ? listUpcomingDueInvoices(today)
      : [],
    openUnpaidInvoices: input.includeDueInvoices
      ? listOpenUnpaidInvoices(8)
      : [],
  };
}
