"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, Unlink, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MicrosoftLogo } from "@/components/branding/provider-logos";
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
  const [sigText, setSigText] = useState("");
  const [sigAppend, setSigAppend] = useState(true);
  const [sigSaving, setSigSaving] = useState(false);
  const [sigStatus, setSigStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/connection");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status laden fehlgeschlagen");
      setData(json as Connection);
      if (json.connected) {
        try {
          const sigRes = await fetch("/api/microsoft/mail/signature");
          const sigJson = await sigRes.json().catch(() => ({}));
          if (sigRes.ok && sigJson.signature) {
            setSigText(String(sigJson.signature.text || ""));
            setSigAppend(sigJson.signature.appendOnSend !== false);
          }
        } catch {
          /* optional */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  async function saveSignature() {
    setSigSaving(true);
    setSigStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sigText,
          appendOnSend: sigAppend,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Signatur speichern fehlgeschlagen");
      setSigStatus("Signatur gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigSaving(false);
    }
  }

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
          <span className="flex size-8 items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
            <MicrosoftLogo className="size-4" />
          </span>
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
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3">
                <div className="space-y-1">
                  <Label htmlFor="ms-sig">Mail-Signatur für Buddy-Versand</Label>
                  <p className="text-[12px] text-muted-foreground">
                    Outlook-Client-Signaturen sind über die Microsoft-API{" "}
                    <span className="font-medium text-foreground">nicht lesbar</span>
                    . Einmal aus Outlook kopieren und hier einfügen — Buddy hängt
                    sie beim Senden an.
                  </p>
                  <Textarea
                    id="ms-sig"
                    rows={5}
                    value={sigText}
                    onChange={(e) => setSigText(e.target.value)}
                    placeholder={"Mit freundlichen Grüssen\nRolf Walker\n…"}
                    disabled={sigSaving}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={sigAppend}
                    onChange={(e) => setSigAppend(e.target.checked)}
                    disabled={sigSaving}
                  />
                  Beim Senden aus Buddy automatisch anhängen
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={sigSaving}
                    onClick={() => void saveSignature()}
                  >
                    {sigSaving ? "Speichert…" : "Signatur speichern"}
                  </Button>
                  {sigStatus ? (
                    <span className="text-xs text-emerald-700">{sigStatus}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
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
