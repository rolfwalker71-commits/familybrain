import { getDb } from "@/lib/db/client";
import { countPendingTriageDocuments } from "@/lib/documents/triage";
import { paymentMethodLabel } from "@/lib/finance/payment-methods";
import { SQL_DOC_NOT_BUSINESS } from "@/lib/documents/business";
import {
  getOverviewHockeyBundle,
  getTodayCalendarExcerpt,
  getUpcomingBirthdaysExcerpt,
} from "@/lib/calendar/agenda-feed";
import { getTodayMailExcerpt } from "@/lib/mail/gmail";
import type { MailListItem } from "@/lib/mail/gmail";
import {
  enrichAgendaWithWeather,
  fetchHomeWeather,
} from "@/lib/dashboard/agenda-weather";
import {
  buildAgendaAiIconKey,
  lookupAgendaAiIconUrl,
  shouldHaveAgendaAiIcon,
} from "@/lib/dashboard/agenda-ai-icon";
import { weatherConditionIcon } from "@/lib/trips/weather";
import { daysFromNow, toSwissDate } from "@/lib/utils/dates";
import type { IcsCalendarType } from "@/lib/calendar/ics-types";
import { getDriveMirrorStatus } from "@/lib/buddy/drive-mirror";
import type { DayBriefingPayload } from "@/lib/dashboard/day-briefing";
import { getSchedulerSettings } from "@/lib/jobs/queries";
import { getSchedulerRuntimeStatus } from "@/lib/jobs/scheduler";
import { getMariTicketsWatchState } from "@/lib/mari/sync-tickets-if-due";

function attachAgendaAiIconMeta<T extends AgendaItem>(items: T[]): T[] {
  return items.map((item) => {
    if (!shouldHaveAgendaAiIcon(item)) {
      return { ...item, aiIconKey: null, aiIconUrl: null };
    }
    const key = buildAgendaAiIconKey(item);
    const hit = lookupAgendaAiIconUrl(item);
    return {
      ...item,
      aiIconKey: key || null,
      aiIconUrl: hit?.url ?? null,
    };
  });
}

export type OverviewPeriod = "week" | "month" | "quarter" | "half" | "year";

export type AgendaKind =
  | "invoice"
  | "deadline"
  | "travel"
  | "warranty"
  | "triage"
  | "ledger"
  | "hockey"
  | "holiday"
  | "calendar";

export type AgendaWeatherChip = {
  icon: string;
  temperatureC: number;
  labelDe: string;
  placeLabel: string;
};

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  date: string;
  title: string;
  subtitle: string | null;
  amount: number | null;
  currency: string | null;
  documentId: number | null;
  /** Prefer over document link when set (e.g. FinanzBuddy ledger). */
  href: string | null;
  badge: string;
  /** Optional logos: for hockey, home (left) vs away (right). */
  logos?: {
    left: string | null;
    right: string | null;
    leftLabel?: string | null;
    rightLabel?: string | null;
  } | null;
  /** Hockey final score line e.g. "4:0" */
  score?: string | null;
  /** Hockey goal scorers (short names) */
  scorers?: string[] | null;
  /** Kickoff / start time (Europe/Zurich), e.g. "19:00" */
  time?: string | null;
  /** Venue / place for weather enrichment */
  location?: string | null;
  /** ICS/Google DESCRIPTION body when available */
  description?: string | null;
  /** End time HH:mm when known */
  endTime?: string | null;
  /** Google Meet / Zoom / Teams */
  meetUrl?: string | null;
  /** Resolved place coordinates */
  coords?: { lat: number; lon: number; label: string } | null;
  /** Driving minutes from home (Altdorf) */
  driveMinutes?: number | null;
  /** Road distance km from home when known */
  distanceKm?: number | null;
  /** e.g. "~12 Min Fahrt" / "in der Nähe" */
  driveLabel?: string | null;
  /** Google Maps directions / search URL */
  mapsUrl?: string | null;
  /** Forecast chip when location + date resolve */
  weather?: AgendaWeatherChip | null;
  /** Per-calendar accent (ICS feeds) */
  accentColor?: string | null;
  /** ICS semantic type when kind is calendar / hockey */
  calendarType?: IcsCalendarType | null;
  /** Source id for Kalender-Filter (ICS id, swiss-holidays, deadlines, …) */
  calendarId?: string | null;
  /** Display name of the source calendar (Google/MS/ICS) */
  calendarName?: string | null;
  /**
   * false = Referenzkalender (z. B. Partner-Dienstplan): anzeigen, aber nicht
   * für «nächster Termin» / Fokus / Konflikte.
   */
  planningRelevant?: boolean;
  /** Cache key for recurring-event AI illustration */
  aiIconKey?: string | null;
  /** Public URL when icon file already exists */
  aiIconUrl?: string | null;
};

