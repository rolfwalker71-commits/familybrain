"use client";

import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ACTIVITY_ACTION_LABELS,
  type ActivityAction,
  type ActivityEntityType,
  type ActivityLogRow,
} from "@/lib/activity-log-shared";
import { toSwissDate } from "@/lib/utils/dates";
import { readResponseJson } from "@/lib/utils/fetch-json";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    const day = toSwissDate(iso.slice(0, 10));
    const time = d.toLocaleTimeString("de-CH", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${day} ${time}`;
  } catch {
    return iso;
  }
}

export function ActivityLogPanel({
  entityType,
  entityId,
  className,
  compact = false,
}: {
  entityType: ActivityEntityType;
  entityId: number;
  className?: string;
  compact?: boolean;
}) {
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        entityType,
        entityId: String(entityId),
        limit: compact ? "30" : "80",
      });
      const res = await fetch(`/api/activity-log?${params}`);
      const json = await readResponseJson<{
        error?: string;
        rows?: ActivityLogRow[];
        total?: number;
      }>(res);
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setRows((json.rows || []) as ActivityLogRow[]);
      setTotal(Number(json.total) || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [compact, entityId, entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Aktivität</p>
          {total > 0 ? (
            <Badge variant="secondary" className="text-[10px]">
              {total}
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Log…</p>
      ) : null}
      {!loading && rows.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Einträge.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {ACTIVITY_ACTION_LABELS[row.action as ActivityAction] ||
                    row.action}
                </Badge>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatWhen(row.created_at)}
                </span>
                {row.actor ? (
                  <span className="text-[11px] text-muted-foreground">
                    · {row.actor}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-foreground">{row.summary}</p>
              {row.field_name &&
              (row.old_value != null || row.new_value != null) ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium">{row.field_name}</span>
                  {": "}
                  <span className="line-through opacity-70">
                    {row.old_value ?? "—"}
                  </span>
                  {" → "}
                  <span>{row.new_value ?? "—"}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
