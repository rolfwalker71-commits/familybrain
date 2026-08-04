"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCHF } from "@/lib/utils/format";
import { toSwissDate } from "@/lib/utils/dates";
import { KNOWLEDGE_AREAS } from "@/lib/extraction/categories";
import type { FinanceEditableItem } from "@/lib/dashboard/overview";
import { cn } from "@/lib/utils";

export function KpiCorrectSheet({
  open,
  onOpenChange,
  items,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: FinanceEditableItem[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState(items);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setRows(items);
  }, [open, items]);

  async function patch(
    id: number,
    body: { counts_in_stats?: boolean; category?: string | null }
  ) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/finance/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                countsInStats:
                  body.counts_in_stats !== undefined
                    ? body.counts_in_stats
                    : r.countsInStats,
                category:
                  body.category !== undefined ? body.category : r.category,
              }
            : r
        )
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
          <SheetTitle>Kennzahlen korrigieren</SheetTitle>
          <SheetDescription>
            Positionen aus dem gewählten Zeitraum — aus Statistik nehmen oder
            Kategorie anpassen.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Finanzpositionen in diesem Zeitraum.
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  "space-y-2 rounded-xl border border-border/60 p-3",
                  !row.countsInStats && "border-dashed opacity-80"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.vendor || row.documentTitle || `Pos. #${row.id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {toSwissDate(row.invoiceDate)}
                      {row.amount != null
                        ? ` · ${formatCHF(row.amount, row.currency || "CHF")}`
                        : ""}
                    </p>
                  </div>
                  {row.documentId ? (
                    <Link
                      href={`/documents/${row.documentId}`}
                      className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
                    >
                      Dokument
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={row.countsInStats ? "secondary" : "outline"}
                    disabled={busyId === row.id}
                    onClick={() =>
                      void patch(row.id, {
                        counts_in_stats: !row.countsInStats,
                      })
                    }
                  >
                    {row.countsInStats ? "In Statistik" : "Ohne Statistik"}
                  </Button>
                  <select
                    className="h-8 max-w-[12rem] rounded-md border border-border bg-background px-2 text-xs"
                    value={row.category || ""}
                    disabled={busyId === row.id}
                    onChange={(e) => {
                      const next = e.target.value || null;
                      void patch(row.id, { category: next });
                    }}
                    aria-label="Kategorie"
                  >
                    <option value="">Kategorie…</option>
                    {KNOWLEDGE_AREAS.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                {row.description ? (
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">
                    {row.description}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
