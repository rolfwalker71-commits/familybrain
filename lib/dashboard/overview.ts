import { getDb } from "@/lib/db/client";
import { countPendingTriageDocuments } from "@/lib/documents/triage";
import { daysFromNow } from "@/lib/utils/dates";

export type OverviewPeriod = "week" | "month" | "quarter" | "half" | "year";

export type AgendaKind =
  | "invoice"
  | "deadline"
  | "travel"
  | "warranty"
  | "triage";

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  date: string;
  title: string;
  subtitle: string | null;
  amount: number | null;
  currency: string | null;
  documentId: number | null;
  badge: string;
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

export function getDashboardOverview(
  period: OverviewPeriod,
  anchorIso?: string | null
): OverviewPayload {
  const anchor = anchorIso ? new Date(anchorIso) : new Date();
  const { start, end, label } = resolvePeriodRange(period, anchor);
  const today = isoDate(new Date());
  const db = getDb();

  const agenda: AgendaItem[] = [];

  // Open unpaid invoices (Paperless flags) with finance row dates
  const invoices = db
    .prepare(
      `SELECT d.id as document_id, d.title, d.correspondent_name,
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
    finance_id: number | null;
    amount: number | null;
    currency: string | null;
    vendor: string | null;
    invoice_date: string | null;
    due_date: string | null;
    category: string | null;
  }>;

  let openDueAmount = 0;
  for (const row of invoices) {
    const rawDate = (row.due_date || row.invoice_date || today).slice(0, 10);
    // In period, or overdue (before today) still open — show on range start day
    let useDate: string | null = null;
    if (inRange(rawDate, start, end)) {
      useDate = rawDate;
    } else if (rawDate < today && rawDate < start) {
      useDate = start;
    }
    if (!useDate) continue;
    if (row.amount != null) openDueAmount += Number(row.amount);
    agenda.push({
      id: `inv-${row.document_id}`,
      kind: "invoice",
      date: useDate,
      title: row.vendor || row.title || `Rechnung #${row.document_id}`,
      subtitle:
        [row.correspondent_name, row.category].filter(Boolean).join(" · ") ||
        null,
      amount: row.amount,
      currency: row.currency || "CHF",
      documentId: row.document_id,
      badge: "Rechnung",
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
      badge: "Garantie",
    });
  }

  const travels = db
    .prepare(
      `SELECT t.id, t.title, t.travel_type, t.provider, t.start_date, t.end_date,
              t.origin, t.destination, t.document_id, t.price, t.currency
       FROM travel_items t
       WHERE t.start_date IS NOT NULL
         AND t.start_date >= ?
         AND t.start_date <= ?`
    )
    .all(start, end) as Array<{
    id: number;
    title: string | null;
    travel_type: string | null;
    provider: string | null;
    start_date: string;
    end_date: string | null;
    origin: string | null;
    destination: string | null;
    document_id: number | null;
    price: number | null;
    currency: string | null;
  }>;

  for (const row of travels) {
    agenda.push({
      id: `tr-${row.id}`,
      kind: "travel",
      date: row.start_date.slice(0, 10),
      title: row.title || row.travel_type || "Reise",
      subtitle:
        [row.provider, row.origin && row.destination ? `${row.origin} → ${row.destination}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      amount: row.price,
      currency: row.currency || "CHF",
      documentId: row.document_id,
      badge: "Reise",
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
      badge: "Triage",
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
      badge: "Frist",
    });
  }

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

  return {
    period,
    rangeStart: start,
    rangeEnd: end,
    rangeLabel: label,
    chips: {
      triagePending: countPendingTriageDocuments(),
      urgentDeadlines,
      openDueAmount,
      openDueCount: invoices.length,
    },
    agenda,
    upcoming14,
    kpi: { total: kpiTotal, byCategory },
    financeItems,
  };
}
