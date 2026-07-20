"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals } from "@/components/layout/icon-circle";

type GuideRow = {
  id: number;
  title: string;
  filename: string;
  page_count: number | null;
  extracted_chars: number;
  embedding_status: string | null;
  embedding_error: string | null;
  last_indexed_at: string | null;
  created_at: string;
};

type GuidesResponse = {
  guides: GuideRow[];
  indexedGuides: number;
  qdrant: { ok: boolean; points: number };
  hasOpenAIKey: boolean;
};

function statusBadge(status: string | null) {
  switch (status) {
    case "indexed":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          Indexiert
        </Badge>
      );
    case "indexing":
      return <Badge variant="secondary">Indexiert…</Badge>;
    case "error":
      return <Badge variant="destructive">Fehler</Badge>;
    default:
      return <Badge variant="secondary">Ausstehend</Badge>;
  }
}

export function GuidesClient() {
  const [guides, setGuides] = useState<GuideRow[]>([]);
  const [indexedGuides, setIndexedGuides] = useState(0);
  const [qdrantOk, setQdrantOk] = useState(false);
  const [qdrantPoints, setQdrantPoints] = useState(0);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadGuides() {
    const res = await fetch("/api/guides");
    const data = (await res.json()) as GuidesResponse;
    setGuides(data.guides || []);
    setIndexedGuides(data.indexedGuides || 0);
    setQdrantOk(Boolean(data.qdrant?.ok));
    setQdrantPoints(data.qdrant?.points || 0);
    setHasOpenAIKey(Boolean(data.hasOpenAIKey));
  }

  useEffect(() => {
    void loadGuides();
  }, []);

  async function uploadGuide() {
    if (!file) {
      setError("Bitte eine PDF-Datei auswählen.");
      return;
    }

    setBusy("upload");
    setError(null);
    setMessage(null);

    try {
      const form = new FormData();
      form.append("file", file);
      if (title.trim()) form.append("title", title.trim());

      const res = await fetch("/api/guides", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen");

      setMessage(
        `Guide importiert und indexiert (${data.chunkCount} Chunks, ${data.pageCount || "?"} Seiten).`
      );
      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadGuides();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function reindexGuide(guideId: number) {
    setBusy(guideId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/guides/${guideId}/reindex`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reindex fehlgeschlagen");
      setMessage(`Guide #${guideId} neu indexiert (${data.chunkCount} Chunks).`);
      await loadGuides();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function deleteGuide(guideId: number) {
    if (!window.confirm("Guide wirklich löschen?")) return;
    setBusy(guideId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/guides/${guideId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      setMessage(`Guide #${guideId} gelöscht.`);
      await loadGuides();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guides"
        description="PDF-Guides importieren und semantisch für den Chat indexieren"
        icon={pageVisuals.guides.icon}
        tone={pageVisuals.guides.tone}
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            <IconCircle icon={Upload} tone="blue" size="sm" />
            PDF importieren
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Text-PDFs werden lokal gespeichert, in Chunks zerlegt und mit OpenAI
            Embeddings in Qdrant indexiert. Der Chat nutzt diese Inhalte
            semantisch.
          </p>

          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <div>
              Qdrant:{" "}
              <strong>{qdrantOk ? "verbunden" : "nicht erreichbar"}</strong>
              {qdrantOk ? ` · ${qdrantPoints} Vektoren` : null}
            </div>
            <div>
              Indexierte Guides: <strong>{indexedGuides}</strong>
            </div>
            {!hasOpenAIKey ? (
              <div className="mt-2 text-destructive">
                OpenAI API-Key fehlt (für Embeddings erforderlich).
              </div>
            ) : null}
            {!qdrantOk ? (
              <div className="mt-2 text-destructive">
                Qdrant läuft nicht. Bitte `docker compose up -d` mit Qdrant-Service
                starten.
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="guideTitle">Titel (optional)</Label>
            <Input
              id="guideTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Proxmox Homelab Guide"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guideFile">PDF-Datei</Label>
            <Input
              id="guideFile"
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button
            onClick={() => void uploadGuide()}
            disabled={busy !== null || !file || !hasOpenAIKey || !qdrantOk}
          >
            {busy === "upload" ? "Importiert…" : "PDF importieren & indexieren"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            <IconCircle icon={BookOpen} tone="teal" size="sm" />
            Importierte Guides
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {guides.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Guides importiert.
            </p>
          ) : (
            guides.map((guide) => (
              <div
                key={guide.id}
                id={`guide-${guide.id}`}
                className="rounded-lg border border-border/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{guide.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {guide.filename}
                      {guide.page_count ? ` · ${guide.page_count} Seiten` : ""}
                      {guide.extracted_chars
                        ? ` · ${guide.extracted_chars.toLocaleString("de-CH")} Zeichen`
                        : ""}
                    </div>
                    {guide.embedding_error ? (
                      <div className="mt-2 text-xs text-destructive">
                        {guide.embedding_error}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(guide.embedding_status)}
                    <Button
                      variant="outline"
                      size="icon-sm"
                      title="Neu indexieren"
                      disabled={busy !== null}
                      onClick={() => void reindexGuide(guide.id)}
                    >
                      {busy === guide.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      title="Löschen"
                      disabled={busy !== null}
                      onClick={() => void deleteGuide(guide.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
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
