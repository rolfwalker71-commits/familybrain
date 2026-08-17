"use client";

import { useCallback, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MicrosoftMailComposeDialog } from "@/components/microsoft/microsoft-mail-compose-dialog";
import { MicrosoftMailQuickActions } from "@/components/microsoft/microsoft-mail-quick-actions";
import { MailHtmlBody } from "@/components/mail/mail-html-body";
import { cn } from "@/lib/utils";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import type { MailMessageDetail } from "@/lib/mail/gmail";
import {
  buildMailChronikThreads,
  chronikDateTimeLabel,
} from "@/lib/mail/mail-threads";

export type MailChronikProvider = "microsoft" | "google";

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
  return [...inbox, ...sent];
}

export function countMailsInRange(
  items: MsMailItem[],
  folder?: "inbox" | "sent"
): number {
  return items.filter(
    (m) =>
      m.inRange !== false && (folder == null || m.folder === folder)
  ).length;
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

function MailChronikRow({
  mail,
  indented,
  onOpen,
}: {
  mail: MsMailItem;
  indented: boolean;
  onOpen: (m: MsMailItem) => void;
}) {
  const isInbox = mail.folder === "inbox";
  const isContext = mail.inRange === false;
  const partyName = isInbox
    ? mail.from || mail.fromEmail || "Unbekannt"
    : mail.toPreview?.split("<")[0]?.trim() ||
      mail.toEmails[0] ||
      "Empfänger";
  const partyEmail = isInbox ? mail.fromEmail : mail.toEmails[0] || null;
  const headline = `${partyName} · ${mail.subject || "(kein Betreff)"}`;
  const sub = isInbox
    ? partyEmail || partyName
    : partyEmail
      ? `An ${partyName} (${partyEmail})`
      : `An ${partyName}`;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onOpen(mail)}
      className={cn(
        "h-auto w-full min-w-0 justify-start items-start gap-3 px-3.5 py-3 text-left transition-colors",
        indented && "border-l-2 border-border/60 bg-muted/15 pl-5 sm:pl-6",
        isContext
          ? "text-muted-foreground hover:bg-muted/35"
          : indented
            ? "hover:bg-muted/30"
            : isInbox
              ? "bg-teal-50/70 hover:bg-teal-100/70 dark:bg-teal-500/10 dark:hover:bg-teal-500/16"
              : "bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-500/10 dark:hover:bg-amber-500/16"
      )}
    >
      <div className="flex w-[4.25rem] shrink-0 flex-col items-start gap-1">
        <Badge
          variant="outline"
          className={cn(
            "mt-0.5 h-5 rounded-md px-1.5 text-[10px] font-semibold",
            isContext
              ? "border-border/70 bg-background/70 text-muted-foreground"
              : isInbox
                ? "border-teal-200/80 bg-teal-50 text-teal-950 dark:border-teal-400/30 dark:bg-teal-500/15 dark:text-teal-100"
                : "border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100"
          )}
        >
          {isInbox ? "Eingang" : "Gesendet"}
        </Badge>
        {isContext ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">
            Kontext
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[14px] leading-snug",
              isContext
                ? "font-normal"
                : isInbox && !mail.isRead
                  ? "font-semibold"
                  : "font-medium"
            )}
          >
            {headline}
          </p>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap pt-0.5 text-[12px] tabular-nums",
              isContext ? "text-muted-foreground/80" : "text-muted-foreground"
            )}
          >
            {chronikDateTimeLabel(mail.receivedOrSentAt)}
          </span>
        </div>
        <p
          className={cn(
            "mt-0.5 truncate text-[12px]",
            isContext ? "text-muted-foreground/80" : "text-muted-foreground"
          )}
        >
          {sub}
        </p>
      </div>
    </Button>
  );
}

export function MailChronikList({
  items,
  loading,
  provider,
  onItemsChanged,
}: {
  items: MsMailItem[];
  loading?: boolean;
  provider: MailChronikProvider;
  onItemsChanged?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [webLink, setWebLink] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<"inbox" | "sent" | null>(null);
  const [openFromEmail, setOpenFromEmail] = useState<string | null>(null);
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const threads = useMemo(() => buildMailChronikThreads(items), [items]);
  const hasInRange = items.some((m) => m.inRange !== false);

  const openMail = useCallback(
    async (item: MsMailItem) => {
      setOpenId(item.id);
      setWebLink(item.webLink);
      setOpenFolder(item.folder);
      setOpenFromEmail(item.fromEmail || null);
      setOpenSubject(item.subject || null);
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
  if (!hasInRange) {
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
      <ul className="space-y-3">
        {threads.map((thread) => {
          const contextCount = thread.mails.filter(
            (m) => m.inRange === false
          ).length;
          const isThread = thread.mails.length > 1;
          return (
            <li key={thread.key}>
              <article
                className={cn(
                  "overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)]",
                  isThread && "ring-1 ring-border/40"
                )}
              >
                {isThread ? (
                  <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3.5 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Thread · {thread.mails.length} Mails
                      {contextCount > 0
                        ? ` · ${contextCount} Kontext`
                        : ""}
                    </p>
                  </div>
                ) : null}
                <ul>
                  {thread.mails.map((m, idx) => (
                    <li
                      key={`${m.folder}-${m.id}`}
                      className={cn(idx > 0 && "border-t border-border/35")}
                    >
                      <MailChronikRow
                        mail={m}
                        indented={idx > 0}
                        onOpen={(item) => void openMail(item)}
                      />
                    </li>
                  ))}
                </ul>
              </article>
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
            setOpenFolder(null);
            setOpenFromEmail(null);
            setOpenSubject(null);
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
            <div className="flex flex-wrap items-center gap-2">
              {webLink ? (
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
              ) : null}
              {provider === "microsoft" && openId ? (
                <MicrosoftMailQuickActions
                  messageId={openId}
                  unread={detail?.unread}
                  folder={openFolder}
                  onReply={() => setComposeOpen(true)}
                  onChanged={(action) => {
                    if (
                      action === "archive" ||
                      action === "delete" ||
                      action === "markRead"
                    ) {
                      if (action === "archive" || action === "delete") {
                        setOpenId(null);
                      }
                      onItemsChanged?.();
                    }
                  }}
                />
              ) : null}
            </div>
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
                <MailHtmlBody
                  html={detail.bodyHtml}
                  plainFallback={detail.bodyText || detail.snippet}
                />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {provider === "microsoft" ? (
        <MicrosoftMailComposeDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          mode="reply"
          sourceMailId={openId}
          defaultTo={openFromEmail || detail?.from || ""}
          defaultSubject={
            openSubject
              ? openSubject.toLowerCase().startsWith("re:")
                ? openSubject
                : `Re: ${openSubject}`
              : ""
          }
          defaultBody=""
          onSent={() => onItemsChanged?.()}
        />
      ) : null}
    </>
  );
}
