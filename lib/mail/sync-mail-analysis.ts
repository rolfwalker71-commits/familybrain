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
  upsertMailAnalysis,
} from "@/lib/mail/mail-analysis-store";

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
    if (!ex) return true;
    if (ex.status === "error") return true;
    if (ex.status === "skipped") {
      return shouldAnalyzeMail({
        from: i.from,
        fromName: i.fromName,
        subject: i.subject,
        snippet: i.snippet,
      });
    }
    return false;
  });
  if (candidates.length === 0) return result;

  let aiBudget = maxAi;
  const openaiOk = hasOpenAIKey();

  for (const item of candidates) {
    result.examined += 1;
    const interesting = shouldAnalyzeMail({
      from: item.from,
      fromName: item.fromName,
      subject: item.subject,
      snippet: item.snippet,
    });

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
      const analysis = await analyzeMailForActions(detail, zurichToday());
      const status = resolveStatusFromAnalysis(analysis);
      upsertMailAnalysis({
        userId,
        messageId: item.id,
        threadId: item.threadId || detail.threadId,
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
