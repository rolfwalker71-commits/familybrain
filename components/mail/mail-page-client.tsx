"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, Mail, RefreshCw, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { MailListFilter, MailListItem, MailMessageDetail } from "@/lib/mail/gmail";

const FILTERS: { id: MailListFilter; label: string }[] = [
  { id: "today", label: "Heute" },
  { id: "week", label: "Diese Woche" },
  { id: "unread", label: "Ungelesen" },
];

function formatMailWhen(item: MailListItem): string {
  if (item.internalDate) {
    const d = new Date(Number(item.internalDate));
    if (Number.isFinite(d.getTime())) {
      return d.toLocaleString("de-CH", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return item.date || "";
}

export function MailPageClient() {
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<MailListFilter>("today");
  const [items, setItems] = useState<MailListItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openMail = useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/mail/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Laden fehlgeschlagen");
      setDetail(data.message as MailMessageDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const g = searchParams.get("google");
    if (g === "connected") {
      setBanner("Google-Konto verbunden.");
    } else if (g === "error") {
      setBanner(
        `Google-Verbindung fehlgeschlagen: ${searchParams.get("reason") || "unbekannt"}`
      );
    }
    const open = searchParams.get("open");
    if (open) {
      void openMail(open);
    }
  }, [searchParams, openMail]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/mail/list?filter=${encodeURIComponent(filter)}&limit=30`
      );
      const data = await res.json();
      if (!res.ok && data.error) {
        throw new Error(data.error);
      }
      setConfigured(Boolean(data.configured));
      setConnected(Boolean(data.connected));
      setConnectedEmail(data.connectedEmail || null);
      setItems(data.items || []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function disconnect() {
    if (!window.confirm("Google-Konto trennen?")) return;
    await fetch("/api/google/oauth/disconnect", { method: "POST" });
    setBanner("Google-Konto getrennt.");
    await load();
  }

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <PageHeader
        title="Mail"
        description="Gmail-Auszug — heute, Woche oder ungelesen. Nur Lesen."
        icon={pageVisuals.mail.icon}
        tone={pageVisuals.mail.tone}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={filter === f.id ? "default" : "outline"}
                className={cn(
                  filter === f.id &&
                    "bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
                )}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw className="size-3.5" />
              Aktualisieren
            </Button>
          </div>
        }
      />

      {banner ? (
        <p className="text-sm text-emerald-800" role="status">
          {banner}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!configured ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-sm">
            <p>
              Google OAuth ist noch nicht konfiguriert. Unter{" "}
              <a
                href="/settings?tab=calendars"
                className="font-medium text-[var(--brand-docs)] underline-offset-2 hover:underline"
              >
                Einstellungen → Kalender
              </a>{" "}
              Client-ID und Secret hinterlegen.
            </p>
          </CardContent>
        </Card>
      ) : !connected ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              Noch kein Google-Konto verbunden. Readonly-Zugriff auf Gmail.
            </p>
            <a
              href="/api/google/oauth/start"
              className={cn(buttonVariants(), "gap-1.5")}
            >
              <Link2 className="size-3.5" />
              Google verbinden
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            Verbunden als{" "}
            <span className="font-medium text-foreground">
              {connectedEmail || "Google"}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void disconnect()}
          >
            <Unlink className="size-3.5" />
            Trennen
          </Button>
        </div>
      )}

      {connected ? (
        loading ? (
          <p className="text-sm text-muted-foreground">Lade Mails…</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Keine Mails in diesem Filter.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left shadow-[0_2px_10px_rgba(20,32,28,0.04)] hover:bg-muted/30"
                  onClick={() => void openMail(item.id)}
                >
                  <Mail
                    className="mt-0.5 size-8 shrink-0 text-muted-foreground"
                    strokeWidth={APP_ICON_STROKE}
                    absoluteStrokeWidth
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.unread ? (
                        <span
                          className="size-2 shrink-0 rounded-full bg-[var(--brand-docs)]"
                          aria-label="Ungelesen"
                        />
                      ) : null}
                      <p className="truncate text-sm font-medium">
                        {item.fromName}
                      </p>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatMailWhen(item)}
                      </span>
                    </div>
                    <p className="truncate text-sm text-foreground">
                      {item.subject}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.snippet}
                    </p>
                  </div>
                  {item.unread ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Neu
                    </Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <Dialog
        open={openId != null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setDetail(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[min(96vw,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
            <DialogTitle className="pr-8 text-base leading-snug">
              {detail?.subject || (detailLoading ? "Lade…" : "Mail")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {detail
                ? `${detail.fromName}${detail.from ? ` <${detail.from}>` : ""}`
                : "Mail-Inhalt"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
            {detailLoading ? (
              <p className="text-muted-foreground">Lade Inhalt…</p>
            ) : detail ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {formatMailWhen(detail)}
                  {detail.to ? ` · An: ${detail.to}` : ""}
                </p>
                {detail.bodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none break-words dark:prose-invert"
                    // Gmail HTML — sandbox-ish: we only show for the connected user
                    dangerouslySetInnerHTML={{ __html: detail.bodyHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {detail.bodyText || detail.snippet || "Kein Text."}
                  </pre>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
