import {
  dateBadgeHtml,
  escapeHtml,
} from "@/lib/finance-brain/mail-templates";

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

function placeLine(input: TripEventCommentMailInput): string | null {
  const parts = [input.location, input.provider]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

function timeLine(input: TripEventCommentMailInput): string | null {
  const start = input.startTime?.trim();
  const end = input.endTime?.trim();
  if (start && end) return `${start}–${end}`;
  return start || end || null;
}

function eventHeaderHtml(input: TripEventCommentMailInput): string {
  const aiCid = input.aiCid || "event-ai";
  const place = placeLine(input);
  const time = timeLine(input);
  const endIso =
    input.endDate &&
    input.startDate &&
    input.endDate.slice(0, 10) !== input.startDate.slice(0, 10)
      ? input.endDate
      : null;
  return `
    <div style="background:${BRAND.card};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};margin-bottom:16px;">
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
        </div>
        ${
          input.hasAiImage
            ? `<img src="cid:${escapeHtml(aiCid)}" alt="" width="72" height="72" style="width:72px;height:72px;border-radius:8px;object-fit:cover;border:1px solid ${BRAND.border};flex-shrink:0;" />`
            : ""
        }
      </div>
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
          <div style="margin-top:8px;font-size:15px;line-height:1.5;color:${BRAND.ink};white-space:pre-wrap;">${bodyHtml}</div>
          ${
            input.hasCommentImage
              ? `<div style="margin-top:12px;"><img src="cid:${escapeHtml(commentCid)}" alt="Kommentar-Bild" style="max-width:100%;height:auto;border-radius:8px;border:1px solid ${BRAND.border};" /></div>`
              : ""
          }
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
