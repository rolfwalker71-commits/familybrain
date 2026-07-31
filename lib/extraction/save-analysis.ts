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
} from "@/lib/extraction/normalize-categories";
import {
  ensureGesamtbetragAmount,
  normalizeLineItems,
} from "@/lib/extraction/line-items";
import { resolveTravelType, findTravelTypeRule } from "@/lib/extraction/classification-rules";
import {
  displayImportantDateLabel,
  importantDateKey,
  itineraryStopLabel,
} from "@/lib/extraction/itinerary-labels";
import { updateDocumentEmbeddingStatus } from "@/lib/db/queries";
import {
  looksLikeLohnabrechnung,
  looksLikeLohnausweis,
  looksLikeSwissTaxDocument,
  resolveAlsoCategories,
  resolveTaxYear,
  serializeAlsoCategories,
} from "@/lib/extraction/tax";
import { enrichAnalysisIdentity } from "@/lib/extraction/enrich-identity";

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

  const importantDates = (analysis.important_dates || []).map((d) => ({
    ...d,
    label: displayImportantDateLabel(d.label) || d.label,
  }));
  const existingKeys = new Set(
    importantDates.map((d) => importantDateKey(d.date, d.label))
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
    const label = itineraryStopLabel(stop.location);
    const key = importantDateKey(stop.date, label);
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
  modelName: string,
  expectedContentHash?: string | null
): void {
  const db = getDb();
  const ts = nowIso();
  const docMeta = db
    .prepare(
      `SELECT title, content, created_date FROM paperless_documents WHERE id = ?`
    )
    .get(documentId) as
    | { title: string | null; content: string | null; created_date: string | null }
    | undefined;
  const enriched = enrichAnalysisIdentity(
    enrichTravelWithItinerary(analysis, docMeta?.content ?? null),
    { title: docMeta?.title, createdDate: docMeta?.created_date }
  );

  let category = normalizeKnowledgeCategory(enriched.category);
  const taxText = [
    docMeta?.title,
    enriched.suggested_title,
    enriched.short_summary,
    enriched.detailed_summary,
    (docMeta?.content || "").slice(0, 4000),
  ]
    .filter(Boolean)
    .join("\n");
  // Monthly payslips → Arbeit, never Steuern (Lohnausweis is the tax certificate).
  if (looksLikeLohnabrechnung(taxText)) {
    category = "Arbeit";
  } else if (
    category !== "Steuern" &&
    (looksLikeSwissTaxDocument(taxText) || looksLikeLohnausweis(taxText))
  ) {
    category = "Steuern";
  }

  const taxYear = resolveTaxYear({
    taxYear: enriched.tax_year ?? null,
    title: enriched.suggested_title || docMeta?.title,
    content: docMeta?.content,
    createdDate: docMeta?.created_date,
  });
  const alsoCategories = resolveAlsoCategories({
    analysis: enriched,
    title: enriched.suggested_title || docMeta?.title,
    content: docMeta?.content,
    category,
  });
  const alsoCategoriesJson = serializeAlsoCategories(alsoCategories);

  const tx = db.transaction(() => {
    if (expectedContentHash !== undefined) {
      const current = db
        .prepare(`SELECT content_hash FROM paperless_documents WHERE id = ?`)
        .get(documentId) as { content_hash: string | null } | undefined;
      if (!current || current.content_hash !== expectedContentHash) {
        throw new Error("CONTENT_HASH_MISMATCH");
      }
    }

    db.prepare(
      `INSERT INTO document_summaries (
        document_id, short_summary, detailed_summary, important_points, important_dates,
        amounts, line_items, deadlines, contract_parties, warranty_info, cancellation_terms,
        category, tax_year, also_categories, possible_todos, confidence, model_name,
        analysis_status, analyzed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        short_summary = excluded.short_summary,
        detailed_summary = excluded.detailed_summary,
        important_points = excluded.important_points,
        important_dates = excluded.important_dates,
        amounts = excluded.amounts,
        line_items = excluded.line_items,
        deadlines = excluded.deadlines,
        contract_parties = excluded.contract_parties,
        warranty_info = excluded.warranty_info,
        cancellation_terms = excluded.cancellation_terms,
        category = excluded.category,
        tax_year = excluded.tax_year,
        also_categories = excluded.also_categories,
        possible_todos = excluded.possible_todos,
        confidence = excluded.confidence,
        model_name = excluded.model_name,
        analysis_status = 'completed',
        analysis_attempts = 0,
        analysis_claimed_at = NULL,
        analysis_claim_hash = NULL,
        analysis_next_retry_at = NULL,
        analysis_last_error = NULL,
        analyzed_at = excluded.analyzed_at,
        updated_at = excluded.updated_at`
    ).run(
      documentId,
      enriched.short_summary,
      enriched.detailed_summary,
      JSON.stringify(enriched.important_points),
      JSON.stringify(enriched.important_dates),
      JSON.stringify(ensureGesamtbetragAmount(enriched)),
      JSON.stringify(normalizeLineItems(enriched.line_items)),
      JSON.stringify(enriched.deadlines),
      JSON.stringify(enriched.contract_parties),
      JSON.stringify(enriched.warranty_info),
      JSON.stringify(enriched.cancellation_terms),
      category,
      taxYear,
      alsoCategoriesJson,
      JSON.stringify(enriched.possible_todos),
      enriched.confidence,
      modelName,
      ts,
      ts,
      ts
    );

    db.prepare(
      `DELETE FROM devices_and_warranties
       WHERE document_id = ? AND COALESCE(manual_override, 0) = 0`
    ).run(documentId);
    db.prepare(
      `DELETE FROM deadlines
       WHERE document_id = ? AND COALESCE(manual_override, 0) = 0`
    ).run(documentId);

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

    db.prepare(
      `DELETE FROM financial_items
       WHERE document_id = ? AND COALESCE(manual_override, 0) = 0`
    ).run(documentId);

    const previousTravel = db
      .prepare(
        `SELECT travel_type, travel_type_override, provider, title, start_date, end_date,
                origin, destination, booking_reference
         FROM travel_items WHERE document_id = ?`
      )
      .all(documentId) as Array<{
      travel_type: string | null;
      travel_type_override: string | null;
      provider: string | null;
      title: string | null;
      start_date: string | null;
      end_date: string | null;
      origin: string | null;
      destination: string | null;
      booking_reference: string | null;
    }>;

    db.prepare(`DELETE FROM travel_items WHERE document_id = ?`).run(documentId);

    function resolveTravelOverride(input: {
      provider?: string | null;
      title?: string | null;
      start_date?: string | null;
      booking_reference?: string | null;
      origin?: string | null;
      destination?: string | null;
    }): string | null {
      const match = previousTravel.find(
        (p) =>
          (p.booking_reference || null) === (input.booking_reference || null) &&
          (p.provider || null) === (input.provider || null) &&
          (p.title || null) === (input.title || null) &&
          (p.start_date || null) === (input.start_date || null)
      );
      if (match?.travel_type_override) return match.travel_type_override;
      // Weaker rematch without booking ref
      const soft = previousTravel.find(
        (p) =>
          p.travel_type_override &&
          (p.provider || null) === (input.provider || null) &&
          (p.title || null) === (input.title || null)
      );
      return soft?.travel_type_override ?? null;
    }

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
    const hasManualWarranty = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM devices_and_warranties
           WHERE document_id = ? AND COALESCE(manual_override, 0) = 1`
        )
        .get(documentId) as { c: number }
    ).c;
    if (
      !hasManualWarranty &&
      wi?.has_warranty &&
      (wi.product_name || wi.vendor || wi.warranty_until)
    ) {
      db.prepare(
        `INSERT INTO devices_and_warranties (
          document_id, product_name, manufacturer, vendor, purchase_date, price, currency,
          serial_number, warranty_months, warranty_until, status, confidence,
          manual_override, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
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

    const manualDeadlineTitles = new Set(
      (
        db
          .prepare(
            `SELECT lower(title) as t FROM deadlines
             WHERE document_id = ? AND COALESCE(manual_override, 0) = 1`
          )
          .all(documentId) as Array<{ t: string }>
      ).map((r) => r.t)
    );

    const insertDeadline = db.prepare(
      `INSERT INTO deadlines (
        document_id, title, description, deadline_date, deadline_type, source_text,
        status, confidence, manual_override, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 0, ?, ?)`
    );
    for (const d of enriched.deadlines) {
      if (manualDeadlineTitles.has(String(d.title || "").toLowerCase())) {
        continue;
      }
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
      enriched.cancellation_terms.latest_cancellation_date &&
      !manualDeadlineTitles.has("kündigung")
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
        description, is_recurring, counts_in_stats, confidence, manual_override,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
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
        document_id, travel_type, travel_type_override, provider, title, start_date, end_date,
        origin, destination, booking_reference, price, currency, extracted_data, confidence,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const t of enriched.travel_items) {
      const ctx = {
        title: t.title,
        provider: t.provider,
        origin: t.origin,
        destination: t.destination,
      };
      const previousOverride = resolveTravelOverride({
        provider: t.provider,
        title: t.title,
        start_date: t.start_date,
        booking_reference: t.booking_reference,
        origin: t.origin,
        destination: t.destination,
      });
      const travelType = resolveTravelType(t.travel_type, {
        ...ctx,
        travel_type_override: previousOverride,
      });
      // Persist rule hits as override so read-time heuristics cannot undo them.
      const matched = previousOverride ? null : findTravelTypeRule(ctx);
      const storedOverride =
        previousOverride || (matched ? matched.target_value : null);

      insertTravel.run(
        documentId,
        travelType,
        storedOverride,
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

  try {
    updateDocumentEmbeddingStatus(documentId, {
      embeddingStatus: "pending",
      embeddingError: null,
    });
  } catch {
    /* optional — summary row may be missing in edge cases */
  }
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
