import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  getConnectedGoogleEmail,
  hasGmailModifyScope,
} from "@/lib/google/oauth";

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

function buildPlainReplyMime(input: {
  from: string;
  to: string;
  subject: string;
  inReplyTo: string | null;
  references: string | null;
  text: string;
}): string {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);
  return `${headers.join("\r\n")}\r\n\r\n${input.text}`;
}

/**
 * Create a Gmail draft reply in the same thread (user can edit/send in Gmail).
 */
export async function createGmailReplyDraft(
  userId: number,
  messageId: string,
  draft: { subject?: string | null; body: string },
  request?: Request | null
): Promise<{ ok: boolean; draftId?: string; skipped?: string; error?: string }> {
  const body = draft.body.trim();
  if (!body) return { ok: false, skipped: "leerer Text" };
  if (!hasGmailModifyScope(userId)) {
    return { ok: false, skipped: "gmail.modify fehlt" };
  }
  const me = getConnectedGoogleEmail(userId);
  if (!me) return { ok: false, skipped: "keine Google-E-Mail" };

  try {
    const auth = await getAuthedGoogleClient(userId, request);
    const gmail = google.gmail({ version: "v1", auth });
    const original = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["Subject", "Message-ID", "References", "From", "Reply-To"],
    });
    const headers = original.data.payload?.headers;
    const threadId = original.data.threadId || undefined;
    const subjectRaw = headerValue(headers, "Subject") || "(kein Betreff)";
    const messageIdHdr = headerValue(headers, "Message-ID");
    const prevRefs = headerValue(headers, "References");
    const replyTo =
      headerValue(headers, "Reply-To") || headerValue(headers, "From") || me;
    const subject =
      draft.subject?.trim() ||
      (/^(re|aw|wg|fwd?)\s*:/i.test(subjectRaw)
        ? subjectRaw
        : `Re: ${subjectRaw}`);
    const references = [prevRefs, messageIdHdr].filter(Boolean).join(" ").trim();

    const raw = toBase64Url(
      buildPlainReplyMime({
        from: me,
        to: replyTo,
        subject,
        inReplyTo: messageIdHdr,
        references: references || messageIdHdr,
        text: body,
      })
    );

    const created = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          threadId,
        },
      },
    });

    return { ok: true, draftId: created.data.id || undefined };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[gmail] reply draft:", msg);
    return { ok: false, error: msg };
  }
}
