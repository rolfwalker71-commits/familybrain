import { analyzeDocument } from "@/lib/ai/analyze-document";
import { hasOpenAIKey } from "@/lib/ai/client";
import { listCompletedAnalysisDocumentIds } from "@/lib/db/queries";
import {
  AI_ICONS_MISSING_BATCH_SIZE,
  ANALYZE_PENDING_BATCH_SIZE,
  JOB_TYPE_AI_ICONS_MISSING,
  JOB_TYPE_AI_ICONS_REGENERATE,
  JOB_TYPE_ANALYZE_PENDING,
  JOB_TYPE_PAPERLESS_WRITEBACK,
  PAPERLESS_WRITEBACK_BATCH_SIZE,
} from "@/lib/jobs/constants";
import {
  addJobRunItem,
  claimPendingDocumentsForAnalysis,
  clearAnalysisClaimOnSuccess,
  countIncompleteAnalyses,
  finishJobRun,
  getDocumentContentHash,
  heartbeatJobRun,
  isJobRunStillActive,
  markAnalysisClaimFailed,
  recoverExpiredAnalysisClaims,
  recoverExpiredJobLeases,
  releaseAnalysisClaimAsPending,
  resetAllAnalysisErrors,
  requeueAllAnalysesForRerun,
  tryAcquireJobRun,
  updateJobRunSummary,
  type JobRunSummary,
  type JobTrigger,
} from "@/lib/jobs/queries";
import {
  countDocumentsEligibleForAiIcon,
  countDocumentsMissingAiIcon,
  generateDocumentAiIcon,
  isDocumentAiIconsEnabled,
  listDocumentIdsForAiIcon,
} from "@/lib/paperless/document-icon";
import { writebackAnalysisToPaperless } from "@/lib/paperless/writeback";
import {
  pauseTriageForMassAnalysis,
  resumeTriageAfterMassAnalysis,
} from "@/lib/documents/triage-mass-pause";

export type BackgroundRunResult =
  | {
      ok: true;
      runId: number;
      status: "success" | "error";
      summary: JobRunSummary;
      error?: string;
    }
  | {
      ok: false;
      status: "skipped";
      reason: string;
    };

async function assertNotCancelled(runId: number): Promise<boolean> {
  return isJobRunStillActive(runId);
}

export async function runAnalyzePendingJob(
  trigger: JobTrigger = "manual",
  options?: { resetErrors?: boolean; requeueAll?: boolean }
): Promise<BackgroundRunResult> {
  recoverExpiredJobLeases();
  recoverExpiredAnalysisClaims();

  if (!hasOpenAIKey()) {
    return {
      ok: false,
      status: "skipped",
      reason: "OpenAI API-Key fehlt.",
    };
  }

  const run = tryAcquireJobRun(trigger, JOB_TYPE_ANALYZE_PENDING);
  if (!run) {
    return {
      ok: false,
      status: "skipped",
      reason: "Ein anderer Hintergrund-Job läuft bereits.",
    };
  }

  const summary: JobRunSummary = {
    analyzed: 0,
    analysisFailed: 0,
    analysisSkipped: 0,
    succeeded: 0,
    failed: 0,
  };

  // Mass / full re-runs: suppress triage inbox + mail; restore afterwards
  const triagePaused =
    options?.requeueAll === true ||
    options?.resetErrors === true ||
    countIncompleteAnalyses() > 1;
  if (triagePaused) {
    pauseTriageForMassAnalysis();
  }

  try {
    let resetCount = 0;
    if (options?.requeueAll) {
      resetCount = requeueAllAnalysesForRerun();
      summary.errorsReset = resetCount;
    } else if (options?.resetErrors) {
      resetCount = resetAllAnalysisErrors();
      summary.errorsReset = resetCount;
    }

    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "running",
      title: "AI-Analyse",
      message: options?.requeueAll
        ? `Komplette Neuanalyse vorbereitet (${resetCount} zurückgesetzt), starte Analyse`
        : options?.resetErrors
          ? `Fehlerhafte zurückgesetzt (${resetCount}), starte Analyse`
          : "Starte Hintergrund-Analyse ausstehender Dokumente",
    });

    while (await assertNotCancelled(run.id)) {
      const claims = claimPendingDocumentsForAnalysis(ANALYZE_PENDING_BATCH_SIZE);
      if (claims.length === 0) break;

      for (const claim of claims) {
        if (!(await assertNotCancelled(run.id))) break;
        heartbeatJobRun(run.id);
        try {
          const currentHash = getDocumentContentHash(claim.documentId);
          if (
            claim.contentHash &&
            currentHash &&
            claim.contentHash !== currentHash
          ) {
            releaseAnalysisClaimAsPending(
              claim.documentId,
              "Inhalt während der Analyse geändert"
            );
            summary.analysisSkipped = (summary.analysisSkipped ?? 0) + 1;
            continue;
          }

          await analyzeDocument(claim.documentId);
          clearAnalysisClaimOnSuccess(claim.documentId);
          summary.analyzed = (summary.analyzed ?? 0) + 1;
          summary.succeeded = (summary.succeeded ?? 0) + 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          markAnalysisClaimFailed(
            claim.documentId,
            message,
            claim.attempts,
            false
          );
          summary.analysisFailed = (summary.analysisFailed ?? 0) + 1;
          summary.failed = (summary.failed ?? 0) + 1;
          addJobRunItem({
            runId: run.id,
            itemKind: "document",
            status: "error",
            title: claim.title,
            externalRef: String(claim.documentId),
            message,
          });
        }
      }

      summary.remaining = countIncompleteAnalyses();
      updateJobRunSummary(run.id, summary);
    }

    if (!(await assertNotCancelled(run.id))) {
      finishJobRun(run.id, "error", summary, "Manuell gestoppt");
      return {
        ok: true,
        runId: run.id,
        status: "error",
        summary,
        error: "Manuell gestoppt",
      };
    }

    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "success",
      title: "AI-Analyse",
      message: `${summary.succeeded ?? 0} analysiert, ${summary.failed ?? 0} fehlgeschlagen`,
    });
    finishJobRun(run.id, "success", summary);
    return { ok: true, runId: run.id, status: "success", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishJobRun(run.id, "error", summary, message);
    return {
      ok: true,
      runId: run.id,
      status: "error",
      summary,
      error: message,
    };
  } finally {
    if (triagePaused) {
      try {
        resumeTriageAfterMassAnalysis();
      } catch {
        /* best-effort */
      }
    }
  }
}

