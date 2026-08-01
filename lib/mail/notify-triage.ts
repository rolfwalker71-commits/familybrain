/**
 * Send HTML triage-ready mails (no PDF attachments — avoids Paperless re-import).
 * AI icons are embedded inline via CID (not remote URLs).
 */

import fs from "node:fs";
import path from "node:path";
import { absoluteAppUrl } from "@/lib/app-url";
import {
  listPendingTriageDocuments,
  type TriageInboxItem,
} from "@/lib/documents/triage";
import { getDb } from "@/lib/db/client";
import { sendMail, type MailAttachment } from "@/lib/finance-brain/email";
import { formatMoney } from "@/lib/finance-brain/format";
import { isEmailConfigured } from "@/lib/finance-brain/mail-settings";
import { toSwissDate } from "@/lib/utils/dates";
import { buildTriageReadyMail } from "@/lib/mail/triage-ready-template";
import {
  getTriageMailFrom,
  getTriageMailRecipients,
  isTriageMailEnabled,
} from "@/lib/mail/triage-mail-settings";
import { resolveDocumentAiIconPath } from "@/lib/paperless/document-icon";

function amountLabel(item: {
  amount: number | null;
  currency: string | null;
}): string | null {
  if (item.amount == null || !Number.isFinite(item.amount)) return null;
  return formatMoney(item.amount, item.currency || "CHF");
}

function resolveAiIconFsPath(documentId: number): string | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT ai_icon_path FROM paperless_documents WHERE id = ?`)
    .get(documentId) as { ai_icon_path: string | null } | undefined;
  const stored = row?.ai_icon_path?.trim();
  if (!stored) return null;
  if (fs.existsSync(stored)) return stored;
  const byName = resolveDocumentAiIconPath(path.basename(stored));
  return byName && fs.existsSync(byName) ? byName : null;
}

function aiIconAttachment(documentId: number): MailAttachment | null {
  const fsPath = resolveAiIconFsPath(documentId);
  if (!fsPath) return null;
  try {
    const ext = path.extname(fsPath).toLowerCase() || ".jpg";
    return {
      filename: `doc-${documentId}-ai${ext}`,
      content: fs.readFileSync(fsPath).toString("base64"),
      content_id: `doc-ai-${documentId}`,
    };
  } catch {
    return null;
  }
}

function itemToMailFields(
  item: TriageInboxItem,
  iconCid: string | null
) {
  return {
    title: item.title?.trim() || item.vendor || `Dokument #${item.id}`,
    meta: [
      item.due_date ? `Fällig ${toSwissDate(item.due_date)}` : null,
      item.correspondent_name,
      item.category,
    ]
      .filter(Boolean)
      .join(" · ") || null,
    amountLabel: amountLabel(item),
    reasons: item.reasons,
    iconSrc: iconCid ? `cid:${iconCid}` : null,
  };
}

function loadTriageItem(documentId: number): TriageInboxItem | null {
  const pending = listPendingTriageDocuments(200);
  return pending.find((d) => d.id === documentId) || null;
}

/** Count pending triage docs (cheap). */
export function countPendingTriageDocuments(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM paperless_documents
       WHERE triage_status = 'pending'
         AND COALESCE(sync_status, 'synced') != 'missing'`
    )
    .get() as { n: number };
  return Number(row?.n) || 0;
}

/**
 * After analysis newly queued a doc for triage — send HTML mail if enabled.
 * Never attaches PDFs. AI icons are CID-inlined when present on disk.
 */
export async function notifyTriageReadyEmail(documentId: number): Promise<{
  ok: boolean;
  skipped?: string;
  error?: string;
}> {
  if (!isTriageMailEnabled()) {
    return { ok: false, skipped: "Triage-Mail deaktiviert" };
  }
  if (!isEmailConfigured()) {
    return { ok: false, skipped: "SMTP nicht konfiguriert" };
  }
  const recipients = getTriageMailRecipients();
  if (recipients.length === 0) {
    return { ok: false, skipped: "Keine Empfänger" };
  }

  const item = loadTriageItem(documentId);
  if (!item) {
    return { ok: false, skipped: "Dokument nicht in Triage-Inbox" };
  }

  const iconAtt = aiIconAttachment(documentId);
  const totalPending = countPendingTriageDocuments();
  const mail = buildTriageReadyMail({
    items: [itemToMailFields(item, iconAtt?.content_id || null)],
    inboxUrl: absoluteAppUrl("/dashboard"),
    totalPending,
  });

  return sendMail({
    to: recipients,
    from: getTriageMailFrom(),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: iconAtt ? [iconAtt] : undefined,
  });
}

/** Settings test: sample or live pending item, HTML only (+ CID icons when available). */
export async function sendTriageTestEmail(to: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!isEmailConfigured()) {
    return {
      ok: false,
      error: "SMTP ist nicht konfiguriert (Host, Benutzer, Passwort und Absender).",
    };
  }

  const pending = listPendingTriageDocuments(3);
  const attachments: MailAttachment[] = [];
  const items =
    pending.length > 0
      ? pending.map((item) => {
          const att = aiIconAttachment(item.id);
          if (att) attachments.push(att);
          return itemToMailFields(item, att?.content_id || null);
        })
      : [
          {
            title: "Beispiel: Swisscom Rechnung",
            meta: "Fällig bald · Test",
            amountLabel: "CHF 89.90",
            reasons: ["invoice" as const],
            iconSrc: null,
          },
          {
            title: "Beispiel: Zahnarzt",
            meta: "Hoher Betrag · Test",
            amountLabel: "CHF 240.00",
            reasons: ["high_amount" as const],
            iconSrc: null,
          },
        ];

  const mail = buildTriageReadyMail({
    items,
    inboxUrl: absoluteAppUrl("/dashboard"),
    totalPending: pending.length || items.length,
  });

  return sendMail({
    to,
    from: getTriageMailFrom(),
    subject: `[Test] ${mail.subject}`,
    text: mail.text,
    html: mail.html,
    attachments: attachments.length ? attachments : undefined,
  });
}
