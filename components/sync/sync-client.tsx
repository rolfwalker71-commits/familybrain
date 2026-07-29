"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Link2,
  RefreshCw,
  BrainCircuit,
  BookOpen,
  Activity,
  Bot,
  Sparkles,
  CloudCheck,
  Info,
  ScrollText,
} from "lucide-react";
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
import { SyncLogPanel } from "@/components/sync/sync-log-panel";
import { VectorIndexStatusPanel } from "@/components/sync/vector-index-status-panel";
import {
  SyncTabNav,
  parseSyncTab,
  type SyncTab,
  type SyncTabItem,
} from "@/components/sync/sync-tab-nav";


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

type TriliumSyncResult = {
  totalRemote: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  missing: number;
  errors: string[];
};

export function SyncClient() {
  return (
    <Suspense
      fallback={<p className="p-6 text-sm text-muted-foreground">Lade Sync…</p>}
    >
      <SyncClientInner />
    </Suspense>
  );
}

function SyncClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    pendingCount,
    analyzedCount,
    hasOpenAIKey,
    isRunning: analysisRunning,
    lastError: analysisError,
    lastMessage: analysisMessage,
    startAnalysis,
    stopAnalysis,
    refreshStats,
  } = useAnalysis();

  const [baseUrl, setBaseUrl] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [triliumConfigured, setTriliumConfigured] = useState(false);
  const [triliumSyncedNotes, setTriliumSyncedNotes] = useState(0);
  const [triliumSyncResult, setTriliumSyncResult] =
    useState<TriliumSyncResult | null>(null);
  const [triliumSyncProgress, setTriliumSyncProgress] =
    useState<SyncProgress | null>(null);
  const [busy, setBusy] = useState<
    "save" | "test" | "sync" | "trilium-sync" | "writeback" | "job" | null
  >(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [bgJob, setBgJob] = useState<{
    id: number;
    jobType: string;
    label: string;
    summary: Record<string, unknown> | null;
  } | null>(null);

  async function refreshBackgroundJob() {
    try {
      const res = await fetch("/api/jobs/status", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      const active = data?.activeRun;
      if (active && active.status === "running") {
        let summary: Record<string, unknown> | null = null;
        if (typeof active.summary_json === "string" && active.summary_json) {
          try {
            summary = JSON.parse(active.summary_json) as Record<string, unknown>;
          } catch {
            summary = null;
          }
        }
        setBgJob({
          id: Number(active.id),
          jobType: String(active.job_type || ""),
          label: String(data.activeRunLabel || active.job_type || "Job"),
          summary,
        });
      } else {
        setBgJob(null);
      }
    } catch {
      /* ignore */
    }
  }

  async function startBackgroundJob(
    jobType:
      | "analyze_pending"
      | "paperless_writeback"
      | "ai_icons_missing"
      | "sync_analyze"
  ) {
    setBusy("job");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error ||
            (data.activeRun
              ? "Ein anderer Hintergrund-Job läuft bereits."
              : "Job starten fehlgeschlagen")
        );
      }
      setMessage(
        `${data.label || "Job"} gestartet — läuft auf dem Server weiter, auch wenn du die Seite verlässt.`
      );
      await refreshBackgroundJob();
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function stopBackgroundJob() {
    setBusy("job");
    setError(null);
    try {
      stopAnalysis();
      const res = await fetch("/api/jobs/cancel", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Stoppen fehlgeschlagen");
      setMessage(
        data.cancelled
          ? `${data.label || "Job"} gestoppt.`
          : data.message || "Kein aktiver Job."
      );
      setBgJob(null);
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setBaseUrl(data.paperlessBaseUrl || "");
      setPublicUrl(data.paperlessPublicUrl || "");
      setTokenMasked(data.paperlessApiTokenMasked);
      setHasToken(Boolean(data.hasPaperlessToken));
      setTriliumConfigured(Boolean(data.triliumConfigured));
      setTriliumSyncedNotes(Number(data.triliumSyncedNotes || 0));
      await refreshStats();
    })();
  }, [refreshStats]);

  useEffect(() => {
    void (async () => {
      try {
        const [statusRes, runsRes] = await Promise.all([
          fetch("/api/jobs/status", { cache: "no-store" }),
          fetch("/api/jobs/runs?limit=1", { cache: "no-store" }),
        ]);
        const statusData = await statusRes.json().catch(() => null);
        const runsData = await runsRes.json().catch(() => null);
        const fromScheduler =
          typeof statusData?.scheduler?.lastTickAt === "string"
            ? statusData.scheduler.lastTickAt
            : null;
        const latestRun = Array.isArray(runsData?.runs)
          ? runsData.runs[0]
          : null;
        const fromRun =
          typeof latestRun?.finished_at === "string"
            ? latestRun.finished_at
            : typeof latestRun?.started_at === "string"
              ? latestRun.started_at
              : null;
        setLastSyncAt(fromScheduler || fromRun || null);
      } catch {
        /* ignore status lookup errors */
      }
    })();
  }, []);

  useEffect(() => {
    void refreshBackgroundJob();
    const id = window.setInterval(() => {
      void refreshBackgroundJob();
      if (bgJob) void refreshStats();
    }, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll independently of bgJob identity
  }, [bgJob?.id, refreshStats]);

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
          paperlessPublicUrl: publicUrl.trim(),
          paperlessApiToken: apiToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setBaseUrl(data.paperlessBaseUrl || baseUrl);
      setPublicUrl(data.paperlessPublicUrl || "");
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
            paperlessPublicUrl: publicUrl.trim(),
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
      setLastSyncAt(new Date().toISOString());
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSyncProgress(null);
    } finally {
      setBusy(null);
    }
  }

  async function startTriliumSync() {
    setBusy("trilium-sync");
    setError(null);
    setMessage(null);
    setTriliumSyncResult(null);
    setTriliumSyncProgress({
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
      const res = await fetch("/api/trilium/sync", { method: "POST" });
      if (!res.ok && !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Trilium-Sync fehlgeschlagen");
      }

      let finalResult: TriliumSyncResult | undefined;
      let streamError: string | null = null;

      await readNdjsonStream(res, (event) => {
        if (event.type === "progress") {
          setTriliumSyncProgress({
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
          finalResult = event.result as TriliumSyncResult;
        } else if (event.type === "error") {
          streamError = String(event.error || "Trilium-Sync fehlgeschlagen");
        }
      });

      if (streamError) throw new Error(streamError);
      if (!finalResult) throw new Error("Trilium-Sync ohne Ergebnis beendet.");

      setTriliumSyncResult(finalResult);
      setTriliumSyncProgress((prev) =>
        prev ? { ...prev, phase: "done", percent: 100 } : null
      );
      setMessage(
        `Trilium-Sync abgeschlossen. ${finalResult.created + finalResult.updated} Notizen aktualisiert.`
      );

      const settingsRes = await fetch("/api/settings");
      const settingsData = await settingsRes.json();
      setTriliumSyncedNotes(Number(settingsData.triliumSyncedNotes || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTriliumSyncProgress(null);
    } finally {
      setBusy(null);
    }
  }

  async function runPaperlessWriteback() {
    await startBackgroundJob("paperless_writeback");
  }

  const syncLabel =
    syncProgress?.phase === "connecting"
      ? "Verbinde mit Paperless…"
      : syncProgress?.phase === "done"
        ? "Sync abgeschlossen"
        : "Synchronisiere Dokumente…";

  const lastSyncLabel = lastSyncAt
    ? new Intl.DateTimeFormat("de-CH", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(lastSyncAt))
    : "Noch nie";

  const syncPrimaryBtn =
    "w-full bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90";

  const activeTab = parseSyncTab(searchParams.get("tab"));
  const tabItems: SyncTabItem[] = [
    { id: "status", label: "Status", icon: Activity },
    { id: "automation", label: "Automation", icon: Bot },
    { id: "analyse", label: "Analyse", icon: Sparkles },
    { id: "log", label: "Protokoll", icon: ScrollText },
  ];

  function setTab(tab: SyncTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "status") params.delete("tab");
    else params.set("tab", tab);
    const q = params.toString();
    router.replace(q ? `?${q}` : "?", { scroll: false });
  }

  return (
    <div className="space-y-6 pb-28 md:space-y-8 md:pb-0">
      <PageHeader
        title="Sync"
        description="Paperless und Trilium aktuell halten — dann AI-Analyse starten."
        icon={pageVisuals.sync.icon}
        tone={pageVisuals.sync.tone}
      />

      <SyncTabNav items={tabItems} active={activeTab} onChange={setTab} />

      {activeTab === "status" ? (
        <div className="space-y-4">
      <Card className="border-[color-mix(in_oklab,var(--brand-docs),white_70%)] bg-white">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <IconCircle
            icon={CloudCheck}
            tone="teal"
            size="lg"
            className="size-16 bg-[var(--brand-docs-soft)] text-[var(--brand-docs)] [&_svg]:size-8"
          />
          <div className="space-y-1">
            <p className="text-base text-muted-foreground">
              Letzte Sync:{" "}
              <span className="font-semibold text-[var(--brand-docs)]">
                {lastSyncLabel}
              </span>
            </p>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Lädt Metadaten und OCR-Text aus Paperless in die lokale
              SQLite-Datenbank.
            </p>
          </div>
          <Button
            onClick={() => void startSync()}
            disabled={busy !== null || !hasToken || analysisRunning}
            className={syncPrimaryBtn}
          >
            <RefreshCw
              className={busy === "sync" ? "animate-spin" : undefined}
            />
            {busy === "sync" ? "Synchronisiert…" : "Jetzt synchronisieren"}
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            Automatik und Analyse findest du in den anderen Tabs.
          </p>

          {syncProgress ? (
            <div className="w-full space-y-3 rounded-xl border border-border/60 bg-[var(--brand-docs-soft)]/50 p-4 text-left">
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
            <div className="w-full space-y-1 text-left text-sm">
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

      <VectorIndexStatusPanel />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={Link2} tone="teal" size="sm" />
            Paperless-Verbindung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">API-URL (Server / intern)</Label>
            <Input
              id="baseUrl"
              className="rounded-xl"
              placeholder="http://paperless:8000"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Sync/Writeback: bei Docker die interne Adresse (z.B. Service-Name).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="publicUrl">Öffentliche URL (Browser)</Label>
            <Input
              id="publicUrl"
              className="rounded-xl"
              placeholder="https://paperless.example.com"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Für Links «In Paperless öffnen». Leer = wie API-URL.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">API-Token</Label>
            <Input
              id="token"
              type="password"
              className="rounded-xl"
              placeholder={
                hasToken
                  ? `Gespeichert: ${tokenMasked || "••••"}`
                  : "Token eingeben"
              }
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              onClick={() => void saveSettings()}
              disabled={busy !== null}
              className={syncPrimaryBtn}
            >
              {busy === "save" ? "Speichert…" : "Speichern"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void testConnection()}
              disabled={busy !== null}
            >
              {busy === "test" ? "Testet…" : "Verbindung testen"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={BookOpen} tone="teal" size="sm" />
            Trilium-Notizen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Lädt Notizen aus «Privat» und «Geschäftlich ANG» in die lokale
            SQLite-Datenbank. Der Chat nutzt danach den lokalen Index (schneller,
            auch bei Trilium-Ausfall).
          </p>
          <div className="rounded-xl border border-border/60 bg-[var(--brand-docs-soft)]/50 p-4 text-sm">
            {triliumConfigured ? (
              <>
                Trilium konfiguriert · lokal indexiert:{" "}
                <strong>{triliumSyncedNotes}</strong> Notizen
              </>
            ) : (
              <>
                Trilium noch nicht bereit. Bitte unter{" "}
                <Link href="/settings" className="underline">
                  Einstellungen
                </Link>{" "}
                URL, Token und Bereiche hinterlegen.
              </>
            )}
          </div>
          <Button
            onClick={() => void startTriliumSync()}
            disabled={busy !== null || !triliumConfigured || analysisRunning}
            className={syncPrimaryBtn}
          >
            <RefreshCw
              className={
                busy === "trilium-sync" ? "animate-spin" : undefined
              }
            />
            {busy === "trilium-sync" ? "Synchronisiert…" : "Trilium-Sync starten"}
          </Button>

          {triliumSyncProgress ? (
            <div className="space-y-3 rounded-xl border border-border/60 bg-[var(--brand-docs-soft)]/50 p-4">
              <ProgressBar
                value={triliumSyncProgress.percent}
                label={
                  triliumSyncProgress.phase === "connecting"
                    ? "Verbinde mit Trilium…"
                    : triliumSyncProgress.phase === "done"
                      ? "Trilium-Sync abgeschlossen"
                      : "Synchronisiere Notizen…"
                }
                detail={`${triliumSyncProgress.processed} / ${triliumSyncProgress.totalRemote || "?"} · ${triliumSyncProgress.percent}%`}
              />
              {triliumSyncProgress.currentTitle ? (
                <p className="truncate text-xs text-muted-foreground">
                  Aktuell: {triliumSyncProgress.currentTitle}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <span>Neu: {triliumSyncProgress.created}</span>
                <span>Aktualisiert: {triliumSyncProgress.updated}</span>
                <span>Unverändert: {triliumSyncProgress.unchanged}</span>
                <span>Fehler: {triliumSyncProgress.errors}</span>
              </div>
            </div>
          ) : null}

          {triliumSyncResult ? (
            <div className="space-y-1 text-sm">
              <div>Remote gesamt: {triliumSyncResult.totalRemote}</div>
              <div>Verarbeitet: {triliumSyncResult.processed}</div>
              <div>Fehlend markiert: {triliumSyncResult.missing}</div>
              {triliumSyncResult.errors.length > 0 ? (
                <div className="space-y-1 pt-2">
                  <div className="font-medium text-destructive">Fehlerdetails</div>
                  {triliumSyncResult.errors.slice(0, 10).map((err, i) => (
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
        </div>
      ) : null}

      {activeTab === "automation" ? <AutomationPanel /> : null}

      {activeTab === "log" ? <SyncLogPanel /> : null}

      {activeTab === "analyse" ? (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={BrainCircuit} tone="teal" size="sm" />
            AI-Analyse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <strong>Wichtig:</strong> „10 analysieren“ ist ein kurzer Browser-Batch.
            „Alle im Hintergrund“ und Writeback laufen als Server-Job weiter — der
            Tab darf geschlossen werden.
          </p>
          <div className="rounded-xl border border-border/60 bg-[var(--brand-docs-soft)]/50 p-4 text-sm">
            Ausstehend: <strong>{pendingCount}</strong>
            <span className="mx-2 text-muted-foreground">·</span>
            Analysiert: <strong>{analyzedCount}</strong>
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

          {bgJob ? (
            <div className="rounded-xl border border-[var(--brand-docs)]/40 bg-[var(--brand-docs-soft)] px-4 py-3 text-sm text-[var(--brand-docs)]">
              <p className="font-medium">Server-Job läuft: {bgJob.label}</p>
              <p className="mt-1 text-[var(--brand-docs)]/90">
                {bgJob.summary
                  ? `Fortschritt: ${Number(bgJob.summary.succeeded ?? bgJob.summary.analyzed ?? 0)} ok` +
                    (Number(
                      bgJob.summary.failed ?? bgJob.summary.analysisFailed ?? 0
                    ) > 0
                      ? `, ${Number(bgJob.summary.failed ?? bgJob.summary.analysisFailed ?? 0)} Fehler`
                      : "") +
                    (bgJob.summary.remaining != null
                      ? ` · noch ${Number(bgJob.summary.remaining)}`
                      : "") +
                    (bgJob.summary.processed != null
                      ? ` · ${Number(bgJob.summary.processed)} verarbeitet`
                      : "")
                  : "Gestartet — Status wird aktualisiert…"}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={busy !== null}
                onClick={() => void stopBackgroundJob()}
              >
                Job stoppen
              </Button>
            </div>
          ) : null}

          {(error || analysisError) && activeTab === "analyse" ? (
            <Alert variant="destructive">
              <AlertTitle>Analyse / Job</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{error || analysisError}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void stopBackgroundJob()}
                >
                  Aktiven Job stoppen und freigeben
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {analysisMessage && !analysisRunning ? (
            <p className="text-sm text-muted-foreground">{analysisMessage}</p>
          ) : null}

          <div className="grid grid-cols-1 gap-2">
            {analysisRunning || bgJob?.jobType === "analyze_pending" ? (
              <Button
                variant="outline"
                className="w-full"
                disabled={busy !== null}
                onClick={() => void stopBackgroundJob()}
              >
                Analyse stoppen
              </Button>
            ) : (
              <>
                <Button
                  className={syncPrimaryBtn}
                  disabled={
                    pendingCount === 0 ||
                    !hasOpenAIKey ||
                    busy !== null ||
                    bgJob != null
                  }
                  onClick={() => void startBackgroundJob("analyze_pending")}
                >
                  Alle im Hintergrund analysieren
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={
                    pendingCount === 0 ||
                    !hasOpenAIKey ||
                    busy !== null ||
                    bgJob != null ||
                    analysisRunning
                  }
                  onClick={() =>
                    void startAnalysis({ mode: "batch", batchSize: 10 })
                  }
                >
                  10 analysieren
                </Button>
              </>
            )}
          </div>

          <div className="border-t border-border/60 pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Bereits analysierte Dokumente müssen nicht nochmals durch die KI.
              „Writeback erneut“ schreibt die vorhandenen Extrakte nach Paperless
              — ohne OpenAI-Kosten. Läuft als Server-Job im Hintergrund.
            </p>
            {bgJob?.jobType === "paperless_writeback" && bgJob.summary ? (
              <div className="rounded-xl border border-border/60 p-3 text-sm">
                Writeback: {Number(bgJob.summary.succeeded || 0)} ok
                {Number(bgJob.summary.failed || 0) > 0
                  ? `, ${Number(bgJob.summary.failed)} Fehler`
                  : ""}{" "}
                ({Number(bgJob.summary.processed || 0)} verarbeitet)
              </div>
            ) : null}
            <Button
              variant="outline"
              className="w-full"
              disabled={
                analyzedCount === 0 ||
                !hasToken ||
                busy !== null ||
                analysisRunning ||
                bgJob != null
              }
              onClick={() => void runPaperlessWriteback()}
            >
              {busy === "job"
                ? "Starte…"
                : `Paperless-Writeback erneut (${analyzedCount})`}
            </Button>
            {!hasToken ? (
              <p className="text-xs text-destructive">
                Paperless-Token fehlt — zuerst unter Einstellungen hinterlegen.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      ) : null}



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
