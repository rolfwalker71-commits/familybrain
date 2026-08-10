"use client";

import { useCallback, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import type { MailMessageDetail } from "@/lib/mail/gmail";
import { toSwissDate } from "@/lib/utils/dates";

export type MailChronikProvider = "microsoft" | "google";

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

function formatDetailWhen(detail: MailMessageDetail): string {
  if (detail.internalDate) {
    const d = new Date(Number(detail.internalDate));
    if (Number.isFinite(d.getTime())) {
      return d.toLocaleString("de-CH", {
        timeZone: "Europe/Zurich",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return detail.date || "";
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
  provider,
}: {
  items: MsMailItem[];
  loading?: boolean;
  provider: MailChronikProvider;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [webLink, setWebLink] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const openMail = useCallback(
    async (item: MsMailItem) => {
      setOpenId(item.id);
      setWebLink(item.webLink);
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        const path =
          provider === "microsoft"
            ? `/api/microsoft/mail/${encodeURIComponent(item.id)}`
            : `/api/mail/${encodeURIComponent(item.id)}`;
        const res = await fetch(path);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { error?: string }).error || "Mail laden fehlgeschlagen"
          );
        }
        setDetail((data as { message: MailMessageDetail }).message);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [provider]
  );

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

  const externalLabel =
    provider === "microsoft" ? "In Outlook öffnen" : "In Gmail öffnen";

  return (
    <>
      <ul className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
        {items.map((m) => {
          const isInbox = m.folder === "inbox";
          const partyName = isInbox
            ? m.from || m.fromEmail || "Unbekannt"
            : m.toPreview?.split("<")[0]?.trim() ||
              m.toEmails[0] ||
              "Empfänger";
          const partyEmail = isInbox ? m.fromEmail : m.toEmails[0] || null;
          const headline = `${partyName} · ${m.subject || "(kein Betreff)"}`;
          const sub = isInbox
            ? partyEmail || partyName
            : partyEmail
              ? `An ${partyName} (${partyEmail})`
              : `An ${partyName}`;

          return (
            <li
              key={`${m.folder}-${m.id}`}
              className="border-b border-border/40 last:border-0"
            >
              <button
                type="button"
                onClick={() => void openMail(m)}
                className={cn(
                  "flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors",
                  isInbox
                    ? "bg-teal-50/70 hover:bg-teal-100/70"
                    : "bg-amber-50/70 hover:bg-amber-100/70"
                )}
              >
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
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={Boolean(openId)}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setDetail(null);
            setDetailError(null);
            setWebLink(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[min(96vw,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-base leading-snug">
              {detail?.subject ||
                (detailLoading ? "Lade…" : detailError ? "Mail" : "Mail")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {detail
                ? `${detail.fromName || detail.from || "—"}${
                    detail.from && detail.fromName
                      ? ` <${detail.from}>`
                      : ""
                  }${formatDetailWhen(detail) ? ` · ${formatDetailWhen(detail)}` : ""}`
                : provider === "microsoft"
                  ? "Outlook-Nachricht"
                  : "Gmail-Nachricht"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-3">
            {webLink ? (
              <div>
                <a
                  href={webLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1.5"
                  )}
                >
                  <ExternalLink className="size-3.5" />
                  {externalLabel}
                </a>
              </div>
            ) : null}
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">Lade Inhalt…</p>
            ) : detailError ? (
              <p className="text-sm text-rose-800">{detailError}</p>
            ) : detail ? (
              <div className="space-y-3">
                {detail.to ? (
                  <p className="text-[12px] text-muted-foreground">
                    An: {detail.to}
                  </p>
                ) : null}
                {detail.bodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none break-words text-sm leading-relaxed [&_a]:underline [&_img]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: detail.bodyHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 font-sans text-sm leading-relaxed">
                    {detail.bodyText || detail.snippet || "(kein Text)"}
                  </pre>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
