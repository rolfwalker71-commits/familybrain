import { graphJson } from "@/lib/microsoft/graph";
import { addDaysYmd, dayWindowLocal, zurichYmd } from "@/lib/microsoft/time";
import type { MailListFilter, MailListItem, MailMessageDetail } from "@/lib/mail/gmail";

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
  conversationId?: string | null;
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

function mapToListItem(m: GraphMessage): MailListItem | null {
  if (!m.id) return null;
  const fromEmail = m.from?.emailAddress?.address?.trim() || "";
  const fromName =
    m.from?.emailAddress?.name?.trim() || fromEmail || "—";
  const received = m.receivedDateTime || null;
  return {
    id: m.id,
    threadId: m.conversationId || m.id,
    from: fromEmail || fromName,
    fromName,
    subject: (m.subject || "").trim() || "(kein Betreff)",
    snippet: (m.bodyPreview || "").trim().slice(0, 280),
    date: received,
    internalDate: received ? String(new Date(received).getTime()) : null,
    unread: m.isRead === false,
  };
}

function mapToDetail(m: GraphMessage): MailMessageDetail | null {
  const base = mapToListItem(m);
  if (!base) return null;
  const rawBody = m.body?.content || "";
  const isHtml = (m.body?.contentType || "").toLowerCase() === "html";
  const bodyText = isHtml ? stripHtml(rawBody) : rawBody.trim();
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
  return {
    ...base,
    to: to || null,
    bodyText: bodyText.slice(0, 12_000) || null,
    bodyHtml: isHtml ? rawBody.slice(0, 50_000) : null,
  };
}

/** Inbox-Liste mit Filtern analog Gmail (today / week / unread). */
export async function listMicrosoftInboxMessages(
  userId: number,
  options?: { filter?: MailListFilter; limit?: number }
): Promise<MailListItem[]> {
  const filter = options?.filter || "today";
  const limit = Math.min(50, Math.max(1, options?.limit ?? 30));
  const today = zurichYmd();
  const weekStart = addDaysYmd(today, -7);
  const { start: todayStart } = dayWindowLocal(today);

  let filterExpr = "";
  if (filter === "today") {
    filterExpr = `receivedDateTime ge ${todayStart}`;
  } else if (filter === "week") {
    const { start } = dayWindowLocal(weekStart);
    filterExpr = `receivedDateTime ge ${start}`;
  } else {
    filterExpr = "isRead eq false";
  }

  const qs = new URLSearchParams({
    $filter: filterExpr,
    $orderby: "receivedDateTime desc",
    $top: String(limit),
    $select:
      "id,subject,bodyPreview,from,receivedDateTime,conversationId,isRead",
  });

  try {
    const data = await graphJson<{ value?: GraphMessage[] }>(
      userId,
      `/me/mailFolders/inbox/messages?${qs}`
    );
    return (data.value || [])
      .map(mapToListItem)
      .filter((m): m is MailListItem => Boolean(m));
  } catch {
    // Fallback ohne $filter (manche Tenants)
    const qs2 = new URLSearchParams({
      $orderby: "receivedDateTime desc",
      $top: String(Math.min(limit * 3, 60)),
      $select:
        "id,subject,bodyPreview,from,receivedDateTime,conversationId,isRead",
    });
    const data = await graphJson<{ value?: GraphMessage[] }>(
      userId,
      `/me/mailFolders/inbox/messages?${qs2}`
    );
    let items = (data.value || [])
      .map(mapToListItem)
      .filter((m): m is MailListItem => Boolean(m));
    if (filter === "unread") {
      items = items.filter((i) => i.unread);
    } else if (filter === "today") {
      items = items.filter((i) => (i.date || "").slice(0, 10) === today);
    } else if (filter === "week") {
      items = items.filter((i) => (i.date || "").slice(0, 10) >= weekStart);
    }
    return items.slice(0, limit);
  }
}

export async function getMicrosoftMessage(
  userId: number,
  messageId: string
): Promise<MailMessageDetail> {
  const m = await graphJson<GraphMessage>(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}?$select=id,subject,bodyPreview,body,from,toRecipients,receivedDateTime,conversationId,isRead`,
    { headers: { Prefer: 'outlook.body-content-type="text"' } }
  );
  const detail = mapToDetail(m);
  if (!detail) throw new Error("Outlook-Nachricht nicht gefunden.");
  return detail;
}
