import { getAppPublicUrlSetting } from "@/lib/app-url";
import { graphJson, MicrosoftGraphError } from "@/lib/microsoft/graph";
import {
  hasMicrosoftTeamsChatScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";

/** Teams «Chat with self» / Notes — fester Chat-Identifier. */
export const TEAMS_SELF_CHAT_ID = "48:notes";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absoluteBuddyHref(href: string | null | undefined): string | null {
  if (!href?.trim()) return null;
  const path = href.trim().startsWith("/") ? href.trim() : `/${href.trim()}`;
  const origin =
    getAppPublicUrlSetting() ||
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    null;
  if (!origin) return path;
  try {
    return new URL(path, origin.replace(/\/$/, "") + "/").toString();
  } catch {
    return path;
  }
}

export type TeamsSelfMessageResult =
  | { ok: true; messageId: string | null }
  | { ok: false; skipped: string }
  | { ok: false; error: string };

/**
 * Nachricht in den Teams-Selbstchat (Notes / «Chat with myself»).
 * Braucht delegated ChatMessage.Send oder Chat.ReadWrite.
 * Fehler werden nicht geworfen — Aufrufer kann fire-and-forget nutzen.
 */
export async function sendTeamsSelfMessage(
  userId: number,
  input: {
    headline: string;
    detail?: string | null;
    href?: string | null;
  }
): Promise<TeamsSelfMessageResult> {
  if (!isMicrosoftConnected(userId)) {
    return { ok: false, skipped: "not_connected" };
  }
  if (!hasMicrosoftTeamsChatScope(userId)) {
    return { ok: false, skipped: "no_teams_scope" };
  }

  const headline = (input.headline || "").trim() || "Buddy";
  const detail = (input.detail || "").trim();
  const link = absoluteBuddyHref(input.href);
  const parts = [
    `<p><b>${escapeHtml(headline)}</b></p>`,
    detail ? `<p>${escapeHtml(detail)}</p>` : "",
    link
      ? `<p><a href="${escapeHtml(link)}">In Buddy öffnen</a></p>`
      : "",
  ].filter(Boolean);

  try {
    const chatPath = `/me/chats/${encodeURIComponent(TEAMS_SELF_CHAT_ID)}/messages`;
    const created = await graphJson<{ id?: string }>(userId, chatPath, {
      method: "POST",
      body: JSON.stringify({
        body: {
          contentType: "html",
          content: parts.join(""),
        },
      }),
    });
    return { ok: true, messageId: created.id || null };
  } catch (err) {
    const message =
      err instanceof MicrosoftGraphError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, error: message };
  }
}

/** Fire-and-forget Wrapper für Hintergrund-Jobs. */
export function notifyTeamsSelfMessage(
  userId: number,
  input: {
    headline: string;
    detail?: string | null;
    href?: string | null;
  }
): void {
  void sendTeamsSelfMessage(userId, input).catch(() => {
    /* optional */
  });
}
