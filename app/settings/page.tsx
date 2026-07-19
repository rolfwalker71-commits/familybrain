"use client";

import { useEffect, useState } from "react";
import { KeyRound, Server } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals } from "@/components/layout/icon-circle";

const OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
  "o4-mini",
];

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiKeyMasked, setOpenaiKeyMasked] = useState<string | null>(null);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [customModel, setCustomModel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"paperless" | "openai" | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setBaseUrl(data.paperlessBaseUrl || "");
      setTokenMasked(data.paperlessApiTokenMasked);
      setHasToken(Boolean(data.hasPaperlessToken));
      setOpenaiKeyMasked(data.openaiApiKeyMasked);
      setHasOpenAIKey(Boolean(data.hasOpenAIKey));
      const model = data.openaiModel || "gpt-4o-mini";
      if (OPENAI_MODELS.includes(model)) {
        setOpenaiModel(model);
      } else {
        setOpenaiModel("custom");
        setCustomModel(model);
      }
    })();
  }, []);

  async function savePaperless() {
    setSaving("paperless");
    setError(null);
    setMessage(null);
    try {
      if (!baseUrl) throw new Error("Paperless Basis-URL ist erforderlich.");
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperlessBaseUrl: baseUrl,
          paperlessApiToken: apiToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setTokenMasked(data.paperlessApiTokenMasked);
      setHasToken(data.hasPaperlessToken);
      setApiToken("");
      setMessage("Paperless-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function saveOpenAI() {
    setSaving("openai");
    setError(null);
    setMessage(null);
    try {
      const model =
        openaiModel === "custom" ? customModel.trim() : openaiModel;
      if (!model) throw new Error("Bitte ein Modell wählen oder eingeben.");
      if (!openaiKey && !hasOpenAIKey) {
        throw new Error("Bitte einen OpenAI API-Key eingeben.");
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openaiApiKey: openaiKey || undefined,
          openaiModel: model,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setOpenaiKeyMasked(data.openaiApiKeyMasked);
      setHasOpenAIKey(data.hasOpenAIKey);
      setOpenaiKey("");
      setMessage("OpenAI-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Einstellungen"
        description="Paperless-Verbindung und OpenAI-Konfiguration"
        icon={pageVisuals.settings.icon}
        tone={pageVisuals.settings.tone}
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            <IconCircle icon={Server} tone="blue" size="sm" />
            Paperless-ngx
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Basis-URL</Label>
            <Input
              id="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://paperless.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">API-Token</Label>
            <Input
              id="token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                hasToken
                  ? `Gespeichert: ${tokenMasked || "••••"}`
                  : "Token eingeben"
              }
            />
          </div>
          <Button
            onClick={() => void savePaperless()}
            disabled={saving !== null}
            className="w-full sm:w-auto"
          >
            {saving === "paperless" ? "Speichert…" : "Paperless speichern"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-base">
            <IconCircle icon={KeyRound} tone="violet" size="sm" />
            OpenAI
          </CardTitle>
          {hasOpenAIKey ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Konfiguriert
            </Badge>
          ) : (
            <Badge variant="destructive">Fehlt</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openaiKey">API-Key</Label>
            <Input
              id="openaiKey"
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder={
                hasOpenAIKey
                  ? `Gespeichert: ${openaiKeyMasked || "••••"}`
                  : "sk-..."
              }
            />
            <p className="text-xs text-muted-foreground">
              Wird lokal in SQLite gespeichert und nie vollständig im Browser
              angezeigt.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Modell</Label>
            <Select
              value={openaiModel}
              onValueChange={(value) => {
                if (value != null) setOpenaiModel(value);
              }}
            >
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Modell wählen" />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_MODELS.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Eigenes Modell…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {openaiModel === "custom" ? (
            <div className="space-y-2">
              <Label htmlFor="customModel">Modellname</Label>
              <Input
                id="customModel"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="z. B. gpt-4.1-nano"
              />
            </div>
          ) : null}
          <Button
            onClick={() => void saveOpenAI()}
            disabled={saving !== null}
            className="w-full sm:w-auto"
          >
            {saving === "openai" ? "Speichert…" : "OpenAI speichern"}
          </Button>
        </CardContent>
      </Card>

      {message ? (
        <Alert>
          <AlertTitle>Gespeichert</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
