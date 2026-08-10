import { graphJson } from "@/lib/microsoft/graph";
import { dayWindowLocal, zurichYmd } from "@/lib/microsoft/time";
import {
  isMailAnalysisYmd,
  mailAnalysisListLimits,
  mailAnalysisRangeExclusiveEnd,
  resolveMailAnalysisRange,
} from "@/lib/mail/mail-analysis-range";
import {
  annotateMailInRange,
  MAIL_THREAD_EXPAND_MAX_MESSAGES,
  MAIL_THREAD_EXPAND_MAX_THREADS,
  mergeMailItemsById,
  splitMailsByFolder,
} from "@/lib/mail/mail-threads";

export type MsMailFolder = "inbox" | "sent";

export type MsMailItem = {
  id: string;
  folder: MsMailFolder;
  subject: string;
  from: string;
  fromEmail: string | null;
  toPreview: string | null;
  toEmails: string[];
  receivedOrSentAt: string | null;
  preview: string;
  bodyText: string;
  conversationId: string | null;
  webLink: string | null;
  isRead: boolean;
  /**
   * True when the mail falls in the requested from/to range.
   * False = thread context loaded for Chronik/AI outside the filter window.
   */
  inRange?: boolean;
};

type GraphRecipient = {
  emailAddress?: { name?: string | null; address?: string | null };
};

type GraphMessage = {
  id?: string;
  subject?: string | null;
  bodyPreview?: string | null;
  body?: { contentType?: string | null; content?: string | null } | null;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  conversationId?: string | null;
  webLink?: string | null;
  isRead?: boolean;
  parentFolderId?: string | null;
};

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

