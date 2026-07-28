"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Database,
  FileText,
  RefreshCw,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { IconCircle } from "@/components/layout/icon-circle";
import type { EmbeddingBucketCounts } from "@/lib/vectors/embedding-stats";

type VectorStatusResponse = {
  qdrant: {
    ok: boolean;
    url: string;
    collection: string;
    points: number;
    bySource: {
      paperless: number;
      trilium: number;
      guide: number;
    };
  };
  local: {
    paperless: EmbeddingBucketCounts;
    trilium: EmbeddingBucketCounts;
    guides: EmbeddingBucketCounts;
  };
  hasOpenAIKey: boolean;
};

function pct(indexed: number, eligible: number): number {
  if (eligible <= 0) return 0;
  return Math.min(100, Math.round((indexed / eligible) * 100));
}

function StatusRow({
  title,
  icon,
  tone,
  buckets,
  qdrantChunks,
}: {
  title: string;
  icon: typeof FileText;
  tone: "teal" | "green";
  buckets: EmbeddingBucketCounts;
  qdrantChunks: number;
}) {
  const percent = pct(buckets.indexed, buckets.eligible);
  const backlog =
    buckets.pending + buckets.error + buckets.stale + buckets.other;

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconCircle icon={icon} tone={tone} size="sm" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={buckets.indexed > 0 ? "default" : "secondary"}
            className="text-[11px]"
          >
            {buckets.indexed}/{buckets.eligible} indexiert
          </Badge>
          {backlog > 0 ? (
            <Badge variant="outline" className="text-[11px]">
              {backlog} offen
            </Badge>
          ) : null}
          {buckets.error > 0 ? (
            <Badge variant="destructive" className="text-[11px]">
              {buckets.error} Fehler
            </Badge>
          ) : null}
        </div>
      </div>
      <ProgressBar
        value={percent}
        label={`${percent}% in SQLite als indexiert markiert`}
        detail={`Qdrant-Chunks: ${qdrantChunks}`}
      />
      <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground sm:grid-cols-4">
        <span>Indexiert: {buckets.indexed}</span>
        <span>Wartend: {buckets.pending}</span>
        <span>Veraltet: {buckets.stale}</span>
        <span>Fehler: {buckets.error}</span>
      </div>
    </div>
  );
}

export function VectorIndexStatusPanel() {
  const [data, setData] = useState<VectorStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/vectors/status", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status laden fehlgeschlagen");
      setData(json as VectorStatusResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-3 text-base">
          <IconCircle icon={Database} tone="teal" size="sm" />
          Vektor-Index (Qdrant)
        </CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Aktualisieren
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Zeigt, welche Einträge lokal als indexiert gelten und wie viele Chunks
          in Qdrant liegen. Chat-Semantik braucht OpenAI-Embeddings und einen
          laufenden Qdrant-Service.
        </p>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && !data ? (
          <p className="text-sm text-muted-foreground">Lade Index-Status…</p>
        ) : null}

        {data ? (
          <>
            <div className="rounded-xl border border-border/60 bg-[var(--brand-docs-soft)]/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Qdrant:{" "}
                  <strong>
                    {data.qdrant.ok ? "verbunden" : "nicht erreichbar"}
                  </strong>
                </span>
                {data.qdrant.ok ? (
                  <Badge variant="secondary" className="text-[11px]">
                    {data.qdrant.points} Chunks gesamt
                  </Badge>
                ) : null}
                {!data.hasOpenAIKey ? (
                  <Badge variant="destructive" className="text-[11px]">
                    OpenAI-Key fehlt
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {data.qdrant.collection} · {data.qdrant.url}
              </p>
              {!data.qdrant.ok ? (
                <p className="mt-2 text-xs text-destructive">
                  Qdrant starten (z. B. via Docker Compose), dann Sync-/Job laufen
                  lassen — Paperless und Trilium werden dort indexiert.
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              <StatusRow
                title="Paperless-Dokumente"
                icon={FileText}
                tone="teal"
                buckets={data.local.paperless}
                qdrantChunks={data.qdrant.bySource.paperless}
              />
              <StatusRow
                title="Trilium-Notizen"
                icon={StickyNote}
                tone="teal"
                buckets={data.local.trilium}
                qdrantChunks={data.qdrant.bySource.trilium}
              />
              <StatusRow
                title="Guides (PDF)"
                icon={BookOpen}
                tone="green"
                buckets={data.local.guides}
                qdrantChunks={data.qdrant.bySource.guide}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
