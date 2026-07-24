"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Server, BookOpen, MessageSquareText, Luggage, HandCoins, Mail, MoreHorizontal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals } from "@/components/layout/icon-circle";
import {
  SettingsTabNav,
  parseSettingsTab,
  type SettingsTab,
  type SettingsTabItem,
} from "@/components/settings/settings-tab-nav";


const ICLOUD_SMTP = {
  host: "smtp.mail.me.com",
  port: 587,
  secure: false,
} as const;

const OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
  "o4-mini",
];

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Lade Einstellungen…</p>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [saving, setSaving] = useState<
    | "paperless"
    | "openai"
    | "trilium"
    | "chat"
    | "travelbrain"
    | "finanzbrain"
    | "email"
    | null
  >(null);
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
  const [chatInstructions, setChatInstructions] = useState("");
  const [chatInstructionsDefault, setChatInstructionsDefault] = useState("");
  const [chatInstructionsCustomized, setChatInstructionsCustomized] =
    useState(false);
  const [aerodataboxKey, setAerodataboxKey] = useState("");
  const [aerodataboxKeyMasked, setAerodataboxKeyMasked] = useState<string | null>(
    null
  );
  const [hasAerodataboxKey, setHasAerodataboxKey] = useState(false);
  const [aerodataboxProvider, setAerodataboxProvider] = useState<
    "apimarket" | "rapidapi"
  >("apimarket");
  const [nominatimBaseUrl, setNominatimBaseUrl] = useState(
    "https://nominatim.openstreetmap.org"
  );
  const [tripMapStyle, setTripMapStyle] = useState<
    "voyager" | "positron" | "osm"
  >("voyager");
  const [eventAiImagePrompt, setEventAiImagePrompt] = useState("");
  const [eventAiImagePromptDefault, setEventAiImagePromptDefault] =
    useState("");
  const [eventAiImagePromptCustomized, setEventAiImagePromptCustomized] =
    useState(false);
  const [eventAiImagePromptPlaceholders, setEventAiImagePromptPlaceholders] =
    useState<string[]>([
      "{{type}}",
      "{{title}}",
      "{{details}}",
      "{{notes}}",
      "{{beleg}}",
      "{{scene}}",
    ]);
  const [financeExpenseAiImagePrompt, setFinanceExpenseAiImagePrompt] =
    useState("");
  const [
    financeExpenseAiImagePromptDefault,
    setFinanceExpenseAiImagePromptDefault,
  ] = useState("");
  const [
    financeExpenseAiImagePromptCustomized,
    setFinanceExpenseAiImagePromptCustomized,
  ] = useState(false);
  const [
    financeExpenseAiImagePromptPlaceholders,
    setFinanceExpenseAiImagePromptPlaceholders,
  ] = useState<string[]>([
    "{{category}}",
    "{{description}}",
    "{{details}}",
    "{{amount}}",
    "{{currency}}",
    "{{date}}",
    "{{place}}",
    "{{scene}}",
  ]);
  const [smtpHost, setSmtpHost] = useState<string>(ICLOUD_SMTP.host);
  const [smtpPort, setSmtpPort] = useState(String(ICLOUD_SMTP.port));
  const [smtpSecure, setSmtpSecure] = useState(Boolean(ICLOUD_SMTP.secure));
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordMasked, setSmtpPasswordMasked] = useState<string | null>(
    null
  );
  const [hasSmtpPassword, setHasSmtpPassword] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState("");
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [testMailTo, setTestMailTo] = useState("");
  const [testMailBusy, setTestMailBusy] = useState(false);
  const [flightTestNumber, setFlightTestNumber] = useState("LX1594");
  const [flightTestDate, setFlightTestDate] = useState("2026-10-23");
  const [flightTestBusy, setFlightTestBusy] = useState(false);
  const [flightTestResult, setFlightTestResult] = useState<string | null>(null);

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
      setChatInstructions(data.chatInstructions || "");
      setChatInstructionsDefault(data.chatInstructionsDefault || "");
      setChatInstructionsCustomized(Boolean(data.chatInstructionsCustomized));
      setAerodataboxKeyMasked(data.aerodataboxApiKeyMasked || null);
      setHasAerodataboxKey(Boolean(data.hasAerodataboxKey));
      setAerodataboxProvider(
        data.aerodataboxProvider === "rapidapi" ? "rapidapi" : "apimarket"
      );
      setNominatimBaseUrl(
        data.nominatimBaseUrl || "https://nominatim.openstreetmap.org"
      );
      setTripMapStyle(
        data.tripMapStyle === "positron" || data.tripMapStyle === "osm"
          ? data.tripMapStyle
          : "voyager"
      );
      setEventAiImagePrompt(data.eventAiImagePrompt || "");
      setEventAiImagePromptDefault(data.eventAiImagePromptDefault || "");
      setEventAiImagePromptCustomized(
        Boolean(data.eventAiImagePromptCustomized)
      );
      if (Array.isArray(data.eventAiImagePromptPlaceholders)) {
        setEventAiImagePromptPlaceholders(
          data.eventAiImagePromptPlaceholders.filter(
            (p: unknown): p is string => typeof p === "string"
          )
        );
      }
      setFinanceExpenseAiImagePrompt(data.financeExpenseAiImagePrompt || "");
      setFinanceExpenseAiImagePromptDefault(
        data.financeExpenseAiImagePromptDefault || ""
      );
      setFinanceExpenseAiImagePromptCustomized(
        Boolean(data.financeExpenseAiImagePromptCustomized)
      );
      if (Array.isArray(data.financeExpenseAiImagePromptPlaceholders)) {
        setFinanceExpenseAiImagePromptPlaceholders(
          data.financeExpenseAiImagePromptPlaceholders.filter(
            (p: unknown): p is string => typeof p === "string"
          )
        );
      }
      setSmtpHost(data.smtpHost || ICLOUD_SMTP.host);
      setSmtpPort(String(data.smtpPort || ICLOUD_SMTP.port));
      setSmtpSecure(Boolean(data.smtpSecure));
      setSmtpUser(data.smtpUser || "");
      setSmtpPasswordMasked(data.smtpPasswordMasked || null);
      setHasSmtpPassword(Boolean(data.hasSmtpPassword));
      setSmtpFrom(data.smtpFrom || "");
      setEmailConfigured(Boolean(data.emailConfigured));
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

  async function saveChatInstructions() {
    setSaving("chat");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatInstructions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setChatInstructions(data.chatInstructions || "");
      setChatInstructionsDefault(data.chatInstructionsDefault || "");
      setChatInstructionsCustomized(Boolean(data.chatInstructionsCustomized));
      setMessage("Chat-Regeln gespeichert. Gelten ab der nächsten Antwort.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function restoreDefaultChatInstructions() {
    setSaving("chat");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetChatInstructions: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Zurücksetzen fehlgeschlagen");
      setChatInstructions(data.chatInstructions || "");
      setChatInstructionsDefault(data.chatInstructionsDefault || "");
      setChatInstructionsCustomized(Boolean(data.chatInstructionsCustomized));
      setMessage(
        "Ausgangs-Vorlage wiederhergestellt. Du kannst sie jederzeit erneut anpassen und speichern."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function saveTravelBrainSettings() {
    setSaving("travelbrain");
    setError(null);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        nominatimBaseUrl: nominatimBaseUrl.trim(),
        aerodataboxProvider,
        tripMapStyle,
        eventAiImagePrompt,
      };
      if (aerodataboxKey.trim()) {
        payload.aerodataboxApiKey = aerodataboxKey.trim();
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setAerodataboxKeyMasked(data.aerodataboxApiKeyMasked || null);
      setHasAerodataboxKey(Boolean(data.hasAerodataboxKey));
      setAerodataboxProvider(
        data.aerodataboxProvider === "rapidapi" ? "rapidapi" : "apimarket"
      );
      setAerodataboxKey("");
      setNominatimBaseUrl(
        data.nominatimBaseUrl || "https://nominatim.openstreetmap.org"
      );
      setTripMapStyle(
        data.tripMapStyle === "positron" || data.tripMapStyle === "osm"
          ? data.tripMapStyle
          : "voyager"
      );
      setEventAiImagePrompt(data.eventAiImagePrompt || "");
      setEventAiImagePromptDefault(data.eventAiImagePromptDefault || "");
      setEventAiImagePromptCustomized(
        Boolean(data.eventAiImagePromptCustomized)
      );
      if (Array.isArray(data.eventAiImagePromptPlaceholders)) {
        setEventAiImagePromptPlaceholders(
          data.eventAiImagePromptPlaceholders.filter(
            (p: unknown): p is string => typeof p === "string"
          )
        );
      }
      setMessage("TravelBrain-Einstellungen gespeichert.");
      window.dispatchEvent(new Event("trip-map-style-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function resetEventAiImagePrompt() {
    setSaving("travelbrain");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetEventAiImagePrompt: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Zurücksetzen fehlgeschlagen");
      setEventAiImagePrompt(data.eventAiImagePrompt || "");
      setEventAiImagePromptDefault(data.eventAiImagePromptDefault || "");
      setEventAiImagePromptCustomized(false);
      setMessage("KI-Bild-Prompt auf Standard zurückgesetzt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function saveFinanzBrainSettings() {
    setSaving("finanzbrain");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          financeExpenseAiImagePrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setFinanceExpenseAiImagePrompt(data.financeExpenseAiImagePrompt || "");
      setFinanceExpenseAiImagePromptDefault(
        data.financeExpenseAiImagePromptDefault || ""
      );
      setFinanceExpenseAiImagePromptCustomized(
        Boolean(data.financeExpenseAiImagePromptCustomized)
      );
      if (Array.isArray(data.financeExpenseAiImagePromptPlaceholders)) {
        setFinanceExpenseAiImagePromptPlaceholders(
          data.financeExpenseAiImagePromptPlaceholders.filter(
            (p: unknown): p is string => typeof p === "string"
          )
        );
      }
      setMessage("FinanzBrain-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function resetFinanceExpenseAiImagePrompt() {
    setSaving("finanzbrain");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetFinanceExpenseAiImagePrompt: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Zurücksetzen fehlgeschlagen");
      setFinanceExpenseAiImagePrompt(data.financeExpenseAiImagePrompt || "");
      setFinanceExpenseAiImagePromptDefault(
        data.financeExpenseAiImagePromptDefault || ""
      );
      setFinanceExpenseAiImagePromptCustomized(false);
      setMessage("FinanzBrain KI-Bild-Prompt auf Standard zurückgesetzt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function saveEmailSettings() {
    setSaving("email");
    setError(null);
    setMessage(null);
    try {
      const port = Number(smtpPort);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new Error("SMTP-Port muss zwischen 1 und 65535 liegen.");
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpHost: smtpHost.trim() || null,
          smtpPort: port,
          smtpSecure,
          smtpUser: smtpUser.trim() || null,
          smtpPassword: smtpPassword || undefined,
          smtpFrom: smtpFrom.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setSmtpHost(data.smtpHost || ICLOUD_SMTP.host);
      setSmtpPort(String(data.smtpPort || ICLOUD_SMTP.port));
      setSmtpSecure(Boolean(data.smtpSecure));
      setSmtpUser(data.smtpUser || "");
      setSmtpPasswordMasked(data.smtpPasswordMasked || null);
      setHasSmtpPassword(Boolean(data.hasSmtpPassword));
      setSmtpFrom(data.smtpFrom || "");
      setEmailConfigured(Boolean(data.emailConfigured));
      setSmtpPassword("");
      setMessage("SMTP-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function clearSmtpPassword() {
    setSaving("email");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearSmtpPassword: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      setSmtpPasswordMasked(data.smtpPasswordMasked || null);
      setHasSmtpPassword(Boolean(data.hasSmtpPassword));
      setEmailConfigured(Boolean(data.emailConfigured));
      setSmtpPassword("");
      setMessage("SMTP-Passwort gelöscht.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  function applyIcloudPreset() {
    setSmtpHost(ICLOUD_SMTP.host);
    setSmtpPort(String(ICLOUD_SMTP.port));
    setSmtpSecure(ICLOUD_SMTP.secure);
    if (smtpUser.trim() && !smtpFrom.trim()) {
      setSmtpFrom(`FamilyBrain <${smtpUser.trim()}>`);
    }
    setMessage(
      "iCloud+-Preset gesetzt. Als Passwort ein App-spezifisches Passwort von appleid.apple.com verwenden."
    );
  }

  async function sendSettingsTestMail() {
    setTestMailBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!testMailTo.trim()) {
        throw new Error("Bitte Empfänger-Adresse für die Testmail angeben.");
      }
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testMailTo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Testmail fehlgeschlagen");
      setMessage(`Testmail an ${testMailTo.trim()} gesendet.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestMailBusy(false);
    }
  }

  async function clearAerodataboxKey() {
    setSaving("travelbrain");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAerodataboxApiKey: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      setAerodataboxKeyMasked(data.aerodataboxApiKeyMasked || null);
      setHasAerodataboxKey(Boolean(data.hasAerodataboxKey));
      setAerodataboxKey("");
      setMessage("AeroDataBox-Key entfernt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function testFlightApi() {
    setFlightTestBusy(true);
    setFlightTestResult(null);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/trips/test-flight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flightNumber: flightTestNumber.trim(),
          date: flightTestDate.trim(),
        }),
      });
      const data = await res.json();
      setFlightTestResult(JSON.stringify(data, null, 2));
      if (!res.ok || data.ok === false) {
        setError(
          data.error ||
            data.hint ||
            `Flug-API-Test: HTTP ${data.response?.status ?? res.status}`
        );
      } else {
        setMessage(
          `Flug-API-Test ok (${data.provider}, HTTP ${data.response?.status}).`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setFlightTestResult(JSON.stringify({ ok: false, error: message }, null, 2));
    } finally {
      setFlightTestBusy(false);
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

  const activeTab = parseSettingsTab(searchParams.get("tab"));
  const tabItems: SettingsTabItem[] = [
    { id: "chat", label: "Chat", icon: MessageSquareText },
    { id: "paperless", label: "Paperless", icon: Server },
    { id: "travel", label: "Travel", icon: Luggage },
    { id: "mail", label: "Mail", icon: Mail },
    { id: "more", label: "Mehr", icon: MoreHorizontal },
  ];

  function setTab(tab: SettingsTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "chat") params.delete("tab");
    else params.set("tab", tab);
    const q = params.toString();
    router.replace(q ? `?${q}` : "?", { scroll: false });
  }

  const settingsPrimaryBtn =
    "w-full bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <div className="space-y-6 pb-28 md:space-y-8 md:pb-0">
      <PageHeader
        title="Einstellungen"
        description="Verbindungen, KI und Chat-Verhalten für FamilyBrain."
        icon={pageVisuals.settings.icon}
        tone={pageVisuals.settings.tone}
      />

      <SettingsTabNav items={tabItems} active={activeTab} onChange={setTab} />

      {activeTab === "chat" ? (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={MessageSquareText} tone="teal" size="sm" />
            Chat-Regeln
          </CardTitle>
          {chatInstructionsCustomized ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Angepasst
            </Badge>
          ) : (
            <Badge variant="secondary">Vorlage</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Diese Regeln gelten bei jeder Chat-Antwort und können jederzeit
            geändert werden. Die Ausgangsvorlage ist nur ein Startpunkt — speichere
            deine Version, sobald du etwas anpasst.
          </p>
          <div className="space-y-2">
            <Label htmlFor="chatInstructions">Antwortverhalten</Label>
            <Textarea
              id="chatInstructions"
              value={chatInstructions}
              onChange={(e) => setChatInstructions(e.target.value)}
              className="min-h-[220px] rounded-xl font-mono text-xs leading-relaxed"
              placeholder="z. B. Pfade immer vollständig ausgeben…"
            />
            <p className="text-xs text-muted-foreground">
              {chatInstructions.length} Zeichen · max. 8000
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => void saveChatInstructions()}
              disabled={saving !== null}
              className={settingsPrimaryBtn}
            >
              {saving === "chat" ? "Speichert…" : "Chat-Regeln speichern"}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => {
                  if (chatInstructionsDefault) {
                    setChatInstructions(chatInstructionsDefault);
                  }
                }}
                disabled={saving !== null || !chatInstructionsDefault}
              >
                Vorlage in Editor laden
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="flex-1 sm:flex-none"
                onClick={() => void restoreDefaultChatInstructions()}
                disabled={saving !== null}
              >
                Auf Ausgangsvorlage zurücksetzen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      ) : null}

      {activeTab === "paperless" ? (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={Server} tone="teal" size="sm" />
            Paperless-ngx
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Basis-URL</Label>
            <Input
              id="url"
              className="rounded-xl"
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
              className="rounded-xl"
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
            className={settingsPrimaryBtn}
          >
            {saving === "paperless" ? "Speichert…" : "Paperless speichern"}
          </Button>
        </CardContent>
      </Card>
      ) : null}

      {activeTab === "more" ? (
        <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3">
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
              className="rounded-xl"
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
              className="rounded-xl"
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
            <div className="rounded-xl border border-border/60 bg-[var(--brand-docs-soft)]/60 p-3 text-xs text-muted-foreground">
              <div>Master: {triliumMasterNoteId || "–"}</div>
              <div>Privat: {triliumPrivatNoteId || "–"}</div>
              <div>Geschäftlich ANG: {triliumGeschaeftlichNoteId || "–"}</div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => void saveTrilium()}
              disabled={saving !== null || resolvingScopes}
              className={settingsPrimaryBtn}
            >
              {saving === "trilium" ? "Speichert…" : "Trilium speichern"}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => void testTriliumConnection()}
                disabled={saving !== null || resolvingScopes}
              >
                Verbindung testen
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => void resolveTriliumScopes()}
                disabled={saving !== null || resolvingScopes}
              >
                {resolvingScopes ? "Erkenne Bereiche…" : "Bereiche erkennen"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
      ) : null}

      {activeTab === "travel" ? (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={Luggage} tone="teal" size="sm" />
            TravelBrain
          </CardTitle>
          {hasAerodataboxKey ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Flug-API ok
            </Badge>
          ) : (
            <Badge variant="secondary">Flug-API optional</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Optionaler AeroDataBox-Key für Flug-Anreicherung (API.Market oder
            RapidAPI). Orts-Suche nutzt Photon (Komoot, fuzzy) und fällt auf
            OpenStreetMap/Nominatim zurück — ohne Key. Optional eigene
            Nominatim-Instanz.
          </p>
          <div className="space-y-2">
            <Label>Flug-API Anbieter</Label>
            <Select
              value={aerodataboxProvider}
              onValueChange={(v) => {
                if (v === "apimarket" || v === "rapidapi") {
                  setAerodataboxProvider(v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apimarket">API.Market</SelectItem>
                <SelectItem value="rapidapi">RapidAPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aeroKey">
              {aerodataboxProvider === "apimarket"
                ? "API.Market-Key"
                : "RapidAPI-Key"}
            </Label>
            <Input
              id="aeroKey"
              type="password"
              value={aerodataboxKey}
              onChange={(e) => setAerodataboxKey(e.target.value)}
              placeholder={
                hasAerodataboxKey
                  ? `Gespeichert: ${aerodataboxKeyMasked || "••••"}`
                  : aerodataboxProvider === "apimarket"
                    ? "API.Market Key"
                    : "RapidAPI-Key"
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Kartenstil</Label>
            <Select
              value={tripMapStyle}
              onValueChange={(v) => {
                if (v === "voyager" || v === "positron" || v === "osm") {
                  setTripMapStyle(v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="voyager">
                  Carto Voyager (farbig)
                </SelectItem>
                <SelectItem value="positron">
                  Carto Positron (hell)
                </SelectItem>
                <SelectItem value="osm">
                  OpenStreetMap (klassisch)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Kostenlose Kacheln auf OSM-Basis. Default: Voyager.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nominatimUrl">Nominatim Base URL</Label>
            <Input
              id="nominatimUrl"
              type="url"
              value={nominatimBaseUrl}
              onChange={(e) => setNominatimBaseUrl(e.target.value)}
              placeholder="https://nominatim.openstreetmap.org"
            />
            <p className="text-xs text-muted-foreground">
              Leer speichern stellt den öffentlichen OSM-Default wieder her.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="eventAiImagePrompt">
                Default-Prompt für Aktivitäts-KI-Bilder
              </Label>
              {eventAiImagePromptCustomized ? (
                <Badge variant="secondary">Angepasst</Badge>
              ) : (
                <Badge variant="outline">Standard</Badge>
              )}
            </div>
            <Textarea
              id="eventAiImagePrompt"
              rows={8}
              value={eventAiImagePrompt}
              onChange={(e) => setEventAiImagePrompt(e.target.value)}
              placeholder={eventAiImagePromptDefault}
            />
            <p className="text-xs text-muted-foreground">
              Platzhalter:{" "}
              <code className="text-[11px]">
                {eventAiImagePromptPlaceholders.join(" ")}
              </code>
              . In {"{{details}}"} landen automatisch alle ausgefüllten Felder
              der Aktivität (Datum, Ort, Buchung, Flugdaten, Adresse usw.). Beim
              Erzeugen kannst du den Prompt pro Aktivität noch anpassen. Stil
              steckt im Prompt; Modell:{" "}
              <code className="text-[11px]">gpt-image-2</code> (besser lesbarer
              Text).
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving !== null}
              onClick={() => void resetEventAiImagePrompt()}
            >
              Prompt zurücksetzen
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => void saveTravelBrainSettings()}
              disabled={saving !== null}
              className={settingsPrimaryBtn}
            >
              {saving === "travelbrain" ? "Speichert…" : "TravelBrain speichern"}
            </Button>
            {hasAerodataboxKey ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={saving !== null}
                onClick={() => void clearAerodataboxKey()}
              >
                Flug-API-Key entfernen
              </Button>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-border/60 bg-[var(--brand-docs-soft)]/40 p-3">
            <div className="text-sm font-medium">Flug-API testen</div>
            <p className="text-xs text-muted-foreground">
              Sendet dieselbe Lookup-Anfrage wie die Anreicherung und zeigt die
              Rohantwort (Status, Body). Nutzt den gespeicherten Key/Anbieter.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="flightTestNumber">Flugnummer</Label>
                <Input
                  id="flightTestNumber"
                  value={flightTestNumber}
                  onChange={(e) => setFlightTestNumber(e.target.value)}
                  placeholder="z. B. LX1594"
                  className="uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flightTestDate">Datum</Label>
                <Input
                  id="flightTestDate"
                  type="date"
                  value={flightTestDate}
                  onChange={(e) => setFlightTestDate(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={
                flightTestBusy ||
                saving !== null ||
                !flightTestNumber.trim() ||
                !flightTestDate
              }
              onClick={() => void testFlightApi()}
            >
              {flightTestBusy ? "Fragt API…" : "API-Anfrage starten"}
            </Button>
            {flightTestResult ? (
              <pre className="max-h-80 overflow-auto rounded-md border border-border/70 bg-background p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                {flightTestResult}
              </pre>
            ) : null}
          </div>
        </CardContent>
      </Card>
      ) : null}

      {activeTab === "mail" ? (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={Mail} tone="teal" size="sm" />
            E-Mail (SMTP)
          </CardTitle>
          {emailConfigured ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Konfiguriert
            </Badge>
          ) : (
            <Badge variant="secondary">Nicht konfiguriert</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Für FinanzBrain-Belegmails (Ausgabe / Rückzahlung) inkl. PDF-Anhang.
            Empfohlen: iCloud+ mit App-spezifischem Passwort. Werte können auch
            per Env gesetzt sein (
            <code className="text-[11px]">SMTP_HOST</code>,{" "}
            <code className="text-[11px]">SMTP_USER</code>, …).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving !== null}
              onClick={applyIcloudPreset}
            >
              iCloud+ Preset
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="smtpHost">SMTP-Host</Label>
              <Input
                id="smtpHost"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.mail.me.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpPort">Port</Label>
              <Input
                id="smtpPort"
                inputMode="numeric"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpSecure">Verschlüsselung</Label>
              <Select
                value={smtpSecure ? "ssl" : "starttls"}
                onValueChange={(v) => setSmtpSecure(v === "ssl")}
              >
                <SelectTrigger id="smtpSecure" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starttls">STARTTLS (587)</SelectItem>
                  <SelectItem value="ssl">SSL/TLS (465)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpUser">Benutzer (E-Mail)</Label>
              <Input
                id="smtpUser"
                type="email"
                autoComplete="username"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="name@icloud.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpPassword">Passwort</Label>
              <Input
                id="smtpPassword"
                type="password"
                autoComplete="new-password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={
                  hasSmtpPassword
                    ? smtpPasswordMasked || "••••••••"
                    : "App-spezifisches Passwort"
                }
              />
              {hasSmtpPassword ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving !== null}
                  onClick={() => void clearSmtpPassword()}
                >
                  Passwort löschen
                </Button>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="smtpFrom">Absender (From)</Label>
              <Input
                id="smtpFrom"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder="FamilyBrain <name@icloud.com>"
              />
              <p className="text-xs text-muted-foreground">
                Bei iCloud muss die From-Adresse deine iCloud-Mail (oder eine
                iCloud+-Custom-Domain) sein. App-Passwort unter{" "}
                <a
                  className="underline underline-offset-2"
                  href="https://appleid.apple.com/account/manage"
                  target="_blank"
                  rel="noreferrer"
                >
                  appleid.apple.com
                </a>{" "}
                → Anmeldung und Sicherheit → App-spezifische Passwörter.
              </p>
            </div>
          </div>
          <Button
            onClick={() => void saveEmailSettings()}
            disabled={saving !== null}
            className={settingsPrimaryBtn}
          >
            {saving === "email" ? "Speichert…" : "SMTP speichern"}
          </Button>
          <div className="space-y-2 border-t border-border/60 pt-4">
            <Label htmlFor="testMailTo">Testmail senden</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="testMailTo"
                type="email"
                className="min-w-0 flex-1 rounded-xl"
                value={testMailTo}
                onChange={(e) => setTestMailTo(e.target.value)}
                placeholder="du@example.com"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={testMailBusy || saving !== null || !emailConfigured}
                onClick={() => void sendSettingsTestMail()}
              >
                {testMailBusy ? "Sendet…" : "Testmail"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      ) : null}

      {activeTab === "more" ? (
        <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={HandCoins} tone="teal" size="sm" />
            FinanzBrain
          </CardTitle>
          {financeExpenseAiImagePromptCustomized ? (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
              Angepasst
            </Badge>
          ) : (
            <Badge variant="secondary">Standard</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ausgaben werden per KI kategorisiert (Icon oben links). Zusätzlich
            kann ein kleines Illustrationsbild erzeugt werden – analog
            TravelBrain, mit eigenem Prompt.
          </p>
          <div className="space-y-2">
            <Label htmlFor="financeExpenseAiImagePrompt">
              Default-Prompt für Ausgaben-KI-Bilder
            </Label>
            <Textarea
              id="financeExpenseAiImagePrompt"
              rows={7}
              value={financeExpenseAiImagePrompt}
              onChange={(e) => setFinanceExpenseAiImagePrompt(e.target.value)}
              placeholder={financeExpenseAiImagePromptDefault}
            />
            <p className="text-xs text-muted-foreground">
              Platzhalter:{" "}
              <code className="text-[11px]">
                {financeExpenseAiImagePromptPlaceholders.join(" ")}
              </code>
              . In {"{{details}}"} landen Betrag, Datum, Ort und Zahler.
              Kategorie-Icons setzt die KI beim Speichern; Modell für Bilder:{" "}
              <code className="text-[11px]">gpt-image-2</code>.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving !== null}
              onClick={() => void resetFinanceExpenseAiImagePrompt()}
            >
              Prompt zurücksetzen
            </Button>
          </div>
          <Button
            onClick={() => void saveFinanzBrainSettings()}
            disabled={saving !== null}
            className={settingsPrimaryBtn}
          >
            {saving === "finanzbrain"
              ? "Speichert…"
              : "FinanzBrain speichern"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={KeyRound} tone="teal" size="sm" />
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
            className={settingsPrimaryBtn}
          >
            {saving === "openai" ? "Speichert…" : "OpenAI speichern"}
          </Button>
        </CardContent>
      </Card>
        </div>
      ) : null}

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