export type HomeWeatherDay = {
  date: string;
  icon: string;
  weatherLabelDe: string;
  temperatureMaxC: number;
  temperatureMinC: number;
};

export type HomeWeatherCard = {
  placeLabel: string;
  temperatureC: number;
  temperatureMaxC: number | null;
  temperatureMinC: number | null;
  weatherCode: number;
  weatherLabelDe: string;
  icon: string;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  observedAt: string | null;
  /** 7-Tage-Übersicht (inkl. heute). Fehlt ggf. in älteren Caches. */
  week?: HomeWeatherDay[];
};

export type HockeyGameCard = {
  uid: string;
  date: string;
  time: string | null;
  title: string;
  location: string | null;
  isHome: boolean;
  homeTeam: { key: string; label: string; logoUrl: string };
  awayTeam: { key: string; label: string; logoUrl: string };
  opponent: { key: string; label: string; logoUrl: string };
  score: string | null;
  scorers: string[];
};

export type KpiCategorySlice = {
  category: string;
  total: number;
  count: number;
};

export type FinanceEditableItem = {
  id: number;
  documentId: number | null;
  vendor: string | null;
  description: string | null;
  category: string | null;
  amount: number | null;
  currency: string | null;
  invoiceDate: string | null;
  countsInStats: boolean;
  documentTitle: string | null;
};

