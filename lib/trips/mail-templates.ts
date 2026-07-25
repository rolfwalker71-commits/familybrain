import {
  dateBadgeHtml,
  escapeHtml,
  expenseCardHtml,
} from "@/lib/finance-brain/mail-templates";
import { formatDateDe, formatMoney } from "@/lib/finance-brain/format";
import { isWeatherCommentBody } from "@/lib/trips/map-context";
import type { TravelDiaryModel } from "@/lib/trips/travel-diary";

/** Soft-UI sage palette (matches TravelBuddy / FinanzBuddy). */
const BRAND = {
  accent: "#3f6b52",
  accentSoft: "#d9e4d1",
  ink: "#14201c",
  muted: "#5b6b66",
  border: "#d7e0dc",
  page: "#eef2f0",
  card: "#ffffff",
} as const;

export type TripEventCommentMailInput = {
  tripTitle: string;
  eventTitle: string;
  eventType: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  provider: string | null;
  hasAiImage: boolean;
  aiCid?: string;
  authorName: string;
  commentBody: string;
  hasCommentImage: boolean;
  commentImageCid?: string;
};

function placeLine(input: {
  location: string | null;
  provider: string | null;
}): string | null {
  const parts = [input.location, input.provider]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

function timeLine(input: {
  startTime: string | null;
  endTime: string | null;
}): string | null {
  const start = input.startTime?.trim();
  const end = input.endTime?.trim();
  if (start && end) return `${start}–${end}`;
  return start || end || null;
}

function commentWhen(iso: string): string {
  const date = formatDateDe(iso.slice(0, 10));
  const timeMatch = iso.match(/T(\d{2}:\d{2})/);
  if (date && timeMatch) return `${date}, ${timeMatch[1]}`;
  return date || iso;
}

function eventHeaderHtml(input: {
  eventTitle: string;
  eventType: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  provider: string | null;
  notes?: string | null;
  hasAiImage: boolean;
  aiCid?: string;
  marginBottom?: boolean;
}): string {
  const aiCid = input.aiCid || "event-ai";
  const place = placeLine(input);
  const time = timeLine(input);
  const endIso =
    input.endDate &&
    input.startDate &&
    input.endDate.slice(0, 10) !== input.startDate.slice(0, 10)
      ? input.endDate
      : null;
  const mb = input.marginBottom === false ? "0" : "16px";
  return `
    <div style="background:${BRAND.card};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};margin-bottom:${mb};">
      <div style="padding:14px 16px;display:flex;gap:14px;align-items:flex-start;">
        ${dateBadgeHtml(input.startDate)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:17px;font-weight:800;line-height:1.25;color:${BRAND.ink};">${escapeHtml(input.eventTitle)}</div>
          <div style="margin-top:8px;font-size:13px;color:${BRAND.muted};">
            <span style="display:inline-block;background:${BRAND.accentSoft};color:${BRAND.accent};border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;text-transform:uppercase;margin-right:6px;">${escapeHtml(input.eventType)}</span>
            ${time ? escapeHtml(time) : ""}
          </div>
          ${
            endIso
              ? `<div style="margin-top:6px;font-size:13px;color:${BRAND.muted};">bis ${escapeHtml(endIso.slice(0, 10))}</div>`
              : ""
          }
          ${
            place
              ? `<div style="margin-top:6px;font-size:13px;color:${BRAND.muted};">${escapeHtml(place)}</div>`
              : ""
          }
          ${
            input.notes?.trim()
              ? `<div style="margin-top:6px;font-size:13px;color:${BRAND.muted};">Notiz: ${escapeHtml(input.notes.trim())}</div>`
              : ""
          }
        </div>
        ${
          input.hasAiImage
            ? `<img src="cid:${escapeHtml(aiCid)}" alt="" width="72" height="72" style="width:72px;height:72px;border-radius:8px;object-fit:cover;border:1px solid ${BRAND.border};flex-shrink:0;" />`
            : ""
        }
      </div>
    </div>`;
}

function commentBubbleHtml(input: {
  authorName: string;
  body: string;
  createdAt: string;
  hasImage: boolean;
  imageCid: string;
}): string {
  const bodyHtml = escapeHtml(input.body).replace(/\n/g, "<br/>");
  const weather = isWeatherCommentBody(input.body);
  const content =
    weather && input.hasImage
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;border-collapse:collapse;">
          <tr>
            <td valign="top" style="font-size:13px;line-height:1.4;color:${BRAND.ink};padding-right:12px;">${bodyHtml}</td>
            <td valign="top" width="148" style="width:148px;">
              <img src="cid:${escapeHtml(input.imageCid)}" alt="Standortkarte" width="140" height="140" style="width:140px;height:140px;border-radius:8px;object-fit:cover;border:1px solid ${BRAND.border};display:block;" />
            </td>
          </tr>
        </table>`
      : `<div style="margin-top:6px;font-size:14px;line-height:1.45;color:${BRAND.ink};white-space:pre-wrap;">${bodyHtml}</div>
        ${
          input.hasImage
            ? `<div style="margin-top:10px;"><img src="cid:${escapeHtml(input.imageCid)}" alt="Kommentar-Bild" style="max-width:100%;height:auto;border-radius:8px;border:1px solid ${BRAND.border};" /></div>`
            : ""
        }`;
  return `
    <div style="background:${BRAND.page};border-radius:10px;border:1px solid ${BRAND.border};padding:12px 14px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;">
        <div style="font-size:11px;font-weight:700;color:${BRAND.accent};letter-spacing:.03em;text-transform:uppercase;">${escapeHtml(input.authorName)}</div>
        <div style="font-size:11px;color:${BRAND.muted};white-space:nowrap;">${escapeHtml(commentWhen(input.createdAt))}</div>
      </div>
      ${content}
    </div>`;
}

export function buildTripEventCommentMailHtml(
  input: TripEventCommentMailInput
): { subject: string; html: string; text: string } {
  const subject = `TravelBuddy: Kommentar zu «${input.eventTitle}» · ${input.tripTitle}`;
  const header = eventHeaderHtml({
    ...input,
    aiCid: input.aiCid || "event-ai",
  });
  const commentCid = input.commentImageCid || "comment-image";
  const bodyHtml = escapeHtml(input.commentBody).replace(/\n/g, "<br/>");
  const weatherLayout =
    isWeatherCommentBody(input.commentBody) && input.hasCommentImage;
  const commentContent = weatherLayout
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
        <tr>
          <td valign="top" style="font-size:14px;line-height:1.45;color:${BRAND.ink};padding-right:14px;">${bodyHtml}</td>
          <td valign="top" width="168" style="width:168px;">
            <img src="cid:${escapeHtml(commentCid)}" alt="Standortkarte" width="160" height="160" style="width:160px;height:160px;border-radius:8px;object-fit:cover;border:1px solid ${BRAND.border};display:block;" />
          </td>
        </tr>
      </table>`
    : `<div style="margin-top:8px;font-size:15px;line-height:1.5;color:${BRAND.ink};white-space:pre-wrap;">${bodyHtml}</div>
        ${
          input.hasCommentImage
            ? `<div style="margin-top:12px;"><img src="cid:${escapeHtml(commentCid)}" alt="Kommentar-Bild" style="max-width:100%;height:auto;border-radius:8px;border:1px solid ${BRAND.border};" /></div>`
            : ""
        }`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:${BRAND.page};font-family:system-ui,-apple-system,sans-serif;color:${BRAND.ink};">
  <div style="max-width:640px;margin:0 auto;">
    <div style="padding:14px 18px;background:${BRAND.accentSoft};border:1px solid ${BRAND.border};border-radius:12px 12px 0 0;">
      <div style="font-size:12px;font-weight:700;color:${BRAND.accent};letter-spacing:.04em;text-transform:uppercase;">TravelBuddy · Neuer Kommentar</div>
      <div style="font-size:14px;color:${BRAND.accent};margin-top:2px;font-weight:600;">${escapeHtml(input.tripTitle)}</div>
    </div>
    <div style="border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 12px 12px;overflow:hidden;background:${BRAND.card};">
      <div style="padding:16px 16px 4px;">${header}</div>
      <div style="padding:4px 16px 16px;">
        <div style="background:${BRAND.page};border-radius:10px;border:1px solid ${BRAND.border};padding:14px 16px;">
          <div style="font-size:12px;font-weight:700;color:${BRAND.accent};letter-spacing:.03em;text-transform:uppercase;">${escapeHtml(input.authorName)}</div>
          ${commentContent}
        </div>
      </div>
    </div>
  </div>
</body></html>`;

  const place = placeLine(input);
  const time = timeLine(input);
  const text = [
    `TravelBuddy: Neuer Kommentar in «${input.tripTitle}»`,
    "",
    `Aktivität: ${input.eventTitle}`,
    `Typ: ${input.eventType}`,
    input.startDate ? `Datum: ${input.startDate.slice(0, 10)}` : null,
    time ? `Zeit: ${time}` : null,
    place ? `Ort: ${place}` : null,
    "",
    `${input.authorName}:`,
    input.commentBody,
    input.hasCommentImage ? "(mit Bild)" : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function buildTravelDiaryMailHtml(
  model: TravelDiaryModel
): { subject: string; html: string; text: string } {
  const eventCount = model.events.length;
  const commentCount = model.events.reduce(
    (n, e) => n + e.comments.length,
    0
  );
  const expenseCount =
    model.events.reduce((n, e) => n + e.expenses.length, 0) +
    model.orphanExpenses.length;
  const range = [
    formatDateDe(model.startDate) || null,
    formatDateDe(model.endDate) || null,
  ]
    .filter(Boolean)
    .join(" – ");

  const subject = `TravelBuddy: Reisetagebuch «${model.tripTitle}» · ${eventCount} Aktivitäten`;

  const eventBlocks = model.events
    .map((event) => {
      const header = eventHeaderHtml({
        eventTitle: event.title,
        eventType: event.eventType,
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        provider: event.provider,
        notes: event.notes,
        hasAiImage: event.hasAiImage,
        aiCid: event.aiCid,
        marginBottom: false,
      });
      const comments =
        event.comments.length > 0
          ? `<div style="margin-top:10px;">
              <div style="font-size:10px;font-weight:700;color:${BRAND.accent};letter-spacing:.03em;text-transform:uppercase;margin-bottom:6px;">Kommentare · ${event.comments.length}</div>
              ${event.comments
                .map((c) =>
                  commentBubbleHtml({
                    authorName: c.authorName,
                    body: c.body,
                    createdAt: c.createdAt,
                    hasImage: c.hasImage,
                    imageCid: c.imageCid,
                  })
                )
                .join("")}
            </div>`
          : "";
      const expenses =
        event.expenses.length > 0
          ? `<div style="margin-top:12px;padding:10px 10px 2px;background:${BRAND.page};border-radius:12px;border:1px dashed ${BRAND.border};">
              <div style="font-size:10px;font-weight:800;color:${BRAND.accent};letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;">Wallet · Ausgaben · ${event.expenses.length}</div>
              ${event.expenses.map((e) => expenseCardHtml({ ...e, variant: "diary" })).join("")}
            </div>`
          : "";
      return `
        <div style="margin-bottom:20px;">
          ${header}
          ${comments}
          ${expenses}
        </div>`;
    })
    .join("");

  const orphanBlock =
    model.orphanExpenses.length > 0
      ? `<div style="margin-top:8px;margin-bottom:16px;padding:10px 10px 2px;background:${BRAND.page};border-radius:12px;border:1px dashed ${BRAND.border};">
          <div style="font-size:11px;font-weight:800;color:${BRAND.accent};letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px;">Wallet · Weitere Ausgaben${model.ledgerTitle ? ` · ${escapeHtml(model.ledgerTitle)}` : ""}</div>
          ${model.orphanExpenses.map((e) => expenseCardHtml({ ...e, variant: "diary" })).join("")}
        </div>`
      : "";

  const metaBits = [
    range || null,
    model.destination?.trim() || null,
    `${eventCount} Aktivitäten`,
    commentCount ? `${commentCount} Kommentare` : null,
    expenseCount ? `${expenseCount} Ausgaben` : null,
  ].filter(Boolean);

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:${BRAND.page};font-family:system-ui,-apple-system,sans-serif;color:${BRAND.ink};">
  <div style="max-width:640px;margin:0 auto;">
    <div style="padding:14px 18px;background:${BRAND.accentSoft};border:1px solid ${BRAND.border};border-radius:12px 12px 0 0;">
      <div style="font-size:12px;font-weight:700;color:${BRAND.accent};letter-spacing:.04em;text-transform:uppercase;">TravelBuddy · Reisetagebuch</div>
      <div style="font-size:18px;color:${BRAND.ink};margin-top:4px;font-weight:800;">${escapeHtml(model.tripTitle)}</div>
      <div style="font-size:13px;color:${BRAND.muted};margin-top:4px;">${escapeHtml(metaBits.join(" · "))}</div>
    </div>
    <div style="border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 12px 12px;overflow:hidden;background:${BRAND.card};padding:16px;">
      ${eventBlocks || `<div style="color:${BRAND.muted};font-size:14px;">Noch keine Aktivitäten.</div>`}
      ${orphanBlock}
      <div style="padding-top:8px;font-size:12px;color:${BRAND.muted};border-top:1px solid ${BRAND.page};">
        PDF im Anhang — Aktivitäten, Kommentare und Ausgaben.
      </div>
    </div>
  </div>
</body></html>`;

  const textLines: string[] = [
    `TravelBuddy: Reisetagebuch «${model.tripTitle}»`,
    metaBits.join(" · "),
    "",
  ];
  for (const event of model.events) {
    textLines.push(`## ${event.title} (${event.eventType})`);
    if (event.startDate) {
      textLines.push(`Datum: ${event.startDate.slice(0, 10)}`);
    }
    const t = timeLine(event);
    if (t) textLines.push(`Zeit: ${t}`);
    const place = placeLine(event);
    if (place) textLines.push(`Ort: ${place}`);
    if (event.notes?.trim()) textLines.push(`Notiz: ${event.notes.trim()}`);
    for (const c of event.comments) {
      textLines.push(`- ${c.authorName}: ${c.body}`);
    }
    for (const e of event.expenses) {
      const money = formatMoney(e.amountBase, e.baseCurrency);
      textLines.push(
        `* ${e.description || "Ausgabe"} · ${e.paidByName} · ${money}`
      );
    }
    textLines.push("");
  }
  if (model.orphanExpenses.length) {
    textLines.push("## Weitere Ausgaben");
    for (const e of model.orphanExpenses) {
      const money = formatMoney(e.amountBase, e.baseCurrency);
      textLines.push(
        `* ${e.description || "Ausgabe"} · ${e.paidByName} · ${money}`
      );
    }
  }
  textLines.push("PDF im Anhang.");

  return { subject, html, text: textLines.join("\n") };
}
