import { hasOpenAIKey } from "@/lib/ai/client";
import { getGmailMessage, type MailListItem } from "@/lib/mail/gmail";
import { applyGmailStatusLabel } from "@/lib/mail/gmail-labels";
import { analyzeMailForActions } from "@/lib/mail/analyze-mail";
import {
  shouldAnalyzeMail,
  resolveStatusFromAnalysis,
  type MailAnalysisStatus,
} from "@/lib/mail/mail-heuristic";
import {
  getMailAnalysesForMessages,
  listMailAnalysesByThread,
  upsertMailAnalysis,
} from "@/lib/mail/mail-analysis-store";
import {
  emailDomain,
  getMailSenderPref,
  senderPrefPromptLine,
} from "@/lib/mail/mail-sender-prefs";
import { findPatchableEventInThread } from "@/lib/mail/mail-applied-links";

function zurichToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function tagGmail(
  userId: number,
  messageId: string,
  status: MailAnalysisStatus,
  request?: Request | null
): Promise<void> {
  await applyGmailStatusLabel(userId, messageId, status, request).catch(
    () => undefined
  );
}

function buildThreadContext(
  userId: number,
  threadId: string | null | undefined,
  currentMessageId: string
): string | null {
  if (!threadId?.trim()) return null;
  const siblings = listMailAnalysesByThread(userId, threadId, 6).filter(
    (r) => r.messageId !== currentMessageId
  );
  if (siblings.length === 0) return null;
  const lines = siblings.map((r) => {
    const st = r.status;
    const sum = r.summary || r.snippet || "—";
    return `- [${st}] ${r.subject || "(kein Betreff)"}: ${sum.slice(0, 160)}`;
  });
  return `Frühere Mails in diesem Thread:\n${lines.join("\n")}`;
}

export type MailSyncResult = {
  examined: number;
  skippedHeuristic: number;
  analyzed: number;
  withSuggestions: number;
  errors: number;
  pendingAi: number;
};

/**
 * Analyze new mails from a list batch. Caps AI calls per invocation.
 * Already-stored message ids are left untouched (except skipped→retry / error).
 */
export async function syncMailAnalysesForItems(
  userId: number,
  items: MailListItem[],
  options?: {
    maxAi?: number;
    request?: Request | null;
  }
): Promise<MailSyncResult> {
  const maxAi = Math.max(0, options?.maxAi ?? 3);
  const existing = getMailAnalysesForMessages(
    userId,
    items.map((i) => i.id)
  );

  const result: MailSyncResult = {
    examined: 0,
    skippedHeuristic: 0,
    analyzed: 0,
    withSuggestions: 0,
    errors: 0,
    pendingAi: 0,
  };

  const candidates = items.filter((i) => {
    if (!i.id) return false;
    const ex = existing.get(i.id);
    const domain = emailDomain(i.from);
    const pref = domain ? getMailSenderPref(userId, domain) : null;
    const prefCounts = pref
      ? {
          appliedCount: pref.appliedCount,
          dismissedCount: pref.dismissedCount,
        }
      : null;
    if (!ex) return true;
    if (ex.status === "error") return true;
    if (ex.status === "skipped") {
      return shouldAnalyzeMail(
        {
          from: i.from,
          fromName: i.fromName,
          subject: i.subject,
          snippet: i.snippet,
        },
        prefCounts
      );
    }
    return false;
  });
  if (candidates.length === 0) return result;

  let aiBudget = maxAi;
  const openaiOk = hasOpenAIKey();

  for (const item of candidates) {
    result.examined += 1;
    const domain = emailDomain(item.from);
    const pref = domain ? getMailSenderPref(userId, domain) : null;
    const prefCounts = pref
      ? {
          appliedCount: pref.appliedCount,
          dismissedCount: pref.dismissedCount,
        }
      : null;
    const interesting = shouldAnalyzeMail(
      {
        from: item.from,
        fromName: item.fromName,
        subject: item.subject,
        snippet: item.snippet,
      },
      prefCounts
    );

    if (!interesting) {
      upsertMailAnalysis({
        userId,
        messageId: item.id,
        threadId: item.threadId,
        subject: item.subject,
        fromName: item.fromName,
        fromEmail: item.from,
        snippet: item.snippet,
        status: "skipped",
        summary: "Kein Handlungsbedarf erkannt (Heuristik).",
        suggestionCount: 0,
      });
      await tagGmail(userId, item.id, "skipped", options?.request);
      result.skippedHeuristic += 1;
      continue;
    }

    if (!openaiOk || aiBudget <= 0) {
      result.pendingAi += 1;
      continue;
    }

    aiBudget -= 1;
    try {
      const detail = await getGmailMessage(
        userId,
        item.id,
        options?.request
      );
      const threadId = item.threadId || detail.threadId;
      const analysis = await analyzeMailForActions(detail, zurichToday(), {
        threadContext: buildThreadContext(userId, threadId, item.id),
        senderPrefLine: senderPrefPromptLine(pref),
        patchableEvent: findPatchableEventInThread(userId, threadId),
      });
      const status = resolveStatusFromAnalysis(analysis);
      upsertMailAnalysis({
        userId,
        messageId: item.id,
        threadId,
        subject: detail.subject,
        fromName: detail.fromName,
        fromEmail: detail.from,
        snippet: detail.snippet,
        status,
        relevance: analysis.relevance,
        summary: analysis.summary,
        analysis,
        suggestionCount: analysis.suggestions.length,
      });
      await tagGmail(userId, item.id, status, options?.request);
      result.analyzed += 1;
      if (analysis.suggestions.length > 0) result.withSuggestions += 1;
    } catch (error) {
      upsertMailAnalysis({
        userId,
        messageId: item.id,
        threadId: item.threadId,
        subject: item.subject,
        fromName: item.fromName,
        fromEmail: item.from,
        snippet: item.snippet,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        suggestionCount: 0,
      });
      await tagGmail(userId, item.id, "error", options?.request);
      result.errors += 1;
    }
  }

  return result;
}
