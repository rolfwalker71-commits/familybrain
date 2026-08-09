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
  if (ymd === yYmd) return `Gestern ${hm}`;
  return `${toSwissDate(ymd)} ${hm}`;
}

export function mergeMailChronik(
  inbox: MsMailItem[],
  sent: MsMailItem[]
): MsMailItem[] {
  return [...inbox, ...sent].sort((a, b) =>
    (b.receivedOrSentAt || "").localeCompare(a.receivedOrSentAt || "")
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
      <p className="text-sm text-muted-foreground">
        Keine Mails im gewählten Zeitraum.
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      {items.map((m) => {
        const isInbox = m.folder === "inbox";
        const party = isInbox
          ? m.from || m.fromEmail || "Unbekannt"
          : m.toPreview || m.toEmails[0] || "Empfänger";
        return (
          <li key={`${m.folder}-${m.id}`} className="border-b border-border/50 last:border-0">
            {m.webLink ? (
              <a
                href={m.webLink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-start gap-3 border-l-[3px] px-3 py-2.5 transition-colors hover:bg-muted/40",
                  isInbox ? "border-l-teal-600" : "border-l-amber-500"
                )}
              >
                <ChronikRowBody
                  isInbox={isInbox}
                  subject={m.subject}
                  party={party}
                  preview={m.preview}
                  time={chronikTimeLabel(m.receivedOrSentAt)}
                  unread={isInbox && !m.isRead}
                />
              </a>
            ) : (
              <div
                className={cn(
                  "flex items-start gap-3 border-l-[3px] px-3 py-2.5",
                  isInbox ? "border-l-teal-600" : "border-l-amber-500"
                )}
              >
                <ChronikRowBody
                  isInbox={isInbox}
                  subject={m.subject}
                  party={party}
                  preview={m.preview}
                  time={chronikTimeLabel(m.receivedOrSentAt)}
                  unread={isInbox && !m.isRead}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ChronikRowBody({
  isInbox,
  subject,
  party,
  preview,
  time,
  unread,
}: {
  isInbox: boolean;
  subject: string;
  party: string;
  preview: string;
  time: string;
  unread: boolean;
}) {
  return (
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
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "truncate text-[14px] leading-snug",
              unread ? "font-semibold" : "font-medium"
            )}
          >
            {subject || "(kein Betreff)"}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {time}
          </span>
        </div>
        <p className="truncate text-[12px] text-muted-foreground">
          {isInbox ? party : `An ${party}`}
        </p>
        {preview ? (
          <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground/90">
            {preview}
          </p>
        ) : null}
      </div>
    </>
  );
}