export async function runAiIconsMissingJob(
  trigger: JobTrigger = "manual"
): Promise<BackgroundRunResult> {
  return runAiIconsJob(trigger, { forceAll: false });
}

/** Explicit job: regenerate icons for every analyzed document (force). */
export async function runAiIconsRegenerateJob(
  trigger: JobTrigger = "manual"
): Promise<BackgroundRunResult> {
  return runAiIconsJob(trigger, { forceAll: true });
}

async function runAiIconsJob(
  trigger: JobTrigger,
  options: { forceAll: boolean }
): Promise<BackgroundRunResult> {
  recoverExpiredJobLeases();

  if (!isDocumentAiIconsEnabled()) {
    return {
      ok: false,
      status: "skipped",
      reason: "KI-Icons sind deaktiviert (Einstellungen → Paperless).",
    };
  }
  if (!hasOpenAIKey()) {
    return {
      ok: false,
      status: "skipped",
      reason: "OpenAI API-Key fehlt.",
    };
  }

  const jobType = options.forceAll
    ? JOB_TYPE_AI_ICONS_REGENERATE
    : JOB_TYPE_AI_ICONS_MISSING;
  const run = tryAcquireJobRun(trigger, jobType);
  if (!run) {
    return {
      ok: false,
      status: "skipped",
      reason: "Ein anderer Hintergrund-Job läuft bereits.",
    };
  }

  const remainingCount = () =>
    options.forceAll
      ? countDocumentsEligibleForAiIcon(0)
      : countDocumentsMissingAiIcon();

  const summary: JobRunSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    remaining: remainingCount(),
    afterId: 0,
  };

  const phaseTitle = options.forceAll
    ? "KI-Icons (alle neu)"
    : "KI-Icons (fehlend)";

  try {
    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "running",
      title: phaseTitle,
      message: options.forceAll
        ? `${summary.remaining ?? 0} Dokumente · ersetzt bestehende Icons`
        : `${summary.remaining ?? 0} fehlende Icons in der Queue`,
    });

    let afterId = 0;
    while (await assertNotCancelled(run.id)) {
      const ids = listDocumentIdsForAiIcon({
        limit: AI_ICONS_MISSING_BATCH_SIZE,
        afterId,
        onlyMissing: !options.forceAll,
      });
      if (ids.length === 0) break;

      for (const id of ids) {
        if (!(await assertNotCancelled(run.id))) break;
        heartbeatJobRun(run.id);
        try {
          await generateDocumentAiIcon(id, { force: options.forceAll });
          summary.succeeded = (summary.succeeded ?? 0) + 1;
        } catch (error) {
          summary.failed = (summary.failed ?? 0) + 1;
          addJobRunItem({
            runId: run.id,
            itemKind: "document",
            status: "error",
            externalRef: String(id),
            title: `Dokument #${id}`,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        summary.processed = (summary.processed ?? 0) + 1;
        afterId = id;
        summary.afterId = afterId;
        summary.remaining = options.forceAll
          ? countDocumentsEligibleForAiIcon(afterId)
          : countDocumentsMissingAiIcon();
        updateJobRunSummary(run.id, summary);
      }

      if (ids.length < AI_ICONS_MISSING_BATCH_SIZE) break;
    }

    if (!(await assertNotCancelled(run.id))) {
      finishJobRun(run.id, "error", summary, "Manuell gestoppt");
      return {
        ok: true,
        runId: run.id,
        status: "error",
        summary,
        error: "Manuell gestoppt",
      };
    }

    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "success",
      title: phaseTitle,
      message: options.forceAll
        ? `${summary.succeeded ?? 0} neu, ${summary.failed ?? 0} Fehler`
        : `${summary.succeeded ?? 0} ok, ${summary.failed ?? 0} Fehler · noch ${summary.remaining ?? 0} fehlend`,
    });
    finishJobRun(run.id, "success", summary);
    return { ok: true, runId: run.id, status: "success", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishJobRun(run.id, "error", summary, message);
    return {
      ok: true,
      runId: run.id,
      status: "error",
      summary,
      error: message,
    };
  }
}

