"use client";

import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { MailThreadCoverage } from "@/lib/mail/mail-threads";

/**
 * Explains that day analysis / chronik loads full conversations beyond Von–Bis.
 */
export function MailAnalysisThreadHint({
  coverage,
  clusterCount,
  className,
  compact,
}: {
  coverage?: MailThreadCoverage | null;
  /** Clusters returned by the current analysis (for coverage check). */
  clusterCount?: number | null;
  className?: string;
  /** Smaller inline line under the analysis card title. */
  compact?: boolean;
}) {
  const hasCoverage = coverage && coverage.total > 0;
  const stats =
    hasCoverage &&
    `${coverage.inRange} im Zeitraum` +
      (coverage.context > 0
        ? ` · ${coverage.context} Kontext ausserhalb`
        : " · kein Extra-Kontext") +
      ` · ${coverage.threads} Thread${coverage.threads === 1 ? "" : "s"}` +
      (coverage.threadsWithContext > 0
        ? ` (${coverage.threadsWithContext} mit Verlauf ausserhalb)`
        : "");

  const clusterLine =
    typeof clusterCount === "number" && hasCoverage
      ? `${clusterCount} Cluster` +
        (coverage.threads > 0
          ? ` · Ziel ~${coverage.threads} (ein Cluster pro Thread)`
          : "")
      : typeof clusterCount === "number"
        ? `${clusterCount} Cluster`
        : null;

  if (compact) {
    return (
      <p
        className={cn(
          "text-[12px] leading-snug text-muted-foreground",
          className
        )}
      >
        <span className="font-medium text-foreground">Threads:</span> kompletter
        Verlauf, ein Cluster pro Gespräch
        {stats ? <> — {stats}</> : null}
        {clusterLine ? <> · {clusterLine}</> : null}.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-[13px] leading-snug text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/12 dark:text-sky-100",
        className
      )}
      role="note"
    >
      <MessagesSquare
        className="mt-0.5 size-4 shrink-0 text-sky-800"
        strokeWidth={APP_ICON_STROKE}
        aria-hidden
      />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold tracking-tight">
          Vollständige Threads · ein Cluster pro Gespräch
        </p>
        <p className="text-[12px] text-sky-950/85">
          Zu jeder Mail im Von–Bis-Zeitraum wird der{" "}
          <strong className="font-semibold">gesamte Gesprächsverlauf</strong>{" "}
          nachgeladen. Die AI legt{" "}
          <strong className="font-semibold">
            pro Thread (bzw. Einzelmail) einen eigenen Cluster
          </strong>{" "}
          an — inkl. FYI/Newsletter und erledigter Themen. Mails mit
          Betreff «[SYSTEM INFOBOARD]» oder «[Monitoring]» werden aus der
          Analyse ausgeklammert.
          Offene Handlungen stehen zuerst; der Rest hinter «Alle Threads zeigen».
          Frühere Analysen blenden nichts aus.
        </p>
        {stats ? (
          <p className="text-[12px] font-medium tabular-nums text-sky-900">
            Geladen: {stats}
            {clusterLine ? ` · Analyse: ${clusterLine}` : ""}
          </p>
        ) : (
          <p className="text-[12px] text-sky-900/70">
            Nach «Aktualisieren» oder Analyse start erscheinen hier die
            Thread-Zahlen.
          </p>
        )}
      </div>
    </div>
  );
}
