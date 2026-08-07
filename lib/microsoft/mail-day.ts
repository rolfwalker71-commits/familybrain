import { graphJson } from "@/lib/microsoft/graph";
import { dayWindowLocal, zurichYmd } from "@/lib/microsoft/time";

export type MsMailFolder = "inbox" | "sent";

export type MsMailItem = {
  id: string;
  folder: MsMailFolder;
  subject: string;
  from: string;
  fromEmail: string | null;
  toPreview: string | null;
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
  const to = (m.toRecipients || [])
    .map((r) => r.emailAddress?.name || r.emailAddress?.address)
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
    receivedOrSentAt:
      folder === "sent" ? m.sentDateTime || null : m.receivedDateTime || null,
    preview: (m.bodyPreview || "").trim().slice(0, 280),
    bodyText: bodyText.slice(0, 8000),
    conversationId: m.conversationId || null,
    webLink: m.webLink || null,
    isRead: Boolean(m.isRead),
  };
}

async function listFolderToday(
  userId: number,
  folder: MsMailFolder,
  limit: number
): Promise<MsMailItem[]> {
  const today = zurichYmd();
  const { start } = dayWindowLocal(today);
  // Graph filter uses UTC ISO; approximate with Zurich midnight as local then Z-ish
  const filterField =
    folder === "sent" ? "sentDateTime" : "receivedDateTime";
  const folderPath =
    folder === "sent" ? "sentitems" : "inbox";
  const qs = new URLSearchParams({
    $filter: `${filterField} ge ${start}`,
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
    // Fallback without filter (some tenants choke on ge with local format)
    const qs2 = new URLSearchParams({
      $orderby: `${filterField} desc`,
      $top: String(Math.min(limit * 2, 40)),
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
      .filter((m) => (m.receivedOrSentAt || "").slice(0, 10) === today)
      .slice(0, limit);
  }
}

export async function listMicrosoftMailToday(
  userId: number,
  options?: { inboxLimit?: number; sentLimit?: number }
): Promise<{ inbox: MsMailItem[]; sent: MsMailItem[]; todayIso: string }> {
  const inboxLimit = options?.inboxLimit ?? 25;
  const sentLimit = options?.sentLimit ?? 15;
  const [inbox, sent] = await Promise.all([
    listFolderToday(userId, "inbox", inboxLimit),
    listFolderToday(userId, "sent", sentLimit),
  ]);
  return { inbox, sent, todayIso: zurichYmd() };
}
