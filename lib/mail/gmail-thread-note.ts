import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  getConnectedGoogleEmail,
  hasGmailModifyScope,
} from "@/lib/google/oauth";

export type ThreadNoteAction = {
  kind: "event" | "task" | "note";
  title: string;
  notes?: string | null;
  reference?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  allDay?: boolean | null;
  location?: string | null;
  dueDate?: string | null;
  link?: string | null;
};

const BRAND = {
  ink: "#14201c",
  muted: "#5b6b66",
  border: "#d7e0dc",
  page: "#eef2f0",
  card: "#ffffff",
  accent: "#3f6b52",
  accentSoft: "#d9e4d1",
  event: "#0f766e",
  task: "#0369a1",
  note: "#a16207",
} as const;

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
): string | null {
  const hit = (headers || []).find(
    (h) => (h.name || "").toLowerCase() === name.toLowerCase()
  );
  return hit?.value?.trim() || null;
}

function formatZurichStamp(d = new Date()): {
  dateLabel: string;
  timeLabel: string;
  iso: string;
} {
  const dateLabel = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const timeLabel = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(", ", "T");
  return { dateLabel, timeLabel, iso };
}

function formatSwissDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function kindMeta(kind: ThreadNoteAction["kind"]): {
  label: string;
  icon: string;
  color: string;
} {
  if (kind === "event") {
    return { label: "Termin", icon: "📅", color: BRAND.event };
  }
  if (kind === "task") {
    return { label: "Aufgabe", icon: "✅", color: BRAND.task };
  }
  return { label: "Referenz", icon: "📌", color: BRAND.note };
}

function actionDetailsHtml(a: ThreadNoteAction): string {
  const rows: string[] = [];
  if (a.kind === "event") {
    const startD = formatSwissDate(a.startDate);
    const endD = formatSwissDate(a.endDate || a.startDate);
    if (a.allDay && startD) {
      rows.push(`<tr><td style="padding:2px 0;color:${BRAND.muted};width:7rem;">Datum</td><td style="padding:2px 0;color:${BRAND.ink};">${escapeHtml(startD)}${endD && endD !== startD ? ` – ${escapeHtml(endD)}` : ""} (ganztägig)</td></tr>`);
    } else if (startD) {
      const time =
        a.startTime && a.endTime
          ? `${a.startTime} – ${a.endTime}`
          : a.startTime || "";
      rows.push(
        `<tr><td style="padding:2px 0;color:${BRAND.muted};width:7rem;">Zeit</td><td style="padding:2px 0;color:${BRAND.ink};font-variant-numeric:tabular-nums;">${escapeHtml(startD)}${time ? ` · ${escapeHtml(time)}` : ""}</td></tr>`
      );
    }
    if (a.location?.trim()) {
      rows.push(
        `<tr><td style="padding:2px 0;color:${BRAND.muted};">Ort</td><td style="padding:2px 0;color:${BRAND.ink};">${escapeHtml(a.location.trim())}</td></tr>`
      );
    }
  }
  if (a.kind === "task" && a.dueDate) {
    const due = formatSwissDate(a.dueDate);
    if (due) {
      rows.push(
        `<tr><td style="padding:2px 0;color:${BRAND.muted};width:7rem;">Fällig</td><td style="padding:2px 0;color:${BRAND.ink};">${escapeHtml(due)}</td></tr>`
      );
    }
  }
  if (a.reference?.trim()) {
    rows.push(
      `<tr><td style="padding:2px 0;color:${BRAND.muted};width:7rem;">Referenz</td><td style="padding:2px 0;color:${BRAND.ink};font-family:ui-monospace,monospace;font-size:13px;">${escapeHtml(a.reference.trim())}</td></tr>`
    );
  }
  if (a.notes?.trim()) {
    rows.push(
      `<tr><td style="padding:2px 0;vertical-align:top;color:${BRAND.muted};width:7rem;">Details</td><td style="padding:2px 0;color:${BRAND.ink};white-space:pre-wrap;">${escapeHtml(a.notes.trim())}</td></tr>`
    );
  }
  if (a.link?.trim() && !a.link.startsWith("trilium:")) {
    rows.push(
      `<tr><td style="padding:2px 0;color:${BRAND.muted};width:7rem;">Link</td><td style="padding:2px 0;"><a href="${escapeHtml(a.link.trim())}" style="color:${BRAND.accent};">Öffnen</a></td></tr>`
    );
  }
  if (rows.length === 0) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:8px;font-size:13px;line-height:1.45;">${rows.join("")}</table>`;
}

