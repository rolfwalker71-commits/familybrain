import { getSetting, setSetting } from "@/lib/db/migrations";

export const TRIAGE_AFTER_ANALYSIS_ENABLED_SETTING =
  "triage_after_analysis_enabled";

/**
 * When false, analysis does not enqueue documents into the triage inbox
 * (useful during mass re-analysis). Default: on.
 */
export function isTriageAfterAnalysisEnabled(): boolean {
  const raw = getSetting(TRIAGE_AFTER_ANALYSIS_ENABLED_SETTING)?.trim();
  if (raw == null || raw === "") return true;
  return raw === "1" || raw.toLowerCase() === "true";
}

export function setTriageAfterAnalysisEnabled(enabled: boolean): void {
  setSetting(TRIAGE_AFTER_ANALYSIS_ENABLED_SETTING, enabled ? "1" : "0");
}

export function getTriageAfterAnalysisSettingsPublic() {
  return {
    triageAfterAnalysisEnabled: isTriageAfterAnalysisEnabled(),
  };
}
