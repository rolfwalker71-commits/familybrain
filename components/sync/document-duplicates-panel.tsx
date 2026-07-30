"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { DuplicateCluster, DuplicateDocItem } from "@/lib/documents/duplicates";

type KeepMap = Record<string, number>; // cluster key → keep local id

export function DocumentDuplicatesPanel() {
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [keepByCluster, setKeepByCluster] = useState<KeepMap>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/duplicates");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      const next = (json.clusters || []) as DuplicateCluster[];
      setClusters(next);
      const keep: KeepMap = {};
      for (const c of next) {
        // Default: keep newest (already sorted)
        if (c.documents[0]) keep[c.key] = c.documents[0].id;
      }
      setKeepByCluster(keep);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteDuplicates(cluster: DuplicateCluster) {
    const keepId = keepByCluster[cluster.key];
    if (keepId == null) {
      setError("Bitte das zu behaltende Dokument wählen.");
      return;
    }
    const deleteIds = cluster.documents
      .map((d) => d.id)
      .filter((id) => id !== keepId);
    if (deleteIds.length === 0) return;

    const keepDoc = cluster.documents.find((d) => d.id === keepId);
    const ok = window.confirm(
      `${deleteIds.length} Duplikat(e) wirklich löschen?\n\n` +
        `Behalten: #${keepId} «${keepDoc?.title || "ohne Titel"}»\n` +
        `Löschen: ${deleteIds.map((id) => `#${id}`).join(", ")}\n\n` +
        `Es wird in Paperless und in Buddy gelöscht.`
    );
    if (!ok) return;

    setBusyKey(cluster.key);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/documents/duplicates/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteLocalIds: deleteIds, confirm: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Löschen fehlgeschlagen");
      }
      setMessage(
        `${Number(json.succeeded || 0)} Duplikat(e) gelöscht` +
          (Number(json.failed || 0) > 0
            ? `, ${Number(json.failed)} Fehler`
            : "")
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Copy className="size-4 text-[var(--brand-docs)]" />
          Doppelte Dokumente
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Gruppiert nach gleicher Kurzbeschreibung (Analyse). Pro Gruppe ein
          Dokument behalten, die anderen nach Prüfung löschen (Paperless +
          Buddy).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Suche…
              </>
            ) : (
              "Erneut suchen"
            )}
          </Button>
          {!loading ? (
            <span className="text-xs text-muted-foreground">
              {clusters.length} Gruppe
              {clusters.length === 1 ? "" : "n"} ·{" "}
              {clusters.reduce((n, c) => n + c.count, 0)} Treffer
            </span>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        {message ? (
          <p className="text-sm text-[var(--brand-docs)]">{message}</p>
        ) : null}

        {loading && clusters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Suche Duplikate…</p>
        ) : null}

        {!loading && clusters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine doppelten Kurzbeschreibungen gefunden.
          </p>
        ) : null}

        <div className="space-y-4">
          {clusters.map((cluster) => {
            const keepId = keepByCluster[cluster.key];
            const busy = busyKey === cluster.key;
            return (
              <section
                key={cluster.key}
                className="overflow-hidden rounded-xl border border-border/70 bg-muted/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">
                      {cluster.description}
                    </p>
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      {cluster.count}× gleich
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={busy || keepId == null}
                    onClick={() => void deleteDuplicates(cluster)}
                  >
                    <Trash2 className="size-3.5" />
                    {busy ? "Lösche…" : "Duplikate löschen"}
                  </Button>
                </div>
                <ul className="divide-y divide-border/50">
                  {cluster.documents.map((doc) => (
                    <DuplicateRow
                      key={doc.id}
                      doc={doc}
                      groupName={cluster.key}
                      selected={keepId === doc.id}
                      disabled={busy}
                      onSelect={() =>
                        setKeepByCluster((prev) => ({
                          ...prev,
                          [cluster.key]: doc.id,
                        }))
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DuplicateRow({
  doc,
  groupName,
  selected,
  disabled,
  onSelect,
}: {
  doc: DuplicateDocItem;
  groupName: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-3 py-2.5",
        selected && "bg-[var(--brand-docs-soft)]/40"
      )}
    >
      <input
        type="radio"
        name={`keep-${groupName}`}
        className="mt-2"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        aria-label={`Behalten: Dokument ${doc.id}`}
      />
      <DocumentAiIcon
        aiIconUrl={doc.ai_icon_url}
        category={doc.category}
        size="xs"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <Link
          href={`/documents/${doc.id}`}
          className="font-medium underline-offset-2 hover:underline"
        >
          {doc.title || `Dokument #${doc.id}`}
        </Link>
        <p className="text-xs text-muted-foreground">
          {[
            toSwissDate(doc.created_date),
            doc.correspondent_name,
            doc.category,
            `#${doc.id}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {doc.paperless_url ? (
          <a
            href={doc.paperless_url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-[var(--brand-docs)] underline-offset-2 hover:underline"
          >
            In Paperless öffnen
          </a>
        ) : null}
      </div>
      {selected ? (
        <Badge className="shrink-0 text-[10px]">Behalten</Badge>
      ) : (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          Duplikat
        </Badge>
      )}
    </li>
  );
}
