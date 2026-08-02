/**
 * HTML-only mail when documents are ready for triage.
 * Never attach PDFs — Paperless would re-import and create duplicates.
 */

import {
  TRIAGE_REASON_LABELS,
  type TriageReason,
} from "@/lib/documents/triage-shared";
import { escapeHtml } from "@/lib/finance-brain/mail-templates";

const BRAND = {
  docs: "#3f6b52",
  docsSoft: "#d9e4d1",
  ink: "#14201c",
  muted: "#5b6b66",
  border: "#d7e0dc",
  page: "#eef2f0",
  card: "#ffffff",
  heroFrom: "#d9e4d1",
  heroTo: "#eef2f0",
} as const;

export type TriageReadyMailItem = {
  title: string;
  meta?: string | null;
  amountLabel?: string | null;
  reasons?: TriageReason[];
  /** Absolute https URL or cid:… for inline AI icon (optional). */
  iconSrc?: string | null;
};

export type TriageReadyMailInput = {
  items: TriageReadyMailItem[];
  /** Absolute URL to Buddy inbox / dashboard. */
  inboxUrl: string;
  /** Optional absolute URL or cid: for hero illustration. */
  heroImageSrc?: string | null;
  /** Absolute URL or cid: for header brand mark (Buddy logo). */
  brandLogoSrc?: string | null;
  totalPending?: number;
};

function formatAmount(amountLabel: string | null | undefined): string {
  return amountLabel?.trim() || "";
}

function reasonLine(reasons: TriageReason[] | undefined): string {
  if (!reasons?.length) return "";
  return reasons
    .map((r) => TRIAGE_REASON_LABELS[r] || r)
    .filter(Boolean)
    .join(" · ");
}

function itemRowHtml(item: TriageReadyMailItem): string {
  const title = escapeHtml(item.title.trim() || "Dokument");
  const amount = formatAmount(item.amountLabel);
  const reasons = reasonLine(item.reasons);
  const metaParts = [item.meta?.trim(), reasons].filter(Boolean);
  const meta = metaParts.map((p) => escapeHtml(p!)).join(" · ");
  const icon = item.iconSrc
    ? `<img src="${escapeHtml(item.iconSrc)}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid ${BRAND.border};" />`
    : `<div style="width:44px;height:44px;border-radius:10px;background:${BRAND.docsSoft};border:1px solid ${BRAND.border};"></div>`;

  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${BRAND.border};vertical-align:top;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="52" valign="top" style="padding-right:12px;">${icon}</td>
            <td valign="top">
              <div style="font-size:15px;font-weight:700;color:${BRAND.ink};line-height:1.3;">
                ${title}${amount ? ` <span style="font-weight:600;color:${BRAND.docs};">· ${escapeHtml(amount)}</span>` : ""}
              </div>
              ${
                meta
                  ? `<div style="margin-top:4px;font-size:12px;color:${BRAND.muted};line-height:1.4;">${meta}</div>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/** Build subject + HTML + plain text. No attachments. */
export function buildTriageReadyMail(input: TriageReadyMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const count = input.totalPending ?? input.items.length;
  const noun = count === 1 ? "Dokument" : "Dokumente";
  const verb = count === 1 ? "wartet" : "warten";
  const subject = `Buddy: ${count} ${noun} ${verb} auf dich`;
  const headline = `${count} ${noun} ${verb} auf dich`;
  const preview =
    "Kurz prüfen und einordnen — dauert nur eine Minute.";

  const shown = input.items.slice(0, 8);
  const rows = shown.map(itemRowHtml).join("");
  const more =
    count > shown.length
      ? `<tr><td style="padding:12px 0 0;font-size:12px;color:${BRAND.muted};">… und ${count - shown.length} weitere in der Inbox</td></tr>`
      : "";

  const hero = input.heroImageSrc
    ? `<img src="${escapeHtml(input.heroImageSrc)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />`
    : `<div style="height:120px;background:linear-gradient(135deg,${BRAND.heroFrom} 0%,${BRAND.heroTo} 100%);"></div>`;

  const brandMark = input.brandLogoSrc
    ? `<img src="${escapeHtml(input.brandLogoSrc)}" width="56" height="56" alt="BuddyApp" style="display:block;width:56px;height:56px;border:0;border-radius:12px;object-fit:contain;" />`
    : `<div style="width:56px;height:56px;border-radius:12px;background:${BRAND.docs};"></div>`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};font-family:Georgia,'Times New Roman',serif;color:${BRAND.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.page};padding:28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.docsSoft};padding:18px 22px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:14px;line-height:0;">${brandMark}</td>
                  <td valign="middle" style="font-family:system-ui,-apple-system,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.docs};line-height:1.1;">BuddyApp</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">${hero}</td>
          </tr>
          <tr>
            <td style="padding:28px 22px 8px;font-family:system-ui,-apple-system,sans-serif;">
              <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:800;color:${BRAND.ink};">${escapeHtml(headline)}</h1>
              <p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(preview)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 22px 4px;font-family:system-ui,-apple-system,sans-serif;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${rows}
                ${more}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px;font-family:system-ui,-apple-system,sans-serif;" align="center">
              <a href="${escapeHtml(input.inboxUrl)}" style="display:inline-block;background:${BRAND.docs};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">Zur Inbox öffnen</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 22px 22px;font-family:system-ui,-apple-system,sans-serif;font-size:11px;line-height:1.5;color:${BRAND.muted};text-align:center;">
              Buddy · Haushaltsdokumente<br />
              Nur Hinweis — keine Belege im Anhang (vermeidet Doppelimporte in Paperless).
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    subject,
    preview,
    "",
    ...shown.map((item) => {
      const bits = [
        item.title.trim() || "Dokument",
        formatAmount(item.amountLabel) || null,
        item.meta?.trim() || null,
        reasonLine(item.reasons) || null,
      ].filter(Boolean);
      return `• ${bits.join(" · ")}`;
    }),
    count > shown.length ? `… und ${count - shown.length} weitere` : null,
    "",
    `Inbox: ${input.inboxUrl}`,
    "",
    "Kein PDF-Anhang — bitte in Buddy öffnen.",
  ].filter((line) => line != null);

  return { subject, html, text: textLines.join("\n") };
}
