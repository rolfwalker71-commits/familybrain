import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import {
  UNKNOWN_RECIPIENT_LABEL,
  familyMemberMatchNames,
  listFamilyMembers,
  type FamilyMemberPublic,
} from "@/lib/family/queries";
import type { DocumentAnalysis } from "@/lib/ai/schemas";

export type RecipientStatus = "matched" | "unknown";

export type DocumentRecipientInfo = {
  status: RecipientStatus | null;
  memberIds: number[];
  members: Array<{
    id: number;
    display_name: string;
    avatar_url: string | null;
  }>;
  label: string | null;
};

function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss");
}

/** Whole-word / phrase match against normalized haystack. */
export function textMentionsName(haystackNorm: string, name: string): boolean {
  const needle = normalizeText(name).trim();
  if (needle.length < 2) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escaped}([^\\p{L}\\p{N}_]|$)`,
    "u"
  );
  return pattern.test(haystackNorm);
}

function partyLooksLikeRecipient(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return /empf[aä]ng|adressat|kunde|versicherte|patient|nehmer|inhaber|buyer|recipient|addressee|insured|patient|account.?holder|kontoinhaber|zahler|rechnungsempf/.test(
    r
  );
}

export function buildRecipientHaystack(input: {
  title?: string | null;
  content?: string | null;
  contractParties?: Array<{ name?: string | null; role?: string | null }>;
}): string {
  const parts: string[] = [];
  if (input.title) parts.push(input.title);
  if (input.content) {
    // Cap OCR for speed; addresses are usually near the top / early pages.
    parts.push(input.content.slice(0, 60000));
  }
  for (const p of input.contractParties || []) {
    if (!p?.name) continue;
    if (partyLooksLikeRecipient(p.role) || !p.role) {
      parts.push(p.name);
      if (p.role) parts.push(`${p.role}: ${p.name}`);
    }
  }
  return normalizeText(parts.join("\n"));
}

export function detectRecipientMemberIds(
  haystackNorm: string,
  members?: FamilyMemberPublic[]
): number[] {
  const list = members ?? listFamilyMembers({ activeOnly: true });
  const matched = new Set<number>();
  for (const member of list) {
    const names = familyMemberMatchNames(member).sort(
      (a, b) => b.length - a.length
    );
    for (const name of names) {
      if (textMentionsName(haystackNorm, name)) {
        matched.add(member.id);
        break;
      }
    }
  }
  return [...matched].sort((a, b) => a - b);
}

export function parseRecipientMemberIds(
  raw: string | null | undefined
): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

export function setDocumentRecipients(
  documentId: number,
  memberIds: number[]
): { status: RecipientStatus; memberIds: number[] } {
  const db = getDb();
  const unique = [...new Set(memberIds)].sort((a, b) => a - b);
  const status: RecipientStatus = unique.length > 0 ? "matched" : "unknown";
  const ts = nowIso();
  db.prepare(
    `UPDATE paperless_documents
     SET recipient_member_ids = ?, recipient_status = ?, recipient_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(JSON.stringify(unique), status, ts, ts, documentId);
  return { status, memberIds: unique };
}

export function applyRecipientsAfterAnalysis(
  documentId: number,
  analysis: DocumentAnalysis
): { status: RecipientStatus; memberIds: number[] } {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT title, content FROM paperless_documents WHERE id = ?`
    )
    .get(documentId) as
    | { title: string | null; content: string | null }
    | undefined;
  if (!row) return { status: "unknown", memberIds: [] };

  const haystack = buildRecipientHaystack({
    title: row.title,
    content: row.content,
    contractParties: analysis.contract_parties || [],
  });
  const ids = detectRecipientMemberIds(haystack);
  return setDocumentRecipients(documentId, ids);
}

/** Detect recipients from stored OCR + summary parties (no AI). */
export function refreshDocumentRecipients(
  documentId: number
): { status: RecipientStatus; memberIds: number[] } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT d.title, d.content, s.contract_parties
       FROM paperless_documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id
       WHERE d.id = ?`
    )
    .get(documentId) as
    | {
        title: string | null;
        content: string | null;
        contract_parties: string | null;
      }
    | undefined;
  if (!row) return null;

  let parties: Array<{ name?: string | null; role?: string | null }> = [];
  if (row.contract_parties) {
    try {
      const parsed = JSON.parse(row.contract_parties) as unknown;
      if (Array.isArray(parsed)) {
        parties = parsed as Array<{
          name?: string | null;
          role?: string | null;
        }>;
      }
    } catch {
      /* ignore */
    }
  }
  const haystack = buildRecipientHaystack({
    title: row.title,
    content: row.content,
    contractParties: parties,
  });
  const ids = detectRecipientMemberIds(haystack);
  return setDocumentRecipients(documentId, ids);
}

