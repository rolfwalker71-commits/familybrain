import { graphJson } from "@/lib/microsoft/graph";
import { addDaysYmd, dayWindowLocal, zurichYmd } from "@/lib/microsoft/time";

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

function mapMessage(m: GraphMessage, folder: MsMailFolder): MsMailItem | null {
  if (!m.id) return null;
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
  return {
    id: m.id,
    folder,
    subject: (m.subject || "").trim() || "(kein Betreff)",
    from: fromName || fromEmail || "—",
    fromEmail,
    toPreview: to || null,
    toEmails,
    receivedOrSentAt:
      folder === "sent" ? m.sentDateTime || null : m.receivedDateTime || null,
    preview: (m.bodyPreview || "").trim().slice(0, 280),
    bodyText: bodyText.slice(0, 8000),
    conversationId: m.conversationId || null,
    webLink: m.webLink || null,
    isRead: Boolean(m.isRead),
  };
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function listFolderForDay(
  userId: number,
  folder: MsMailFolder,
  dayIso: string,
  limit: number
): Promise<MsMailItem[]> {
  const ymd = isYmd(dayIso) ? dayIso : zurichYmd();
  const { start } = dayWindowLocal(ymd);
  const next = addDaysYmd(ymd, 1);
  const filterField =
    folder === "sent" ? "sentDateTime" : "receivedDateTime";
  const folderPath = folder === "sent" ? "sentitems" : "inbox";
  const qs = new URLSearchParams({
    $filter: `${filterField} ge ${start} and ${filterField} lt ${next}T00:00:00`,
    $orderby: `${filterField} desc`,
    $top: String(limit),
    $select:
      "id,subject,bodyPreview,body,from,toRecipients,receivedDateTime,sentDateTime,conversationId,webLink,isRead",
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
      $top: String(Math.min(limit * 3, 60)),
      $select:
        "id,subject,bodyPreview,body,from,toRecipients,receivedDateTime,sentDateTime,conversationId,webLink,isRead",
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
      .filter((m) => (m.receivedOrSentAt || "").slice(0, 10) === ymd)
      .slice(0, limit);
  }
}

/** Mails für einen Kalendertag (Europe/Zurich), Default: heute. */
export async function listMicrosoftMailForDay(
  userId: number,
  dayIso?: string | null,
  options?: { inboxLimit?: number; sentLimit?: number }
): Promise<{ inbox: MsMailItem[]; sent: MsMailItem[]; dayIso: string }> {
  const day = dayIso && isYmd(dayIso) ? dayIso : zurichYmd();
  const inboxLimit = options?.inboxLimit ?? 25;
  const sentLimit = options?.sentLimit ?? 15;
  const [inbox, sent] = await Promise.all([
    listFolderForDay(userId, "inbox", day, inboxLimit),
    listFolderForDay(userId, "sent", day, sentLimit),
  ]);
  return { inbox, sent, dayIso: day };
}

/** @deprecated use listMicrosoftMailForDay */
export async function listMicrosoftMailToday(
  userId: number,
  options?: { inboxLimit?: number; sentLimit?: number }
): Promise<{ inbox: MsMailItem[]; sent: MsMailItem[]; todayIso: string }> {
  const data = await listMicrosoftMailForDay(userId, null, options);
  return { inbox: data.inbox, sent: data.sent, todayIso: data.dayIso };
}
