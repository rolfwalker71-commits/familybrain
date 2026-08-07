"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCircle } from "@/components/layout/icon-circle";

type GoogleSettings = {
  googleOauthClientId: string;
  googleOauthClientSecretMasked: string | null;
  hasGoogleOauthClientSecret: boolean;
  googleOauthConfigured: boolean;
  googleOauthRedirectUri: string;
};

/** Admin-only: shared OAuth client credentials. Per-user linking lives under /account. */
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
      setStatus("Google OAuth Client-Daten gespeichert (app-weit).");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={KeyRound} tone="teal" size="sm" />
          Google OAuth — App-Zugang
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Einmalig app-weit:</span>{" "}
          Client-ID und Secret aus der Google Cloud Console. Danach verbindet
          jeder User unter{" "}
          <a href="/account" className="underline underline-offset-2">
            Konto
          </a>{" "}
          <span className="font-medium text-foreground">sein eigenes</span>{" "}
          Google-Konto — Tokens sind userspezifisch, nicht geteilt.
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
                <p className="mt-2 text-muted-foreground">
                  Sollte{" "}
                  <code className="text-[11px]">
                    https://buddyapp.rolfwalker.ch/api/google/oauth/callback
                  </code>{" "}
                  sein. Wenn hier eine andere Domain steht: Einstellungen → Mail
                  «Öffentliche App-URL» bzw. Env{" "}
                  <code className="text-[11px]">APP_PUBLIC_URL</code> setzen.
                </p>
              </div>
            ) : null}

            <Button type="button" disabled={saving} onClick={() => void save()}>
              Speichern
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
