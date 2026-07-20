"use client";

import { useEffect, useState } from "react";
import { KeyRound, Server, BookOpen } from "lucide-react";
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
  const [saving, setSaving] = useState<"paperless" | "openai" | "trilium" | null>(
    null
  );
  const [triliumBaseUrl, setTriliumBaseUrl] = useState("");
  const [triliumToken, setTriliumToken] = useState("");
  const [triliumTokenMasked, setTriliumTokenMasked] = useState<string | null>(
    null
  );
  const [hasTriliumToken, setHasTriliumToken] = useState(false);
  const [triliumConfigured, setTriliumConfigured] = useState(false);
  const [triliumMasterNoteId, setTriliumMasterNoteId] = useState<string | null>(
    null
  );
  const [triliumPrivatNoteId, setTriliumPrivatNoteId] = useState<string | null>(
    null
  );
  const [triliumGeschaeftlichNoteId, setTriliumGeschaeftlichNoteId] = useState<
    string | null
  >(null);
  const [resolvingScopes, setResolvingScopes] = useState(false);

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
      setTriliumBaseUrl(data.triliumBaseUrl || "");
      setTriliumTokenMasked(data.triliumApiTokenMasked);
      setHasTriliumToken(Boolean(data.hasTriliumToken));
      setTriliumConfigured(Boolean(data.triliumConfigured));
      setTriliumMasterNoteId(data.triliumMasterNoteId || null);
      setTriliumPrivatNoteId(data.triliumPrivatNoteId || null);
      setTriliumGeschaeftlichNoteId(data.triliumGeschaeftlichNoteId || null);
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

  async function saveTrilium() {
    setSaving("trilium");
    setError(null);
    setMessage(null);
    try {
      if (!triliumBaseUrl) {
        throw new Error("Trilium Basis-URL ist erforderlich.");
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triliumBaseUrl,
          triliumApiToken: triliumToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setTriliumTokenMasked(data.triliumApiTokenMasked);
      setHasTriliumToken(data.hasTriliumToken);
      setTriliumConfigured(Boolean(data.triliumConfigured));
      setTriliumMasterNoteId(data.triliumMasterNoteId || null);
      setTriliumPrivatNoteId(data.triliumPrivatNoteId || null);
      setTriliumGeschaeftlichNoteId(data.triliumGeschaeftlichNoteId || null);
      setTriliumToken("");
      setMessage("Trilium-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function testTriliumConnection() {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/trilium/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: triliumBaseUrl || undefined,
          apiToken: triliumToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verbindung fehlgeschlagen");
      setMessage(
        `Trilium-Verbindung OK${data.appVersion ? ` (v${data.appVersion})` : ""}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function resolveTriliumScopes() {
    setResolvingScopes(true);
    setError(null);
    setMessage(null);
    try {
      if (!triliumBaseUrl) {
        throw new Error("Bitte zuerst die Trilium Basis-URL speichern.");
      }
      const res = await fetch("/api/trilium/resolve-scopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: triliumBaseUrl || undefined,
          apiToken: triliumToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bereiche konnten nicht erkannt werden");
      setTriliumMasterNoteId(data.masterNoteId || null);
      setTriliumPrivatNoteId(data.privatNoteId || null);
      setTriliumGeschaeftlichNoteId(data.geschaeftlichNoteId || null);
      setTriliumConfigured(true);
      setMessage(
        "Trilium-Bereiche erkannt: Master → Privat und Geschäftlich ANG."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResolvingScopes(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Einstellungen"
        description="Paperless, Trilium und OpenAI konfigurieren"
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
            <IconCircle icon={BookOpen} tone="teal" size="sm" />
            Trilium
          </CardTitle>
          {triliumConfigured ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Chat aktiv
            </Badge>
          ) : (
            <Badge variant="secondary">Optional</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ergänzt den Chat um Notizen aus «Master → Privat» und «Master →
            Geschäftlich ANG». Nach «Bereiche erkennen» unter Sync die Notizen
            lokal synchronisieren.
          </p>
          <div className="space-y-2">
            <Label htmlFor="triliumUrl">Basis-URL</Label>
            <Input
              id="triliumUrl"
              value={triliumBaseUrl}
              onChange={(e) => setTriliumBaseUrl(e.target.value)}
              placeholder="https://trilium.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="triliumToken">ETAPI-Token</Label>
            <Input
              id="triliumToken"
              type="password"
              value={triliumToken}
              onChange={(e) => setTriliumToken(e.target.value)}
              placeholder={
                hasTriliumToken
                  ? `Gespeichert: ${triliumTokenMasked || "••••"}`
                  : "Token aus Trilium → Optionen → ETAPI"
              }
            />
          </div>
          {triliumPrivatNoteId || triliumGeschaeftlichNoteId ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
              <div>Master: {triliumMasterNoteId || "–"}</div>
              <div>Privat: {triliumPrivatNoteId || "–"}</div>
              <div>Geschäftlich ANG: {triliumGeschaeftlichNoteId || "–"}</div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void saveTrilium()}
              disabled={saving !== null || resolvingScopes}
            >
              {saving === "trilium" ? "Speichert…" : "Trilium speichern"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void testTriliumConnection()}
              disabled={saving !== null || resolvingScopes}
            >
              Verbindung testen
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void resolveTriliumScopes()}
              disabled={saving !== null || resolvingScopes}
            >
              {resolvingScopes ? "Erkenne Bereiche…" : "Bereiche erkennen"}
            </Button>
          </div>
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
