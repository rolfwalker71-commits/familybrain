import { graphFetch, graphJson } from "@/lib/microsoft/graph";
import {
  appendMailSignature,
  getMicrosoftMailSignature,
} from "@/lib/microsoft/mail-signature";
import { createOutlookTodoTask } from "@/lib/microsoft/mail-day-actions";

export type MailMutateAction =
  | "markRead"
  | "markUnread"
  | "archive"
  | "delete"
  | "flag"
  | "unflag"
  | "createTodo";

/** Mark read / unread. */
export async function setMicrosoftMessageRead(
  userId: number,
  messageId: string,
  isRead: boolean
): Promise<void> {
  await graphJson(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ isRead }),
    }
  );
}

/** Move to Archive well-known folder. */
export async function archiveMicrosoftMessage(
  userId: number,
  messageId: string
): Promise<void> {
  await graphJson(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}/move`,
    {
      method: "POST",
      body: JSON.stringify({ destinationId: "archive" }),
    }
  );
}

/** Soft-delete (Deleted Items). */
export async function deleteMicrosoftMessage(
  userId: number,
  messageId: string
): Promise<void> {
  const res = await graphFetch(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Löschen fehlgeschlagen (${res.status}): ${text.slice(0, 180)}`);
  }
}

/** Outlook follow-up flag (often also surfaces in To Do Flagged Email). */
export async function setMicrosoftMessageFlag(
  userId: number,
  messageId: string,
  flagged: boolean
): Promise<void> {
  await graphJson(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        flag: { flagStatus: flagged ? "flagged" : "notFlagged" },
      }),
    }
  );
}

export async function createTodoFromMicrosoftMessage(
  userId: number,
  input: {
    messageId: string;
    title?: string | null;
    dueDate?: string | null;
    alsoFlag?: boolean;
  }
): Promise<{ id: string; title: string; webLink: string | null }> {
  const msg = await graphJson<{
    id?: string;
    subject?: string | null;
    bodyPreview?: string | null;
    from?: {
      emailAddress?: { name?: string | null; address?: string | null };
    };
    webLink?: string | null;
  }>(
    userId,
    `/me/messages/${encodeURIComponent(input.messageId)}?$select=id,subject,bodyPreview,from,webLink`
  );
  const fromName =
    msg.from?.emailAddress?.name?.trim() ||
    msg.from?.emailAddress?.address?.trim() ||
    null;
  const title =
    (input.title || "").trim() ||
    (msg.subject || "").trim() ||
    "Aufgabe aus Mail";
  const notes = [
    fromName ? `Von: ${fromName}` : null,
    msg.bodyPreview?.trim() || null,
    msg.webLink ? `Mail: ${msg.webLink}` : null,
    "Aus Outlook-Mail in Buddy angelegt",
  ]
    .filter(Boolean)
    .join("\n\n");

  const task = await createOutlookTodoTask(userId, {
    title,
    notes,
    dueDate: input.dueDate || null,
  });

  if (input.alsoFlag !== false) {
    try {
      await setMicrosoftMessageFlag(userId, input.messageId, true);
    } catch {
      /* flag is best-effort */
    }
  }

  return task;
}

export type SendOutlookMailInput = {
  to: string;
  subject: string;
  body: string;
  /** When set, reply in-thread via createReply then send. */
  sourceMailId?: string | null;
  cc?: string | null;
  /** Override stored preference; default = signature.appendOnSend. */
  includeSignature?: boolean;
  contentType?: "Text" | "HTML";
};

export type SentOutlookMail = {
  /** Draft id before send (may be empty after sendMail one-shot). */
  id: string | null;
  subject: string;
  sent: true;
};

function parseRecipients(raw: string): Array<{
  emailAddress: { address: string };
}> {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"))
    .map((address) => ({ emailAddress: { address } }));
}