export type OverviewPayload = {
  period: OverviewPeriod;
  rangeStart: string;
  rangeEnd: string;
  rangeLabel: string;
  chips: {
    triagePending: number;
    urgentDeadlines: number;
    openDueAmount: number;
    openDueCount: number;
    /** Open mail AI suggestions awaiting triage (Google + O365) */
    mailSuggestionsPending: number;
    /** Mails AI-processed today (analyzed / triage / applied / dismissed) */
    mailAnalyzedToday: number;
    mailByProvider: {
      google: {
        analyzedToday: number;
        pendingTriage: number;
        lastAnalyzedAt: string | null;
      };
      microsoft: {
        analyzedToday: number;
        pendingTriage: number;
        lastAnalyzedAt: string | null;
      };
    };
  };
  agenda: AgendaItem[];
  /** Heute (+ optional nächste 24h), max 5 — Link zu /calendar */
  todayCalendar: AgendaItem[];
  /** Heute-Mails (Gmail), max 5 — Link zu /google */
  todayMail: MailListItem[];
  /** Heute-Mails (Outlook), max 5 — Link zu /microsoft */
  todayMailMicrosoft: MailListItem[];
  kpi: {
    total: number;
    byCategory: KpiCategorySlice[];
  };
  financeItems: FinanceEditableItem[];
  hockey: {
    calendarName: string;
    nextGame: HockeyGameCard | null;
    upcoming: HockeyGameCard[];
  };
  /** Current weather at home (Altdorf UR). */
  homeWeather: HomeWeatherCard | null;
  /** Google Tasks + Outlook To Do + Planner (offen, Horizont ~7 Tage). */
  tasks: {
    googleConnected: boolean;
    microsoftConnected: boolean;
    hasGoogleScope: boolean;
    hasMicrosoftScope: boolean;
    /** @deprecated use hasGoogleScope || hasMicrosoftScope */
    hasScope: boolean;
    items: Array<{
      key: string;
      id: string;
      source: "google" | "todo" | "planner";
      title: string;
      dueDate: string | null;
      overdue: boolean;
      subtitle: string;
      accountLabel: string;
      bucketLabel: string | null;
      href: string;
      listId: string | null;
      etag: string | null;
      planId?: string | null;
      bucketId?: string | null;
      /** legacy */
      listTitle?: string;
    }>;
  };
  /** Recent reference notes (tracking etc. from mail). */
  referenceNotes: Array<{
    id: number;
    title: string;
    reference: string | null;
    createdAt: string;
  }>;
  /** Upcoming birthdays (today … +7 days), for aside — not in Fokus/Ablauf. */
  upcomingBirthdays: AgendaItem[];
  /** Google Drive mirror progress (Paperless → BUDDY/…). */
  driveMirror: {
    enabled: boolean;
    hasDriveScope: boolean;
    connected: boolean;
    mirrored: number;
    pending: number;
    totalDocuments: number;
    percent: number;
    complete: boolean;
    lastRunAt: string | null;
    lastError: string | null;
  } | null;
  /** In-process scheduler teaser for dashboard Zustand card. */
  scheduler: {
    enabled: boolean;
    intervalMinutes: number;
    nextTickAt: string | null;
  } | null;
  /** Maringo «Tickets von mir» — Status-Zähler + Änderungen vom Poll. */
  mariTickets: {
    configured: boolean;
    employeeNumber: string | null;
    lastPollAt: string | null;
    countsByStatus: Array<{
      statusId: number;
      label: string;
      count: number;
    }>;
    total: number;
    recentChanges: Array<{
      at: string;
      issueId: number;
      title: string;
      detail: string;
    }>;
  } | null;
  /** Context pulse + optional AI prose (Morgen / Tag / Abend). */
  briefing: DayBriefingPayload | null;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function resolvePeriodRange(
  period: OverviewPeriod,
  anchor = new Date()
): { start: string; end: string; label: string } {
  const a = startOfDay(anchor);
  const y = a.getFullYear();
  const m = a.getMonth();

  if (period === "week") {
    const day = (a.getDay() + 6) % 7; // Mon=0
    const start = new Date(a);
    start.setDate(a.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      start: isoDate(start),
      end: isoDate(end),
      label: `KW · ${isoDate(start).slice(8)}.–${isoDate(end).slice(8)}.${String(end.getMonth() + 1).padStart(2, "0")}.${end.getFullYear()}`,
    };
  }

  if (period === "month") {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    const label = start.toLocaleDateString("de-CH", {
      month: "long",
      year: "numeric",
    });
    return { start: isoDate(start), end: isoDate(end), label };
  }

  if (period === "quarter") {
    const q = Math.floor(m / 3);
    const start = new Date(y, q * 3, 1);
    const end = new Date(y, q * 3 + 3, 0);
    return {
      start: isoDate(start),
      end: isoDate(end),
      label: `Q${q + 1} ${y}`,
    };
  }

  if (period === "half") {
    const first = m < 6;
    const start = new Date(y, first ? 0 : 6, 1);
    const end = new Date(y, first ? 6 : 12, 0);
    return {
      start: isoDate(start),
      end: isoDate(end),
      label: first ? `1. Halbjahr ${y}` : `2. Halbjahr ${y}`,
    };
  }

  const start = new Date(y, 0, 1);
  const end = new Date(y, 11, 31);
  return { start: isoDate(start), end: isoDate(end), label: String(y) };
}

export function parseOverviewPeriod(
  raw: string | null | undefined
): OverviewPeriod {
  if (
    raw === "week" ||
    raw === "month" ||
    raw === "quarter" ||
    raw === "half" ||
    raw === "year"
  ) {
    return raw;
  }
  return "month";
}

function inRange(date: string | null | undefined, start: string, end: string) {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= start && d <= end;
}

export async function getDashboardOverview(
  period: OverviewPeriod,
  anchorIso?: string | null,
  calendarUserId: number | null = null
): Promise<OverviewPayload> {
  const anchor = anchorIso ? new Date(anchorIso) : new Date();
  const { start, end, label } = resolvePeriodRange(period, anchor);
  const today = isoDate(new Date());
  const db = getDb();

  const agenda: AgendaItem[] = [];

  // Open unpaid invoices (Paperless flags) with finance row dates
  const invoices = db
    .prepare(
      `SELECT d.id as document_id, d.title, d.correspondent_name,
              d.payment_planned_date, d.payment_method,
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
    finance_id: number | null;
    amount: number | null;
    currency: string | null;
    vendor: string | null;
    invoice_date: string | null;
    due_date: string | null;
    category: string | null;
  }>;

  let openDueAmount = 0;
  let openDueCount = 0;
  for (const row of invoices) {
    const planned =
      row.payment_planned_date && row.payment_planned_date.trim()
        ? row.payment_planned_date.slice(0, 10)
        : null;
    const inPipeline = Boolean(planned && planned >= today);
    if (!inPipeline) {
      openDueCount += 1;
      if (row.amount != null) openDueAmount += Number(row.amount);
    }
    const dueRaw = (row.due_date || row.invoice_date || today).slice(0, 10);
    // Pipeline → show on planned payment day; otherwise due/invoice date
    const rawDate = inPipeline ? planned! : dueRaw;
    let useDate: string | null = null;
    if (inRange(rawDate, start, end)) {
      useDate = rawDate;
    } else if (!inPipeline && rawDate < today && rawDate < start) {
      useDate = start;
    }
    if (!useDate) continue;
    const methodLabel = paymentMethodLabel(row.payment_method);
    agenda.push({
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
      href: null,
      badge: inPipeline ? "Zahlung" : "Rechnung",
    });
  }

  const deadlines = db
    .prepare(
      `SELECT dl.id, dl.title, dl.deadline_date, dl.deadline_type,
              d.id as document_id, d.correspondent_name
       FROM deadlines dl
       JOIN paperless_documents d ON d.id = dl.document_id
       WHERE dl.status = 'open'
         AND dl.deadline_date IS NOT NULL
         AND dl.deadline_date >= ?
         AND dl.deadline_date <= ?
         AND (dl.snoozed_until IS NULL OR TRIM(dl.snoozed_until) = '' OR dl.snoozed_until < ?)`
    )
    .all(start, end, today) as Array<{
    id: number;
    title: string | null;
    deadline_date: string;
    deadline_type: string | null;
    document_id: number;
    correspondent_name: string | null;
  }>;

  for (const row of deadlines) {
    agenda.push({
      id: `dl-${row.id}`,
      kind: "deadline",
      date: row.deadline_date.slice(0, 10),
      title: row.title || "Frist",
      subtitle: [row.correspondent_name, row.deadline_type].filter(Boolean).join(" · ") || null,
      amount: null,
      currency: null,
      documentId: row.document_id,
      href: null,
      badge: "Frist",
    });
  }

  const warranties = db
    .prepare(
      `SELECT w.id, w.product_name, w.vendor, w.warranty_until, w.document_id,
              d.title as document_title
       FROM devices_and_warranties w
       LEFT JOIN paperless_documents d ON d.id = w.document_id
       WHERE w.warranty_until IS NOT NULL
         AND w.warranty_until >= ?
         AND w.warranty_until <= ?`
    )
    .all(start, end) as Array<{
    id: number;
    product_name: string | null;
    vendor: string | null;
    warranty_until: string;
    document_id: number | null;
    document_title: string | null;
  }>;

  for (const row of warranties) {
    agenda.push({
      id: `w-${row.id}`,
      kind: "warranty",
      date: row.warranty_until.slice(0, 10),
      title: row.product_name || row.document_title || "Garantie",
      subtitle: row.vendor,
      amount: null,
      currency: null,
      documentId: row.document_id,
      href: null,
      badge: "Garantie",
    });
  }

  const tripEvents = db
    .prepare(
      `SELECT e.id, e.trip_id, e.event_type, e.title, e.start_date, e.start_time,
              e.provider, e.origin_place, e.destination_place,
              e.departure_airport, e.arrival_airport, e.place_name, e.location,
              e.flight_number, e.airline, e.document_id,
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
    trip_title: string;
  }>;

  for (const row of tripEvents) {
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
      [row.airline || row.provider, row.flight_number].filter(Boolean).join(" ") ||
      null;
    agenda.push({
      id: `te-${row.id}`,
      kind: "travel",
      date: row.start_date.slice(0, 10),
      title: row.title || row.event_type || "Reise",
      subtitle:
        [row.trip_title, carrier, route, row.start_time]
          .filter(Boolean)
          .join(" · ") || null,
      amount: null,
      currency: null,
      documentId: null,
      href: `/trips/${row.trip_id}`,
      badge: "Reise",
      time: row.start_time,
      location:
        row.place_name ||
        row.location ||
        row.destination_place ||
        row.arrival_airport ||
        null,
    });
  }

  const ledgerExpenses = db
    .prepare(
      `SELECT e.id, e.ledger_id, e.amount, e.currency, e.description,
              e.category_label, e.expense_date, e.amount_base,
              l.title as ledger_title, l.base_currency,
              m.display_name as payer_name
       FROM finance_expenses e
       JOIN finance_ledgers l ON l.id = e.ledger_id
       LEFT JOIN finance_ledger_members m ON m.id = e.paid_by_member_id
       WHERE e.expense_date IS NOT NULL
         AND e.expense_date >= ?
         AND e.expense_date <= ?
         AND COALESCE(e.direction, 'expense') = 'expense'
         AND (l.archived_at IS NULL OR TRIM(l.archived_at) = '')`
    )
    .all(start, end) as Array<{
    id: number;
    ledger_id: number;
    amount: number;
    currency: string;
    description: string | null;
    category_label: string | null;
    expense_date: string;
    amount_base: number | null;
    ledger_title: string;
    base_currency: string;
    payer_name: string | null;
  }>;

  for (const row of ledgerExpenses) {
    agenda.push({
      id: `fe-${row.id}`,
      kind: "ledger",
      date: row.expense_date.slice(0, 10),
      title: row.description?.trim() || row.category_label || "Ausgabe",
      subtitle:
        [row.ledger_title, row.payer_name ? `Bezahlt von ${row.payer_name}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      amount: row.amount_base ?? row.amount,
      currency: row.base_currency || row.currency || "CHF",
      documentId: null,
      href: `/finance-brain/${row.ledger_id}`,
      badge: "FinanzBuddy",
    });
  }

  // Triage pending → "offen" bucket at today
  const triageRows = db
    .prepare(
      `SELECT d.id, d.title, d.correspondent_name, d.triage_reasons
       FROM paperless_documents d
       WHERE d.triage_status = 'pending'
         AND COALESCE(d.sync_status, 'synced') != 'missing'
         AND ${SQL_DOC_NOT_BUSINESS}
       ORDER BY d.triage_at DESC
       LIMIT 40`
    )
    .all() as Array<{
    id: number;
    title: string | null;
    correspondent_name: string | null;
    triage_reasons: string | null;
  }>;

  for (const row of triageRows) {
    agenda.push({
      id: `tg-${row.id}`,
      kind: "triage",
      date: today,
      title: row.title || `Dokument #${row.id}`,
      subtitle: row.correspondent_name,
      amount: null,
      currency: null,
      documentId: row.id,
      href: null,
      badge: "Triage",
    });
  }

  // Kalender/Hockey/Feiertage: not in period agenda — see todayCalendar + /calendar

  agenda.sort((a, b) => {
    const c = a.date.localeCompare(b.date);
    if (c !== 0) return c;
    return a.title.localeCompare(b.title, "de");
  });

  const financeRows = db
    .prepare(
      `SELECT f.id, f.document_id, f.vendor, f.description, f.category, f.amount,
              f.currency, f.invoice_date, f.counts_in_stats, d.title as document_title
       FROM financial_items f
       LEFT JOIN paperless_documents d ON d.id = f.document_id
       WHERE f.invoice_date IS NOT NULL
         AND f.invoice_date >= ?
         AND f.invoice_date <= ?
       ORDER BY f.invoice_date DESC, f.id DESC`
    )
    .all(start, end) as Array<{
    id: number;
    document_id: number | null;
    vendor: string | null;
    description: string | null;
    category: string | null;
    amount: number | null;
    currency: string | null;
    invoice_date: string | null;
    counts_in_stats: number | null;
    document_title: string | null;
  }>;

  const financeItems: FinanceEditableItem[] = financeRows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    vendor: r.vendor,
    description: r.description,
    category: r.category,
    amount: r.amount,
    currency: r.currency,
    invoiceDate: r.invoice_date,
    countsInStats: r.counts_in_stats !== 0,
    documentTitle: r.document_title,
  }));

  const byCat = new Map<string, { total: number; count: number }>();
  let kpiTotal = 0;
  for (const item of financeItems) {
    if (!item.countsInStats || item.amount == null) continue;
    const cat = item.category?.trim() || "Sonstiges";
    const cur = byCat.get(cat) || { total: 0, count: 0 };
    cur.total += Number(item.amount);
    cur.count += 1;
    byCat.set(cat, cur);
    kpiTotal += Number(item.amount);
  }

  const byCategory: KpiCategorySlice[] = [...byCat.entries()]
    .map(([category, v]) => ({
      category,
      total: v.total,
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total);

  const urgentDeadlines = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM deadlines
         WHERE status = 'open'
           AND deadline_date IS NOT NULL
           AND deadline_date <= ?
           AND deadline_date >= date('now', '-14 days')
           AND (snoozed_until IS NULL OR TRIM(snoozed_until) = '' OR snoozed_until < date('now'))`
      )
      .get(daysFromNow(7)) as { c: number }
  ).c;

  const [agendaWithWeather, todayCalendar, upcomingBirthdays, todayMail, todayMailMicrosoft, hockey, homeWeatherRaw, tasksBundle, mailStats, referenceNotes] =
    await Promise.all([
      enrichAgendaWithWeather(agenda),
      getTodayCalendarExcerpt(calendarUserId, 12),
      getUpcomingBirthdaysExcerpt(calendarUserId, 7).catch(() => [] as AgendaItem[]),
      getTodayMailExcerpt(calendarUserId, 8),
      (async () => {
        try {
          const { getTodayMicrosoftMailExcerpt } = await import(
            "@/lib/microsoft/mail-inbox"
          );
          return await getTodayMicrosoftMailExcerpt(calendarUserId, 8);
        } catch {
          return [] as MailListItem[];
        }
      })(),
      getOverviewHockeyBundle(calendarUserId),
      fetchHomeWeather(),
      (async () => {
        if (calendarUserId == null) {
          const { loadHomeTasksBundle } = await import(
            "@/lib/dashboard/home-tasks"
          );
          return loadHomeTasksBundle(null);
        }
        const { loadHomeTasksBundle } = await import(
          "@/lib/dashboard/home-tasks"
        );
        return loadHomeTasksBundle(calendarUserId, { horizonDays: 45 });
      })(),
      (async () => {
        if (calendarUserId == null) {
          return {
            google: { analyzedToday: 0, pendingTriage: 0, lastAnalyzedAt: null },
            microsoft: { analyzedToday: 0, pendingTriage: 0, lastAnalyzedAt: null },
          };
        }
        try {
          const { countMailOverviewStatsByProvider } = await import(
            "@/lib/mail/mail-analysis-store"
          );
          const day = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Zurich",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date());
          return countMailOverviewStatsByProvider(calendarUserId, day);
        } catch {
          return {
            google: { analyzedToday: 0, pendingTriage: 0, lastAnalyzedAt: null },
            microsoft: { analyzedToday: 0, pendingTriage: 0, lastAnalyzedAt: null },
          };
        }
      })(),
      (async () => {
        if (calendarUserId == null) return [] as const;
        try {
          const { listRecentReferenceNotes } = await import(
            "@/lib/mail/reference-notes"
          );
          return listRecentReferenceNotes(calendarUserId, 6).map((n) => ({
            id: n.id,
            title: n.title,
            reference: n.reference,
            createdAt: n.createdAt,
          }));
        } catch {
          return [] as const;
        }
      })(),
    ]);

  const homeWeather: HomeWeatherCard | null = homeWeatherRaw
    ? {
        placeLabel: homeWeatherRaw.placeLabel,
        temperatureC: Math.round(homeWeatherRaw.current.temperatureC),
        temperatureMaxC:
          homeWeatherRaw.today != null
            ? Math.round(homeWeatherRaw.today.temperatureMaxC)
            : null,
        temperatureMinC:
          homeWeatherRaw.today != null
            ? Math.round(homeWeatherRaw.today.temperatureMinC)
            : null,
        weatherCode: homeWeatherRaw.current.weatherCode,
        weatherLabelDe: homeWeatherRaw.current.weatherLabelDe,
        icon: weatherConditionIcon(homeWeatherRaw.current.weatherCode),
        windSpeedKmh:
          homeWeatherRaw.current.windSpeedKmh != null
            ? Math.round(homeWeatherRaw.current.windSpeedKmh)
            : null,
        windDirectionDeg: homeWeatherRaw.current.windDirectionDeg,
        humidityPct:
          homeWeatherRaw.current.humidityPct != null
            ? Math.round(homeWeatherRaw.current.humidityPct)
            : null,
        precipitationMm: homeWeatherRaw.current.precipitationMm,
        observedAt: homeWeatherRaw.current.observedAt,
        week: (homeWeatherRaw.week || []).map((d) => ({
          date: d.date,
          icon: weatherConditionIcon(d.weatherCode),
          weatherLabelDe: d.weatherLabelDe,
          temperatureMaxC: Math.round(d.temperatureMaxC),
          temperatureMinC: Math.round(d.temperatureMinC),
        })),
      }
    : null;

  const resultShell: OverviewPayload = {
    period,
    rangeStart: start,
    rangeEnd: end,
    rangeLabel: label,
    chips: {
      triagePending: countPendingTriageDocuments(),
      urgentDeadlines,
      openDueAmount,
      openDueCount,
      mailSuggestionsPending:
        mailStats.google.pendingTriage + mailStats.microsoft.pendingTriage,
      mailAnalyzedToday:
        mailStats.google.analyzedToday + mailStats.microsoft.analyzedToday,
      mailByProvider: {
        google: mailStats.google,
        microsoft: mailStats.microsoft,
      },
    },
    agenda: attachAgendaAiIconMeta(agendaWithWeather),
    todayCalendar: attachAgendaAiIconMeta(
      await (async () => {
        const {
          resolveDayCloseRitualStatus,
          withDayCloseRitual,
        } = await import("@/lib/dashboard/day-close-ritual");
        const { zurichNowParts } = await import(
          "@/lib/dashboard/day-briefing"
        );
        const day = zurichNowParts().todayIso;
        const status = await resolveDayCloseRitualStatus(
          calendarUserId,
          day,
          todayCalendar
        );
        return withDayCloseRitual(todayCalendar, day, status);
      })()
    ),
    todayMail,
    todayMailMicrosoft,
    kpi: { total: kpiTotal, byCategory },
    financeItems,
    hockey: {
      calendarName: hockey.calendarName,
      nextGame: hockey.nextGame,
      upcoming: hockey.upcoming,
    },
    homeWeather,
    tasks: {
      googleConnected: tasksBundle.googleConnected,
      microsoftConnected: tasksBundle.microsoftConnected,
      hasGoogleScope: tasksBundle.hasGoogleScope,
      hasMicrosoftScope: tasksBundle.hasMicrosoftScope,
      hasScope: tasksBundle.hasGoogleScope || tasksBundle.hasMicrosoftScope,
      items: tasksBundle.items.map((t) => ({
        ...t,
        listTitle: t.subtitle,
      })),
    },
    referenceNotes: [...referenceNotes],
    upcomingBirthdays: attachAgendaAiIconMeta([...upcomingBirthdays]),
    driveMirror: (() => {
      try {
        const st = getDriveMirrorStatus();
        return {
          enabled: st.enabled,
          hasDriveScope: st.hasDriveScope,
          connected: st.connected,
          mirrored: st.mirrored,
          pending: st.pending,
          totalDocuments: st.totalDocuments,
          percent: st.percent,
          complete: st.complete,
          lastRunAt: st.lastRunAt,
          lastError: st.lastError,
        };
      } catch {
        return null;
      }
    })(),
    scheduler: (() => {
      try {
        const settings = getSchedulerSettings();
        const runtime = getSchedulerRuntimeStatus();
        return {
          enabled: settings.enabled,
          intervalMinutes: settings.intervalMinutes,
          nextTickAt: settings.enabled ? runtime.nextTickAt : null,
        };
      } catch {
        return null;
      }
    })(),
    mariTickets: (() => {
      try {
        const st = getMariTicketsWatchState();
        return {
          configured: st.configured,
          employeeNumber: st.employeeNumber,
          lastPollAt: st.lastPollAt,
          countsByStatus: st.countsByStatus,
          total: st.total,
          recentChanges: st.recentChanges.map((c) => ({
            at: c.at,
            issueId: c.issueId,
            title: c.title,
            detail: c.detail,
          })),
        };
      } catch {
        return null;
      }
    })(),
    briefing: null,
  };

  try {
    const {
      buildDayBriefingFacts,
      buildDayBriefingPayload,
      zurichNowParts,
    } = await import("@/lib/dashboard/day-briefing");
    const { countMailAppliedToday } = await import(
      "@/lib/mail/mail-applied-links"
    );
    const zurich = zurichNowParts();
    const drive = resultShell.driveMirror;
    const facts = buildDayBriefingFacts({
      todayIso: zurich.todayIso,
      hour: zurich.hour,
      nowHm: zurich.hm,
      todayCalendar: resultShell.todayCalendar,
      chips: resultShell.chips,
      driveMirror: drive
        ? { percent: drive.percent, pending: drive.pending }
        : null,
      upcomingBirthdays: resultShell.upcomingBirthdays,
      mailAppliedToday:
        calendarUserId != null
          ? countMailAppliedToday(calendarUserId, zurich.todayIso)
          : 0,
      tasksOverdue: (resultShell.tasks.items || []).filter((t) => t.overdue)
        .length,
    });
    resultShell.briefing = await buildDayBriefingPayload(facts, {
      withAi: true,
      aiTimeoutMs: 2200,
    });
  } catch {
    resultShell.briefing = null;
  }

  return resultShell;
}
