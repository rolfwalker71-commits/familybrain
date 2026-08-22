"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCircle } from "@/components/layout/icon-circle";

type InboundMode = "off" | "poll" | "webhook";

export function SettingsTelegramPanel() {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [hasChatId, setHasChatId] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [inboundMode, setInboundMode] = useState<InboundMode>("off");
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [inboundBusy, setInboundBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<string | null>(null);

  const loadInbound = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/telegram-inbound");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInboundMode(
          data.mode === "webhook" || data.mode === "poll" || data.mode === "off"
            ? data.mode
            : "off"
        );
        setWebhookUrl(
          typeof data.webhookUrl === "string" ? data.webhookUrl : null
        );
      }
    } catch {
      /* optional */
    }
  }, []);

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
      await loadInbound();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadInbound]);

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
      // Auto-enable poll so buttons work without extra setup.
      if (data.hasTelegramConfigured) {
        await fetch("/api/settings/telegram-inbound", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "enable_poll" }),
        }).catch(() => null);
        await loadInbound();
      }
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
      await fetch("/api/settings/telegram-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable" }),
      }).catch(() => null);
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
      setInboundMode("off");
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

  async function setInbound(action: "enable_poll" | "enable_webhook" | "disable") {
    setInboundBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/telegram-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(
          data.error || data.hint || `Inbound: HTTP ${res.status}`
        );
      }
      setInboundMode(
        data.mode === "webhook" || data.mode === "poll" || data.mode === "off"
          ? data.mode
          : inboundMode
      );
      if (typeof data.webhookUrl === "string") setWebhookUrl(data.webhookUrl);
      setMessage(
        action === "enable_webhook"
          ? "Webhook aktiv — Telegram ruft Buddy direkt an."
          : action === "enable_poll"
            ? "Polling aktiv — Buddy holt Updates alle paar Sekunden."
            : "Telegram-Aktionen aus."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInboundBusy(false);
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
          Zusätzlicher Kanal parallel zu Web Push: Live-Benachrichtigungen mit
          Text und Bild. Bei Belegen Buttons{" "}
          <span className="font-medium">Zahlen / Irrelevant / Später</span>,
          beim Abend-Digest bis zu drei{" "}
          <span className="font-medium">Erledigt</span>-Termine. Antworten auf
          die Nachricht mit denselben Stichworten geht auch. Bot bei{" "}
          <span className="font-medium">@BotFather</span> anlegen, einmal
          anschreiben, Chat-ID ermitteln. Master-Schalter unter
          Live-Benachrichtigungen gilt auch hier.
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
                Konfiguriert — Senden ok
                {inboundMode === "poll"
                  ? " · Aktionen via Polling"
                  : inboundMode === "webhook"
                    ? " · Aktionen via Webhook"
                    : " · Aktionen aus"}
                .
              </p>
            ) : (
              <p className="text-xs text-amber-800">
                Noch unvollständig — Token und Chat-ID nötig.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={saving || probing || inboundBusy}
                onClick={() => void save()}
              >
                {saving ? "Speichert…" : "Telegram speichern"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving || probing || inboundBusy || !configured}
                onClick={() => void probe()}
              >
                {probing ? "Sendet…" : "Testnachricht senden"}
              </Button>
              {hasToken || hasChatId ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving || probing || inboundBusy}
                  onClick={() => void clearAll()}
                >
                  Entfernen
                </Button>
              ) : null}
            </div>

            {configured ? (
              <div className="space-y-2 rounded-md border border-border/70 p-3">
                <p className="text-sm font-medium">Aktionen empfangen</p>
                <p className="text-xs text-muted-foreground">
                  Polling funktioniert ohne öffentlichen HTTPS-Webhook.
                  Webhook ist sparsam, braucht aber erreichbare App-URL
                  {webhookUrl ? ` (${webhookUrl})` : ""}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={inboundMode === "poll" ? "default" : "outline"}
                    disabled={inboundBusy}
                    onClick={() => void setInbound("enable_poll")}
                  >
                    Polling
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={inboundMode === "webhook" ? "default" : "outline"}
                    disabled={inboundBusy}
                    onClick={() => void setInbound("enable_webhook")}
                  >
                    Webhook
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={inboundMode === "off" ? "default" : "ghost"}
                    disabled={inboundBusy}
                    onClick={() => void setInbound("disable")}
                  >
                    Aus
                  </Button>
                </div>
              </div>
            ) : null}

            {probeResult ? (
              <pre className="max-h-48 overflow-auto rounded-md border border-border/70 bg-background p-3 text-[0.6875rem] leading-relaxed whitespace-pre-wrap break-all">
                {probeResult}
              </pre>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
