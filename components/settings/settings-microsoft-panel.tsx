"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCircle } from "@/components/layout/icon-circle";

type MicrosoftSettings = {
  microsoftOauthClientId: string;
  microsoftOauthClientSecretMasked: string | null;
  hasMicrosoftOauthClientSecret: boolean;
  microsoftOauthTenant: string;
  microsoftOauthConfigured: boolean;
  microsoftOauthRedirectUri: string;
};

/** Admin-only: shared Entra app credentials. Per-user linking under /account. */
export function SettingsMicrosoftPanel() {
  const [data, setData] = useState<MicrosoftSettings | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tenant, setTenant] = useState("organizations");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/settings");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json as MicrosoftSettings);
      setClientId(json.microsoftOauthClientId || "");
      setTenant(json.microsoftOauthTenant || "organizations");
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
      const res = await fetch("/api/microsoft/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          microsoftOauthClientId: clientId,
          microsoftOauthTenant: tenant.trim() || "organizations",
          ...(clientSecret.trim()
            ? { microsoftOauthClientSecret: clientSecret.trim() }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setData(json as MicrosoftSettings);
      setClientSecret("");
      setStatus("Microsoft OAuth Client-Daten gespeichert (app-weit).");
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
      const res = await fetch("/api/microsoft/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearMicrosoftOauthClientSecret: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Löschen fehlgeschlagen");
      setData(json as MicrosoftSettings);
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
          <IconCircle icon={KeyRound} tone="blue" size="sm" />
          Microsoft 365 OAuth — App-Zugang
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Einmalig app-weit:</span>{" "}
          Anwendungs-ID (Client) und Geheimnis aus der Entra-App-Registrierung.
          Redirect-URI dort eintragen (zusätzlich zu anderen Apps). Danach
          verbindet jeder User unter{" "}
          <a href="/account" className="underline underline-offset-2">
            Konto
          </a>{" "}
          sein O365-Konto (z. B.{" "}
          <span className="font-medium text-foreground">
            rolf.walker@an-group.one
          </span>
          ).
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
              <Label htmlFor="msClientId">Anwendungs-ID (Client)</Label>
              <Input
                id="msClientId"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="msTenant">
                Verzeichnis (Tenant) — GUID oder organizations
              </Label>
              <Input
                id="msTenant"
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                placeholder="organizations"
                autoComplete="off"
              />
              <p className="text-[12px] text-muted-foreground">
                Für ANG GmbH: Tenant-ID aus Entra eintragen, oder{" "}
                <code className="text-[11px]">organizations</code> lassen.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="msSecret">Client-Geheimnis</Label>
              <Input
                id="msSecret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={
                  data?.hasMicrosoftOauthClientSecret
                    ? `Gespeichert: ${data.microsoftOauthClientSecretMasked || "••••"}`
                    : "Neues Secret einfügen"
                }
                autoComplete="new-password"
              />
              {data?.hasMicrosoftOauthClientSecret ? (
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

            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Redirect-URI (in Entra eintragen)
              </p>
              <p className="mt-1 break-all font-mono text-[13px]">
                {data?.microsoftOauthRedirectUri || "—"}
              </p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Soll{" "}
                <code className="text-[11px]">
                  https://buddyapp.rolfwalker.ch/api/microsoft/oauth/callback
                </code>{" "}
                sein. Wenn hier eine andere Domain steht: unter Einstellungen →
                Mail/SMTP die «Öffentliche App-URL» auf{" "}
                <code className="text-[11px]">
                  https://buddyapp.rolfwalker.ch
                </code>{" "}
                setzen (oder Env{" "}
                <code className="text-[11px]">APP_PUBLIC_URL</code>).
              </p>
            </div>

            <Button
              type="button"
              disabled={saving || !clientId.trim()}
              onClick={() => void save()}
            >
              {saving ? "Speichert…" : "Microsoft OAuth speichern"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
