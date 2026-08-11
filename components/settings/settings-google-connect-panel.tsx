"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleLogo } from "@/components/branding/provider-logos";
import { cn } from "@/lib/utils";

type Connection = {
  googleOauthConfigured: boolean;
  ownerUserId: number | null;
  connected: boolean;
  connectedEmail: string | null;
  hasCalendarScope: boolean;
  hasCalendarEventsWrite: boolean;
  hasTasksScope: boolean;
  hasDriveScope?: boolean;
  hasContactsScope?: boolean;
  hasGmailModify?: boolean;
};

export function SettingsGoogleConnectPanel() {
  const [data, setData] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/google/connection");
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

  async function disconnect() {
    if (!window.confirm("Dein Google-Konto von Buddy trennen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/google/oauth/disconnect", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Trennen fehlgeschlagen");
      setStatus("Google-Konto getrennt — gilt nur für dich.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
            <GoogleLogo className="size-4" />
          </span>
          Mein Google-Konto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Jeder Buddy-User verbindet <span className="font-medium text-foreground">sein eigenes</span>{" "}
          Google-Konto (Mail, Kalender). Die Client-ID in den Admin-Einstellungen
          ist nur die gemeinsame App — die Erlaubnis liegt bei dir.
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

            {!data?.googleOauthConfigured ? (
              <p className="text-sm text-amber-800">
                Google OAuth ist noch nicht app-weit konfiguriert (Admin:
                Einstellungen → Kalender).
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
                      {data.connectedEmail || "Google"}
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
                  {!data.hasCalendarScope ||
                  !data.hasCalendarEventsWrite ||
                  !data.hasTasksScope ||
                  !data.hasDriveScope ||
                  !data.hasContactsScope ? (
                    <a
                      href="/api/google/oauth/start"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "gap-1.5"
                      )}
                    >
                      <Link2 className="size-3.5" />
                      Neu verbinden
                    </a>
                  ) : null}
                </div>
                {!data.hasCalendarScope ? (
                  <p className="text-xs text-amber-800">
                    Ohne Kalender-Recht — bitte neu verbinden.
                  </p>
                ) : !data.hasCalendarEventsWrite ? (
                  <p className="text-xs text-amber-800">
                    Kalender lesen ok, aber ohne Schreibrecht — bitte neu
                    verbinden, damit Ambri-Resultate (und Torschützen) in deine
                    Google-Termine zurückgeschrieben werden.
                  </p>
                ) : !data.hasTasksScope ? (
                  <p className="text-xs text-amber-800">
                    Tasks-Recht fehlt — bitte neu verbinden (Google Tasks API in
                    der Cloud Console aktivieren, dann Consent erneut).
                  </p>
                ) : !data.hasDriveScope ? (
                  <p className="text-xs text-amber-800">
                    Drive-Recht fehlt — bitte neu verbinden (PDF-Spiegel nach
                    Ordner BUDDY).
                  </p>
                ) : !data.hasContactsScope ? (
                  <p className="text-xs text-amber-800">
                    Kontakte-Recht fehlt — bitte neu verbinden (Adressen /
                    Geburtstage).
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Kalender, Tasks, Drive und Kontakte aktiv.
                  </p>
                )}
              </div>
            ) : (
              <a
                href="/api/google/oauth/start"
                className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
              >
                <Link2 className="size-3.5" />
                Mein Google-Konto verbinden
              </a>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
