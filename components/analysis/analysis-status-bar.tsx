"use client";

import Link from "next/link";
import { BrainCircuit, Loader2 } from "lucide-react";
import { useAnalysis } from "@/components/analysis/analysis-provider";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";

export function AnalysisStatusBar() {
  const {
    pendingCount,
    analyzedCount,
    hasOpenAIKey,
    isRunning,
    mode,
    runTarget,
    runSucceeded,
    runFailed,
    batchPercent,
    batchProcessed,
    batchTotal,
    lastError,
    lastMessage,
    startAnalysis,
    stopAnalysis,
  } = useAnalysis();

  const overallDone = runSucceeded + runFailed;
  const overallPercent =
    runTarget > 0
      ? Math.min(100, Math.round((overallDone / runTarget) * 100))
      : isRunning
        ? batchPercent
        : 0;

  // Always show when there is pending work, a run, or a recent message/error
  if (!isRunning && pendingCount === 0 && !lastMessage && !lastError) {
    return null;
  }

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BrainCircuit className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                {isRunning
                  ? mode === "all"
                    ? "Hintergrund-Analyse läuft"
                    : "Batch-Analyse läuft"
                  : pendingCount > 0
                    ? `${pendingCount} Dokumente warten auf Analyse`
                    : "Analyse"}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isRunning
                  ? `In diesem Lauf: ${overallDone}/${runTarget || "?"} · Noch ausstehend gesamt: ${pendingCount}` +
                    (batchTotal
                      ? ` · Aktueller Batch: ${batchProcessed}/${batchTotal}`
                      : "")
                  : `Bereits analysiert: ${analyzedCount}` +
                    (lastMessage ? ` · ${lastMessage}` : "")}
              </p>
              {lastError ? (
                <p className="mt-1 text-xs text-destructive">{lastError}</p>
              ) : null}
              {!hasOpenAIKey ? (
                <p className="mt-1 text-xs text-destructive">
                  OpenAI-Key fehlt – bitte unter{" "}
                  <Link href="/settings" className="underline">
                    Einstellungen
                  </Link>{" "}
                  hinterlegen.
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isRunning ? (
              <Button size="sm" variant="outline" onClick={stopAnalysis}>
                Stoppen
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasOpenAIKey || pendingCount === 0}
                  onClick={() => void startAnalysis({ mode: "batch", batchSize: 10 })}
                >
                  10 analysieren
                </Button>
                <Button
                  size="sm"
                  disabled={!hasOpenAIKey || pendingCount === 0}
                  onClick={() => void startAnalysis({ mode: "all", batchSize: 10 })}
                >
                  Alle im Hintergrund
                </Button>
              </>
            )}
          </div>
        </div>

        {isRunning ? (
          <ProgressBar
            value={overallPercent}
            label={mode === "all" ? "Gesamtfortschritt" : "Batch-Fortschritt"}
            detail={`${overallPercent}%`}
          />
        ) : null}
      </div>
    </div>
  );
}
