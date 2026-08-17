"use client";

import { CalendarDays, Check, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { toSwissDate } from "@/lib/utils/dates";
import type { MailDayCachedSummary } from "@/lib/mail/mail-day-cache-summary";
import type { MailWorkspaceAccent } from "@/components/mail/mail-workspace-subnav";

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
  accent = "google",
}: {
  entries: MailDayCachedSummary[];
  selectedKey: string | null;
  onSelect: (entry: MailDayCachedSummary) => void;
  emptyHint?: string;
  accent?: MailWorkspaceAccent;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/70 bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
        {emptyHint ||
          "Noch keine Tagesanalysen gespeichert. Starte eine neue AI-Tagesanalyse."}
      </p>
    );
  }

  const activeBorder =
    accent === "google"
      ? "border-teal-700/70 bg-teal-50/30 dark:border-teal-400/40 dark:bg-teal-500/10"
      : "border-[var(--brand-docs)]/50 bg-[var(--brand-docs-soft)]/40";
  const iconWrap =
    accent === "google"
      ? "bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-100"
      : "bg-[var(--brand-docs-soft)] text-[var(--brand-docs)]";

  return (
    <ul className="space-y-2.5">
      {entries.map((e) => {
        const active = e.rangeKey === selectedKey;
        return (
          <li key={e.rangeKey}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSelect(e)}
              className={cn(
                "h-auto w-full items-start justify-start gap-3 rounded-2xl border px-3.5 py-3.5 text-left shadow-[0_4px_18px_rgba(15,23,42,0.05)]",
                active
                  ? activeBorder
                  : "border-border/60 bg-card hover:bg-muted/20"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                  iconWrap
                )}
              >
                <CalendarDays
                  className="size-4"
                  strokeWidth={APP_ICON_STROKE}
                  absoluteStrokeWidth
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[12px] text-muted-foreground">
                  {finishedLabel(e.finishedAt)}
                  <span className="text-muted-foreground/70">
                    {" "}
                    · {rangeLabel(e.fromYmd, e.toYmd)}
                  </span>
                </p>
                <p className="text-[15px] font-black tracking-tight">
                  AI · Tagesbild
                </p>
                <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                  {e.daySummary ||
                    `Analyse von Posteingang und Gesendet. ${e.clusterCount} Cluster, ${e.taskCount} Aufgabe(n).`}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
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
              <div className="flex shrink-0 flex-col items-end gap-2 self-stretch pt-0.5">
                <Badge className="h-6 gap-1 rounded-full border-transparent bg-emerald-100 px-2 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100">
                  <Check className="size-3" aria-hidden />
                  Fertig
                </Badge>
                <ChevronRight
                  className="mt-auto size-4 text-muted-foreground/70"
                  aria-hidden
                />
              </div>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
