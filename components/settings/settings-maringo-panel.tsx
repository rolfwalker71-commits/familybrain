"use client";

import { useCallback, useEffect, useState } from "react";
import { MaringoLogo } from "@/components/branding/provider-logos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsMaringoPanel() {
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordMasked, setPasswordMasked] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [configured, setConfigured] = useState(false);
  const [fromEnvOnly, setFromEnvOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probeInfo, setProbeInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Laden fehlgeschlagen (${res.status})`);
      }
      setBaseUrl(
        typeof data.mariBaseUrl === "string" ? data.mariBaseUrl : ""
      );
      setUsername(
        typeof data.mariUsername === "string" ? data.mariUsername : ""
      );
      setPasswordMasked(
        typeof data.mariPasswordMasked === "string"
          ? data.mariPasswordMasked
          : null
      );
      setHasPassword(Boolean(data.hasMariPassword));
      setEmployeeNumber(
        typeof data.mariEmployeeNumber === "string"
          ? data.mariEmployeeNumber
          : ""
      );
      setConfigured(Boolean(data.mariConfigured));
      setFromEnvOnly(Boolean(data.mariFromEnvOnly));
      setPassword("");
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
    setMessage(null);
    setError(null);
    setProbeInfo(null);
    try {
      if (!username.trim()) {
        throw new Error("Benutzername (NameInitials, z.B. RWA) ist erforderlich.");
      }
      if (!password.trim() && !hasPassword) {
        throw new Error("Passwort ist erforderlich.");
      }
      if (!employeeNumber.trim()) {
        throw new Error("Personalnummer (z.B. M1010) ist erforderlich.");
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mariBaseUrl: baseUrl.trim() || undefined,
          mariUsername: username.trim(),
          mariPassword: password.trim() || undefined,
          mariEmployeeNumber: employeeNumber.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      setPasswordMasked(data.mariPasswordMasked || null);
      setHasPassword(Boolean(data.hasMariPassword));
      setConfigured(Boolean(data.mariConfigured));
      setFromEnvOnly(Boolean(data.mariFromEnvOnly));
      setPassword("");
      setMessage("Maringo / MARI-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function probe() {
    setProbing(true);
    setProbeInfo(null);
    setError(null);
    try {
      const res = await fetch("/api/maringo/probe", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Verbindungstest fehlgeschlagen");
      }
      setProbeInfo(
        typeof data.message === "string"
          ? data.message
          : "Verbindung OK."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbing(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Lade Maringo-Einstellungen…</p>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
            <MaringoLogo className="size-4" />
          </span>
          Maringo / MARI
        </CardTitle>
        {configured ? (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            Konfiguriert
          </Badge>
        ) : (
          <Badge variant="destructive">Fehlt</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Login für den MARI Rest Service (Support-Tickets). Benutzer =
          NameInitials (z.B. RWA), Personalnummer = EmployeeNumber (z.B.
          M1010) — nicht der UserCode.
        </p>
        {fromEnvOnly ? (
          <Alert>
            <AlertDescription>
              Aktuell nur über <code className="text-xs">.env.local</code>{" "}
              gesetzt. Speichern hier überschreibt die Werte in SQLite
              (Einstellungen haben Vorrang).
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="mariBaseUrl">Service-URL</Label>
          <Input
            id="mariBaseUrl"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://marirestservice.an-group.international"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mariUsername">Benutzer</Label>
            <Input
              id="mariUsername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="RWA"
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mariEmployee">Personalnummer</Label>
            <Input
              id="mariEmployee"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              placeholder="M1010"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mariPassword">Passwort</Label>
          <Input
            id="mariPassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              hasPassword
                ? `Gespeichert: ${passwordMasked || "••••"}`
                : "Passwort"
            }
            autoComplete="current-password"
          />
          <p className="text-xs text-muted-foreground">
            Wird lokal in SQLite gespeichert und nie vollständig im Browser
            angezeigt. Leer lassen = bestehendes Passwort behalten.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving || probing}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? "Speichert…" : "Maringo speichern"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void probe()}
            disabled={saving || probing || !configured}
          >
            {probing ? "Teste…" : "Verbindung testen"}
          </Button>
        </div>
        {message ? (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {probeInfo ? (
          <Alert>
            <AlertDescription>{probeInfo}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
