import { getDb } from "@/lib/db/client";
import { documentAiIconPublicUrl } from "@/lib/paperless/document-icon";
import {
  listFamilyMembers,
  type FamilyMemberPublic,
} from "@/lib/family/queries";
import {
  parseRecipientMemberIds,
  resolveDocumentRecipients,
  type DocumentRecipientInfo,
} from "@/lib/family/recipients";
import { looksLikeLohnabrechnung } from "@/lib/extraction/tax";
import type { KnowledgeAreaName } from "@/lib/extraction/categories";
import { KNOWLEDGE_AREAS } from "@/lib/extraction/categories";

export type KnowledgeFilterMember = {
  id: number;
  display_name: string;
  avatar_url: string | null;
};

export type KnowledgeDocItem = {
  id: number;
  paperless_id: number;
  title: string | null;
  created_date: string | null;
  correspondent_name: string | null;
  document_type_name: string | null;
  year: number | null;
  short_summary: string | null;
  ai_icon_path: string | null;
  ai_icon_url: string | null;
  recipient_member_ids: string | null;
  recipient_status: string | null;
  recipients: DocumentRecipientInfo;
};

export type KnowledgeMemberGroup = {
  memberKey: string;
  memberId: number | null;
  label: string;
  avatarUrl: string | null;
  documents: KnowledgeDocItem[];
};

export type KnowledgeYearGroup = {
  year: number | null;
  label: string;
  memberGroups: KnowledgeMemberGroup[];
  /** Flat list for selection / export */
  documents: KnowledgeDocItem[];
};

