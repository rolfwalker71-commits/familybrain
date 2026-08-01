import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  isTriageAfterAnalysisEnabled,
  setTriageAfterAnalysisEnabled,
} from "@/lib/documents/triage-settings";
import {
  getTriageMailRecipientsRaw,
  isTriageMailEnabled,
  saveTriageMailSettings,
} from "@/lib/mail/triage-mail-settings";

export const TRIAGE_MASS_PAUSE_SNAPSHOT_SETTING = "triage_mass_pause_snapshot";

type TriageMassPauseSnapshot = {
  depth: number;
  triageAfterAnalysisEnabled: boolean;
  triageMailEnabled: boolean;
  triageMailRecipients: string;
  pausedAt: string;
};

function readSnapshot(): TriageMassPauseSnapshot | null {
  const raw = getSetting(TRIAGE_MASS_PAUSE_SNAPSHOT_SETTING)?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TriageMassPauseSnapshot>;
    if (
      typeof parsed.depth !== "number" ||
      parsed.depth < 1 ||
      typeof parsed.triageAfterAnalysisEnabled !== "boolean" ||
      typeof parsed.triageMailEnabled !== "boolean"
    ) {
      return null;
    }
    return {
      depth: parsed.depth,
      triageAfterAnalysisEnabled: parsed.triageAfterAnalysisEnabled,
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

/**
 * Temporarily disable triage inbox + triage mail for mass re-analysis.
 * Nested pauses share one snapshot (depth counter); only the outermost resume restores.
 */
export function pauseTriageForMassAnalysis(): {
  paused: boolean;
  depth: number;
} {
  const existing = readSnapshot();
  if (existing) {
    const next = { ...existing, depth: existing.depth + 1 };
    writeSnapshot(next);
    // Ensure flags stay off even if someone toggled mid-run
    setTriageAfterAnalysisEnabled(false);
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
  setTriageAfterAnalysisEnabled(false);
  saveTriageMailSettings({ enabled: false });
  return { paused: true, depth: 1 };
}

/**
 * Restore triage settings after mass analysis (including mail recipients).
 */
export function resumeTriageAfterMassAnalysis(): {
  resumed: boolean;
  depth: number;
  restored: boolean;
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
  setTriageAfterAnalysisEnabled(existing.triageAfterAnalysisEnabled);
  saveTriageMailSettings({
    enabled: existing.triageMailEnabled,
    recipients: existing.triageMailRecipients || null,
  });
  return { resumed: true, depth: 0, restored: true };
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
