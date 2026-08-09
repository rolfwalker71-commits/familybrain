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
  JOB_TYPE_DRIVE_MIRROR,
  JOB_TYPE_O365_PDF_BACKFILL,
  JOB_TYPE_O365_PDF_LIVE,
  DRIVE_MIRROR_BATCH_SIZE,
  MAX_DRIVE_MIRROR_PER_RUN,
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

  // Mass / full re-runs: suppress triage mail only; status still written
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

export async function runDriveMirrorJob(
  trigger: JobTrigger = "manual"
): Promise<BackgroundRunResult> {
  recoverExpiredJobLeases();

  const {
    getDriveMirrorStatus,
    isDriveMirrorEnabled,
    mirrorDocumentToDrive,
    resolveDriveMirrorUserId,
    DRIVE_MIRROR_LAST_ERROR_KEY,
    DRIVE_MIRROR_LAST_RUN_KEY,
  } = await import("@/lib/buddy/drive-mirror");
  const { setSetting } = await import("@/lib/db/migrations");
  const { listDocumentIdsMissingDriveMirror } = await import(
    "@/lib/buddy/source-links"
  );
  const { hasGoogleDriveScope } = await import("@/lib/google/oauth");

  if (!isDriveMirrorEnabled()) {
    return {
      ok: false,
      status: "skipped",
      reason: "Drive-Spiegel ist deaktiviert.",
    };
  }

  const userId = resolveDriveMirrorUserId();
  if (userId == null || !hasGoogleDriveScope(userId)) {
    return {
      ok: false,
      status: "skipped",
      reason:
        "Google Drive-Recht fehlt — unter Konto Google neu verbinden (drive.file).",
    };
  }

  const run = tryAcquireJobRun(trigger, JOB_TYPE_DRIVE_MIRROR);
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
    const before = getDriveMirrorStatus();
    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "running",
      title: "Drive-Spiegel",
      message: `${before.pending} Dokumente ausstehend · ${before.mirrored}/${before.totalDocuments} bereits gespiegelt`,
    });

    setSetting(DRIVE_MIRROR_LAST_RUN_KEY, new Date().toISOString());
    setSetting(DRIVE_MIRROR_LAST_ERROR_KEY, null);

    let processedThisRun = 0;
    while (
      (await assertNotCancelled(run.id)) &&
      processedThisRun < MAX_DRIVE_MIRROR_PER_RUN
    ) {
      const batch = listDocumentIdsMissingDriveMirror(DRIVE_MIRROR_BATCH_SIZE);
      if (batch.length === 0) break;

      for (const id of batch) {
        if (!(await assertNotCancelled(run.id))) break;
        if (processedThisRun >= MAX_DRIVE_MIRROR_PER_RUN) break;
        heartbeatJobRun(run.id);
        summary.processed = (summary.processed || 0) + 1;
        processedThisRun += 1;
        try {
          const result = await mirrorDocumentToDrive(id, { userId });
          if (result.ok) {
            summary.succeeded = (summary.succeeded || 0) + 1;
          } else {
            summary.failed = (summary.failed || 0) + 1;
            addJobRunItem({
              runId: run.id,
              itemKind: "document",
              externalRef: String(id),
              status: "error",
              title: `Dokument #${id}`,
              message: result.skipped || "fehlgeschlagen",
            });
          }
        } catch (error) {
          summary.failed = (summary.failed || 0) + 1;
          const msg = error instanceof Error ? error.message : String(error);
          setSetting(DRIVE_MIRROR_LAST_ERROR_KEY, msg);
          addJobRunItem({
            runId: run.id,
            itemKind: "document",
            externalRef: String(id),
            status: "error",
            title: `Dokument #${id}`,
            message: msg,
          });
        }
        updateJobRunSummary(run.id, summary);
      }
    }

    const after = getDriveMirrorStatus();
    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "success",
      title: "Drive-Spiegel",
      message: `${summary.succeeded ?? 0} ok, ${summary.failed ?? 0} Fehler · Stand ${after.mirrored}/${after.totalDocuments} (${after.percent}%)`,
    });
    finishJobRun(run.id, "success", summary);
    return { ok: true, runId: run.id, status: "success", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSetting(DRIVE_MIRROR_LAST_ERROR_KEY, message);
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

export async function runO365PdfBackfillJob(
  trigger: JobTrigger = "manual"
): Promise<BackgroundRunResult> {
  recoverExpiredJobLeases();

  const {
    getO365PdfBackfillStatus,
    runO365PdfBackfillBatch,
    configureO365PdfBackfill,
    setO365PdfBackfillNote,
    setO365PdfBackfillAttemptNow,
    O365_PDF_BACKFILL_LAST_ERROR_KEY,
    O365_PDF_BACKFILL_PROGRESS_KEY,
  } = await import("@/lib/microsoft/mail-paperless-backfill");
  const { setSetting } = await import("@/lib/db/migrations");
  const {
    hasMicrosoftMailScope,
    isMicrosoftConnected,
  } = await import("@/lib/microsoft/oauth");
  const { findRolfAppUserId } = await import("@/lib/calendar/ics-calendars");

  const status = getO365PdfBackfillStatus();
  if (!status.enabled && trigger === "schedule") {
    const note = status.lastNote || "";
    if (
      !/gestoppt|pausiert|manuell gestoppt/i.test(note) &&
      !status.complete
    ) {
      setO365PdfBackfillNote(
        "Übersprungen: Crawl ist nicht aktiv (pausiert/fertig)."
      );
    }
    return {
      ok: false,
      status: "skipped",
      reason: "O365-PDF-Backfill ist nicht aktiv.",
    };
  }

  const userId = findRolfAppUserId();
  if (userId == null || !isMicrosoftConnected(userId) || !hasMicrosoftMailScope(userId)) {
    const reason = "Microsoft Mail nicht verbunden oder Scope fehlt.";
    setSetting(O365_PDF_BACKFILL_LAST_ERROR_KEY, reason);
    setO365PdfBackfillNote(`Job gestoppt: ${reason}`);
    setO365PdfBackfillAttemptNow();
    return {
      ok: false,
      status: "skipped",
      reason,
    };
  }

  const run = tryAcquireJobRun(trigger, JOB_TYPE_O365_PDF_BACKFILL);
  if (!run) {
    const reason = "Ein anderer Hintergrund-Job läuft bereits.";
    // Manual start should still arm catch-up even if lease is busy.
    if (trigger === "manual" && !status.enabled) {
      configureO365PdfBackfill({ enabled: true });
    }
    setO365PdfBackfillNote(`Wartet: ${reason}`);
    setO365PdfBackfillAttemptNow();
    // Continuity: keep trying while catch-up is enabled (don't die on busy lease).
    const {
      isO365PdfBackfillEnabled,
      scheduleO365PdfBackfillChain,
      O365_PDF_BACKFILL_CHAIN_RETRY_MS,
    } = await import("@/lib/microsoft/mail-paperless-backfill");
    if (isO365PdfBackfillEnabled()) {
      scheduleO365PdfBackfillChain(() => {
        void runO365PdfBackfillJob("schedule").catch((error) => {
          console.warn("[o365-backfill] lease-retry chain:", error);
        });
      }, O365_PDF_BACKFILL_CHAIN_RETRY_MS);
    }
    return {
      ok: false,
      status: "skipped",
      reason,
    };
  }

  const summary: JobRunSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    remaining: status.hasCursor || status.enabled ? 1 : 0,
  };

  try {
    if (trigger === "manual" && !status.enabled) {
      configureO365PdfBackfill({ enabled: true });
    }

    const batch = await runO365PdfBackfillBatch(userId);
    summary.processed = batch.messagesSeen;
    summary.succeeded = batch.pdfsUploaded;
    summary.failed = batch.pdfsFailed;
    summary.remaining = batch.done ? 0 : 1;

    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: "success",
      title: "O365 → Paperless",
      message: `${batch.pdfsUploaded} neu, ${batch.pdfsSkipped} übersprungen, ${batch.pdfsFailed} Fehler · ${batch.messagesSeen} Mails m. Anhang (${batch.messagesWithPdf} mit PDF) · ${batch.done ? "fertig" : "Fortsetzung folgt"}`,
    });
    finishJobRun(run.id, "success", summary);

    // Catch-up: verkettet nur wenn noch aktiv (Stop bricht die Kette ab).
    if (!batch.done && !batch.stopped) {
      const {
        getO365PdfBackfillStatus: getStatus,
        isO365PdfBackfillEnabled,
        scheduleO365PdfBackfillChain,
        O365_PDF_BACKFILL_CHAIN_DELAY_MS,
      } = await import("@/lib/microsoft/mail-paperless-backfill");
      if (isO365PdfBackfillEnabled() && getStatus().enabled) {
        scheduleO365PdfBackfillChain(() => {
          void runO365PdfBackfillJob("schedule").catch((error) => {
            console.warn("[o365-backfill] chain:", error);
          });
        }, O365_PDF_BACKFILL_CHAIN_DELAY_MS);
      }
    }

    return { ok: true, runId: run.id, status: "success", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSetting(O365_PDF_BACKFILL_LAST_ERROR_KEY, message);
    setO365PdfBackfillNote(`Fehler: ${message}`);
    setSetting(O365_PDF_BACKFILL_PROGRESS_KEY, null);
    finishJobRun(run.id, "error", summary, message);

    // Soft retry so a single Graph/Paperless blip doesn't kill catch-up.
    const {
      isO365PdfBackfillEnabled,
      scheduleO365PdfBackfillChain,
      O365_PDF_BACKFILL_CHAIN_RETRY_MS,
    } = await import("@/lib/microsoft/mail-paperless-backfill");
    if (isO365PdfBackfillEnabled()) {
      scheduleO365PdfBackfillChain(() => {
        void runO365PdfBackfillJob("schedule").catch((err) => {
          console.warn("[o365-backfill] error-retry chain:", err);
        });
      }, O365_PDF_BACKFILL_CHAIN_RETRY_MS);
    }

    return {
      ok: true,
      runId: run.id,
      status: "error",
      summary,
      error: message,
    };
  }
}

