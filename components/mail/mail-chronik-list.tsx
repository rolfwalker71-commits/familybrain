"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import { toSwissDate } from "@/lib/utils/dates";

function chronikTimeLabel(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return toSwissDate(iso);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
  }).format(new Date());
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
  }).format(d);
  const hm = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  if (ymd === today) return hm;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
  }).format(yesterday);
  if (ymd === yYmd) return "Gestern";
  return toSwissDate(ymd);
}

export function mergeMailChronik(
  inbox: MsMailItem[],
  sent: MsMailItem[]
): MsMailItem[] {
  return [...inbox, ...sent].sort((a, b) =>
    (b.receivedOrSentAt || "").localeCompare(a.receivedOrSentAt || "")
  );
}

export function MailChronikSummary({
  rangeLabel,
  inboxCount,
  sentCount,
}: {
  rangeLabel: string;
  inboxCount: number;
  sentCount: number;
}) {
  return (
    <p className="px-1 text-[14px] font-semibold tracking-tight">
      {rangeLabel}
      <span className="font-normal text-muted-foreground"> · </span>
      <span className="font-semibold text-teal-800">{inboxCount} Eingang</span>
      <span className="font-normal text-muted-foreground"> · </span>
      <span className="font-semibold text-amber-800">{sentCount} Gesendet</span>
    </p>
  );
}

export function MailChronikList({
  items,
  loading,
}: {
  items: MsMailItem[];
  loading?: boolean;
}) {
  if (loading && items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Lade Mails…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
        Keine Mails im gewählten Zeitraum.
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
      {items.map((m) => {
        const isInbox = m.folder === "inbox";
        const partyName = isInbox
          ? m.from || m.fromEmail || "Unbekannt"
          : m.toPreview?.split("<")[0]?.trim() ||
            m.toEmails[0] ||
            "Empfänger";
        const partyEmail = isInbox
          ? m.fromEmail
          : m.toEmails[0] || null;
        const headline = `${partyName} · ${m.subject || "(kein Betreff)"}`;
        const sub = isInbox
          ? partyEmail || partyName
          : partyEmail
            ? `An ${partyName} (${partyEmail})`
            : `An ${partyName}`;

        const rowCls = cn(
          "flex items-start gap-3 border-l-[3px] px-3.5 py-3 transition-colors hover:bg-muted/30",
          isInbox ? "border-l-teal-600" : "border-l-amber-500"
        );

        const body = (
          <>
            <Badge
              variant="outline"
              className={cn(
                "mt-0.5 h-5 shrink-0 rounded-md px-1.5 text-[10px] font-semibold",
                isInbox
                  ? "border-teal-200/80 bg-teal-50 text-teal-950"
                  : "border-amber-200/80 bg-amber-50 text-amber-950"
              )}
            >
              {isInbox ? "Eingang" : "Gesendet"}
            </Badge>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p
                  className={cn(
                    "min-w-0 truncate text-[14px] leading-snug",
                    isInbox && !m.isRead ? "font-semibold" : "font-medium"
                  )}
                >
                  {headline}
                </p>
                <span className="shrink-0 pt-0.5 text-[12px] tabular-nums text-muted-foreground">
                  {chronikTimeLabel(m.receivedOrSentAt)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {sub}
              </p>
            </div>
          </>
        );

        return (
          <li
            key={`${m.folder}-${m.id}`}
            className="border-b border-border/40 last:border-0"
          >
            {m.webLink ? (
              <a
                href={m.webLink}
                target="_blank"
                rel="noopener noreferrer"
                className={rowCls}
              >
                {body}
              </a>
            ) : (
              <div className={rowCls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