function mapMessage(
  m: GraphMessage,
  folder: MsMailFolder,
  sentFolderId?: string | null
): MsMailItem | null {
  if (!m.id) return null;
  let resolvedFolder: MsMailFolder = folder;
  if (sentFolderId && m.parentFolderId) {
    resolvedFolder =
      m.parentFolderId === sentFolderId ? "sent" : "inbox";
  }
  const fromName = m.from?.emailAddress?.name?.trim();
  const fromEmail = m.from?.emailAddress?.address?.trim() || null;
  const toEmails = (m.toRecipients || [])
    .map((r) => r.emailAddress?.address?.trim())
    .filter((a): a is string => Boolean(a))
    .slice(0, 5);
  const to = (m.toRecipients || [])
    .map((r) => {
      const name = r.emailAddress?.name?.trim();
      const addr = r.emailAddress?.address?.trim();
      if (name && addr) return `${name} <${addr}>`;
      return name || addr || null;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const rawBody = m.body?.content || "";
  const bodyText =
    (m.body?.contentType || "").toLowerCase() === "html"
      ? stripHtml(rawBody)
      : rawBody.trim();
  const at =
    resolvedFolder === "sent"
      ? m.sentDateTime || m.receivedDateTime || null
      : m.receivedDateTime || m.sentDateTime || null;
  return {
    id: m.id,
    folder: resolvedFolder,
    subject: (m.subject || "").trim() || "(kein Betreff)",
    from: fromName || fromEmail || "—",
    fromEmail,
    toPreview: to || null,
    toEmails,
    receivedOrSentAt: at,
    preview: (m.bodyPreview || "").trim().slice(0, 280),
    bodyText: bodyText.slice(0, 8000),
    conversationId: m.conversationId || null,
    webLink: m.webLink || null,
    isRead: Boolean(m.isRead),
  };
}

const MESSAGE_SELECT =
  "id,subject,bodyPreview,body,from,toRecipients,receivedDateTime,sentDateTime,conversationId,webLink,isRead,parentFolderId";

function odataStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function getSentFolderId(userId: number): Promise<string | null> {
  try {
    const data = await graphJson<{ id?: string }>(
      userId,
      "/me/mailFolders/sentitems?$select=id"
    );
    return data.id || null;
  } catch {
    return null;
  }
}

async function listConversationMessages(
  userId: number,
  conversationId: string,
  sentFolderId: string | null
): Promise<MsMailItem[]> {
  const qs = new URLSearchParams({
    $filter: `conversationId eq ${odataStringLiteral(conversationId)}`,
    $top: String(MAIL_THREAD_EXPAND_MAX_MESSAGES),
    $select: MESSAGE_SELECT,
  });
  try {
    const data = await graphJson<{ value?: GraphMessage[] }>(
      userId,
      `/me/messages?${qs}`,
      { headers: { Prefer: 'outlook.body-content-type="text"' } }
    );
    return (data.value || [])
      .map((m) => mapMessage(m, "inbox", sentFolderId))
      .filter((m): m is MsMailItem => Boolean(m));
  } catch (err) {
    console.warn(
      "[ms-mail] conversation expand failed:",
      conversationId.slice(0, 24),
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

async function expandMicrosoftThreads(
  userId: number,
  seeds: MsMailItem[],
  fromYmd: string,
  toYmd: string
): Promise<MsMailItem[]> {
  const annotatedSeeds = seeds.map((m) =>
    annotateMailInRange({ ...m, inRange: true }, fromYmd, toYmd)
  );
  const convIds = [
    ...new Set(
      annotatedSeeds
        .map((m) => m.conversationId?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ].slice(0, MAIL_THREAD_EXPAND_MAX_THREADS);

  if (convIds.length === 0) {
    return annotatedSeeds.map((m) => annotateMailInRange(m, fromYmd, toYmd));
  }

  const sentFolderId = await getSentFolderId(userId);
  const extras: MsMailItem[] = [];
  const concurrency = 4;
  for (let i = 0; i < convIds.length; i += concurrency) {
    const batch = convIds.slice(i, i + concurrency);
    const parts = await Promise.all(
      batch.map((id) => listConversationMessages(userId, id, sentFolderId))
    );
    for (const list of parts) extras.push(...list);
  }

  const merged = mergeMailItemsById(annotatedSeeds, extras);
  return merged.map((m) => annotateMailInRange(m, fromYmd, toYmd));
}

async function listFolderForRange(
  userId: number,
  folder: MsMailFolder,
  fromYmd: string,
  toYmd: string,
  limit: number
): Promise<MsMailItem[]> {
  const { start } = dayWindowLocal(fromYmd);
  const exclusiveEnd = mailAnalysisRangeExclusiveEnd(toYmd);
  const filterField =
    folder === "sent" ? "sentDateTime" : "receivedDateTime";
  const folderPath = folder === "sent" ? "sentitems" : "inbox";
  const qs = new URLSearchParams({
    $filter: `${filterField} ge ${start} and ${filterField} lt ${exclusiveEnd}T00:00:00`,
    $orderby: `${filterField} desc`,
    $top: String(limit),
    $select: MESSAGE_SELECT,
  });
  try {
    const data = await graphJson<{ value?: GraphMessage[] }>(
      userId,
      `/me/mailFolders/${folderPath}/messages?${qs}`,
      {
        headers: {
          Prefer: 'outlook.body-content-type="text"',
        },
      }
    );
    return (data.value || [])
      .map((m) => mapMessage(m, folder))
      .filter((m): m is MsMailItem => Boolean(m));
  } catch {
    const qs2 = new URLSearchParams({
      $orderby: `${filterField} desc`,
      $top: String(Math.min(limit * 3, 80)),
      $select: MESSAGE_SELECT,
    });
    const data = await graphJson<{ value?: GraphMessage[] }>(
      userId,
      `/me/mailFolders/${folderPath}/messages?${qs2}`,
      { headers: { Prefer: 'outlook.body-content-type="text"' } }
    );
    const items = (data.value || [])
      .map((m) => mapMessage(m, folder))
      .filter((m): m is MsMailItem => Boolean(m));
    return items
      .filter((m) => {
        const ymd = (m.receivedOrSentAt || "").slice(0, 10);
        return ymd >= fromYmd && ymd <= toYmd;
      })
      .slice(0, limit);
  }
}

export type MicrosoftMailListResult = {
  inbox: MsMailItem[];
  sent: MsMailItem[];
  dayIso: string;
  fromYmd: string;
  toYmd: string;
  rangeKey: string;
};

/** Mails für einen Kalenderzeitraum (Europe/Zurich). */
export async function listMicrosoftMailForRange(
  userId: number,
  fromYmd?: string | null,
  toYmd?: string | null,
  options?: { inboxLimit?: number; sentLimit?: number }
): Promise<MicrosoftMailListResult> {
  const resolved = resolveMailAnalysisRange({ from: fromYmd, to: toYmd });
  if ("error" in resolved) throw new Error(resolved.error);
  const caps = mailAnalysisListLimits(resolved.dayCount);
  const inboxLimit = options?.inboxLimit ?? caps.inboxLimit;
  const sentLimit = options?.sentLimit ?? caps.sentLimit;
  const [inboxSeed, sentSeed] = await Promise.all([
    listFolderForRange(
      userId,
      "inbox",
      resolved.fromYmd,
      resolved.toYmd,
      inboxLimit
    ),
    listFolderForRange(
      userId,
      "sent",
      resolved.fromYmd,
      resolved.toYmd,
      sentLimit
    ),
  ]);
  const expanded = await expandMicrosoftThreads(
    userId,
    [...inboxSeed, ...sentSeed],
    resolved.fromYmd,
    resolved.toYmd
  );
  const { inbox, sent } = splitMailsByFolder(expanded);
  return {
    inbox,
    sent,
    dayIso: resolved.dayIso,
    fromYmd: resolved.fromYmd,
    toYmd: resolved.toYmd,
    rangeKey: resolved.rangeKey,
  };
}

/** Mails für einen Kalendertag (Europe/Zurich), Default: heute. */
export async function listMicrosoftMailForDay(
  userId: number,
  dayIso?: string | null,
  options?: { inboxLimit?: number; sentLimit?: number }
): Promise<MicrosoftMailListResult> {
  const day = dayIso && isMailAnalysisYmd(dayIso) ? dayIso : zurichYmd();
  return listMicrosoftMailForRange(userId, day, day, options);
}

/** @deprecated use listMicrosoftMailForDay */
export async function listMicrosoftMailToday(
  userId: number,
  options?: { inboxLimit?: number; sentLimit?: number }
): Promise<{ inbox: MsMailItem[]; sent: MsMailItem[]; todayIso: string }> {
  const data = await listMicrosoftMailForDay(userId, null, options);
  return { inbox: data.inbox, sent: data.sent, todayIso: data.dayIso };
}