export async function runO365PdfLiveJob(
  trigger: JobTrigger = "manual"
): Promise<BackgroundRunResult> {
  recoverExpiredJobLeases();

  const {
    getO365PdfLiveStatus,
    isO365PdfLiveEnabled,
    isO365PdfLiveDue,
    isO365PdfBackfillBlockingLive,
    runO365PdfLiveBatch,
    O365_PDF_LIVE_LAST_ERROR_KEY,
    O365_PDF_LIVE_LAST_NOTE_KEY,
  } = await import("@/lib/microsoft/mail-paperless-live");
  const { setSetting } = await import("@/lib/db/migrations");
  const {
    hasMicrosoftMailScope,
    isMicrosoftConnected,
  } = await import("@/lib/microsoft/oauth");
  const { findRolfAppUserId } = await import("@/lib/calendar/ics-calendars");

  if (!isO365PdfLiveEnabled()) {
    return {
      ok: false,
      status: "skipped",
      reason: "O365-PDF-Live-Import ist aus.",
    };
  }

  if (isO365PdfBackfillBlockingLive()) {
    setSetting(
      O365_PDF_LIVE_LAST_NOTE_KEY,
      "Übersprungen: historischer Catch-up ist aktiv — Live wartet."
    );
    return {
      ok: false,
      status: "skipped",
      reason: "Catch-up aktiv — Live wartet.",
    };
  }

  if (trigger === "schedule" && !isO365PdfLiveDue()) {
    return {
      ok: false,
      status: "skipped",
      reason: "Live-Import noch nicht fällig.",
    };
  }

  const userId = findRolfAppUserId();
  if (
    userId == null ||
    !isMicrosoftConnected(userId) ||
    !hasMicrosoftMailScope(userId)
  ) {
    const reason = "Microsoft Mail nicht verbunden oder Scope fehlt.";
    setSetting(O365_PDF_LIVE_LAST_ERROR_KEY, reason);
    return {
      ok: false,
      status: "skipped",
      reason,
    };
  }

  const run = tryAcquireJobRun(trigger, JOB_TYPE_O365_PDF_LIVE);
  if (!run) {
    return {
      ok: false,
      status: "skipped",
      reason: "Ein anderer Hintergrund-Job läuft bereits.",
    };
  }

  const status = getO365PdfLiveStatus();
  const summary: JobRunSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    remaining: 0,
  };

  try {
    const batch = await runO365PdfLiveBatch(userId);
    summary.processed = batch.messagesSeen;
    summary.succeeded = batch.pdfsUploaded;
    summary.failed = batch.pdfsFailed;

    addJobRunItem({
      runId: run.id,
      itemKind: "phase",
      status: batch.skipped ? "info" : "success",
      title: "O365 Live → Paperless",
      message: batch.skipped
        ? `Übersprungen (${batch.skipped}) · Intervall ${status.intervalMinutes} Min`
        : `${batch.pdfsUploaded} neu, ${batch.pdfsSkipped} übersprungen, ${batch.pdfsFailed} Fehler · ${batch.messagesSeen} Mails`,
    });
    finishJobRun(run.id, "success", summary);
    return { ok: true, runId: run.id, status: "success", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSetting(O365_PDF_LIVE_LAST_ERROR_KEY, message);
    setSetting(O365_PDF_LIVE_LAST_NOTE_KEY, `Fehler: ${message}`);
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