export async function runPaperlessWritebackJob(
  trigger: JobTrigger = "manual"
): Promise<BackgroundRunResult> {
  recoverExpiredJobLeases();

  const run = tryAcquireJobRun(trigger, JOB_TYPE_PAPERLESS_WRITEBACK);
  if (!run) {
    return {
      ok: false,
      status: "skipped",
      reason: "Ein anderer Hintergrund-Job läuft bereits.",
    };
  }

  const summary: JobRunSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    afterId: 0,
  };

  try {
    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "running",
      title: "Paperless-Writeback",
      message: "Schreibe Analysen zurück nach Paperless",
    });

    let afterId = 0;
    while (await assertNotCancelled(run.id)) {
      const ids = listCompletedAnalysisDocumentIds(
        PAPERLESS_WRITEBACK_BATCH_SIZE,
        afterId
      );
      if (ids.length === 0) break;

      for (const id of ids) {
        if (!(await assertNotCancelled(run.id))) break;
        heartbeatJobRun(run.id);
        try {
          const result = await writebackAnalysisToPaperless(id);
          if (!result.ok) {
            summary.failed = (summary.failed ?? 0) + 1;
            addJobRunItem({
              runId: run.id,
              itemKind: "document",
              status: "error",
              externalRef: String(id),
              title: `Dokument #${id}`,
              message: result.error || "Writeback fehlgeschlagen",
            });
          } else {
            summary.succeeded = (summary.succeeded ?? 0) + 1;
          }
        } catch (error) {
          summary.failed = (summary.failed ?? 0) + 1;
          addJobRunItem({
            runId: run.id,
            itemKind: "document",
            status: "error",
            externalRef: String(id),
            title: `Dokument #${id}`,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        summary.processed = (summary.processed ?? 0) + 1;
        afterId = id;
        summary.afterId = afterId;
        if ((summary.processed ?? 0) % 10 === 0) {
          updateJobRunSummary(run.id, summary);
        }
      }

      updateJobRunSummary(run.id, summary);
      if (ids.length < PAPERLESS_WRITEBACK_BATCH_SIZE) break;
    }

    if (!(await assertNotCancelled(run.id))) {
      finishJobRun(run.id, "error", summary, "Manuell gestoppt");
      return {
        ok: true,
        runId: run.id,
        status: "error",
        summary,
        error: "Manuell gestoppt",
      };
    }

    try {
      const {
        drainTaxRelevantUdfBackfill,
        isTaxRelevantUdfBackfillDone,
      } = await import("@/lib/paperless/writeback");
      if (!isTaxRelevantUdfBackfillDone()) {
        addJobRunItem({
          runId: run.id,
          itemKind: "phase",
          status: "running",
          title: "Steuer-relevant UDF",
          message: "Befülle Paperless «Steuer relevant» aus Wissensrubrik",
        });
        const backfill = await drainTaxRelevantUdfBackfill({
          maxBatches: 100,
          batchSize: 40,
          onBatch: async () => {
            heartbeatJobRun(run.id);
          },
        });
        addJobRunItem({
          runId: run.id,
          itemKind: "phase",
          status: backfill.done ? "success" : "info",
          title: "Steuer-relevant UDF",
          message: `${backfill.succeeded} ok, ${backfill.failed} Fehler${
            backfill.done ? " — fertig" : " — Fortsetzung folgt"
          }`,
        });
      }
    } catch {
      /* optional one-time backfill */
    }

    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "success",
      title: "Paperless-Writeback",
      message: `${summary.succeeded ?? 0} ok, ${summary.failed ?? 0} Fehler (${summary.processed ?? 0} Dokumente)`,
    });
    finishJobRun(run.id, "success", summary);
    return { ok: true, runId: run.id, status: "success", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishJobRun(run.id, "error", summary, message);
    return {
      ok: true,
      runId: run.id,
      status: "error",
      summary,
      error: message,
    };
  }
}
