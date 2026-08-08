import { graphJson } from "@/lib/microsoft/graph";
import { hasMicrosoftCalendarScope } from "@/lib/microsoft/oauth";

type GraphBody = {
  contentType?: string | null;
  content?: string | null;
};

type GraphEventBody = {
  id?: string;
  body?: GraphBody | null;
};

function htmlToRoughText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtmlParagraphs(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Read current Outlook notes (body), return normalized text for Buddy block merge
 * plus original contentType so we can write back without flattening HTML when possible.
 */
export async function getMicrosoftEventNotes(
  userId: number,
  eventId: string
): Promise<{
  text: string;
  contentType: "text" | "html";
  rawContent: string;
}> {
  if (!hasMicrosoftCalendarScope(userId)) {
    throw new Error("Microsoft-Kalender-Recht fehlt.");
  }
  const ev = await graphJson<GraphEventBody>(
    userId,
    `/me/events/${encodeURIComponent(eventId)}?$select=id,body`
  );
  const contentType =
    ev.body?.contentType?.toLowerCase() === "html" ? "html" : "text";
  const raw = ev.body?.content || "";
  const text =
    contentType === "html" ? htmlToRoughText(raw) : raw.trim();
  return { text, contentType, rawContent: raw };
}

/** Patch only the Outlook notes body. Subject/location untouched. */
export async function patchMicrosoftEventNotes(
  userId: number,
  input: {
    eventId: string;
    /** Full notes text after Buddy block merge */
    notesText: string;
    /** Prefer preserving HTML when the event already used HTML */
    contentType?: "text" | "html";
  }
): Promise<void> {
  if (!hasMicrosoftCalendarScope(userId)) {
    throw new Error("Microsoft-Kalender-Recht fehlt.");
  }
  const eventId = input.eventId.trim();
  if (!eventId) throw new Error("Event-ID fehlt.");

  const contentType = input.contentType || "text";
  const content =
    contentType === "html"
      ? textToHtmlParagraphs(input.notesText)
      : input.notesText;

  await graphJson(userId, `/me/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      body: {
        contentType: contentType === "html" ? "HTML" : "Text",
        content,
      },
    }),
  });
}
