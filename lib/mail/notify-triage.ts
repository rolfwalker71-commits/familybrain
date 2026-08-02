/**
 * Send HTML triage-ready mails (no PDF attachments — avoids Paperless re-import).
 * AI icons are embedded inline via CID (not remote URLs).
 */

import fs from "node:fs";
import path from "node:path";
import { absoluteAppUrl } from "@/lib/app-url";
import {
  countPendingTriageDocuments,
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
import { isTriageMailPausedForMassAnalysis } from "@/lib/documents/triage-mass-pause";
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

const BUDDY_LOGO_CID = "buddy-logo";

/** Inline Buddy mark for triage mail header (CID). */
function buddyLogoAttachment(): MailAttachment | null {
  const candidates = [
    path.join(process.cwd(), "public", "buddy-logo.png"),
    path.join(process.cwd(), "buddy-logo.png"),
  ];
  for (const fsPath of candidates) {
    if (!fs.existsSync(fsPath)) continue;
    try {
      return {
        filename: "buddy-logo.png",
        content: fs.readFileSync(fsPath).toString("base64"),
        content_id: BUDDY_LOGO_CID,
      };
    } catch {
      /* try next */
    }
  }
  return null;
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

export { countPendingTriageDocuments };

/**
 * After analysis newly queued a doc for triage — send HTML mail if enabled.
 * Never attaches PDFs. AI icons are CID-inlined when present on disk.
 */
export async function notifyTriageReadyEmail(documentId: number): Promise<{
  ok: boolean;
  skipped?: string;
  error?: string;
}> {
  if (isTriageMailPausedForMassAnalysis()) {
    return { ok: false, skipped: "Triage-Mail pausiert (Massenanalyse)" };
  }
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
  const logoAtt = buddyLogoAttachment();
  const totalPending = countPendingTriageDocuments();
  const mail = buildTriageReadyMail({
    items: [itemToMailFields(item, iconAtt?.content_id || null)],
    inboxUrl: absoluteAppUrl("/dashboard"),
    brandLogoSrc: logoAtt ? `cid:${BUDDY_LOGO_CID}` : null,
    totalPending,
  });

  const attachments = [logoAtt, iconAtt].filter(
    (a): a is MailAttachment => a != null
  );

  return sendMail({
    to: recipients,
    from: getTriageMailFrom(),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: attachments.length ? attachments : undefined,
  });
}

/**
 * Fan-out triage-ready mails for document ids (e.g. after backfill).
 * Caps sends to avoid flooding after large catch-up runs.
 */
export async function notifyTriageReadyEmailsForDocuments(
  documentIds: number[],
  options?: { limit?: number }
): Promise<{ sent: number; skipped: number; errors: number }> {
  const limit = Math.min(Math.max(options?.limit ?? 15, 0), 50);
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  for (const id of documentIds.slice(0, limit)) {
    try {
      const result = await notifyTriageReadyEmail(id);
      if (result.ok) sent += 1;
      else if (result.error) errors += 1;
      else skipped += 1;
    } catch {
      errors += 1;
    }
  }
  return { sent, skipped, errors };
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
  const logoAtt = buddyLogoAttachment();
  if (logoAtt) attachments.push(logoAtt);
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
    brandLogoSrc: logoAtt ? `cid:${BUDDY_LOGO_CID}` : null,
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
