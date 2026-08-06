import { getDb } from "@/lib/db/client";
import { countPendingTriageDocuments } from "@/lib/documents/triage";
import { paymentMethodLabel } from "@/lib/finance/payment-methods";
import {
  formatHockeyScoreLine,
  getHockeyGames,
  getNextHockeyGame,
  getUpcomingHockeyGames,
  type HockeyGame,
} from "@/lib/hockey/games";
import { daysFromNow, toSwissDate } from "@/lib/utils/dates";

export type OverviewPeriod = "week" | "month" | "quarter" | "half" | "year";

export type AgendaKind =
  | "invoice"
  | "deadline"
  | "travel"
  | "warranty"
  | "triage"
  | "ledger"
  | "hockey";

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
  /** Hockey kickoff time (Europe/Zurich), e.g. "19:00" */
  time?: string | null;
  /** Hockey venue */
  location?: string | null;
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
  };
  agenda: AgendaItem[];
  upcoming14: AgendaItem[];
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

function toHockeyCard(game: HockeyGame): HockeyGameCard {
  return {
    uid: game.uid,
    date: game.date,
    time: game.time,
    title: game.summary,
    location: game.location,
    isHome: game.isHome,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    opponent: game.opponent,
    score: game.result ? formatHockeyScoreLine(game.result) : null,
    scorers: game.result?.scorers || [],
  };
}

function hockeyAgendaMeta(game: HockeyGame): {
  subtitle: string | null;
  badge: string;
  score: string | null;
  scorers: string[] | null;
} {
  const score = game.result ? formatHockeyScoreLine(game.result) : null;
  // Date lives in the day group header (left agenda) — not repeated here.
  const parts = [score, game.time, game.location].filter(Boolean);
  const scorers =
    game.result?.scorers && game.result.scorers.length > 0
      ? game.result.scorers
      : null;
  if (scorers) {
    parts.push(scorers.slice(0, 4).join(", "));
  }
  return {
    subtitle: parts.join(" · ") || null,
    badge: score || "Hockey",
    score,
    scorers,
  };
}

export async function getDashboardOverview(
  period: OverviewPeriod,
  anchorIso?: string | null
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
         AND COALESCE(d.bezahlt, 0) = 0`
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

  let hockeyGames: HockeyGame[] = [];
  let hockeyCalendarName = "HC Ambri-Piotta";
  try {
    const hockey = await getHockeyGames();
    hockeyGames = hockey.games;
    hockeyCalendarName = hockey.calendarName;
  } catch {
    hockeyGames = [];
  }

  for (const game of hockeyGames) {
    if (!inRange(game.date, start, end)) continue;
    const meta = hockeyAgendaMeta(game);
    agenda.push({
      id: `hk-${game.uid}`,
      kind: "hockey",
      date: game.date,
      title: game.isHome ? "Heim" : "Auswärts",
      subtitle: meta.subtitle,
      amount: null,
      currency: null,
      documentId: null,
      href: null,
      badge: meta.badge,
      score: meta.score,
      scorers: meta.scorers,
      time: game.time,
      location: game.location,
      logos: {
        left: game.homeTeam.logoUrl || null,
        right: game.awayTeam.logoUrl || null,
        leftLabel: game.homeTeam.label,
        rightLabel: game.awayTeam.label,
      },
    });
  }

  agenda.sort((a, b) => {
    const c = a.date.localeCompare(b.date);
    if (c !== 0) return c;
    return a.title.localeCompare(b.title, "de");
  });

  const upcomingEnd = daysFromNow(14);
  const upcoming14: AgendaItem[] = [];
  const upcomingDeadlines = db
    .prepare(
      `SELECT dl.id, dl.title, dl.deadline_date, dl.deadline_type,
              d.id as document_id, d.correspondent_name
       FROM deadlines dl
       JOIN paperless_documents d ON d.id = dl.document_id
       WHERE dl.status = 'open'
         AND dl.deadline_date IS NOT NULL
         AND dl.deadline_date >= ?
         AND dl.deadline_date <= ?
         AND (dl.snoozed_until IS NULL OR TRIM(dl.snoozed_until) = '' OR dl.snoozed_until < ?)
       ORDER BY dl.deadline_date ASC
       LIMIT 8`
    )
    .all(today, upcomingEnd, today) as Array<{
    id: number;
    title: string | null;
    deadline_date: string;
    deadline_type: string | null;
    document_id: number;
    correspondent_name: string | null;
  }>;

  for (const row of upcomingDeadlines) {
    upcoming14.push({
      id: `u-dl-${row.id}`,
      kind: "deadline",
      date: row.deadline_date.slice(0, 10),
      title: row.title || "Frist",
      subtitle: row.correspondent_name,
      amount: null,
      currency: null,
      documentId: row.document_id,
      href: null,
      badge: "Frist",
    });
  }

  for (const game of getUpcomingHockeyGames(hockeyGames, new Date(), 6)) {
    const meta = hockeyAgendaMeta(game);
    upcoming14.push({
      id: `u-hk-${game.uid}`,
      kind: "hockey",
      date: game.date,
      title: game.isHome ? "Heim" : "Auswärts",
      subtitle: meta.subtitle,
      amount: null,
      currency: null,
      documentId: null,
      href: null,
      badge: meta.badge,
      score: meta.score,
      scorers: meta.scorers,
      time: game.time,
      location: game.location,
      logos: {
        left: game.homeTeam.logoUrl || null,
        right: game.awayTeam.logoUrl || null,
        leftLabel: game.homeTeam.label,
        rightLabel: game.awayTeam.label,
      },
    });
  }
  upcoming14.sort((a, b) => a.date.localeCompare(b.date));

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

  const next = getNextHockeyGame(hockeyGames);
  const upcomingHockey = getUpcomingHockeyGames(hockeyGames, new Date(), 5).map(
    toHockeyCard
  );

  return {
    period,
    rangeStart: start,
    rangeEnd: end,
    rangeLabel: label,
    chips: {
      triagePending: countPendingTriageDocuments(),
      urgentDeadlines,
      openDueAmount,
      openDueCount,
    },
    agenda,
    upcoming14,
    kpi: { total: kpiTotal, byCategory },
    financeItems,
    hockey: {
      calendarName: hockeyCalendarName,
      nextGame: next ? toHockeyCard(next) : null,
      upcoming: upcomingHockey,
    },
  };
}
