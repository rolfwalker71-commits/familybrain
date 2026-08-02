"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toSwissDate } from "@/lib/utils/dates";

type DeviceRow = {
  id: number;
  label: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export function DeviceTokensPanel() {
  const [tokens, setTokens] = useState<DeviceRow[]>([]);
  const [label, setLabel] = useState("Android");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/device-tokens");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setTokens((json.tokens || []) as DeviceRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createToken() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setFreshToken(null);
    try {
      const res = await fetch("/api/device-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "Android" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Anlegen fehlgeschlagen");
      setFreshToken(typeof json.token === "string" ? json.token : null);
      setMessage(
        "Token erstellt — jetzt in die Android-App kopieren (nur einmal sichtbar)."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    if (!window.confirm("Dieses Geräte-Token wirklich widerrufen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/device-tokens?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Widerruf fehlgeschlagen");
      setMessage("Token widerrufen.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <p className="text-xs text-muted-foreground">
        Widgets auf dem Android-Homescreen brauchen ein Geräte-Token (kein
        Cookie). Buddy-URL + Token einmal in der App hinterlegen — Details in{" "}
        <code className="text-[11px]">docs/android-twa.md</code>.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1 space-y-1">
          <Label htmlFor="deviceLabel">Bezeichnung</Label>
          <Input
            id="deviceLabel"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Android Pixel"
          />
        </div>
        <Button type="button" disabled={busy} onClick={() => void createToken()}>
          Token erzeugen
        </Button>
      </div>

      {freshToken ? (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-medium text-foreground">
            Neues Token (kopieren):
          </p>
          <code className="block break-all text-xs">{freshToken}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(freshToken);
              setMessage("In Zwischenablage kopiert.");
            }}
          >
            Kopieren
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade Tokens…</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Geräte-Tokens.</p>
      ) : (
        <ul className="space-y-2">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/80 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {t.label}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {t.token_prefix}…
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  erstellt {toSwissDate(t.created_at.slice(0, 10))}
                  {t.revoked_at
                    ? " · widerrufen"
                    : t.last_used_at
                      ? ` · zuletzt ${toSwissDate(t.last_used_at.slice(0, 10))}`
                      : ""}
                </p>
              </div>
              {!t.revoked_at ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => void revoke(t.id)}
                >
                  Widerrufen
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
