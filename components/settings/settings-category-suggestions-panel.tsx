"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderTree, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";

type Suggestion = {
  id: string;
  proposedName: string;
  description: string;
  mapToExisting?: string | null;
  documentIds: number[];
  sampleTitles: string[];
  status: "pending" | "accepted" | "rejected";
};

export function SettingsCategorySuggestionsPanel() {
  const [pending, setPending] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge/category-suggestions");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      setPending(data.pending || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAnalyze() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/knowledge/category-suggestions", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      setPending(data.pending || []);
      setInfo(
        `${data.scanned ?? 0} Sonstiges-Dokumente geprüft · ${data.created ?? 0} Vorschläge`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string, action: "accept" | "reject") {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/knowledge/category-suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Aktion fehlgeschlagen");
      setPending(data.pending || []);
      if (action === "accept") {
        setInfo(
          data.areaName
            ? `«${data.areaName}»: ${data.moved ?? 0} Dokumente verschoben`
            : "Übernommen"
        );
      } else {
        setInfo("Vorschlag verworfen — Dokumente bleiben in Sonstiges");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={FolderTree} tone="teal" size="sm" />
          Wissensrubriken aus Sonstiges
        </CardTitle>
        {pending.length > 0 ? (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            {pending.length} offen
          </Badge>
        ) : (
          <Badge variant="secondary">Keine Vorschläge</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Analysiert die Rubrik «Sonstiges» per Stichwort-Cluster (ohne
          Neuanalyse / ohne OpenAI). Du entscheidest pro Vorschlag: neue Rubrik
          anlegen bzw. in bestehende verschieben — oder verwerfen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void runAnalyze()}
          >
            <RefreshCw className="size-3.5" />
            {busy ? "Analysiere…" : "Sonstiges analysieren"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Aktualisieren
          </Button>
        </div>
        {info ? (
          <p className="text-xs text-muted-foreground">{info}</p>
        ) : null}
        {error ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine offenen Vorschläge. «Sonstiges analysieren» starten.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {s.mapToExisting
                        ? `Nach «${s.mapToExisting}» verschieben`
                        : `Neue Rubrik «${s.proposedName}»`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.description} · {s.documentIds.length} Dokumente
                    </p>
                    {s.sampleTitles.length > 0 ? (
                      <ul className="list-inside list-disc text-xs text-muted-foreground">
                        {s.sampleTitles.map((t) => (
                          <li key={t} className="truncate">
                            {t}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      disabled={busy}
                      onClick={() => void resolve(s.id, "accept")}
                    >
                      Anlegen / Übernehmen
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void resolve(s.id, "reject")}
                    >
                      Verwerfen
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
