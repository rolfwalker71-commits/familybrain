/** Client helper: pause/resume triage during multi-document analysis. */

export async function pauseTriageForMassAnalysisClient(): Promise<void> {
  const res = await fetch("/api/settings/triage-mass-pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pause" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Triage-Pause fehlgeschlagen"
    );
  }
}

export async function resumeTriageAfterMassAnalysisClient(): Promise<void> {
  const res = await fetch("/api/settings/triage-mass-pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resume" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Triage-Wiederherstellung fehlgeschlagen"
    );
  }
}

/** Pause only when analyzing more than one document. Always resume in finally. */
export async function withTriageMassPause<T>(
  documentCount: number,
  fn: () => Promise<T>
): Promise<T> {
  const shouldPause = documentCount > 1;
  if (shouldPause) {
    await pauseTriageForMassAnalysisClient();
  }
  try {
    return await fn();
  } finally {
    if (shouldPause) {
      try {
        await resumeTriageAfterMassAnalysisClient();
      } catch {
        /* best-effort restore */
      }
    }
  }
}
