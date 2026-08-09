"use client";

import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toSwissDate } from "@/lib/utils/dates";
import type { MailDayCachedSummary } from "@/lib/mail/mail-day-cache-summary";

function finishedLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-CH", {
      timeZone: "Europe/Zurich",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function rangeLabel(fromYmd: string, toYmd: string): string {
  if (fromYmd === toYmd) return toSwissDate(fromYmd);
  return `${toSwissDate(fromYmd)} – ${toSwissDate(toYmd)}`;
}

export function MailTagesanalysenList({
  entries,
  selectedKey,
  onSelect,
  emptyHint,
}: {
  entries: MailDayCachedSummary[];
  selectedKey: string | null;
  onSelect: (entry: MailDayCachedSummary) => void;
  emptyHint?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
        {emptyHint ||
          "Noch keine Tagesanalysen gespeichert. Starte eine neue AI-Tagesanalyse."}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((e) => {
        const active = e.rangeKey === selectedKey;
        return (
          <li key={e.rangeKey}>
            <button
              type="button"
              onClick={() => onSelect(e)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left shadow-sm transition-colors",
                active
                  ? "border-[var(--brand-docs)]/40 bg-[var(--brand-docs)]/5"
                  : "border-border/70 bg-card hover:bg-muted/30"
              )}
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-black tracking-tight">
                    {rangeLabel(e.fromYmd, e.toYmd)}
                  </p>
                  <span className="text-[12px] text-muted-foreground">
                    {finishedLabel(e.finishedAt)}
                  </span>
                  <Badge
                    variant="secondary"
                    className="h-5 rounded-md bg-emerald-50 text-[10px] font-semibold text-emerald-900"
                  >
                    Fertig
                  </Badge>
                </div>
                <p className="line-clamp-2 text-[13px] leading-snug text-foreground/90">
                  {e.daySummary || "AI · Tagesbild"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="h-5 text-[10px]">
                    {e.clusterCount} Cluster
                  </Badge>
                  <Badge variant="outline" className="h-5 text-[10px]">
                    {e.taskCount} Aufgabe{e.taskCount === 1 ? "" : "n"}
                  </Badge>
                  {e.replyCount > 0 ? (
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {e.replyCount} Antwort{e.replyCount === 1 ? "" : "en"}
                    </Badge>
                  ) : null}
                  {e.model ? (
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {e.model}
                    </Badge>
                  ) : null}
                  {e.usageLine ? (
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {e.usageLine}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <ChevronRight
                className="mt-1 size-4 shrink-0 text-muted-foreground/70"
                aria-hidden
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
