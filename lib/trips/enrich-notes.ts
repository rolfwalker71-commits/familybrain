import { getDb } from "@/lib/db/client";
import {
  formatDatesInText,
  nowIso,
  toSwissDate,
  toSwissTime,
} from "@/lib/utils/dates";
import {
  getTripEventById,
  listLinkedDocumentIdsForEvents,
  listTripEvents,
  updateTripEvent,
  type TripEventRow,
} from "@/lib/trips/queries";
import { itineraryFromExtractedData } from "@/lib/extraction/itinerary";

function norm(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(
  raw: string | null | undefined
): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function overlapsKnown(event: TripEventRow, value: string | null): boolean {
  if (!value) return true;
  const n = norm(value);
  if (!n) return true;
  const known = [
    event.title,
    event.location,
    event.place_name,
    event.address,
    event.provider,
    event.booking_reference,
    event.flight_number,
    event.airline,
    event.departure_airport,
    event.arrival_airport,
    event.origin_place,
    event.destination_place,
    event.aircraft_type,
    event.aircraft_reg,
    event.phone,
    event.website,
    event.start_date,
    event.end_date,
    event.start_time,
    event.end_time,
    event.departure_terminal,
    event.arrival_terminal,
    event.departure_gate,
    event.arrival_gate,
    event.check_in_desk,
    event.baggage_belt,
  ]
    .filter(Boolean)
    .map((x) => norm(String(x)));

  if (known.some((k) => k === n || k.includes(n) || n.includes(k))) {
    return true;
  }
  // Combined route strings
  const routes = [
    `${event.departure_airport || ""} → ${event.arrival_airport || ""}`,
    `${event.origin_place || ""} → ${event.destination_place || ""}`,
  ].map((r) => norm(r));
  return routes.some((r) => r && (r === n || n.includes(r) || r.includes(n)));
}

type LinkedDocBundle = {
  documentId: number;
  paperlessId: number;
  title: string | null;
  travelItems: Array<{
    travel_type: string | null;
    provider: string | null;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    origin: string | null;
    destination: string | null;
    booking_reference: string | null;
    extracted_data: string | null;
  }>;
  summary: {
    short_summary: string | null;
    detailed_summary: string | null;
    important_points: string | null;
    important_dates: string | null;
    amounts: string | null;
    cancellation_terms: string | null;
    possible_todos: string | null;
    category: string | null;
  } | null;
};

function loadLinkedDocBundles(event: TripEventRow): LinkedDocBundle[] {
  const linked =
    listLinkedDocumentIdsForEvents([event.id]).get(event.id) || [];
  const ids = new Set<number>(linked);
  if (event.document_id != null && event.document_id > 0) {
    ids.add(event.document_id);
  }
  if (ids.size === 0) return [];

  const db = getDb();
  const bundles: LinkedDocBundle[] = [];
  for (const documentId of ids) {
    const doc = db
      .prepare(
        `SELECT id, paperless_id, title FROM paperless_documents WHERE id = ?`
      )
      .get(documentId) as
      | { id: number; paperless_id: number; title: string | null }
      | undefined;
    if (!doc) continue;

    const travelItems = db
      .prepare(
        `SELECT travel_type, provider, title, start_date, end_date,
                origin, destination, booking_reference, extracted_data
         FROM travel_items WHERE document_id = ?`
      )
      .all(documentId) as LinkedDocBundle["travelItems"];

    const summary = db
      .prepare(
        `SELECT short_summary, detailed_summary, important_points, important_dates,
                amounts, cancellation_terms, possible_todos, category
         FROM document_summaries WHERE document_id = ?`
      )
      .get(documentId) as LinkedDocBundle["summary"];

    bundles.push({
      documentId: doc.id,
      paperlessId: doc.paperless_id,
      title: doc.title,
      travelItems,
      summary: summary ?? null,
    });
  }
  return bundles;
}

function mdEscapeCell(raw: string): string {
  return raw.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function section(title: string, body: string[]): string {
  if (body.length === 0) return "";
  return `### ${title}\n\n${body.join("\n")}\n`;
}

function buildDocMarkdown(
  event: TripEventRow,
  bundle: LinkedDocBundle
): string {
  const parts: string[] = [];
  const header = `## 📄 Aus Beleg: ${bundle.title || `#${bundle.documentId}`}`;
  parts.push(header);

  // Travel extracted
  for (const item of bundle.travelItems) {
    const extracted = parseJsonObject(item.extracted_data);
    const travelLines: string[] = [];

    const candidates: Array<[string, string | null]> = [
      ["Typ", item.travel_type || asString(extracted?.travel_type)],
      ["Titel", item.title || asString(extracted?.title)],
      ["Anbieter", item.provider || asString(extracted?.provider)],
      [
        "Buchung",
        item.booking_reference || asString(extracted?.booking_reference),
      ],
      ["Von", item.origin || asString(extracted?.origin)],
      ["Nach", item.destination || asString(extracted?.destination)],
      ["Adresse", asString(extracted?.address)],
      ["Flugnr.", asString(extracted?.flight_number)],
      [
        "Preis",
        extracted?.price != null
          ? `${extracted.price}${
              asString(extracted.currency)
                ? ` ${asString(extracted.currency)}`
                : ""
            }`
          : null,
      ],
    ];

    for (const [label, value] of candidates) {
      if (!value || overlapsKnown(event, value)) continue;
      travelLines.push(`- **${label}:** ${formatDatesInText(value)}`);
    }

    if (travelLines.length) {
      parts.push(section("🏨 Buchungsdetails", travelLines));
    }

    const itinerary = itineraryFromExtractedData(extracted);
    if (itinerary.length) {
      const rows = itinerary
        .map((s) => {
          const loc = s.location || "";
          if (overlapsKnown(event, loc) && !s.note && !s.arrive && !s.depart) {
            return null;
          }
          const when = s.date
            ? toSwissDate(s.date)
            : s.day_label
              ? formatDatesInText(s.day_label)
              : "—";
          return `| ${mdEscapeCell(when)} | ${mdEscapeCell(
            loc
          )} | ${mdEscapeCell(
            [
              s.arrive ? `An ${toSwissTime(s.arrive)}` : null,
              s.depart ? `Ab ${toSwissTime(s.depart)}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"
          )} | ${mdEscapeCell(
            s.note ? formatDatesInText(s.note) : "—"
          )} |`;
        })
        .filter((x): x is string => Boolean(x));
      if (rows.length) {
        parts.push(
          section("🗺️ Route / Stationen", [
            "| Datum | Ort | Zeiten | Hinweis |",
            "| --- | --- | --- | --- |",
            ...rows,
          ])
        );
      }
    }
  }

  const summary = bundle.summary;
  if (summary) {
    const short = asString(summary.short_summary);
    const detailed = asString(summary.detailed_summary);
    if (short && !overlapsKnown(event, short)) {
      parts.push(section("📝 Kurzfassung", [`*${formatDatesInText(short)}*`]));
    }
    if (
      detailed &&
      detailed !== short &&
      !overlapsKnown(event, detailed.slice(0, 80))
    ) {
      parts.push(section("📋 Zusammenfassung", [formatDatesInText(detailed)]));
    }

    const points = parseJsonArray<string>(summary.important_points)
      .map((p) => asString(p))
      .filter((p): p is string => Boolean(p) && !overlapsKnown(event, p));
    if (points.length) {
      parts.push(
        section(
          "⭐ Wichtige Punkte",
          points.map((p) => `- ${formatDatesInText(p)}`)
        )
      );
    }

    const dates = parseJsonArray<{
      date?: string | null;
      label?: string | null;
      description?: string | null;
    }>(summary.important_dates);
    const dateRows = dates
      .map((d) => {
        const label = asString(d.label) || asString(d.description) || "Datum";
        const date = asString(d.date);
        if (!date && !asString(d.description)) return null;
        if (date && overlapsKnown(event, date) && overlapsKnown(event, label)) {
          return null;
        }
        const dateLabel = date ? toSwissDate(date) : "—";
        const desc = asString(d.description);
        return `| ${mdEscapeCell(dateLabel)} | ${mdEscapeCell(
          formatDatesInText(label)
        )} | ${mdEscapeCell(desc ? formatDatesInText(desc) : "—")} |`;
      })
      .filter((x): x is string => Boolean(x));
    if (dateRows.length) {
      parts.push(
        section("📅 Wichtige Daten", [
          "| Datum | Label | Beschreibung |",
          "| --- | --- | --- |",
          ...dateRows,
        ])
      );
    }

    const amounts = parseJsonArray<{
      amount?: number | null;
      currency?: string | null;
      label?: string | null;
    }>(summary.amounts);
    const amountRows = amounts
      .map((a) => {
        if (a.amount == null) return null;
        const label = asString(a.label) || "Betrag";
        const cur = asString(a.currency) || "";
        const cell = `${a.amount}${cur ? ` ${cur}` : ""}`;
        if (overlapsKnown(event, cell)) return null;
        return `| ${mdEscapeCell(label)} | ${mdEscapeCell(cell)} |`;
      })
      .filter((x): x is string => Boolean(x));
    if (amountRows.length) {
      parts.push(
        section("💶 Beträge", [
          "| Bezeichnung | Betrag |",
          "| --- | --- |",
          ...amountRows,
        ])
      );
    }

    const cancel = parseJsonObject(summary.cancellation_terms);
    if (cancel?.has_cancellation_terms) {
      const lines: string[] = [];
      const notice = asString(cancel.notice_period);
      const latest = asString(cancel.latest_cancellation_date);
      if (notice && !overlapsKnown(event, notice)) {
        lines.push(`- **Frist:** ${formatDatesInText(notice)}`);
      }
      if (latest && !overlapsKnown(event, latest)) {
        lines.push(`- **Späteste Storno:** ${toSwissDate(latest)}`);
      }
      if (lines.length) parts.push(section("🚫 Storno", lines));
    }

    const todos = parseJsonArray<{
      title?: string | null;
      due_date?: string | null;
      priority?: string | null;
    }>(summary.possible_todos);
    const todoLines = todos
      .map((t) => {
        const title = asString(t.title);
        if (!title || overlapsKnown(event, title)) return null;
        const due = asString(t.due_date);
        const prio = asString(t.priority);
        return `- **${formatDatesInText(title)}**${
          due ? ` _(bis ${toSwissDate(due)})_` : ""
        }${prio ? ` · ${prio}` : ""}`;
      })
      .filter(Boolean);
    if (todoLines.length) {
      parts.push(section("✅ To-dos", todoLines as string[]));
    }
  }

  // Drop header-only docs
  const body = parts.slice(1).join("\n").trim();
  if (!body) return "";
  return `${parts[0]}\n\n${body}\n`;
}

export function buildDocumentNotesMarkdown(event: TripEventRow): string {
  const bundles = loadLinkedDocBundles(event);
  if (bundles.length === 0) return "";
  const blocks = bundles
    .map((b) => buildDocMarkdown(event, b))
    .filter(Boolean);
  return blocks.join("\n---\n\n").trim();
}

export function enrichEventDocumentNotes(eventId: number): TripEventRow {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  const md = buildDocumentNotesMarkdown(event);
  return updateTripEvent(eventId, {
    documentNotesMd: md || null,
    documentNotesEnrichedAt: nowIso(),
    showDocumentNotes:
      event.show_document_notes === 0 ? false : true,
  });
}

export function enrichTripDocumentNotes(tripId: number): {
  updated: number;
  empty: number;
  events: TripEventRow[];
} {
  const events = listTripEvents(tripId);
  let updated = 0;
  let empty = 0;
  const out: TripEventRow[] = [];
  for (const event of events) {
    const next = enrichEventDocumentNotes(event.id);
    out.push(next);
    if (next.document_notes_md?.trim()) updated += 1;
    else empty += 1;
  }
  return { updated, empty, events: out };
}
