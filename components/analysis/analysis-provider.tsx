"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { readNdjsonStream } from "@/lib/utils/stream";

export type AnalysisMode = "batch" | "all";

type AnalysisStatus = {
  pendingCount: number;
  analyzedCount: number;
  totalDocuments: number;
  warrantiesTotal: number;
  deadlinesOpen: number;
  financialItemsTotal: number;
  travelDocuments: number;
  knowledgeDocuments: number;
  hasOpenAIKey: boolean;
  isRunning: boolean;
  mode: AnalysisMode | null;
  batchSize: number;
  /** Documents remaining when the current run started (for overall %). */
  runTarget: number;
  /** Successfully analyzed in the current run. */
  runSucceeded: number;
  /** Failed in the current run. */
  runFailed: number;
  /** Current batch progress 0–100. */
  batchPercent: number;
  batchProcessed: number;
  batchTotal: number;
  lastError: string | null;
  lastMessage: string | null;
};

type AnalysisContextValue = AnalysisStatus & {
  refreshStats: () => Promise<void>;
  startAnalysis: (options?: {
    mode?: AnalysisMode;
    batchSize?: number;
  }) => Promise<void>;
  stopAnalysis: () => void;
};

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

const defaultStatus: AnalysisStatus = {
  pendingCount: 0,
  analyzedCount: 0,
  totalDocuments: 0,
  warrantiesTotal: 0,
  deadlinesOpen: 0,
  financialItemsTotal: 0,
  travelDocuments: 0,
  knowledgeDocuments: 0,
  hasOpenAIKey: false,
  isRunning: false,
  mode: null,
  batchSize: 10,
  runTarget: 0,
  runSucceeded: 0,
  runFailed: 0,
  batchPercent: 0,
  batchProcessed: 0,
  batchTotal: 0,
  lastError: null,
  lastMessage: null,
};

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AnalysisStatus>(defaultStatus);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const refreshStats = useCallback(async () => {
    try {
      const [dashRes, settingsRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/settings"),
      ]);
      const dash = dashRes.ok ? await dashRes.json() : {};
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      setStatus((prev) => ({
        ...prev,
        pendingCount: Number(dash.pendingAnalysis ?? prev.pendingCount),
        analyzedCount: Number(dash.analyzed ?? prev.analyzedCount),
        totalDocuments: Number(dash.totalDocuments ?? prev.totalDocuments),
        warrantiesTotal: Number(dash.warrantiesTotal ?? prev.warrantiesTotal),
        deadlinesOpen: Number(dash.deadlinesOpen ?? prev.deadlinesOpen),
        financialItemsTotal: Number(
          dash.financialItemsTotal ?? prev.financialItemsTotal
        ),
        travelDocuments: Number(dash.travelDocuments ?? prev.travelDocuments),
        knowledgeDocuments: Number(
          dash.knowledgeDocuments ?? prev.knowledgeDocuments
        ),
        hasOpenAIKey: Boolean(settings.hasOpenAIKey),
      }));
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    void refreshStats();
    const id = window.setInterval(() => {
      if (!runningRef.current) void refreshStats();
    }, 15000);
    return () => window.clearInterval(id);
  }, [refreshStats]);

  const stopAnalysis = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    setStatus((prev) => ({
      ...prev,
      isRunning: false,
      mode: null,
      lastMessage: "Analyse gestoppt.",
    }));
  }, []);

  const startAnalysis = useCallback(
    async (options?: { mode?: AnalysisMode; batchSize?: number }) => {
      if (runningRef.current) return;

      const mode: AnalysisMode = options?.mode ?? "batch";
      const batchSize = options?.batchSize ?? 10;

      const controller = new AbortController();
      abortRef.current = controller;
      runningRef.current = true;

      // Fresh pending count before starting
      let pending = status.pendingCount;
      try {
        const dashRes = await fetch("/api/dashboard");
        if (dashRes.ok) {
          const dash = await dashRes.json();
          pending = Number(dash.pendingAnalysis ?? 0);
        }
      } catch {
        // keep previous
      }

      if (pending <= 0) {
        runningRef.current = false;
        setStatus((prev) => ({
          ...prev,
          isRunning: false,
          pendingCount: 0,
          lastMessage: "Keine ausstehenden Dokumente.",
        }));
        return;
      }

      const settingsRes = await fetch("/api/settings");
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      if (!settings.hasOpenAIKey) {
        runningRef.current = false;
        setStatus((prev) => ({
          ...prev,
          isRunning: false,
          lastError:
            "OpenAI API-Key fehlt. Bitte unter Einstellungen hinterlegen.",
        }));
        return;
      }

      const runTarget = mode === "all" ? pending : Math.min(batchSize, pending);

      setStatus((prev) => ({
        ...prev,
        isRunning: true,
        mode,
        batchSize,
        pendingCount: pending,
        runTarget,
        runSucceeded: 0,
        runFailed: 0,
        batchPercent: 0,
        batchProcessed: 0,
        batchTotal: 0,
        lastError: null,
        lastMessage:
          mode === "all"
            ? `Starte Analyse für ${pending} Dokumente…`
            : `Starte Batch von bis zu ${batchSize} Dokumenten…`,
      }));

      let runSucceeded = 0;
      let runFailed = 0;

      try {
        // Loop: one or many batches
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (controller.signal.aborted) break;

          const res = await fetch("/api/analyze/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limit: batchSize }),
            signal: controller.signal,
          });

          let batchSucceeded = 0;
          let batchFailed = 0;
          let batchProcessedLocal = 0;
          let batchTotalLocal = 0;
          let streamError: string | null = null;

          await readNdjsonStream(res, (event) => {
            if (controller.signal.aborted) return;
            if (event.type === "progress") {
              batchProcessedLocal = Number(event.processed || 0);
              batchTotalLocal = Number(event.total || 0);
              batchSucceeded = Number(event.succeeded || 0);
              batchFailed = Number(event.failed || 0);
              setStatus((prev) => ({
                ...prev,
                batchPercent: Number(event.percent || 0),
                batchProcessed: batchProcessedLocal,
                batchTotal: batchTotalLocal,
                runSucceeded: runSucceeded + batchSucceeded,
                runFailed: runFailed + batchFailed,
                lastMessage: `Analysiere Batch… ${batchProcessedLocal}/${batchTotalLocal}`,
              }));
            } else if (event.type === "error") {
              streamError = String(event.error || "Analyse fehlgeschlagen");
            }
          });

          if (streamError) throw new Error(streamError);
          if (controller.signal.aborted) break;

          runSucceeded += batchSucceeded;
          runFailed += batchFailed;

          // Refresh pending after each batch
          let remaining = 0;
          try {
            const dashRes = await fetch("/api/dashboard");
            if (dashRes.ok) {
              const dash = await dashRes.json();
              remaining = Number(dash.pendingAnalysis ?? 0);
              setStatus((prev) => ({
                ...prev,
                pendingCount: remaining,
                analyzedCount: Number(dash.analyzed ?? prev.analyzedCount),
                runSucceeded,
                runFailed,
              }));
            }
          } catch {
            // ignore
          }

          if (mode === "batch") break;
          if (remaining <= 0) break;
          // If batch returned 0 processed, stop to avoid infinite loop
          if (batchTotalLocal === 0) break;
        }

        if (!controller.signal.aborted) {
          setStatus((prev) => ({
            ...prev,
            isRunning: false,
            mode: null,
            batchPercent: 100,
            lastMessage:
              mode === "all"
                ? `Fertig: ${runSucceeded} analysiert` +
                  (runFailed ? `, ${runFailed} fehlerhaft` : "") +
                  "."
                : `Batch fertig: ${runSucceeded} analysiert` +
                  (runFailed ? `, ${runFailed} fehlerhaft` : "") +
                  `. Noch ${prev.pendingCount} ausstehend.`,
            lastError: null,
          }));
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          setStatus((prev) => ({
            ...prev,
            isRunning: false,
            mode: null,
            lastMessage: "Analyse gestoppt.",
          }));
        } else {
          setStatus((prev) => ({
            ...prev,
            isRunning: false,
            mode: null,
            lastError:
              error instanceof Error ? error.message : String(error),
          }));
        }
      } finally {
        runningRef.current = false;
        abortRef.current = null;
        await refreshStats();
      }
    },
    [refreshStats, status.pendingCount]
  );

  const value = useMemo<AnalysisContextValue>(
    () => ({
      ...status,
      refreshStats,
      startAnalysis,
      stopAnalysis,
    }),
    [status, refreshStats, startAnalysis, stopAnalysis]
  );

  return (
    <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) {
    throw new Error("useAnalysis must be used within AnalysisProvider");
  }
  return ctx;
}