/** Build multipart-friendly HTML body for the Buddy apply note. */
export function buildApplyThreadNoteHtml(input: {
  actions: ThreadNoteAction[];
  appliedAt?: Date;
}): string {
  const stamp = formatZurichStamp(input.appliedAt || new Date());
  const cards = input.actions
    .map((a) => {
      const meta = kindMeta(a.kind);
      return `
      <div style="margin:0 0 12px;border:1px solid ${BRAND.border};border-left:4px solid ${meta.color};border-radius:10px;background:${BRAND.card};padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${meta.color};">
          <span aria-hidden="true">${meta.icon}</span> ${escapeHtml(meta.label)}
        </div>
        <div style="margin-top:6px;font-size:16px;font-weight:700;color:${BRAND.ink};line-height:1.3;">
          ${escapeHtml(a.title)}
        </div>
        ${actionDetailsHtml(a)}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${BRAND.page};font-family:Georgia,'Times New Roman',serif;color:${BRAND.ink};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.page};padding:20px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND.accentSoft};padding:16px 20px;border-bottom:1px solid ${BRAND.border};">
            <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.accent};">Buddy</div>
            <div style="margin-top:4px;font-size:20px;font-weight:700;color:${BRAND.ink};font-family:system-ui,-apple-system,sans-serif;">
              Übernommen in Buddy
            </div>
            <div style="margin-top:8px;font-size:12px;color:${BRAND.muted};font-family:system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;">
              ${escapeHtml(stamp.dateLabel)} · ${escapeHtml(stamp.timeLabel)} (Europe/Zurich)
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 20px 8px;font-family:system-ui,-apple-system,sans-serif;">
            <p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:${BRAND.muted};">
              Folgende Einträge wurden aus dieser Mail übernommen:
            </p>
            ${cards}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 20px 18px;font-family:system-ui,-apple-system,sans-serif;">
            <p style="margin:0;font-size:11px;color:${BRAND.muted};">
              Automatische Notiz von Buddy · ${escapeHtml(stamp.iso)}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildApplyThreadNoteText(input: {
  actions: ThreadNoteAction[];
  appliedAt?: Date;
}): string {
  const stamp = formatZurichStamp(input.appliedAt || new Date());
  const lines = [
    "BUDDY — Übernommen",
    `${stamp.dateLabel} · ${stamp.timeLabel} (Europe/Zurich)`,
    "",
    "Folgende Einträge wurden aus dieser Mail übernommen:",
    "",
  ];
  for (const a of input.actions) {
    const meta = kindMeta(a.kind);
    lines.push(`${meta.icon} ${meta.label}: ${a.title}`);
    if (a.kind === "event" && a.startDate) {
      const d = formatSwissDate(a.startDate);
      const t =
        a.allDay
          ? "ganztägig"
          : [a.startTime, a.endTime].filter(Boolean).join(" – ");
      if (d) lines.push(`  Zeit: ${d}${t ? ` · ${t}` : ""}`);
      if (a.location?.trim()) lines.push(`  Ort: ${a.location.trim()}`);
    }
    if (a.kind === "task" && a.dueDate) {
      const d = formatSwissDate(a.dueDate);
      if (d) lines.push(`  Fällig: ${d}`);
    }
    if (a.reference?.trim()) lines.push(`  Referenz: ${a.reference.trim()}`);
    if (a.notes?.trim()) lines.push(`  Details: ${a.notes.trim()}`);
    lines.push("");
  }
  lines.push(`— Buddy · ${stamp.iso}`);
  return lines.join("\n");
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMimeMessage(input: {
  from: string;
  to: string;
  subject: string;
  inReplyTo: string | null;
  references: string | null;
  text: string;
  html: string;
}): string {
  const boundary = `buddy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`);
  }
  if (input.references) {
    headers.push(`References: ${input.references}`);
  }

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

/**
 * Append an HTML note into the Gmail thread after Buddy applied suggestions.
 */
export async function sendApplyNoteInThread(
  userId: number,
  messageId: string,
  actions: ThreadNoteAction[],
  request?: Request | null
): Promise<{ ok: boolean; skipped?: string; error?: string; id?: string }> {
  if (actions.length === 0) {
    return { ok: false, skipped: "keine Aktionen" };
  }
  if (!hasGmailModifyScope(userId)) {
    return { ok: false, skipped: "gmail.modify fehlt" };
  }
  const me = getConnectedGoogleEmail(userId);
  if (!me) {
    return { ok: false, skipped: "keine Google-E-Mail" };
  }

  try {
    const auth = await getAuthedGoogleClient(userId, request);
    const gmail = google.gmail({ version: "v1", auth });
    const original = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["Subject", "Message-ID", "References", "From"],
    });
    const headers = original.data.payload?.headers;
    const threadId = original.data.threadId || undefined;
    const subjectRaw = headerValue(headers, "Subject") || "(kein Betreff)";
    const messageIdHdr = headerValue(headers, "Message-ID");
    const prevRefs = headerValue(headers, "References");
    const subject = /^(re|aw|wg|fwd?)\s*:/i.test(subjectRaw)
      ? subjectRaw
      : `Re: ${subjectRaw}`;
    const references = [prevRefs, messageIdHdr].filter(Boolean).join(" ").trim();

    const appliedAt = new Date();
    const html = buildApplyThreadNoteHtml({ actions, appliedAt });
    const text = buildApplyThreadNoteText({ actions, appliedAt });
    const raw = toBase64Url(
      buildMimeMessage({
        from: me,
        to: me,
        subject,
        inReplyTo: messageIdHdr,
        references: references || messageIdHdr,
        text,
        html,
      })
    );

    const sent = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        threadId,
      },
    });

    return { ok: true, id: sent.data.id || undefined };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[gmail] thread apply note:", msg);
    return { ok: false, error: msg };
  }
}
