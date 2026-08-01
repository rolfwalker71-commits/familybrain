"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Server, BookOpen, MessageSquareText, Luggage, HandCoins, Mail, MoreHorizontal, Users, Bell, Heart } from "lucide-react";
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
import { SettingsUsersPanel } from "@/components/settings/settings-users-panel";
import { SettingsFamilyPanel } from "@/components/settings/settings-family-panel";
import { NotificationPrefsPanel } from "@/components/settings/notification-prefs-panel";
import { SettingsCategorySuggestionsPanel } from "@/components/settings/settings-category-suggestions-panel";


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
  const [publicUrl, setPublicUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [paperlessWritebackEnabled, setPaperlessWritebackEnabled] =
    useState(true);
  const [documentAiIconsEnabled, setDocumentAiIconsEnabled] = useState(false);
  const [paperlessWebhookSecret, setPaperlessWebhookSecret] = useState("");
  const [paperlessWebhookUrl, setPaperlessWebhookUrl] = useState("");
  const [hasPaperlessWebhookSecret, setHasPaperlessWebhookSecret] =
    useState(false);
  const [paperlessWebhookSecretMasked, setPaperlessWebhookSecretMasked] =
    useState<string | null>(null);
  const [paperlessWritebackLastError, setPaperlessWritebackLastError] =
    useState<string | null>(null);
  const [paperlessCustomFieldChecklist, setPaperlessCustomFieldChecklist] =
    useState<Array<{ name: string; dataTypeHint: string }>>([]);
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
  const [ojpApiToken, setOjpApiToken] = useState("");
  const [ojpApiTokenMasked, setOjpApiTokenMasked] = useState<string | null>(null);
  const [hasOjpApiToken, setHasOjpApiToken] = useState(false);
  const [ojpTokenHash, setOjpTokenHash] = useState("");
  const [ojpTokenHashMasked, setOjpTokenHashMasked] = useState<string | null>(null);
  const [hasOjpTokenHash, setHasOjpTokenHash] = useState(false);
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
  const [appPublicUrl, setAppPublicUrl] = useState("");
  const [triageMailEnabled, setTriageMailEnabled] = useState(false);
  const [triageMailRecipients, setTriageMailRecipients] = useState("");
  const [triageAfterAnalysisEnabled, setTriageAfterAnalysisEnabled] =
    useState(true);
  const [triageMassPaused, setTriageMassPaused] = useState(false);
  const [triageMassPauseRestores, setTriageMassPauseRestores] = useState<{
    triageAfterAnalysisEnabled: boolean;
    triageMailEnabled: boolean;
    triageMailRecipients: string;
  } | null>(null);
  const [testMailTo, setTestMailTo] = useState("");
  const [testMailBusy, setTestMailBusy] = useState(false);
  const [triageTestBusy, setTriageTestBusy] = useState(false);
  const [flightTestNumber, setFlightTestNumber] = useState("LX1594");
  const [flightTestDate, setFlightTestDate] = useState("2026-10-23");
  const [flightTestBusy, setFlightTestBusy] = useState(false);
  const [flightTestResult, setFlightTestResult] = useState<string | null>(null);
  const [ojpTestOrigin, setOjpTestOrigin] = useState("Altdorf UR");
  const [ojpTestDestination, setOjpTestDestination] = useState(
    "Zürich Flughafen"
  );
  const [ojpTestDate, setOjpTestDate] = useState("2026-10-23");
  const [ojpTestTime, setOjpTestTime] = useState("12:30");
  const [ojpTestQuery, setOjpTestQuery] = useState("Zürich Flughafen");
  const [ojpTestBusy, setOjpTestBusy] = useState(false);
  const [ojpTestResult, setOjpTestResult] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || `Einstellungen laden fehlgeschlagen (${res.status})`
          );
        }
      setBaseUrl(data.paperlessBaseUrl || "");
      setPublicUrl(data.paperlessPublicUrl || "");
      setTokenMasked(data.paperlessApiTokenMasked);
      setHasToken(Boolean(data.hasPaperlessToken));
      setPaperlessWritebackEnabled(
        data.paperlessWritebackEnabled !== false
      );
      setDocumentAiIconsEnabled(Boolean(data.documentAiIconsEnabled));
      setPaperlessWebhookUrl(data.paperlessWebhookUrl || "");
      setHasPaperlessWebhookSecret(Boolean(data.hasPaperlessWebhookSecret));
      setPaperlessWebhookSecretMasked(
        data.paperlessWebhookSecretMasked || null
      );
      setPaperlessWebhookSecret(
        typeof data.paperlessWebhookSecret === "string"
          ? data.paperlessWebhookSecret
          : ""
      );
      setPaperlessWritebackLastError(
        data.paperlessWritebackLastError || null
      );
      setPaperlessCustomFieldChecklist(
        Array.isArray(data.paperlessCustomFieldChecklist)
          ? data.paperlessCustomFieldChecklist.filter(
              (row: unknown): row is { name: string; dataTypeHint: string } =>
                !!row &&
                typeof row === "object" &&
                typeof (row as { name?: unknown }).name === "string" &&
                typeof (row as { dataTypeHint?: unknown }).dataTypeHint ===
                  "string"
            )
          : []
      );
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
      setOjpApiTokenMasked(data.ojpApiTokenMasked || null);
      setHasOjpApiToken(Boolean(data.hasOjpApiToken));
      setOjpTokenHashMasked(data.ojpTokenHashMasked || null);
      setHasOjpTokenHash(Boolean(data.hasOjpTokenHash));
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
      setAppPublicUrl(data.appPublicUrl || "");
      setTriageMailEnabled(Boolean(data.triageMailEnabled));
      setTriageMailRecipients(data.triageMailRecipients || "");
      setTriageAfterAnalysisEnabled(
        data.triageAfterAnalysisEnabled !== false
      );
      setTriageMassPaused(Boolean(data.triageMassPaused));
      setTriageMassPauseRestores(
        data.triageMassPauseRestores &&
          typeof data.triageMassPauseRestores === "object"
          ? {
              triageAfterAnalysisEnabled: Boolean(
                data.triageMassPauseRestores.triageAfterAnalysisEnabled
              ),
              triageMailEnabled: Boolean(
                data.triageMassPauseRestores.triageMailEnabled
              ),
              triageMailRecipients:
                data.triageMassPauseRestores.triageMailRecipients || "",
            }
          : null
      );
      setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  useEffect(() => {
    if (!triageMassPaused) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch("/api/settings/triage-mass-pause");
          if (!res.ok) return;
          const data = await res.json();
          setTriageMassPaused(Boolean(data.triageMassPaused));
          setTriageAfterAnalysisEnabled(
            data.triageAfterAnalysisEnabled !== false
          );
          setTriageMailEnabled(Boolean(data.triageMailEnabled));
          setTriageMailRecipients(data.triageMailRecipients || "");
          setTriageMassPauseRestores(
            data.triageMassPauseRestores &&
              typeof data.triageMassPauseRestores === "object"
              ? {
                  triageAfterAnalysisEnabled: Boolean(
                    data.triageMassPauseRestores.triageAfterAnalysisEnabled
                  ),
                  triageMailEnabled: Boolean(
                    data.triageMassPauseRestores.triageMailEnabled
                  ),
                  triageMailRecipients:
                    data.triageMassPauseRestores.triageMailRecipients || "",
                }
              : null
          );
        } catch {
          /* ignore */
        }
      })();
    }, 4000);
    return () => window.clearInterval(id);
  }, [triageMassPaused]);

  async function savePaperless() {
    setSaving("paperless");
    setError(null);
    setMessage(null);
    try {
      if (!baseUrl) throw new Error("Paperless API-URL ist erforderlich.");
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperlessBaseUrl: baseUrl,
          paperlessPublicUrl: publicUrl.trim(),
          paperlessApiToken: apiToken || undefined,
          paperlessWritebackEnabled,
          documentAiIconsEnabled,
          paperlessWebhookUrl: paperlessWebhookUrl.trim(),
          paperlessWebhookSecret: paperlessWebhookSecret || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      setBaseUrl(data.paperlessBaseUrl || baseUrl);
      setPublicUrl(data.paperlessPublicUrl || "");
      setTokenMasked(data.paperlessApiTokenMasked);
      setHasToken(data.hasPaperlessToken);
      setApiToken("");
      setPaperlessWritebackEnabled(data.paperlessWritebackEnabled !== false);
      setDocumentAiIconsEnabled(Boolean(data.documentAiIconsEnabled));
      setPaperlessWebhookUrl(data.paperlessWebhookUrl || "");
      setHasPaperlessWebhookSecret(Boolean(data.hasPaperlessWebhookSecret));
      setPaperlessWebhookSecretMasked(
        data.paperlessWebhookSecretMasked || null
      );
      setPaperlessWebhookSecret(
        typeof data.paperlessWebhookSecret === "string"
          ? data.paperlessWebhookSecret
          : ""
      );
      setPaperlessWritebackLastError(
        data.paperlessWritebackLastError || null
      );
      setMessage("Paperless-Einstellungen gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function generateWebhookSecret() {
    setSaving("paperless");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatePaperlessWebhookSecret: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Secret erzeugen fehlgeschlagen");
      setPaperlessWebhookSecret(
        typeof data.paperlessWebhookSecret === "string"
          ? data.paperlessWebhookSecret
          : ""
      );
      setHasPaperlessWebhookSecret(Boolean(data.hasPaperlessWebhookSecret));
      setPaperlessWebhookSecretMasked(
        data.paperlessWebhookSecretMasked || null
      );
      setPaperlessWebhookUrl(data.paperlessWebhookUrl || "");
      setMessage("Webhook-Secret erzeugt. Bitte in Paperless hinterlegen.");
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

  async function saveTravelBuddySettings() {
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
      if (ojpApiToken.trim()) {
        payload.ojpApiToken = ojpApiToken.trim();
      }
      if (ojpTokenHash.trim()) {
        payload.ojpTokenHash = ojpTokenHash.trim();
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
      setOjpApiTokenMasked(data.ojpApiTokenMasked || null);
      setHasOjpApiToken(Boolean(data.hasOjpApiToken));
      setOjpTokenHashMasked(data.ojpTokenHashMasked || null);
      setHasOjpTokenHash(Boolean(data.hasOjpTokenHash));
      setOjpApiToken("");
      setOjpTokenHash("");
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
      setMessage("TravelBuddy-Einstellungen gespeichert.");
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

  async function saveFinanzBuddySettings() {
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
      setMessage("FinanzBuddy-Einstellungen gespeichert.");
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
      setMessage("FinanzBuddy KI-Bild-Prompt auf Standard zurückgesetzt.");
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
          appPublicUrl: appPublicUrl.trim() || null,
          triageMailEnabled,
          triageMailRecipients: triageMailRecipients.trim() || null,
          triageAfterAnalysisEnabled,
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
      setAppPublicUrl(data.appPublicUrl || "");
      setTriageMailEnabled(Boolean(data.triageMailEnabled));
      setTriageMailRecipients(data.triageMailRecipients || "");
      setTriageAfterAnalysisEnabled(
        data.triageAfterAnalysisEnabled !== false
      );
      setSmtpPassword("");
      setMessage("E-Mail-Einstellungen gespeichert.");
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
      setSmtpFrom(`TripBook <${smtpUser.trim()}>`);
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
        body: JSON.stringify({ to: testMailTo.trim(), kind: "smtp" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Testmail fehlgeschlagen");
      setMessage(`SMTP-Testmail an ${testMailTo.trim()} gesendet.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestMailBusy(false);
    }
  }

  async function sendTriageSettingsTestMail() {
    setTriageTestBusy(true);
    setError(null);
    setMessage(null);
    try {
      const to =
        testMailTo.trim() ||
        triageMailRecipients.split(/[,;\n]/)[0]?.trim() ||
        "";
      if (!to) {
        throw new Error(
          "Bitte Empfänger (Testfeld oder Triage-Empfänger) angeben."
        );
      }
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, kind: "triage" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Triage-Testmail fehlgeschlagen");
      setMessage(`Triage-Testmail (HTML) an ${to} gesendet.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTriageTestBusy(false);
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

  async function clearOjpCredentials() {
    setSaving("travelbrain");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearOjpCredentials: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      setOjpApiTokenMasked(data.ojpApiTokenMasked || null);
      setHasOjpApiToken(Boolean(data.hasOjpApiToken));
      setOjpTokenHashMasked(data.ojpTokenHashMasked || null);
      setHasOjpTokenHash(Boolean(data.hasOjpTokenHash));
      setOjpApiToken("");
      setOjpTokenHash("");
      setMessage("ÖV-CH Zugangsdaten entfernt.");
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

  async function testOjpApi(mode: "trip" | "location") {
    setOjpTestBusy(true);
    setOjpTestResult(null);
    setError(null);
    setMessage(null);
    try {
      const payload =
        mode === "location"
          ? { mode, query: ojpTestQuery.trim() }
          : {
              mode,
              origin: ojpTestOrigin.trim(),
              destination: ojpTestDestination.trim(),
              date: ojpTestDate.trim(),
              time: ojpTestTime.trim(),
            };
      const res = await fetch("/api/trips/test-ojp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setOjpTestResult(JSON.stringify(data, null, 2));
      if (!res.ok || data.ok === false) {
        setError(
          data.error ||
            data.hint ||
            data.response?.errorText ||
            `ÖV-CH-Test: HTTP ${data.response?.status ?? res.status}`
        );
      } else if (mode === "location") {
        setMessage(
          `Bahnhofssuche ok — ${data.response?.candidates?.length ?? 0} Treffer (HTTP ${data.response?.status}).`
        );
      } else {
        setMessage(
          `Verbindungssuche ok — ${data.response?.tripCount ?? 0} Verbindungen (HTTP ${data.response?.status}).`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setOjpTestResult(JSON.stringify({ ok: false, error: message }, null, 2));
    } finally {
      setOjpTestBusy(false);
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
    { id: "notify", label: "Hinweise", icon: Bell },
    { id: "users", label: "User", icon: Users },
    { id: "family", label: "Familie", icon: Heart },
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
        description="Verbindungen, KI und Chat-Verhalten für TripBook."
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
            <Label htmlFor="url">API-URL (Server / intern)</Label>
            <Input
              id="url"
              className="rounded-xl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://paperless:8000"
            />
            <p className="text-xs text-muted-foreground">
              Für Sync, Writeback und Dateiabruf. Bei Docker auf demselben Host
              die interne Adresse verwenden (schnell).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="publicUrl">Öffentliche URL (Browser)</Label>
            <Input
              id="publicUrl"
              className="rounded-xl"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              placeholder="https://paperless.example.com"
            />
            <p className="text-xs text-muted-foreground">
              Für «In Paperless öffnen». Leer = gleiche Adresse wie API-URL.
            </p>
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

          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
            <input
              id="paperlessWriteback"
              type="checkbox"
              className="mt-1 size-4 accent-[var(--brand-docs)]"
              checked={paperlessWritebackEnabled}
              onChange={(e) => setPaperlessWritebackEnabled(e.target.checked)}
            />
            <div className="min-w-0 space-y-1">
              <Label htmlFor="paperlessWriteback" className="cursor-pointer">
                Analyse-Writeback nach Paperless
              </Label>
              <p className="text-xs text-muted-foreground">
                Schreibt Custom Fields, Tags und Status nach erfolgreicher
                Analyse bzw. beim Verknüpfen mit Reise/Ausgabe zurück.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
            <input
              id="documentAiIcons"
              type="checkbox"
              className="mt-1 size-4 accent-[var(--brand-docs)]"
              checked={documentAiIconsEnabled}
              onChange={(e) => setDocumentAiIconsEnabled(e.target.checked)}
            />
            <div className="min-w-0 space-y-1">
              <Label htmlFor="documentAiIcons" className="cursor-pointer">
                KI-Icons für Dokumente
              </Label>
              <p className="text-xs text-muted-foreground">
                Wenn aus: keine Icon-Generierung (auch nicht nach Analyse). Zum
                Testen einschalten und unter Dokumente gezielt einzelne Icons
                erzeugen — «Alle fehlenden» erst danach nutzen.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            Live-Toasts (Dokumente, Reisen, Finanzen), Ton und Anzeigedauer
            stellst du unter{" "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-2 hover:underline"
              onClick={() => setTab("notify")}
            >
              Hinweise
            </button>{" "}
            ein.
          </div>

          {paperlessWritebackLastError ? (
            <Alert variant="destructive">
              <AlertTitle>Letzter Writeback-Fehler</AlertTitle>
              <AlertDescription className="break-words text-xs">
                {paperlessWritebackLastError}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2 rounded-xl border border-border/60 p-3">
            <Label>Webhook (Near-Realtime)</Label>
            <p className="text-xs text-muted-foreground">
              In Paperless Post-Consumption / Webhook hinterlegen. Header:{" "}
              <code className="rounded bg-muted px-1">X-Buddy-Webhook-Secret</code>
              . Parameter verwenden: an, Key{" "}
              <code className="rounded bg-muted px-1">doc_url</code>, Value{" "}
              <code className="rounded bg-muted px-1">{"{{doc_url}}"}</code>{" "}
              (Trigger «Dokument hinzugefügt» oder «aktualisiert»). Dokument
              einbeziehen: aus. Bei Docker die interne Buddy-URL verwenden.
            </p>
            <div className="space-y-1">
              <Label htmlFor="webhookUrl" className="text-xs text-muted-foreground">
                URL
              </Label>
              <Input
                id="webhookUrl"
                className="rounded-xl font-mono text-xs"
                value={paperlessWebhookUrl}
                onChange={(e) => setPaperlessWebhookUrl(e.target.value)}
                placeholder="http://buddy:3000/api/paperless/webhook"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="webhookSecret" className="text-xs text-muted-foreground">
                Shared Secret
              </Label>
              <Input
                id="webhookSecret"
                className="rounded-xl font-mono text-xs"
                value={paperlessWebhookSecret}
                onChange={(e) => setPaperlessWebhookSecret(e.target.value)}
                placeholder={
                  hasPaperlessWebhookSecret && !paperlessWebhookSecret
                    ? `Gespeichert: ${paperlessWebhookSecretMasked || "••••"}`
                    : "Secret eingeben oder erzeugen"
                }
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving !== null}
              onClick={() => void generateWebhookSecret()}
            >
              Secret erzeugen
            </Button>
            <p className="text-xs text-muted-foreground">
              URL und Secret mit «Paperless speichern» übernehmen.
            </p>
          </div>

          {paperlessCustomFieldChecklist.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-border/60 p-3">
              <Label>Custom Fields in Paperless anlegen</Label>
              <p className="text-xs text-muted-foreground">
                Namen exakt so belassen (inkl. «Zu bezahlen» / «Bezahlt»). Tags
                legt Buddy bei Bedarf selbst an.
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {paperlessCustomFieldChecklist.map((row) => (
                  <li key={row.name} className="flex justify-between gap-2">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-muted-foreground">
                      {row.dataTypeHint}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
      <SettingsCategorySuggestionsPanel />
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
            TravelBuddy
          </CardTitle>
          {hasAerodataboxKey || hasOjpApiToken ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              {hasAerodataboxKey && hasOjpApiToken
                ? "Flug- & Zug-API ok"
                : hasOjpApiToken
                  ? "Zug-API ok"
                  : "Flug-API ok"}
            </Badge>
          ) : (
            <Badge variant="secondary">API optional</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Optionaler AeroDataBox-Key für Flug-Anreicherung (API.Market oder
            RapidAPI). ÖV-CH Token von opentransportdata.swiss für Zugstrecken
            (OJP). Orts-Suche nutzt Photon (Komoot, fuzzy) und fällt auf
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
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
            <Label htmlFor="ojpToken">ÖV-CH Token (opentransportdata.swiss)</Label>
            <Input
              id="ojpToken"
              type="password"
              value={ojpApiToken}
              onChange={(e) => setOjpApiToken(e.target.value)}
              placeholder={
                hasOjpApiToken
                  ? `Gespeichert: ${ojpApiTokenMasked || "••••"}`
                  : "Token aus dem API Manager"
              }
            />
            <p className="text-xs text-muted-foreground">
              Wird als Bearer-Token für OJP-Anfragen verwendet. Registrierung
              unter api-manager.opentransportdata.swiss — API „OJP 2.0“
              auswählen.
            </p>
            <Label htmlFor="ojpTokenHash">Token Hash (Referenz)</Label>
            <Input
              id="ojpTokenHash"
              type="password"
              value={ojpTokenHash}
              onChange={(e) => setOjpTokenHash(e.target.value)}
              placeholder={
                hasOjpTokenHash
                  ? `Gespeichert: ${ojpTokenHashMasked || "••••"}`
                  : "Token Hash (optional, wird nicht an OJP gesendet)"
              }
            />
            <p className="text-xs text-muted-foreground">
              Nur zur sicheren Aufbewahrung nach der Registrierung. Für API-Aufrufe
              wird ausschliesslich der Token oben benötigt.
            </p>
            {hasOjpApiToken || hasOjpTokenHash ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving === "travelbrain"}
                onClick={() => void clearOjpCredentials()}
              >
                ÖV-CH Zugangsdaten entfernen
              </Button>
            ) : null}
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
              onClick={() => void saveTravelBuddySettings()}
              disabled={saving !== null}
              className={settingsPrimaryBtn}
            >
              {saving === "travelbrain" ? "Speichert…" : "TravelBuddy speichern"}
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

          <div className="space-y-3 rounded-xl border border-border/60 bg-emerald-50/50 p-3 dark:bg-emerald-950/20">
            <div className="text-sm font-medium">ÖV-CH / OJP testen</div>
            <p className="text-xs text-muted-foreground">
              Prüft Token und OJP-2.0-Zugriff (Verbindungssuche oder
              Bahnhofssuche). Zeigt Status, geparste Treffer und Roh-XML.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ojpTestOrigin">Von</Label>
                <Input
                  id="ojpTestOrigin"
                  value={ojpTestOrigin}
                  onChange={(e) => setOjpTestOrigin(e.target.value)}
                  placeholder="Altdorf UR"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ojpTestDestination">Nach</Label>
                <Input
                  id="ojpTestDestination"
                  value={ojpTestDestination}
                  onChange={(e) => setOjpTestDestination(e.target.value)}
                  placeholder="Zürich Flughafen"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ojpTestDate">Datum</Label>
                <Input
                  id="ojpTestDate"
                  type="date"
                  value={ojpTestDate}
                  onChange={(e) => setOjpTestDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ojpTestTime">Zeit</Label>
                <Input
                  id="ojpTestTime"
                  value={ojpTestTime}
                  onChange={(e) => setOjpTestTime(e.target.value)}
                  placeholder="12:30"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={
                  ojpTestBusy ||
                  saving !== null ||
                  !ojpTestOrigin.trim() ||
                  !ojpTestDestination.trim() ||
                  !ojpTestDate
                }
                onClick={() => void testOjpApi("trip")}
              >
                {ojpTestBusy ? "Fragt OJP…" : "Verbindungen testen"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ojpTestQuery">Bahnhofssuche</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Input
                  id="ojpTestQuery"
                  value={ojpTestQuery}
                  onChange={(e) => setOjpTestQuery(e.target.value)}
                  placeholder="z. B. Zürich Flughafen"
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    ojpTestBusy || saving !== null || !ojpTestQuery.trim()
                  }
                  onClick={() => void testOjpApi("location")}
                >
                  Bahnhof suchen
                </Button>
              </div>
            </div>
            {ojpTestResult ? (
              <pre className="max-h-80 overflow-auto rounded-md border border-border/70 bg-background p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                {ojpTestResult}
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
            SMTP für FinanzBuddy-Belegmails und Buddy-Triage-Benachrichtigungen.
            Triage-Mails sind HTML only — keine PDF-Anhänge (vermeidet
            Doppelimporte in Paperless). Empfohlen: iCloud+ mit App-spezifischem
            Passwort.
          </p>
          <div className="space-y-2">
            <Label htmlFor="appPublicUrl">Öffentliche App-URL</Label>
            <Input
              id="appPublicUrl"
              value={appPublicUrl}
              onChange={(e) => setAppPublicUrl(e.target.value)}
              placeholder="https://familybrain.example.com"
            />
            <p className="text-xs text-muted-foreground">
              Basis für Links in Mails (Inbox, Einladungen) — nicht localhost.
            </p>
          </div>
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
                placeholder="TripBook <name@icloud.com>"
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
            {saving === "email" ? "Speichert…" : "E-Mail speichern"}
          </Button>

          <div
            id="triage-mail"
            className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"
          >
            {triageMassPaused ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-50">
                <p className="font-medium">
                  Temporär ausgeschaltet (Massenanalyse)
                </p>
                <p className="mt-1 text-xs opacity-90">
                  Triage nach Analyse
                  {triageMassPauseRestores?.triageAfterAnalysisEnabled
                    ? " (war aktiv)"
                    : ""}{" "}
                  und Triage-Mail
                  {triageMassPauseRestores?.triageMailEnabled
                    ? " (war aktiv)"
                    : ""}{" "}
                  sind während der Massenanalyse pausiert
                  {triageMassPauseRestores?.triageMailRecipients
                    ? ` — Empfänger bleibt: ${triageMassPauseRestores.triageMailRecipients}`
                    : ""}
                  . Nach Abschluss werden beide Optionen wiederhergestellt.
                </p>
              </div>
            ) : null}
            <div className="flex items-start gap-3">
              <input
                id="triageAfterAnalysisEnabled"
                type="checkbox"
                className="mt-1 size-4 accent-[var(--brand-docs)]"
                checked={
                  triageMassPaused
                    ? Boolean(
                        triageMassPauseRestores?.triageAfterAnalysisEnabled
                      )
                    : triageAfterAnalysisEnabled
                }
                disabled={saving !== null || triageMassPaused}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setTriageAfterAnalysisEnabled(enabled);
                  void (async () => {
                    setSaving("email");
                    setError(null);
                    setMessage(null);
                    try {
                      const res = await fetch("/api/settings", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          triageAfterAnalysisEnabled: enabled,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        throw new Error(
                          data.error || "Speichern fehlgeschlagen"
                        );
                      }
                      setTriageAfterAnalysisEnabled(
                        data.triageAfterAnalysisEnabled !== false
                      );
                      setMessage(
                        enabled
                          ? "Triage nach Analyse wieder aktiv."
                          : "Triage nach Analyse pausiert — Neuanalyse ohne Inbox-Flut."
                      );
                    } catch (err) {
                      setTriageAfterAnalysisEnabled(!enabled);
                      setError(
                        err instanceof Error ? err.message : String(err)
                      );
                    } finally {
                      setSaving(null);
                    }
                  })();
                }}
              />
              <div className="min-w-0 space-y-1">
                <Label
                  htmlFor="triageAfterAnalysisEnabled"
                  className="cursor-pointer"
                >
                  Triage nach Analyse
                  {triageMassPaused ? (
                    <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                      (pausiert)
                    </span>
                  ) : null}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Dokumente nach der Analyse in die Triage-Inbox legen. Bei
                  Massenanalysen (mehrere Belege) wird das automatisch
                  vorübergehend ausgeschaltet und danach wiederhergestellt.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 border-t border-border/50 pt-3">
              <input
                id="triageMailEnabled"
                type="checkbox"
                className="mt-1 size-4 accent-[var(--brand-docs)]"
                checked={
                  triageMassPaused
                    ? Boolean(triageMassPauseRestores?.triageMailEnabled)
                    : triageMailEnabled
                }
                onChange={(e) => setTriageMailEnabled(e.target.checked)}
                disabled={
                  triageMassPaused || !triageAfterAnalysisEnabled
                }
              />
              <div className="min-w-0 space-y-1">
                <Label htmlFor="triageMailEnabled" className="cursor-pointer">
                  Triage-Mail nach Analyse
                  {triageMassPaused ? (
                    <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                      (pausiert)
                    </span>
                  ) : null}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Wenn ein Dokument neu in die Triage-Inbox kommt, HTML-Mail an
                  die Empfänger senden (ohne PDF-Anhang).
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="triageMailRecipients">Empfänger</Label>
              <Input
                id="triageMailRecipients"
                value={
                  triageMassPaused &&
                  triageMassPauseRestores?.triageMailRecipients
                    ? triageMassPauseRestores.triageMailRecipients
                    : triageMailRecipients
                }
                onChange={(e) => setTriageMailRecipients(e.target.value)}
                placeholder="du@example.com, partner@example.com"
                disabled={triageMassPaused}
              />
              <p className="text-xs text-muted-foreground">
                Mehrere Adressen mit Komma trennen.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                triageTestBusy ||
                testMailBusy ||
                saving !== null ||
                !emailConfigured
              }
              onClick={() => void sendTriageSettingsTestMail()}
            >
              {triageTestBusy ? "Sendet…" : "Triage-Testmail senden"}
            </Button>
          </div>

          <div className="space-y-2 border-t border-border/60 pt-4">
            <Label htmlFor="testMailTo">SMTP-Testmail</Label>
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
                disabled={
                  testMailBusy ||
                  triageTestBusy ||
                  saving !== null ||
                  !emailConfigured
                }
                onClick={() => void sendSettingsTestMail()}
              >
                {testMailBusy ? "Sendet…" : "SMTP-Test"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Wird auch als Empfänger für die Triage-Testmail genutzt, falls
              gesetzt.
            </p>
          </div>
        </CardContent>
      </Card>
      ) : null}

      {activeTab === "users" ? <SettingsUsersPanel /> : null}
      {activeTab === "family" ? <SettingsFamilyPanel /> : null}

      {activeTab === "notify" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <IconCircle icon={Bell} tone="teal" size="sm" />
              Live-Benachrichtigungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationPrefsPanel />
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "more" ? (
        <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-3">
            <IconCircle icon={HandCoins} tone="teal" size="sm" />
            FinanzBuddy
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
            TravelBuddy, mit eigenem Prompt.
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
            onClick={() => void saveFinanzBuddySettings()}
            disabled={saving !== null}
            className={settingsPrimaryBtn}
          >
            {saving === "finanzbrain"
              ? "Speichert…"
              : "FinanzBuddy speichern"}
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
