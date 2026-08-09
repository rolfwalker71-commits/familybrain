/**
 * Gmail inbox + sent for a Zurich calendar day/range — same shape as MsMailItem
 * so the shared day-analysis prompt can be reused.
 */
import { google, type gmail_v1 } from "googleapis";
import { getAuthedGoogleClient } from "@/lib/google/oauth";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  isMailAnalysisYmd,
  mailAnalysisListLimits,
  mailAnalysisRangeExclusiveEnd,
  resolveMailAnalysisRange,
} from "@/lib/mail/mail-analysis-range";

function gmailRangeBounds(
  fromYmd: string,
  toYmd: string
): { after: string; before: string } {
  const [y, m, d] = fromYmd.split("-").map(Number);
  const next = mailAnalysisRangeExclusiveEnd(toYmd);
  const [ny, nm, nd] = next.split("-").map(Number);
  return {
    after: `${y}/${m}/${d}`,
    before: `${ny}/${nm}/${nd}`,
  };
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | null {
  const hit = (headers || []).find(
    (h) => (h.name || "").toLowerCase() === name.toLowerCase()
  );
  return hit?.value?.trim() || null;
}

function parseAddressList(raw: string | null): {
  preview: string | null;
  emails: string[];
} {
  if (!raw?.trim()) return { preview: null, emails: [] };
  const emails = Array.from(
    raw.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    (m) => m[0]
  ).slice(0, 5);
  return { preview: raw.trim().slice(0, 200), emails };
}

function parseFrom(raw: string | null): { name: string; email: string | null } {
  if (!raw) return { name: "—", email: null };
  const m = /^(?:"?([^"<]*)"?\s*)?<(.*)>$/.exec(raw);
  if (m) {
    return {
      name: (m[1] || "").trim() || m[2],
      email: m[2].trim() || null,
    };
  }
  if (raw.includes("@")) return { name: raw, email: raw };
  return { name: raw, email: null };
}

function decodeBodyData(data: string | undefined | null): string {
  if (!data) return "";
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractBodies(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  const found = { text: "", html: "" };
  const walk = (p: gmail_v1.Schema$MessagePart) => {
    const mime = (p.mimeType || "").toLowerCase();
    if (mime === "text/plain" && p.body?.data && !found.text) {
      found.text = decodeBodyData(p.body.data);
    }
    if (mime === "text/html" && p.body?.data && !found.html) {
      found.html = decodeBodyData(p.body.data);
    }
    for (const child of p.parts || []) walk(child);
  };
  walk(part);
  if (found.text.trim()) return found.text.trim();
  if (found.html.trim()) return stripHtml(found.html);
  return "";
}

function isoFromInternalDate(internalDate: string | null | undefined): string | null {
  if (!internalDate) return null;
  const n = Number(internalDate);
  if (!Number.isFinite(n)) return null;
  return new Date(n).toISOString();
}

async function listFolderForRange(
  userId: number,
  folder: "inbox" | "sent",
  fromYmd: string,
  toYmd: string,
  limit: number,
  request?: Request | null
): Promise<MsMailItem[]> {
  const { after, before } = gmailRangeBounds(fromYmd, toYmd);
  const q =
    folder === "sent"
      ? `in:sent after:${after} before:${before}`
      : `in:inbox after:${after} before:${before}`;

  const auth = await getAuthedGoogleClient(userId, request);
  const gmail = google.gmail({ version: "v1", auth });
  const listed = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: Math.min(50, Math.max(1, limit)),
  });
  const ids = (listed.data.messages || [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));

  const out: MsMailItem[] = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    if (!msg.data.id) continue;
    const headers = msg.data.payload?.headers;
    const from = parseFrom(headerValue(headers, "From"));
    const to = parseAddressList(headerValue(headers, "To"));
    const bodyText = extractBodies(msg.data.payload).slice(0, 8000);
    const labelIds = msg.data.labelIds || [];
    out.push({
      id: msg.data.id,
      folder,
      subject: headerValue(headers, "Subject") || "(kein Betreff)",
      from: from.name,
      fromEmail: from.email,
      toPreview: to.preview,
      toEmails: to.emails,
      receivedOrSentAt: isoFromInternalDate(msg.data.internalDate),
      preview: (msg.data.snippet || "").trim().slice(0, 280),
      bodyText,
      conversationId: msg.data.threadId || null,
      webLink: `https://mail.google.com/mail/u/0/#inbox/${msg.data.id}`,
      isRead: !labelIds.includes("UNREAD"),
    });
  }
  return out;
}

export type GoogleMailListResult = {
  inbox: MsMailItem[];
  sent: MsMailItem[];
  dayIso: string;
  fromYmd: string;
  toYmd: string;
  rangeKey: string;
};

export async function listGoogleMailForRange(
  userId: number,
  fromYmd?: string | null,
  toYmd?: string | null,
  options?: {
    inboxLimit?: number;
    sentLimit?: number;
    request?: Request | null;
  }
): Promise<GoogleMailListResult> {
  const resolved = resolveMailAnalysisRange({ from: fromYmd, to: toYmd });
  if ("error" in resolved) throw new Error(resolved.error);
  const caps = mailAnalysisListLimits(resolved.dayCount);
  const inboxLimit = options?.inboxLimit ?? caps.inboxLimit;
  const sentLimit = options?.sentLimit ?? caps.sentLimit;
  const [inbox, sent] = await Promise.all([
    listFolderForRange(
      userId,
      "inbox",
      resolved.fromYmd,
      resolved.toYmd,
      inboxLimit,
      options?.request
    ),
    listFolderForRange(
      userId,
      "sent",
      resolved.fromYmd,
      resolved.toYmd,
      sentLimit,
      options?.request
    ),
  ]);
  return {
    inbox,
    sent,
    dayIso: resolved.dayIso,
    fromYmd: resolved.fromYmd,
    toYmd: resolved.toYmd,
    rangeKey: resolved.rangeKey,
  };
}

export async function listGoogleMailForDay(
  userId: number,
  dayIso?: string | null,
  options?: {
    inboxLimit?: number;
    sentLimit?: number;
    request?: Request | null;
  }
): Promise<GoogleMailListResult> {
  const day =
    dayIso && isMailAnalysisYmd(dayIso) ? dayIso : zurichYmd();
  return listGoogleMailForRange(userId, day, day, options);
}