function yearFromCreatedDate(createdDate: string | null | undefined): number | null {
  const m = /^(\d{4})/.exec((createdDate || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1990 && y <= 2100 ? y : null;
}

function isKnowledgeArea(name: string): name is KnowledgeAreaName {
  return KNOWLEDGE_AREAS.some((a) => a.name === name);
}

/** Move misclassified monthly payslips out of Steuern → Arbeit. */
export function demoteLohnabrechnungenFromSteuern(): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.id as summary_id, d.title, s.short_summary, s.detailed_summary
       FROM document_summaries s
       JOIN paperless_documents d ON d.id = s.document_id
       WHERE s.category = 'Steuern'
         AND s.analysis_status = 'completed'`
    )
    .all() as Array<{
    summary_id: number;
    title: string | null;
    short_summary: string | null;
    detailed_summary: string | null;
  }>;

  const update = db.prepare(
    `UPDATE document_summaries
     SET category = 'Arbeit', tax_year = NULL, updated_at = datetime('now')
     WHERE id = ?`
  );
  let n = 0;
  for (const row of rows) {
    const text = [row.title, row.short_summary, row.detailed_summary]
      .filter(Boolean)
      .join("\n");
    if (!looksLikeLohnabrechnung(text)) continue;
    update.run(row.summary_id);
    n += 1;
  }
  return n;
}

/**
 * Knowledge documents grouped by year, then family member.
 * Steuern uses tax_year; other areas use created_date year.
 */
export function listKnowledgeDocumentsGrouped(
  category: string
): {
  groups: KnowledgeYearGroup[];
  filterMembers: KnowledgeFilterMember[];
} {
  if (!isKnowledgeArea(category)) {
    return { groups: [], filterMembers: [] };
  }

  if (category === "Steuern") {
    demoteLohnabrechnungenFromSteuern();
  }

  const db = getDb();
  const members = listFamilyMembers({ activeOnly: true });
  const membersById = new Map(members.map((m) => [m.id, m]));

  const rows = db
    .prepare(
      `SELECT d.id, d.paperless_id, d.title, d.created_date, d.correspondent_name,
              d.document_type_name, d.ai_icon_path, d.recipient_member_ids,
              d.recipient_status, s.tax_year, s.short_summary, s.detailed_summary
       FROM document_summaries s
       JOIN paperless_documents d ON d.id = s.document_id
       WHERE s.analysis_status = 'completed'
         AND (
           s.category = ?
           OR (
             ? = 'Arbeit'
             AND instr(COALESCE(s.also_categories, ''), '"Arbeit"') > 0
           )
         )
         AND COALESCE(d.sync_status, 'synced') != 'missing'
       ORDER BY COALESCE(d.created_date, d.added_at, d.created_at) DESC`
    )
    .all(category, category) as Array<{
    id: number;
    paperless_id: number;
    title: string | null;
    created_date: string | null;
    correspondent_name: string | null;
    document_type_name: string | null;
    ai_icon_path: string | null;
    recipient_member_ids: string | null;
    recipient_status: string | null;
    tax_year: number | null;
    short_summary: string | null;
    detailed_summary: string | null;
  }>;

  const docs: KnowledgeDocItem[] = [];
  for (const row of rows) {
    if (category === "Steuern") {
      const text = [row.title, row.short_summary, row.detailed_summary]
        .filter(Boolean)
        .join("\n");
      if (looksLikeLohnabrechnung(text)) continue;
    }

    const year =
      category === "Steuern"
        ? row.tax_year ?? yearFromCreatedDate(row.created_date)
        : yearFromCreatedDate(row.created_date);

    const recipients = resolveDocumentRecipients({
      recipient_status: row.recipient_status,
      recipient_member_ids: row.recipient_member_ids,
      membersById,
    });

    docs.push({
      id: row.id,
      paperless_id: row.paperless_id,
      title: row.title,
      created_date: row.created_date,
      correspondent_name: row.correspondent_name,
      document_type_name: row.document_type_name,
      year,
      short_summary: row.short_summary,
      ai_icon_path: row.ai_icon_path,
      ai_icon_url: documentAiIconPublicUrl(row.ai_icon_path),
      recipient_member_ids: row.recipient_member_ids,
      recipient_status: row.recipient_status,
      recipients,
    });
  }

  const byYear = new Map<number | null, KnowledgeDocItem[]>();
  for (const doc of docs) {
    const list = byYear.get(doc.year) || [];
    list.push(doc);
    byYear.set(doc.year, list);
  }

  const years = [...byYear.keys()].sort((a, b) => {
    if (a == null) return 1;
    if (b == null) return -1;
    return b - a;
  });

  const groups: KnowledgeYearGroup[] = years.map((year) => {
    const yearDocs = byYear.get(year) || [];
    const memberBuckets = new Map<string, KnowledgeMemberGroup>();

    for (const doc of yearDocs) {
      const ids = parseRecipientMemberIds(doc.recipient_member_ids);
      let memberKey: string;
      let memberId: number | null = null;
      let label: string;
      let avatarUrl: string | null = null;

      if (ids.length === 1) {
        memberId = ids[0]!;
        memberKey = `m:${memberId}`;
        const m = membersById.get(memberId);
        label = m?.display_name || `Mitglied #${memberId}`;
        avatarUrl = m?.avatar_url || null;
      } else if (ids.length > 1) {
        memberKey = "multi";
        label = "Mehrere Empfänger";
      } else {
        memberKey = "none";
        label = "Ohne Zuordnung";
      }

      const bucket = memberBuckets.get(memberKey) || {
        memberKey,
        memberId,
        label,
        avatarUrl,
        documents: [],
      };
      bucket.documents.push(doc);
      memberBuckets.set(memberKey, bucket);
    }

    const memberGroups = [...memberBuckets.values()].sort((a, b) => {
      const rank = (g: KnowledgeMemberGroup) => {
        if (g.memberKey === "none") return 9000;
        if (g.memberKey === "multi") return 8000;
        return membersById.get(g.memberId!)?.sort_key ?? 100;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.label.localeCompare(b.label, "de");
    });

    return {
      year,
      label: year == null ? "Ohne Jahr" : String(year),
      memberGroups,
      documents: yearDocs,
    };
  });

  const filterMembers: KnowledgeFilterMember[] = members.map(
    (m: FamilyMemberPublic) => ({
      id: m.id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
    })
  );

  return { groups, filterMembers };
}
