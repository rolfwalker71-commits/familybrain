"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Link2, Unlink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCircle } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

type GoogleSettings = {
  googleOauthClientId: string;
  googleOauthClientSecretMasked: string | null;
  hasGoogleOauthClientSecret: boolean;
  googleOauthConfigured: boolean;
  googleOauthRedirectUri: string;
  connected: boolean;
  connectedEmail: string | null;
  hasCalendarScope: boolean;
  ownerUserId: number | null;
};

export function SettingsGooglePanel() {
  const [data, setData] = useState<GoogleSettings | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/google/settings");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json as GoogleSettings);
      setClientId(json.googleOauthClientId || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/google/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleOauthClientId: clientId,
          ...(clientSecret.trim()
            ? { googleOauthClientSecret: clientSecret.trim() }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setData(json as GoogleSettings);
      setClientSecret("");
      setStatus("Google OAuth-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/google/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearGoogleOauthClientSecret: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Löschen fehlgeschlagen");
      setData(json as GoogleSettings);
      setStatus("Client-Secret entfernt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Google-Konto trennen?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/google/oauth/disconnect", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Trennen fehlgeschlagen");
      setStatus("Google-Konto getrennt.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={KeyRound} tone="teal" size="sm" />
          Google OAuth (Mail & Geburtstage)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Client-ID und Secret aus der Google Cloud Console (Web-Client).
          Redirect-URI dort eintragen. Tokens liegen pro App-User. Scopes: Gmail
          lesen + Kalender (Geburtstage).
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

            <div className="space-y-1.5">
              <Label htmlFor="g-client-id">Client-ID</Label>
              <Input
                id="g-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="font-mono text-xs"
                placeholder="….apps.googleusercontent.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-client-secret">Client-Secret</Label>
              <Input
                id="g-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="font-mono text-xs"
                placeholder={
                  data?.hasGoogleOauthClientSecret
                    ? data.googleOauthClientSecretMasked || "•••• gespeichert"
                    : "Secret einfügen"
                }
                autoComplete="new-password"
              />
              {data?.hasGoogleOauthClientSecret ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => void clearSecret()}
                >
                  Secret entfernen
                </Button>
              ) : null}
            </div>

            {data?.googleOauthRedirectUri ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                <p className="font-medium text-foreground">
                  Redirect-URI (in Google Cloud eintragen)
                </p>
                <code className="mt-1 block break-all font-mono text-[11px] text-muted-foreground">
                  {data.googleOauthRedirectUri}
                </code>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={saving}
                onClick={() => void save()}
              >
                Speichern
              </Button>
              {data?.googleOauthConfigured && data.ownerUserId != null ? (
                data.connected ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void disconnect()}
                    >
                      <Unlink className="size-3.5" />
                      {data.connectedEmail
                        ? `Trennen (${data.connectedEmail})`
                        : "Trennen"}
                    </Button>
                    {!data.hasCalendarScope ? (
                      <a
                        href="/api/google/oauth/start"
                        className={cn(
                          buttonVariants({ variant: "outline" }),
                          "gap-1.5"
                        )}
                      >
                        <Link2 className="size-3.5" />
                        Neu verbinden (Kalender)
                      </a>
                    ) : null}
                  </>
                ) : (
                  <a
                    href="/api/google/oauth/start"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "gap-1.5"
                    )}
                  >
                    <Link2 className="size-3.5" />
                    Google verbinden
                  </a>
                )
              ) : null}
            </div>

            {data?.connected && !data.hasCalendarScope ? (
              <p className="text-xs text-amber-800">
                Verbindung ohne Kalender-Recht — bitte «Neu verbinden
                (Kalender)» wählen, damit Geburtstage erscheinen.
              </p>
            ) : null}

            {data?.ownerUserId == null ? (
              <p className="text-xs text-amber-800">
                Hinweis: Für die Verbindung braucht es einen App-User (z. B.
                «Rolf»). Env-Admin allein speichert keine User-Tokens.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
