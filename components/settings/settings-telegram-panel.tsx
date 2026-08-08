"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCircle } from "@/components/layout/icon-circle";

export function SettingsTelegramPanel() {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [hasChatId, setHasChatId] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Laden fehlgeschlagen (${res.status})`);
      }
      setTokenMasked(data.telegramBotTokenMasked || null);
      setHasToken(Boolean(data.hasTelegramBotToken));
      setHasChatId(Boolean(data.hasTelegramChatId));
      setConfigured(Boolean(data.hasTelegramConfigured));
      setChatId(
        typeof data.telegramChatId === "string" ? data.telegramChatId : ""
      );
      setBotToken("");
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
    try {
      const payload: Record<string, unknown> = {};
      if (botToken.trim()) payload.telegramBotToken = botToken.trim();
      if (chatId.trim() || hasChatId) {
        payload.telegramChatId = chatId.trim();
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      setTokenMasked(data.telegramBotTokenMasked || null);
      setHasToken(Boolean(data.hasTelegramBotToken));
      setHasChatId(Boolean(data.hasTelegramChatId));
      setConfigured(Boolean(data.hasTelegramConfigured));
      setChatId(
        typeof data.telegramChatId === "string" ? data.telegramChatId : chatId
      );
      setBotToken("");
      setMessage("Telegram-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clearTelegramBotToken: true,
          clearTelegramChatId: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Löschen fehlgeschlagen");
      }
      setTokenMasked(null);
      setHasToken(false);
      setHasChatId(false);
      setConfigured(false);
      setBotToken("");
      setChatId("");
      setMessage("Telegram-Zugang entfernt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function probe() {
    setProbing(true);
    setProbeResult(null);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/telegram-probe", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setProbeResult(JSON.stringify(data, null, 2));
      if (!res.ok || data.ok === false) {
        setError(
          data.hint || data.error || `Telegram-Test: HTTP ${res.status}`
        );
      } else {
        setMessage(data.hint || "Telegram-Test ok.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setProbeResult(JSON.stringify({ ok: false, error: msg }, null, 2));
    } finally {
      setProbing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={Send} tone="teal" size="sm" />
          Telegram
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Zusätzlicher Kanal parallel zu Web Push: jede Live-Benachrichtigung
          (Dokumente, Reisen, Finanzen, Briefing, …) mit gleichem Text und —
          wenn vorhanden — dem KI-/Event-Bild. Bot bei{" "}
          <span className="font-medium">@BotFather</span> anlegen, einmal
          anschreiben, Chat-ID z. B. über{" "}
          <span className="font-medium">@userinfobot</span> oder{" "}
          <code className="text-[11px]">getUpdates</code> ermitteln. Master-Schalter
          unter Live-Benachrichtigungen gilt auch hier.
        </p>

        {message ? (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="telegramBotToken">Bot-Token</Label>
              <Input
                id="telegramBotToken"
                type="password"
                autoComplete="off"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={
                  hasToken
                    ? `Gespeichert: ${tokenMasked || "••••"}`
                    : "123456:ABC…"
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegramChatId">Chat-ID</Label>
              <Input
                id="telegramChatId"
                autoComplete="off"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="z. B. 123456789"
              />
            </div>
            {configured ? (
              <p className="text-xs text-emerald-700">
                Konfiguriert — Buddy kann Nachrichten senden.
              </p>
            ) : (
              <p className="text-xs text-amber-800">
                Noch unvollständig — Token und Chat-ID nötig.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={saving || probing}
                onClick={() => void save()}
              >
                {saving ? "Speichert…" : "Telegram speichern"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving || probing || !configured}
                onClick={() => void probe()}
              >
                {probing ? "Sendet…" : "Testnachricht senden"}
              </Button>
              {hasToken || hasChatId ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving || probing}
                  onClick={() => void clearAll()}
                >
                  Entfernen
                </Button>
              ) : null}
            </div>
            {probeResult ? (
              <pre className="max-h-48 overflow-auto rounded-md border border-border/70 bg-background p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                {probeResult}
              </pre>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
