import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { nowIso } from "@/lib/utils/dates";
import {
  createKnowledgeArea,
  isKnownKnowledgeArea,
  listKnowledgeAreaNames,
} from "@/lib/knowledge/areas";
import { updateDocumentsCategory } from "@/lib/documents/category-update";

const STORE_KEY = "knowledge_category_suggestions_v1";

export type CategorySuggestion = {
  id: string;
  proposedName: string;
  description: string;
  /** Existing area to remap into (if set, accept does not create a new area). */
  mapToExisting?: string | null;
  documentIds: number[];
  sampleTitles: string[];
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt?: string | null;
};

type Store = { suggestions: CategorySuggestion[] };

type ClusterRule = {
  proposedName: string;
  description: string;
  mapToExisting?: string;
  pattern: RegExp;
};

/** Keyword clusters for Sonstiges — keep list short and high-signal. */
const CLUSTER_RULES: ClusterRule[] = [
  {
    proposedName: "Kreditkarten",
    description: "Kreditkartenabrechnungen",
    mapToExisting: "Kreditkarten",
    pattern:
      /kreditkarte|kartenabrechnung|credit\s*card|visa|mastercard|amex/i,
  },
  {
    proposedName: "Computer",
    description: "Hardware, Software, Lizenzen",
    mapToExisting: "Computer",
    pattern:
      /software|lizenz|license|microsoft\s*365|adobe|laptop|notebook|macbook|github|jetbrains/i,
  },
  {
    proposedName: "Spenden",
    description: "Spendenbescheinigungen und Wohltätigkeit",
    pattern: /spende|donation|hilfsorganisation|rotes\s*kreuz|unicef|wwf/i,
  },
  {
    proposedName: "Mitgliedschaften",
    description: "Vereine, Clubs, Abos ohne klare IT-/Versicherungszuordnung",
    pattern:
      /mitgliedschaft|jahresbeitrag|vereinsbeitrag|membership|clubbeitrag/i,
  },
  {
    proposedName: "Energie",
    description: "Strom, Gas, Fernwärme (falls nicht unter Wohnen)",
    pattern: /stromrechnung|gasrechnung|fernwärme|energieversorg|ewz|ckw|axpo/i,
  },
  {
    proposedName: "Telekom",
    description: "Handy, Internet, Festnetz",
    pattern:
      /swisscom|sunrise|salt\b|upc|init7|mobilfunk|handyabo|internetabo/i,
  },
  {
    proposedName: "Rechtswesen",
    description: "Anwalt, Gericht, Betreibung",
    pattern: /anwalt|advokat|gericht|betreibung|mahnung\s*recht|notar/i,
  },
  {
    proposedName: "Haustiere",
    description: "Tierarzt, Futter, Versicherung Tier",
    pattern: /tierarzt|veterinär|hund|katze|haustier/i,
  },
];

function loadStore(): Store {
  const raw = getSetting(STORE_KEY);
  if (!raw) return { suggestions: [] };
  try {
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || !Array.isArray(parsed.suggestions)) return { suggestions: [] };
    return parsed;
  } catch {
    return { suggestions: [] };
  }
}

function saveStore(store: Store): void {
  setSetting(STORE_KEY, JSON.stringify(store));
}

export function listCategorySuggestions(filter?: {
  status?: CategorySuggestion["status"];
}): CategorySuggestion[] {
  const all = loadStore().suggestions;
  if (!filter?.status) return all;
  return all.filter((s) => s.status === filter.status);
}

function hay(row: {
  title: string | null;
  short_summary: string | null;
  content: string | null;
}): string {
  return [row.title, row.short_summary, (row.content || "").slice(0, 2500)]
    .filter(Boolean)
    .join("\n");
}

/**
 * Scan Sonstiges documents and refresh pending suggestions (keeps accepted/rejected history).
 */
export function analyzeSonstigesForCategorySuggestions(): {
  pending: number;
  scanned: number;
  created: number;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.document_id as id, d.title, s.short_summary, d.content
       FROM document_summaries s
       JOIN paperless_documents d ON d.id = s.document_id
       WHERE s.analysis_status = 'completed'
         AND s.category = 'Sonstiges'`
    )
    .all() as Array<{
    id: number;
    title: string | null;
    short_summary: string | null;
    content: string | null;
  }>;

  const existingNames = new Set(
    listKnowledgeAreaNames().map((n) => n.toLowerCase())
  );
  const store = loadStore();
  // Drop old pending; keep resolved history (cap 50)
  const history = store.suggestions
    .filter((s) => s.status !== "pending")
    .slice(-50);

  const created: CategorySuggestion[] = [];
  const ts = nowIso();

  for (const rule of CLUSTER_RULES) {
    const matched = rows.filter((r) => rule.pattern.test(hay(r)));
    if (matched.length < 2) continue; // need at least 2 docs to suggest a split

    const mapTo =
      rule.mapToExisting && isKnownKnowledgeArea(rule.mapToExisting)
        ? rule.mapToExisting
        : null;

    // Skip brand-new names that collide with existing (case-insensitive)
    if (!mapTo && existingNames.has(rule.proposedName.toLowerCase())) {
      continue;
    }

    // Skip if we already accepted/rejected the same proposed name recently
    const prior = history.find(
      (h) =>
        h.proposedName.toLowerCase() === rule.proposedName.toLowerCase() &&
        (h.status === "rejected" || h.status === "accepted")
    );
    if (prior?.status === "rejected") continue;

    created.push({
      id: randomUUID(),
      proposedName: rule.proposedName,
      description: rule.description,
      mapToExisting: mapTo,
      documentIds: matched.map((m) => m.id),
      sampleTitles: matched
        .map((m) => m.title || m.short_summary || `#${m.id}`)
        .filter(Boolean)
        .slice(0, 5) as string[],
      status: "pending",
      createdAt: ts,
      resolvedAt: null,
    });
  }

  saveStore({ suggestions: [...history, ...created] });
  return {
    pending: created.length,
    scanned: rows.length,
    created: created.length,
  };
}

export function resolveCategorySuggestion(input: {
  id: string;
  action: "accept" | "reject";
}): { ok: boolean; error?: string; moved?: number; areaName?: string } {
  const store = loadStore();
  const suggestion = store.suggestions.find((s) => s.id === input.id);
  if (!suggestion) return { ok: false, error: "Vorschlag nicht gefunden." };
  if (suggestion.status !== "pending") {
    return { ok: false, error: "Vorschlag wurde bereits bearbeitet." };
  }

  const ts = nowIso();

  if (input.action === "reject") {
    suggestion.status = "rejected";
    suggestion.resolvedAt = ts;
    saveStore(store);
    return { ok: true, moved: 0 };
  }

  let areaName = suggestion.mapToExisting || suggestion.proposedName;
  if (!suggestion.mapToExisting) {
    const created = createKnowledgeArea({
      name: suggestion.proposedName,
      description: suggestion.description,
    });
    if (!created.ok && !created.area) {
      return { ok: false, error: created.error || "Rubrik anlegen fehlgeschlagen." };
    }
    areaName = created.area?.name || suggestion.proposedName;
  }

  if (!isKnownKnowledgeArea(areaName)) {
    return { ok: false, error: "Zielrubrik ungültig." };
  }

  const result = updateDocumentsCategory({
    documentIds: suggestion.documentIds,
    category: areaName,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  suggestion.status = "accepted";
  suggestion.resolvedAt = ts;
  suggestion.mapToExisting = areaName;
  saveStore(store);

  return { ok: true, moved: result.updated, areaName };
}
