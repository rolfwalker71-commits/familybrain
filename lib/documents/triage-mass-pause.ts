import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  isTriageAfterAnalysisEnabled,
  setTriageAfterAnalysisEnabled,
} from "@/lib/documents/triage-settings";
import { backfillTriageForAnalyzedDocuments } from "@/lib/documents/triage-backfill";
import {
  getTriageMailRecipientsRaw,
  isTriageMailEnabled,
  saveTriageMailSettings,
} from "@/lib/mail/triage-mail-settings";

export const TRIAGE_MASS_PAUSE_SNAPSHOT_SETTING = "triage_mass_pause_snapshot";

/**
 * Mass analysis pauses **mail only**. Triage status is always written so
 * nothing falls through; inbox may fill during backlog runs.
 */
type TriageMassPauseSnapshot = {
  depth: number;
  /** Pre-pause value — restored on resume (legacy pauses also flipped the setting). */
  triageAfterAnalysisEnabled: boolean;
  triageMailEnabled: boolean;
  triageMailRecipients: string;
  pausedAt: string;
};

export type TriageBackfillSummary = {
  scanned: number;
  queued: number;
  skipped: number;
  pay: number;
};

function readSnapshot(): TriageMassPauseSnapshot | null {
  const raw = getSetting(TRIAGE_MASS_PAUSE_SNAPSHOT_SETTING)?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TriageMassPauseSnapshot>;
    if (
      typeof parsed.depth !== "number" ||
      parsed.depth < 1 ||
      typeof parsed.triageMailEnabled !== "boolean"
    ) {
      return null;
    }
    return {
      depth: parsed.depth,
      triageAfterAnalysisEnabled:
        typeof parsed.triageAfterAnalysisEnabled === "boolean"
          ? parsed.triageAfterAnalysisEnabled
          : true,
      triageMailEnabled: parsed.triageMailEnabled,
      triageMailRecipients:
        typeof parsed.triageMailRecipients === "string"
          ? parsed.triageMailRecipients
          : "",
      pausedAt:
        typeof parsed.pausedAt === "string"
          ? parsed.pausedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: TriageMassPauseSnapshot | null): void {
  setSetting(
    TRIAGE_MASS_PAUSE_SNAPSHOT_SETTING,
    snapshot ? JSON.stringify(snapshot) : null
  );
}

export function isTriageMassPaused(): boolean {
  return readSnapshot() != null;
}

/** True when triage mail should be suppressed (mass run in progress). */
export function isTriageMailPausedForMassAnalysis(): boolean {
  return isTriageMassPaused();
}

/**
 * Temporarily disable triage **mail** for mass re-analysis.
 * Nested pauses share one snapshot (depth); only outermost resume restores mail.
 * Does not disable triage enqueue / status writes.
 */
export function pauseTriageForMassAnalysis(): {
  paused: boolean;
  depth: number;
} {
  const existing = readSnapshot();
  if (existing) {
    const next = { ...existing, depth: existing.depth + 1 };
    writeSnapshot(next);
    saveTriageMailSettings({ enabled: false });
    return { paused: true, depth: next.depth };
  }

  const snapshot: TriageMassPauseSnapshot = {
    depth: 1,
    triageAfterAnalysisEnabled: isTriageAfterAnalysisEnabled(),
    triageMailEnabled: isTriageMailEnabled(),
    triageMailRecipients: getTriageMailRecipientsRaw(),
    pausedAt: new Date().toISOString(),
  };
  writeSnapshot(snapshot);
  saveTriageMailSettings({ enabled: false });
  return { paused: true, depth: 1 };
}

function restoreFromSnapshot(snapshot: TriageMassPauseSnapshot): void {
  setTriageAfterAnalysisEnabled(snapshot.triageAfterAnalysisEnabled);
  saveTriageMailSettings({
    enabled: snapshot.triageMailEnabled,
    recipients: snapshot.triageMailRecipients || null,
  });
}

/**
 * Restore triage mail after mass analysis and backfill missing triage statuses.
 */
export function resumeTriageAfterMassAnalysis(): {
  resumed: boolean;
  depth: number;
  restored: boolean;
  backfill?: TriageBackfillSummary;
} {
  const existing = readSnapshot();
  if (!existing) {
    return { resumed: false, depth: 0, restored: false };
  }

  if (existing.depth > 1) {
    const next = { ...existing, depth: existing.depth - 1 };
    writeSnapshot(next);
    return { resumed: true, depth: next.depth, restored: false };
  }

  writeSnapshot(null);
  restoreFromSnapshot(existing);
  const backfill = backfillTriageForAnalyzedDocuments({ limit: 500 });
  return { resumed: true, depth: 0, restored: true, backfill };
}

/** Force-clear a stuck mass pause and restore settings + backfill triage. */
export function forceResumeTriageMassPause(): {
  resumed: boolean;
  backfill: TriageBackfillSummary;
} {
  const existing = readSnapshot();
  writeSnapshot(null);
  if (existing) {
    restoreFromSnapshot(existing);
  } else if (!isTriageAfterAnalysisEnabled()) {
    // Stuck off without snapshot — re-enable triage so status can be written
    setTriageAfterAnalysisEnabled(true);
  }
  const backfill = backfillTriageForAnalyzedDocuments({ limit: 500 });
  return { resumed: Boolean(existing), backfill };
}

export function getTriageMassPausePublic() {
  const snapshot = readSnapshot();
  if (!snapshot) {
    return {
      triageMassPaused: false as const,
      triageMassPauseRestores: null,
    };
  }
  return {
    triageMassPaused: true as const,
    triageMassPauseRestores: {
      triageAfterAnalysisEnabled: snapshot.triageAfterAnalysisEnabled,
      triageMailEnabled: snapshot.triageMailEnabled,
      triageMailRecipients: snapshot.triageMailRecipients,
      pausedAt: snapshot.pausedAt,
    },
  };
}
