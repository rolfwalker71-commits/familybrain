import { getDb } from "@/lib/db/client";
import type { DocumentAnalysis } from "@/lib/ai/schemas";
import { nowIso } from "@/lib/utils/dates";
import {
  parseItineraryFromOcr,
  type ItineraryStop,
} from "@/lib/extraction/itinerary";
import {
  normalizeDeadlineType,
  normalizeFinanceCategory,
  normalizeKnowledgeCategory,
  normalizeTravelType,
} from "@/lib/extraction/normalize-categories";

function warrantyStatus(warrantyUntil: string | null): string {
  if (!warrantyUntil) return "unknown";
  const today = new Date().toISOString().slice(0, 10);
  if (warrantyUntil < today) return "expired";
  const soon = new Date();
  soon.setDate(soon.getDate() + 90);
  if (warrantyUntil <= soon.toISOString().slice(0, 10)) return "expiring_soon";
  return "active";
}

function enrichTravelWithItinerary(
  analysis: DocumentAnalysis,
  ocrContent: string | null
): DocumentAnalysis {
  const ocrStops = parseItineraryFromOcr(ocrContent);
  const travelItems = [...(analysis.travel_items || [])];

  if (travelItems.length === 0 && ocrStops.length > 0) {
    const cruiseOcr = /kreuzfahrtverlauf|ports-of-call|cruise itinerary|of the seas/i.test(
      ocrContent || ""
    );
    travelItems.push({
      travel_type: cruiseOcr ? "Kreuzfahrt" : "Sonstiges",
      provider: null,
      title: null,
      start_date: ocrStops[0]?.date ?? null,
      end_date: ocrStops[ocrStops.length - 1]?.date ?? null,
      origin: ocrStops[0]?.location ?? null,
      destination: ocrStops[ocrStops.length - 1]?.location ?? null,
      booking_reference: null,
      price: null,
      currency: null,
      itinerary: ocrStops,
    });
  } else {
    for (let i = 0; i < travelItems.length; i++) {
      const existing = (travelItems[i].itinerary || []).map((s) => ({
        date: s.date ?? null,
        day_label: s.day_label ?? null,
        location: s.location,
        arrive: s.arrive ?? null,
        depart: s.depart ?? null,
        note: s.note ?? null,
      }));
      if (existing.length === 0 && ocrStops.length > 0) {
        travelItems[i] = { ...travelItems[i], itinerary: ocrStops };
      } else if (existing.length > 0) {
        travelItems[i] = { ...travelItems[i], itinerary: existing };
      }
    }
  }

  const importantDates = [...(analysis.important_dates || [])];
  const existingKeys = new Set(
    importantDates.map(
      (d) => `${d.date || ""}|${(d.label || "").toLowerCase()}`
    )
  );

  const stopsForDates: ItineraryStop[] = [];
  for (const t of travelItems) {
    for (const s of t.itinerary || []) {
      stopsForDates.push({
        date: s.date ?? null,
        day_label: s.day_label ?? null,
        location: s.location,
        arrive: s.arrive ?? null,
        depart: s.depart ?? null,
        note: s.note ?? null,
      });
    }
  }
  if (stopsForDates.length === 0) stopsForDates.push(...ocrStops);

  for (const stop of stopsForDates) {
    if (!stop.date) continue;
    const label = `Anlaufhafen: ${stop.location}`;
    const key = `${stop.date}|${label.toLowerCase()}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    const times = [stop.arrive && `Ankunft ${stop.arrive}`, stop.depart && `Abfahrt ${stop.depart}`]
      .filter(Boolean)
      .join(" · ");
    importantDates.push({
      date: stop.date,
      label,
      description: times || stop.note || stop.day_label || null,
    });
  }

  return {
    ...analysis,
    travel_items: travelItems,
    important_dates: importantDates,
  };
}

export function saveAnalysis(
  documentId: number,
  analysis: DocumentAnalysis,
  modelName: string
): void {
  const db = getDb();
  const ts = nowIso();
  const doc = db
    .prepare(`SELECT content FROM paperless_documents WHERE id = ?`)
    .get(documentId) as { content: string | null } | undefined;
  const enriched = enrichTravelWithItinerary(analysis, doc?.content ?? null);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO document_summaries (
        document_id, short_summary, detailed_summary, important_points, important_dates,
        amounts, deadlines, contract_parties, warranty_info, cancellation_terms,
        category, possible_todos, confidence, model_name, analysis_status, analyzed_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        short_summary = excluded.short_summary,
        detailed_summary = excluded.detailed_summary,
        important_points = excluded.important_points,
        important_dates = excluded.important_dates,
        amounts = excluded.amounts,
        deadlines = excluded.deadlines,
        contract_parties = excluded.contract_parties,
        warranty_info = excluded.warranty_info,
        cancellation_terms = excluded.cancellation_terms,
        category = excluded.category,
        possible_todos = excluded.possible_todos,
        confidence = excluded.confidence,
        model_name = excluded.model_name,
        analysis_status = 'completed',
        analyzed_at = excluded.analyzed_at,
        updated_at = excluded.updated_at`
    ).run(
      documentId,
      enriched.short_summary,
      enriched.detailed_summary,
      JSON.stringify(enriched.important_points),
      JSON.stringify(enriched.important_dates),
      JSON.stringify(enriched.amounts),
      JSON.stringify(enriched.deadlines),
      JSON.stringify(enriched.contract_parties),
      JSON.stringify(enriched.warranty_info),
      JSON.stringify(enriched.cancellation_terms),
      normalizeKnowledgeCategory(enriched.category),
      JSON.stringify(enriched.possible_todos),
      enriched.confidence,
      modelName,
      ts,
      ts,
      ts
    );

    db.prepare(`DELETE FROM devices_and_warranties WHERE document_id = ?`).run(documentId);
    db.prepare(`DELETE FROM deadlines WHERE document_id = ?`).run(documentId);

    const previousFinance = db
      .prepare(
        `SELECT vendor, amount, invoice_date, due_date, category, description, counts_in_stats
         FROM financial_items WHERE document_id = ?`
      )
      .all(documentId) as Array<{
      vendor: string | null;
      amount: number | null;
      invoice_date: string | null;
      due_date: string | null;
      category: string | null;
      description: string | null;
      counts_in_stats: number | null;
    }>;

    db.prepare(`DELETE FROM financial_items WHERE document_id = ?`).run(documentId);
    db.prepare(`DELETE FROM travel_items WHERE document_id = ?`).run(documentId);

    function resolveCountsInStats(input: {
      vendor?: string | null;
      amount?: number | null;
      invoice_date?: string | null;
      due_date?: string | null;
      category?: string | null;
      description?: string | null;
    }): number {
      const match = previousFinance.find(
        (p) =>
          (p.vendor || null) === (input.vendor || null) &&
          Number(p.amount ?? NaN) === Number(input.amount ?? NaN) &&
          (p.invoice_date || null) === (input.invoice_date || null) &&
          (p.due_date || null) === (input.due_date || null) &&
          (p.category || null) === (input.category || null)
      );
      if (match && match.counts_in_stats != null) {
        return match.counts_in_stats ? 1 : 0;
      }
      // Document-level fallback: if any previous item was excluded, keep excluded for same doc
      if (
        previousFinance.length > 0 &&
        previousFinance.every((p) => !p.counts_in_stats)
      ) {
        return 0;
      }
      return 1;
    }

    const wi = enriched.warranty_info;
    if (wi?.has_warranty && (wi.product_name || wi.vendor || wi.warranty_until)) {
      db.prepare(
        `INSERT INTO devices_and_warranties (
          document_id, product_name, manufacturer, vendor, purchase_date, price, currency,
          serial_number, warranty_months, warranty_until, status, confidence, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        documentId,
        wi.product_name,
        wi.manufacturer ?? null,
        wi.vendor,
        wi.purchase_date,
        wi.price ?? null,
        wi.currency ?? "CHF",
        wi.serial_number,
        wi.warranty_months ?? null,
        wi.warranty_until,
        warrantyStatus(wi.warranty_until),
        enriched.confidence,
        ts,
        ts
      );
    }

    const insertDeadline = db.prepare(
      `INSERT INTO deadlines (
        document_id, title, description, deadline_date, deadline_type, source_text,
        status, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
    );
    for (const d of enriched.deadlines) {
      insertDeadline.run(
        documentId,
        d.title,
        d.description,
        d.date,
        normalizeDeadlineType(d.type),
        d.description,
        enriched.confidence,
        ts,
        ts
      );
    }

    if (
      enriched.cancellation_terms?.has_cancellation_terms &&
      enriched.cancellation_terms.latest_cancellation_date
    ) {
      insertDeadline.run(
        documentId,
        "Kündigung",
        enriched.cancellation_terms.notice_period
          ? `Kündigungsfrist: ${enriched.cancellation_terms.notice_period}`
          : "Kündigung prüfen",
        enriched.cancellation_terms.latest_cancellation_date,
        "Kündigung",
        enriched.cancellation_terms.notice_period,
        enriched.confidence,
        ts,
        ts
      );
    }

    const insertFinance = db.prepare(
      `INSERT INTO financial_items (
        document_id, vendor, amount, currency, invoice_date, due_date, category,
        description, is_recurring, counts_in_stats, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const f of enriched.financial_items) {
      insertFinance.run(
        documentId,
        f.vendor,
        f.amount,
        f.currency ?? "CHF",
        f.invoice_date,
        f.due_date,
        normalizeFinanceCategory(f.category),
        f.description ?? null,
        f.is_recurring ? 1 : 0,
        resolveCountsInStats({
          vendor: f.vendor,
          amount: f.amount,
          invoice_date: f.invoice_date,
          due_date: f.due_date,
          category: f.category,
          description: f.description,
        }),
        enriched.confidence,
        ts,
        ts
      );
    }

    // Also promote amounts into financial_items when no structured items returned
    if (enriched.financial_items.length === 0) {
      for (const a of enriched.amounts) {
        if (a.amount == null) continue;
        insertFinance.run(
          documentId,
          null,
          a.amount,
          a.currency ?? "CHF",
          null,
          null,
          normalizeFinanceCategory(a.label),
          a.label,
          0,
          resolveCountsInStats({
            amount: a.amount,
            category: a.label,
            description: a.label,
          }),
          enriched.confidence,
          ts,
          ts
        );
      }
    }

    const insertTravel = db.prepare(
      `INSERT INTO travel_items (
        document_id, travel_type, provider, title, start_date, end_date, origin, destination,
        booking_reference, price, currency, extracted_data, confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const t of enriched.travel_items) {
      insertTravel.run(
        documentId,
        normalizeTravelType(t.travel_type, {
          title: t.title,
          provider: t.provider,
          origin: t.origin,
          destination: t.destination,
        }),
        t.provider,
        t.title,
        t.start_date,
        t.end_date,
        t.origin,
        t.destination,
        t.booking_reference,
        t.price,
        t.currency,
        JSON.stringify(t),
        enriched.confidence,
        ts,
        ts
      );
    }
  });

  tx();
}

export function markAnalysisError(documentId: number, message: string): void {
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO document_summaries (
      document_id, short_summary, analysis_status, created_at, updated_at
    ) VALUES (?, ?, 'error', ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET
      short_summary = excluded.short_summary,
      analysis_status = 'error',
      updated_at = excluded.updated_at`
  ).run(documentId, message, ts, ts);
}
