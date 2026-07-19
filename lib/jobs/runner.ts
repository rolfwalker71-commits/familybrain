import { analyzeDocument } from "@/lib/ai/analyze-document";
import { hasOpenAIKey } from "@/lib/ai/client";
import { syncPaperlessDocuments } from "@/lib/paperless/sync";
import {
  INITIAL_ANALYSIS_BATCH_SIZE,
  MAX_ANALYSIS_PER_RUN,
} from "./constants";
import {
  addJobRunItem,
  claimPendingDocumentsForAnalysis,
  clearAnalysisClaimOnSuccess,
  countIncompleteAnalyses,
  finishJobRun,
  getDocumentContentHash,
  getInitialIngestionComplete,
  getInitialSyncComplete,
  heartbeatJobRun,
  markAnalysisClaimFailed,
  recoverExpiredAnalysisClaims,
  recoverExpiredJobLeases,
  releaseAnalysisClaimAsPending,
  resetTerminalAnalysisErrorsForInitial,
  setInitialIngestionComplete,
  setInitialSyncComplete,
  tryAcquireJobRun,
  type AnalysisClaim,
  type JobRunSummary,
  type JobTrigger,
} from "./queries";

export type RunJobResult =
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

export async function runSyncAnalyzeJob(
  trigger: JobTrigger,
  options?: { syncMode?: "auto" | "full" | "delta"; analyzeLimit?: number }
): Promise<RunJobResult> {
  recoverExpiredJobLeases();
  recoverExpiredAnalysisClaims();

  const run = tryAcquireJobRun(trigger);
  if (!run) {
    return {
      ok: false,
      status: "skipped",
      reason: "Ein anderer Sync-/Analyse-Lauf ist bereits aktiv.",
    };
  }

  const initialRun = !getInitialIngestionComplete();
  const summary: JobRunSummary = {
    initialRun,
    initialComplete: !initialRun,
    analyzed: 0,
    analysisFailed: 0,
    analysisSkipped: 0,
  };

  try {
    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "running",
      title: "Paperless-Sync",
      message: initialRun
        ? "Starte Initial-Synchronisation"
        : "Starte Synchronisation",
    });

    if (initialRun) {
      resetTerminalAnalysisErrorsForInitial();
    }

    const requestedSyncMode = initialRun
      ? getInitialSyncComplete()
        ? "delta"
        : "full"
      : (options?.syncMode ?? "auto");

    let syncResult = await syncPaperlessDocuments({
      mode: requestedSyncMode,
      onProgress: (progress) => {
        if (progress.phase === "syncing" && progress.processed % 25 === 0) {
          heartbeatJobRun(run.id);
        }
      },
    });

    heartbeatJobRun(run.id);

    summary.syncMode = syncResult.mode;
    summary.totalRemote = syncResult.totalRemote;
    summary.processed = syncResult.processed;
    summary.created = syncResult.created;
    summary.updated = syncResult.updated;
    summary.unchanged = syncResult.unchanged;
    summary.missing = syncResult.missing;
    summary.syncErrors = syncResult.errors.length;
    summary.cursorAdvancedTo = syncResult.cursorAdvancedTo;
    summary.idReconciled = syncResult.idReconciled;
    summary.fullReconciled = syncResult.fullReconciled;

    if (
      initialRun &&
      syncResult.mode === "full" &&
      syncResult.errors.length === 0
    ) {
      setInitialSyncComplete(true);
    }

    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: syncResult.errors.length ? "error" : "success",
      title: "Paperless-Sync",
      message: `${syncResult.mode}: ${syncResult.created} neu, ${syncResult.updated} aktualisiert, ${syncResult.missing} fehlend`,
      payload: {
        processed: syncResult.processed,
        errors: syncResult.errors.slice(0, 20),
      },
    });

    if (!hasOpenAIKey()) {
      throw new Error(
        "OpenAI API-Key fehlt. Die Hintergrundanalyse startet nach dem Speichern des Keys automatisch erneut."
      );
    }

    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "running",
      title: "AI-Analyse",
      message: initialRun
        ? "Initialanalyse: alle Dokumente werden abgearbeitet"
        : "Starte Analyse ausstehender Dokumente",
    });

    const analyzeClaims = async (claims: AnalysisClaim[]) => {
      for (const claim of claims) {
        heartbeatJobRun(run.id);
        try {
          const currentHash = getDocumentContentHash(claim.documentId);
          if (
            claim.contentHash != null &&
            currentHash != null &&
            claim.contentHash !== currentHash
          ) {
            releaseAnalysisClaimAsPending(
              claim.documentId,
              "Inhalt während der Analyse geändert"
            );
            summary.analysisSkipped = (summary.analysisSkipped ?? 0) + 1;
            addJobRunItem({
              runId: run.id,
              itemKind: "document",
              status: "info",
              title: claim.title,
              externalRef: String(claim.documentId),
              message: "Übersprungen: Inhalt hat sich geändert",
            });
            continue;
          }

          await analyzeDocument(claim.documentId, {
            expectedContentHash: claim.contentHash,
            manageErrorStatus: false,
          });
          clearAnalysisClaimOnSuccess(claim.documentId);
          summary.analyzed = (summary.analyzed ?? 0) + 1;
          addJobRunItem({
            runId: run.id,
            itemKind: "document",
            status: "success",
            title: claim.title,
            externalRef: String(claim.documentId),
            message: "Analysiert",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("CONTENT_HASH_MISMATCH")) {
            releaseAnalysisClaimAsPending(
              claim.documentId,
              "Inhalt während der Analyse geändert"
            );
            summary.analysisSkipped = (summary.analysisSkipped ?? 0) + 1;
            addJobRunItem({
              runId: run.id,
              itemKind: "document",
              status: "info",
              title: claim.title,
              externalRef: String(claim.documentId),
              message: "Übersprungen: Inhalt hat sich geändert",
            });
            continue;
          }

          markAnalysisClaimFailed(
            claim.documentId,
            message,
            claim.attempts,
            initialRun
          );
          summary.analysisFailed = (summary.analysisFailed ?? 0) + 1;
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
    };

    const drainAnalysisQueue = async () => {
      while (true) {
        const claims = claimPendingDocumentsForAnalysis(
          INITIAL_ANALYSIS_BATCH_SIZE
        );
        if (claims.length === 0) break;
        await analyzeClaims(claims);
      }
    };

    if (initialRun) {
      await drainAnalysisQueue();

      // Catch documents added/changed while the long initial analysis ran.
      if (getInitialSyncComplete()) {
        const finalDelta = await syncPaperlessDocuments({ mode: "delta" });
        heartbeatJobRun(run.id);
        summary.totalRemote =
          (summary.totalRemote ?? 0) + finalDelta.totalRemote;
        summary.processed = (summary.processed ?? 0) + finalDelta.processed;
        summary.created = (summary.created ?? 0) + finalDelta.created;
        summary.updated = (summary.updated ?? 0) + finalDelta.updated;
        summary.unchanged = (summary.unchanged ?? 0) + finalDelta.unchanged;
        summary.missing = (summary.missing ?? 0) + finalDelta.missing;
        summary.syncErrors =
          (summary.syncErrors ?? 0) + finalDelta.errors.length;
        summary.cursorAdvancedTo = finalDelta.cursorAdvancedTo;
        syncResult = finalDelta;
        await drainAnalysisQueue();
      }
    } else {
      const claims = claimPendingDocumentsForAnalysis(
        options?.analyzeLimit ?? MAX_ANALYSIS_PER_RUN
      );
      await analyzeClaims(claims);
    }

    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "success",
      title: "AI-Analyse",
      message: `${summary.analyzed ?? 0} analysiert, ${summary.analysisFailed ?? 0} fehlgeschlagen`,
    });

    const incomplete = initialRun ? countIncompleteAnalyses() : 0;
    const hardFailure =
      (summary.syncErrors ?? 0) > 0 &&
      (summary.created ?? 0) +
        (summary.updated ?? 0) +
        (summary.unchanged ?? 0) ===
        0;

    if (initialRun && (incomplete > 0 || (summary.syncErrors ?? 0) > 0)) {
      const message =
        incomplete > 0
          ? `Initialanalyse unvollständig: ${incomplete} Dokumente offen oder fehlerhaft`
          : (syncResult.errors[0] ?? "Initialer Sync fehlgeschlagen");
      finishJobRun(run.id, "error", summary, message);
      return {
        ok: true,
        runId: run.id,
        status: "error",
        summary,
        error: message,
      };
    }

    if (initialRun) {
      setInitialIngestionComplete(true);
      summary.initialComplete = true;
    }

    if (hardFailure) {
      finishJobRun(
        run.id,
        "error",
        summary,
        syncResult.errors[0] ?? "Sync fehlgeschlagen"
      );
      return {
        ok: true,
        runId: run.id,
        status: "error",
        summary,
        error: syncResult.errors[0],
      };
    }

    finishJobRun(run.id, "success", summary);
    return { ok: true, runId: run.id, status: "success", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addJobRunItem({
      runId: run.id,
      itemKind: "message",
      status: "error",
      title: "Lauf abgebrochen",
      message,
    });
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