/**
 * Fill recipients from existing OCR + summary parties (no AI re-analysis).
 * Processes docs where recipient_status IS NULL.
 */
export function backfillDocumentRecipients(limit = 80): number {
  const db = getDb();
  const members = listFamilyMembers({ activeOnly: true });
  if (members.length === 0) return 0;

  const rows = db
    .prepare(
      `SELECT d.id, d.title, d.content, s.contract_parties
       FROM paperless_documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id
       WHERE COALESCE(d.sync_status, 'synced') != 'missing'
         AND d.recipient_status IS NULL
       ORDER BY d.id DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    title: string | null;
    content: string | null;
    contract_parties: string | null;
  }>;

  let updated = 0;
  for (const row of rows) {
    let parties: Array<{ name?: string | null; role?: string | null }> = [];
    if (row.contract_parties) {
      try {
        const parsed = JSON.parse(row.contract_parties) as unknown;
        if (Array.isArray(parsed)) {
          parties = parsed as Array<{
            name?: string | null;
            role?: string | null;
          }>;
        }
      } catch {
        /* ignore */
      }
    }
    const haystack = buildRecipientHaystack({
      title: row.title,
      content: row.content,
      contractParties: parties,
    });
    const ids = detectRecipientMemberIds(haystack, members);
    setDocumentRecipients(row.id, ids);
    updated += 1;
  }
  return updated;
}

export function resolveDocumentRecipients(input: {
  recipient_status?: string | null;
  recipient_member_ids?: string | null;
  membersById?: Map<number, FamilyMemberPublic>;
}): DocumentRecipientInfo {
  const statusRaw = input.recipient_status;
  const status: RecipientStatus | null =
    statusRaw === "matched" || statusRaw === "unknown" ? statusRaw : null;
  const memberIds = parseRecipientMemberIds(input.recipient_member_ids);
  const map =
    input.membersById ??
    new Map(listFamilyMembers().map((m) => [m.id, m]));
  const members = memberIds
    .map((id) => map.get(id))
    .filter((m): m is FamilyMemberPublic => Boolean(m))
    .map((m) => ({
      id: m.id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
    }));

  let label: string | null = null;
  if (status === "unknown") label = UNKNOWN_RECIPIENT_LABEL;
  else if (status === "matched" && members.length > 0) {
    label = members.map((m) => m.display_name).join(", ");
  }

  return { status, memberIds, members, label };
}

export function recipientFilterSql(
  filter: string
): { clause: string; params: unknown[] } | null {
  if (!filter || filter === "all") return null;
  if (filter === "unknown") {
    return {
      clause: `d.recipient_status = 'unknown'`,
      params: [],
    };
  }
  const id = Number(filter);
  if (!Number.isInteger(id) || id <= 0) return null;
  // Match id inside JSON array [1,2,3]
  return {
    clause: `(
      d.recipient_status = 'matched'
      AND (
        d.recipient_member_ids = ?
        OR d.recipient_member_ids LIKE ?
        OR d.recipient_member_ids LIKE ?
        OR d.recipient_member_ids LIKE ?
      )
    )`,
    params: [
      `[${id}]`,
      `[${id},%`,
      `%,${id},%`,
      `%,${id}]`,
    ],
  };
}