/** Send a real Outlook message (reply or new). Appends Buddy signature when configured. */
export async function sendOutlookMail(
  userId: number,
  input: SendOutlookMailInput
): Promise<SentOutlookMail> {
  const toList = parseRecipients(input.to);
  if (toList.length === 0) {
    throw new Error("Ungültige Empfänger-Adresse.");
  }
  const subject = input.subject.trim() || "(kein Betreff)";
  const contentType = input.contentType || "Text";
  const sigPref = getMicrosoftMailSignature(userId);
  const includeSig =
    input.includeSignature !== undefined
      ? input.includeSignature
      : sigPref.appendOnSend;
  const body = includeSig
    ? appendMailSignature(input.body, sigPref.text, contentType)
    : input.body;
  const ccList = input.cc ? parseRecipients(input.cc) : [];

  if (input.sourceMailId?.trim()) {
    const draft = await graphJson<{ id?: string; subject?: string }>(
      userId,
      `/me/messages/${encodeURIComponent(input.sourceMailId.trim())}/createReply`,
      { method: "POST", body: JSON.stringify({}) }
    );
    if (!draft.id) throw new Error("Antwort-Entwurf ohne ID.");
    await graphJson(
      userId,
      `/me/messages/${encodeURIComponent(draft.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          subject,
          body: { contentType, content: body },
          toRecipients: toList,
          ...(ccList.length ? { ccRecipients: ccList } : {}),
        }),
      }
    );
    const res = await graphFetch(
      userId,
      `/me/messages/${encodeURIComponent(draft.id)}/send`,
      { method: "POST", body: JSON.stringify({}) }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Senden fehlgeschlagen (${res.status}): ${text.slice(0, 200)}`
      );
    }
    return { id: draft.id, subject, sent: true };
  }

  // New message — one-shot sendMail (no leftover draft).
  await graphJson(userId, "/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType, content: body },
        toRecipients: toList,
        ...(ccList.length ? { ccRecipients: ccList } : {}),
      },
      saveToSentItems: true,
    }),
  });
  return { id: null, subject, sent: true };
}

/** Create draft only (with optional signature), return webLink for Outlook. */
export async function createOutlookMailDraftWithSignature(
  userId: number,
  input: SendOutlookMailInput & { includeSignature?: boolean }
): Promise<{ id: string; subject: string; webLink: string | null }> {
  const toList = parseRecipients(input.to);
  if (toList.length === 0) {
    throw new Error("Ungültige Empfänger-Adresse.");
  }
  const subject = input.subject.trim() || "(kein Betreff)";
  const contentType = input.contentType || "Text";
  const sigPref = getMicrosoftMailSignature(userId);
  const includeSig =
    input.includeSignature !== undefined
      ? input.includeSignature
      : sigPref.appendOnSend;
  const body = includeSig
    ? appendMailSignature(input.body, sigPref.text, contentType)
    : input.body;
  const ccList = input.cc ? parseRecipients(input.cc) : [];

  if (input.sourceMailId?.trim()) {
    try {
      const draft = await graphJson<{
        id?: string;
        subject?: string;
        webLink?: string | null;
      }>(
        userId,
        `/me/messages/${encodeURIComponent(input.sourceMailId.trim())}/createReply`,
        { method: "POST", body: JSON.stringify({}) }
      );
      if (draft.id) {
        const patched = await graphJson<{
          id?: string;
          subject?: string;
          webLink?: string | null;
        }>(userId, `/me/messages/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            subject,
            body: { contentType, content: body },
            toRecipients: toList,
            ...(ccList.length ? { ccRecipients: ccList } : {}),
          }),
        });
        return {
          id: patched.id || draft.id,
          subject: patched.subject || subject,
          webLink: patched.webLink || draft.webLink || null,
        };
      }
    } catch {
      /* fall through */
    }
  }

  const created = await graphJson<{
    id?: string;
    subject?: string;
    webLink?: string | null;
  }>(userId, "/me/messages", {
    method: "POST",
    body: JSON.stringify({
      subject,
      body: { contentType, content: body },
      toRecipients: toList,
      ...(ccList.length ? { ccRecipients: ccList } : {}),
    }),
  });
  if (!created.id) throw new Error("Outlook-Entwurf ohne ID.");
  return {
    id: created.id,
    subject: created.subject || subject,
    webLink: created.webLink || null,
  };
}

export async function mutateMicrosoftMessage(
  userId: number,
  messageId: string,
  action: MailMutateAction,
  options?: { todoTitle?: string | null; dueDate?: string | null }
): Promise<{ ok: true; todo?: { id: string; title: string; webLink: string | null } }> {
  switch (action) {
    case "markRead":
      await setMicrosoftMessageRead(userId, messageId, true);
      return { ok: true };
    case "markUnread":
      await setMicrosoftMessageRead(userId, messageId, false);
      return { ok: true };
    case "archive":
      await archiveMicrosoftMessage(userId, messageId);
      return { ok: true };
    case "delete":
      await deleteMicrosoftMessage(userId, messageId);
      return { ok: true };
    case "flag":
      await setMicrosoftMessageFlag(userId, messageId, true);
      return { ok: true };
    case "unflag":
      await setMicrosoftMessageFlag(userId, messageId, false);
      return { ok: true };
    case "createTodo": {
      const todo = await createTodoFromMicrosoftMessage(userId, {
        messageId,
        title: options?.todoTitle,
        dueDate: options?.dueDate,
        alsoFlag: true,
      });
      return { ok: true, todo };
    }
    default:
      throw new Error("Unbekannte Aktion.");
  }
}
