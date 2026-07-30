import { PDFDocument } from "pdf-lib";
import { getDb } from "@/lib/db/client";
import { getPaperlessSettings } from "@/lib/db/queries";
import { PaperlessClient } from "@/lib/paperless/client";

export type TaxExportResult = {
  bytes: Uint8Array;
  filename: string;
  exported: number;
  skipped: Array<{ id: number; title: string; reason: string }>;
};

type TaxExportDoc = {
  id: number;
  paperless_id: number;
  title: string | null;
  tax_year: number | null;
};

function buildFilename(docs: TaxExportDoc[]): string {
  const years = [
    ...new Set(
      docs
        .map((d) => d.tax_year)
        .filter((y): y is number => typeof y === "number")
    ),
  ].sort((a, b) => a - b);
  const yearPart =
    years.length === 0
      ? "ohne-jahr"
      : years.length === 1
        ? String(years[0])
        : `${years[0]}-${years[years.length - 1]}`;
  const stamp = new Date().toISOString().slice(0, 10);
  return `Steuerbelege-${yearPart}-${stamp}.pdf`;
}

/** Load selected Steuern docs and merge their Paperless PDFs into one file. */
export async function exportTaxDocumentsPdf(
  documentIds: number[]
): Promise<TaxExportResult> {
  const uniqueIds = [...new Set(documentIds)];
  if (uniqueIds.length === 0) {
    throw new Error("Keine Dokumente ausgewählt.");
  }
  if (uniqueIds.length > 80) {
    throw new Error("Maximal 80 Belege pro Export.");
  }

  const db = getDb();
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT d.id, d.paperless_id, d.title, s.tax_year
       FROM paperless_documents d
       JOIN document_summaries s ON s.document_id = d.id
       WHERE d.id IN (${placeholders})
         AND s.analysis_status = 'completed'
         AND s.category = 'Steuern'`
    )
    .all(...uniqueIds) as TaxExportDoc[];

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: TaxExportDoc[] = [];
  const skipped: TaxExportResult["skipped"] = [];

  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({
        id,
        title: `#${id}`,
        reason: "Kein analysierter Steuerbeleg",
      });
      continue;
    }
    ordered.push(row);
  }

  if (ordered.length === 0) {
    throw new Error("Keine gültigen Steuerbelege zum Export.");
  }

  const { baseUrl, apiToken, publicUrl } = getPaperlessSettings();
  if (!baseUrl || !apiToken) {
    throw new Error("Paperless ist nicht konfiguriert.");
  }

  const client = new PaperlessClient(baseUrl, apiToken, publicUrl);
  const merged = await PDFDocument.create();
  let exported = 0;

  for (const doc of ordered) {
    const label = doc.title?.trim() || `Dokument #${doc.id}`;
    try {
      const { buffer, contentType } = await client.downloadDocument(
        doc.paperless_id
      );
      if (!contentType.includes("pdf") && !contentType.includes("octet")) {
        skipped.push({
          id: doc.id,
          title: label,
          reason: `Kein PDF (${contentType})`,
        });
        continue;
      }
      const attached = await PDFDocument.load(buffer, {
        ignoreEncryption: true,
      });
      const pages = await merged.copyPages(
        attached,
        attached.getPageIndices()
      );
      for (const page of pages) merged.addPage(page);
      exported += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skipped.push({ id: doc.id, title: label, reason: msg });
    }
  }

  if (merged.getPageCount() === 0) {
    throw new Error(
      skipped.length > 0
        ? `Export fehlgeschlagen: ${skipped.map((s) => s.reason).join("; ")}`
        : "Keine PDF-Seiten zum Zusammenführen."
    );
  }

  const bytes = await merged.save();
  return {
    bytes,
    filename: buildFilename(ordered),
    exported,
    skipped,
  };
}
