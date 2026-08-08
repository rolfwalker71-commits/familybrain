"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, Unlink, Cloud, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

type Connection = {
  microsoftOauthConfigured: boolean;
  ownerUserId: number | null;
  connected: boolean;
  connectedEmail: string | null;
  connectedDisplayName: string | null;
  hasMailScope: boolean;
  hasMailSendScope: boolean;
  hasCalendarScope: boolean;
  hasTasksScope?: boolean;
};

type Probe = {
  ok: boolean;
  me?: { displayName: string | null; mail: string | null };
  calendar?: {
    ok: boolean;
    todayEventCount: number;
    sampleTitles: string[];
    error?: string;
  };
  error?: string;
};

export function SettingsMicrosoftConnectPanel() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/connection");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status laden fehlgeschlagen");
      setData(json as Connection);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const flag = searchParams.get("microsoft");
    if (flag === "connected") {
      setStatus("Microsoft 365 verbunden.");
      void load();
    } else if (flag === "error") {
      const reason = searchParams.get("reason") || "unbekannt";
      setError(`Verbindung fehlgeschlagen: ${reason}`);
    }
  }, [searchParams, load]);

  async function disconnect() {
    if (!window.confirm("Dein Microsoft 365-Konto von Buddy trennen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/oauth/disconnect", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Trennen fehlgeschlagen");
      setStatus("Microsoft 365 getrennt — gilt nur für dich.");
      setProbe(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runProbe() {
    setProbing(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/probe");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Probe fehlgeschlagen");
      setProbe(json as Probe);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={Cloud} tone="blue" size="sm" />
          Mein Microsoft 365
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Geschäftskonto für Outlook-Mail und -Kalender (z. B.{" "}
          <span className="font-medium text-foreground">
            rolf.walker@an-group.one
          </span>
          ). Getrennt von Google — Tokens nur für dich. Welche Kalender Buddy
          zeigt, wählst du unten unter «Microsoft 365-Kalender».
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : (
          <>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {status ? (
              <p className="text-sm text-emerald-700" role="status">
                {status}
              </p>
            ) : null}

            {!data?.microsoftOauthConfigured ? (
              <p className="text-sm text-amber-800">
                Microsoft OAuth ist noch nicht app-weit konfiguriert (Admin:
                Einstellungen → Kalender → Microsoft 365 OAuth).
              </p>
            ) : data.ownerUserId == null ? (
              <p className="text-sm text-amber-800">
                Kein App-User — Verbindung nicht möglich.
              </p>
            ) : data.connected ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm">
                    Verbunden als{" "}
                    <span className="font-medium">
                      {data.connectedDisplayName
                        ? `${data.connectedDisplayName} · `
                        : ""}
                      {data.connectedEmail || "Microsoft 365"}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void disconnect()}
                  >
                    <Unlink className="size-3.5" />
                    Trennen
                  </Button>
                  <a
                    href="/api/microsoft/oauth/start"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "gap-1.5"
                    )}
                  >
                    <Link2 className="size-3.5" />
                    Neu verbinden
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={probing}
                    onClick={() => void runProbe()}
                  >
                    <RefreshCw
                      className={cn("size-3.5", probing && "animate-spin")}
                    />
                    Verbindung testen
                  </Button>
                </div>
                {!data.hasCalendarScope || !data.hasMailScope ? (
                  <p className="text-xs text-amber-800">
                    Scopes unvollständig — bitte neu verbinden (Mail +
                    Kalender + Tasks).
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Mail und Kalender aktiv
                    {data.hasMailSendScope ? " (inkl. Senden)" : ""}
                    {data.hasTasksScope ? " · To Do" : ""}.
                    {!data.hasTasksScope
                      ? " Für To Do: Tasks.ReadWrite in Entra + neu verbinden."
                      : ""}
                  </p>
                )}
                {probe?.ok ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      Graph OK
                      {probe.me?.mail ? ` · ${probe.me.mail}` : ""}
                      {probe.calendar?.ok
                        ? ` · heute ${probe.calendar.todayEventCount} Termin(e)`
                        : ""}
                    </p>
                    {probe.calendar?.sampleTitles?.length ? (
                      <p className="mt-1 text-foreground/80">
                        {probe.calendar.sampleTitles.join(" · ")}
                      </p>
                    ) : null}
                    {probe.calendar && !probe.calendar.ok ? (
                      <p className="mt-1 text-amber-800">
                        Kalender: {probe.calendar.error}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <a
                href="/api/microsoft/oauth/start"
                className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
              >
                <Link2 className="size-3.5" />
                Mein Microsoft 365 verbinden
              </a>
            )}
            {data?.connected ? (
              <p className="pt-1 text-xs text-muted-foreground">
                Abend-Review &amp; Mail-Tag:{" "}
                <a href="/microsoft" className="underline underline-offset-2">
                  /microsoft
                </a>
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
