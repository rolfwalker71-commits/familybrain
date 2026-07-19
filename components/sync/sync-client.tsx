"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2, RefreshCw, BrainCircuit } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useAnalysis } from "@/components/analysis/analysis-provider";
import { readNdjsonStream } from "@/lib/utils/stream";
import { PageHeader } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals } from "@/components/layout/icon-circle";
import { AutomationPanel } from "@/components/sync/automation-panel";

type SyncResult = {
  totalRemote: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
};

type SyncProgress = {
  phase: string;
  totalRemote: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  currentTitle?: string | null;
  percent: number;
};

export function SyncClient() {
  const {
    pendingCount,
    hasOpenAIKey,
    isRunning: analysisRunning,
    startAnalysis,
    stopAnalysis,
    refreshStats,
  } = useAnalysis();

  const [baseUrl, setBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "sync" | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setBaseUrl(data.paperlessBaseUrl || "");
      setTokenMasked(data.paperlessApiTokenMasked);
      setHasToken(Boolean(data.hasPaperlessToken));
      await refreshStats();
    })();
  }, [refreshStats]);

  async function saveSettings() {
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperlessBaseUrl: baseUrl,
          paperlessApiToken: apiToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setTokenMasked(data.paperlessApiTokenMasked);
      setHasToken(data.hasPaperlessToken);
      setApiToken("");
      setMessage("Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test");
    setError(null);
    setMessage(null);
    try {
      if (!apiToken && !hasToken) {
        throw new Error("Bitte zuerst den API-Token eingeben und speichern.");
      }
      if (baseUrl) {
        const saveRes = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paperlessBaseUrl: baseUrl,
            paperlessApiToken: apiToken || undefined,
          }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) {
          throw new Error(
            saveData.error || "Speichern vor dem Test fehlgeschlagen"
          );
        }
        setTokenMasked(saveData.paperlessApiTokenMasked);
        setHasToken(saveData.hasPaperlessToken);
        if (apiToken) setApiToken("");
      }

      const res = await fetch("/api/paperless/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Verbindung fehlgeschlagen");
      }
      setMessage(
        data.count != null
          ? `Verbindung erfolgreich. ${data.count} Dokumente in Paperless.`
          : "Verbindung zu Paperless erfolgreich."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function startSync() {
    setBusy("sync");
    setError(null);
    setMessage(null);
    setSyncResult(null);
    setSyncProgress({
      phase: "connecting",
      totalRemote: 0,
      processed: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: 0,
      percent: 0,
    });

    try {
      const res = await fetch("/api/paperless/sync", { method: "POST" });
      if (!res.ok && !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Sync fehlgeschlagen");
      }

      let finalResult: SyncResult | null = null;
      let streamError: string | null = null;

      await readNdjsonStream(res, (event) => {
        if (event.type === "progress") {
          setSyncProgress({
            phase: String(event.phase),
            totalRemote: Number(event.totalRemote || 0),
            processed: Number(event.processed || 0),
            created: Number(event.created || 0),
            updated: Number(event.updated || 0),
            unchanged: Number(event.unchanged || 0),
            errors: Number(event.errors || 0),
            currentTitle: (event.currentTitle as string) || null,
            percent: Number(event.percent || 0),
          });
        } else if (event.type === "done") {
          finalResult = event.result as SyncResult;
        } else if (event.type === "error") {
          streamError = String(event.error || "Sync fehlgeschlagen");
        }
      });

      if (streamError) throw new Error(streamError);
      if (!finalResult) throw new Error("Sync ohne Ergebnis beendet.");

      setSyncResult(finalResult);
      setSyncProgress((prev) =>
        prev
          ? { ...prev, phase: "done", percent: 100 }
          : {
              phase: "done",
              totalRemote: finalResult!.totalRemote,
              processed: finalResult!.processed,
              created: finalResult!.created,
              updated: finalResult!.updated,
              unchanged: finalResult!.unchanged,
              errors: finalResult!.errors.length,
              percent: 100,
            }
      );
      setMessage("Sync abgeschlossen. Du kannst jetzt die Analyse starten.");
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSyncProgress(null);
    } finally {
      setBusy(null);
    }
  }

  const syncLabel =
    syncProgress?.phase === "connecting"
      ? "Verbinde mit Paperless…"
      : syncProgress?.phase === "done"
        ? "Sync abgeschlossen"
        : "Synchronisiere Dokumente…";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sync"
        description="Paperless verbinden, Dokumente synchronisieren und AI-Analyse starten"
        icon={pageVisuals.sync.icon}
        tone={pageVisuals.sync.tone}
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            <IconCircle icon={Link2} tone="blue" size="sm" />
            1. Paperless-Verbindung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Paperless Basis-URL</Label>
            <Input
              id="baseUrl"
              placeholder="https://paperless.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">API-Token</Label>
            <Input
              id="token"
              type="password"
              placeholder={
                hasToken
                  ? `Gespeichert: ${tokenMasked || "••••"}`
                  : "Token eingeben"
              }
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void saveSettings()} disabled={busy !== null}>
              {busy === "save" ? "Speichert…" : "Speichern"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void testConnection()}
              disabled={busy !== null}
            >
              {busy === "test" ? "Testet…" : "Verbindung testen"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AutomationPanel />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            <IconCircle icon={RefreshCw} tone="amber" size="sm" />
            2. Dokumente synchronisieren
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Lädt Metadaten und OCR-Text aus Paperless in die lokale SQLite-Datenbank.
          </p>
          <Button
            onClick={() => void startSync()}
            disabled={busy !== null || !hasToken || analysisRunning}
          >
            {busy === "sync" ? "Synchronisiert…" : "Sync starten"}
          </Button>

          {syncProgress ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <ProgressBar
                value={syncProgress.percent}
                label={syncLabel}
                detail={`${syncProgress.processed} / ${syncProgress.totalRemote || "?"} · ${syncProgress.percent}%`}
              />
              {syncProgress.currentTitle ? (
                <p className="truncate text-xs text-muted-foreground">
                  Aktuell: {syncProgress.currentTitle}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <span>Neu: {syncProgress.created}</span>
                <span>Aktualisiert: {syncProgress.updated}</span>
                <span>Unverändert: {syncProgress.unchanged}</span>
                <span>Fehler: {syncProgress.errors}</span>
              </div>
            </div>
          ) : null}

          {syncResult ? (
            <div className="space-y-1 text-sm">
              <div>Remote gesamt: {syncResult.totalRemote}</div>
              <div>Verarbeitet: {syncResult.processed}</div>
              {syncResult.errors.length > 0 ? (
                <div className="space-y-1 pt-2">
                  <div className="font-medium text-destructive">Fehlerdetails</div>
                  {syncResult.errors.slice(0, 10).map((err, i) => (
                    <div key={i} className="text-destructive">
                      {err}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            <IconCircle icon={BrainCircuit} tone="violet" size="sm" />
            3. AI-Analyse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <strong>Wichtig:</strong> „10 analysieren“ macht nur einen Batch und
            stoppt danach. „Alle im Hintergrund“ läuft weiter, bis alle
            ausstehenden Dokumente fertig sind (Tab muss offen bleiben). Status
            und Fortschritt siehst du oben auf jeder Seite.
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            Ausstehend: <strong>{pendingCount}</strong>
            {!hasOpenAIKey ? (
              <span className="ml-2 text-destructive">
                · OpenAI-Key fehlt (
                <Link href="/settings" className="underline">
                  Einstellungen
                </Link>
                )
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {analysisRunning ? (
              <Button variant="outline" onClick={stopAnalysis}>
                Analyse stoppen
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={pendingCount === 0 || !hasOpenAIKey || busy !== null}
                  onClick={() =>
                    void startAnalysis({ mode: "batch", batchSize: 10 })
                  }
                >
                  10 analysieren
                </Button>
                <Button
                  disabled={pendingCount === 0 || !hasOpenAIKey || busy !== null}
                  onClick={() =>
                    void startAnalysis({ mode: "all", batchSize: 10 })
                  }
                >
                  Alle im Hintergrund analysieren
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {message ? (
        <Alert>
          <AlertTitle>Status</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
