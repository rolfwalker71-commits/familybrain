import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { getGmailMessage } from "@/lib/mail/gmail";
import { applyGmailStatusLabel } from "@/lib/mail/gmail-labels";
import { analyzeMailForActions } from "@/lib/mail/analyze-mail";
import { hasChatKey } from "@/lib/ai/client";
import { resolveStatusFromAnalysis } from "@/lib/mail/mail-heuristic";
import {
  listMailAnalysesByThread,
  upsertMailAnalysis,
} from "@/lib/mail/mail-analysis-store";
import {
  emailDomain,
  getMailSenderPref,
  senderPrefPromptLine,
} from "@/lib/mail/mail-sender-prefs";
import { findPatchableEventInThread } from "@/lib/mail/mail-applied-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function zurichToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google-Konto nicht verbunden." },
      { status: 400 }
    );
  }
  if (!hasChatKey()) {
    return NextResponse.json(
      { error: "Chat-/Analyse-API-Key fehlt (Einstellungen → KI-API)." },
      { status: 400 }
    );
  }
  try {
    const message = await getGmailMessage(userId, id, request);
    const domain = emailDomain(message.from);
    const pref = domain ? getMailSenderPref(userId, domain) : null;
    const siblings = listMailAnalysesByThread(
      userId,
      message.threadId || "",
      6
    ).filter((r) => r.messageId !== id);
    const threadContext =
      siblings.length > 0
        ? `Frühere Mails in diesem Thread:\n${siblings
            .map(
              (r) =>
                `- [${r.status}] ${r.subject || "(kein Betreff)"}: ${(r.summary || r.snippet || "—").slice(0, 160)}`
            )
            .join("\n")}`
        : null;
    const analysis = await analyzeMailForActions(message, zurichToday(), {
      threadContext,
      senderPrefLine: senderPrefPromptLine(pref),
      patchableEvent: findPatchableEventInThread(
        userId,
        message.threadId,
        message.subject
      ),
    });
    const status = resolveStatusFromAnalysis(analysis);
    const stored = upsertMailAnalysis({
      userId,
      messageId: id,
      provider: "google",
      threadId: message.threadId,
      subject: message.subject,
      fromName: message.fromName,
      fromEmail: message.from,
      snippet: message.snippet,
      status,
      relevance: analysis.relevance,
      summary: analysis.summary,
      analysis,
      suggestionCount: analysis.suggestions.length,
    });
    await applyGmailStatusLabel(userId, id, status, request).catch(
      () => undefined
    );
    if (analysis.suggestions.length > 0) {
      try {
        const { notifyAppChange } = await import("@/lib/realtime/notify");
        notifyAppChange({
          domain: "documents",
          reason: "mail_triage",
          headline: "Mail zur Triage",
          detail: analysis.summary || message.subject,
          title: message.subject || "Mail",
          href: `/google?open=${encodeURIComponent(id)}`,
          source: "buddy",
          aiIconUrl: null,
          category: "mail",
          meta: message.fromName || message.from || null,
        });
      } catch {
        /* optional */
      }
    }
    return NextResponse.json({ analysis, messageId: id, stored });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
