"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Copy, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentAiIcon } from "@/components/documents/document-ai-icon";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { DuplicateCluster, DuplicateDocItem } from "@/lib/documents/duplicates";

type KeepMap = Record<string, number>;

export function DocumentDuplicatesPanel() {
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [keepByCluster, setKeepByCluster] = useState<KeepMap>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

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
        if (c.documents[0]) keep[c.key] = c.documents[0].id;
      }
      setKeepByCluster(keep);
      // All clusters collapsed by default
      setOpenKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function expandAll() {
    setOpenKeys(new Set(clusters.map((c) => c.key)));
  }

  function collapseAll() {
    setOpenKeys(new Set());
  }

  function toggleCluster(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
          Duplikat nur wenn <strong>Titel und Datum</strong> identisch sind —
          gleiche KI-Kurzbeschreibung allein reicht nicht. Pro Gruppe eines
          behalten, Rest löschen.
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
          <Button
            size="sm"
            variant="outline"
            disabled={loading || clusters.length === 0}
            onClick={expandAll}
          >
            Alles aufklappen
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || clusters.length === 0 || openKeys.size === 0}
            onClick={collapseAll}
          >
            Alles zuklappen
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
            Keine Duplikate gefunden (gleicher Titel und gleiches Datum).
          </p>
        ) : null}

        <div className="space-y-2">
          {clusters.map((cluster) => {
            const keepId = keepByCluster[cluster.key];
            const busy = busyKey === cluster.key;
            const open = openKeys.has(cluster.key);
            return (
              <section
                key={cluster.key}
                className="overflow-hidden rounded-xl border border-border/70 bg-muted/10"
              >
                <div className="flex flex-wrap items-start gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    onClick={() => toggleCluster(cluster.key)}
                    aria-expanded={open}
                  >
                    <ChevronDown
                      className={cn(
                        "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug">
                        {cluster.description}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {cluster.count}× gleich
                        </Badge>
                        {cluster.refNumber ? (
                          <Badge variant="outline" className="text-[10px]">
                            Nr. {cluster.refNumber}
                          </Badge>
                        ) : null}
                        {cluster.matchedByDate ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Titel + Datum
                          </Badge>
                        ) : null}
                      </span>
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={busy || keepId == null}
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteDuplicates(cluster);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    {busy ? "Lösche…" : "Duplikate löschen"}
                  </Button>
                </div>
                {open ? (
                  <ul className="divide-y divide-border/50 border-t border-border/60">
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
                ) : null}
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
