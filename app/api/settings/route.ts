import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getOpenAISettings,
  getPaperlessSettings,
  getTriliumSettings,
  countSyncedTriliumNotes,
  isTriliumConfigured,
  saveOpenAISettings,
  savePaperlessSettings,
  saveTriliumSettings,
} from "@/lib/db/queries";
import { getTriliumInitialSyncComplete } from "@/lib/jobs/queries";
import { maskToken } from "@/lib/utils/format";
import { hasOpenAIKey } from "@/lib/ai/client";
import {
  DEFAULT_CHAT_INSTRUCTIONS,
  getChatInstructions,
  isChatInstructionsCustomized,
  resetChatInstructions,
  saveChatInstructions,
} from "@/lib/chat/instructions";
import {
  getAeroDataBoxApiKey,
  getAeroDataBoxProvider,
  getNominatimBaseUrl,
  getOjpApiToken,
  getOjpTokenHash,
  getTripMapStyle,
  hasOjpCredentials,
  saveAeroDataBoxApiKey,
  saveAeroDataBoxProvider,
  saveNominatimBaseUrl,
  saveOjpApiToken,
  saveOjpTokenHash,
  saveTripMapStyle,
  AERODATABOX_PROVIDERS,
  MAP_STYLES,
} from "@/lib/trips/settings";
import {
  DEFAULT_EVENT_AI_IMAGE_PROMPT,
  EVENT_AI_IMAGE_PROMPT_PLACEHOLDERS,
} from "@/lib/trips/event-image-prompt";
import {
  getEventAiImagePromptTemplate,
  isEventAiImagePromptCustomized,
  resetEventAiImagePromptTemplate,
  saveEventAiImagePromptTemplate,
} from "@/lib/trips/event-image-settings";
import {
  DEFAULT_EXPENSE_AI_IMAGE_PROMPT,
  EXPENSE_AI_IMAGE_PROMPT_PLACEHOLDERS,
} from "@/lib/finance-brain/expense-image-prompt";
import {
  getExpenseAiImagePromptTemplate,
  isExpenseAiImagePromptCustomized,
  resetExpenseAiImagePromptTemplate,
  saveExpenseAiImagePromptTemplate,
} from "@/lib/finance-brain/expense-image-settings";
import {
  getSmtpSettingsPublic,
  saveSmtpSettings,
} from "@/lib/finance-brain/mail-settings";
import {
  APP_PUBLIC_URL_KEY,
  getAppPublicUrlSetting,
  absoluteAppUrl,
  normalizeAppPublicUrl,
} from "@/lib/app-url";
import { setSetting } from "@/lib/db/migrations";
import {
  BUDDY_WRITEBACK_FIELD_CHECKLIST,
} from "@/lib/paperless/custom-fields";
import {
  getLastWritebackError,
  getPaperlessWebhookSecret,
  isPaperlessWritebackEnabled,
  setPaperlessWebhookSecret,
  setPaperlessWritebackEnabled,
} from "@/lib/paperless/writeback";
import {
  isDocumentAiIconsEnabled,
  setDocumentAiIconsEnabled,
} from "@/lib/paperless/document-icon";
import { randomBytes } from "crypto";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function paperlessIntegrationPayload(request?: Request) {
  const secret = getPaperlessWebhookSecret();
  return {
    paperlessWritebackEnabled: isPaperlessWritebackEnabled(),
    paperlessWebhookSecret: secret,
    paperlessWebhookSecretMasked: maskToken(secret),
    hasPaperlessWebhookSecret: Boolean(secret),
    paperlessWebhookUrl: absoluteAppUrl("/api/paperless/webhook", request),
    paperlessWritebackLastError: getLastWritebackError(),
    paperlessCustomFieldChecklist: BUDDY_WRITEBACK_FIELD_CHECKLIST,
    documentAiIconsEnabled: isDocumentAiIconsEnabled(),
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;
  const paperless = getPaperlessSettings();
  const openai = getOpenAISettings();
  const trilium = getTriliumSettings();
  const aeroKey = getAeroDataBoxApiKey();
  const ojpToken = getOjpApiToken();
  const ojpTokenHash = getOjpTokenHash();
  const nominatimBaseUrl = getNominatimBaseUrl();
  return NextResponse.json({
    paperlessBaseUrl: paperless.baseUrl,
    paperlessPublicUrl: paperless.publicUrlSetting || "",
    paperlessApiTokenMasked: maskToken(paperless.apiToken),
    hasPaperlessToken: Boolean(paperless.apiToken),
    ...paperlessIntegrationPayload(request),
    openaiApiKeyMasked: maskToken(openai.apiKey),
    hasOpenAIKey: hasOpenAIKey(),
    openaiModel: openai.model,
    triliumBaseUrl: trilium.baseUrl,
    triliumApiTokenMasked: maskToken(trilium.apiToken),
    hasTriliumToken: Boolean(trilium.apiToken),
    triliumMasterNoteId: trilium.masterNoteId,
    triliumPrivatNoteId: trilium.privatNoteId,
    triliumGeschaeftlichNoteId: trilium.geschaeftlichNoteId,
    triliumConfigured: isTriliumConfigured(),
    triliumSyncedNotes: countSyncedTriliumNotes(),
    triliumInitialSyncComplete: getTriliumInitialSyncComplete(),
    chatInstructions: getChatInstructions(),
    chatInstructionsCustomized: isChatInstructionsCustomized(),
    chatInstructionsDefault: DEFAULT_CHAT_INSTRUCTIONS,
    aerodataboxApiKeyMasked: maskToken(aeroKey),
    hasAerodataboxKey: Boolean(aeroKey),
    aerodataboxProvider: getAeroDataBoxProvider(),
    ojpApiTokenMasked: maskToken(ojpToken),
    hasOjpApiToken: Boolean(ojpToken),
    ojpTokenHashMasked: maskToken(ojpTokenHash),
    hasOjpTokenHash: Boolean(ojpTokenHash),
    hasOjpCredentials: hasOjpCredentials(),
    nominatimBaseUrl,
    tripMapStyle: getTripMapStyle(),
    eventAiImagePrompt: getEventAiImagePromptTemplate(),
    eventAiImagePromptCustomized: isEventAiImagePromptCustomized(),
    eventAiImagePromptDefault: DEFAULT_EVENT_AI_IMAGE_PROMPT,
    eventAiImagePromptPlaceholders: EVENT_AI_IMAGE_PROMPT_PLACEHOLDERS,
    financeExpenseAiImagePrompt: getExpenseAiImagePromptTemplate(),
    financeExpenseAiImagePromptCustomized: isExpenseAiImagePromptCustomized(),
    financeExpenseAiImagePromptDefault: DEFAULT_EXPENSE_AI_IMAGE_PROMPT,
    financeExpenseAiImagePromptPlaceholders: EXPENSE_AI_IMAGE_PROMPT_PLACEHOLDERS,
    appPublicUrl: getAppPublicUrlSetting() || "",
    ...getSmtpSettingsPublic(),
  });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[settings GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const PutSchema = z.object({
  paperlessBaseUrl: z.string().url().optional(),
  paperlessPublicUrl: z.union([z.string().url(), z.literal("")]).optional(),
  paperlessApiToken: z.string().optional(),
  paperlessWritebackEnabled: z.boolean().optional(),
  paperlessWebhookSecret: z.string().max(200).nullable().optional(),
  generatePaperlessWebhookSecret: z.boolean().optional(),
  documentAiIconsEnabled: z.boolean().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().min(1).optional(),
  triliumBaseUrl: z.string().url().optional(),
  triliumApiToken: z.string().optional(),
  chatInstructions: z.string().max(8000).optional(),
  resetChatInstructions: z.boolean().optional(),
  aerodataboxApiKey: z.string().optional(),
  clearAerodataboxApiKey: z.boolean().optional(),
  aerodataboxProvider: z.enum(AERODATABOX_PROVIDERS).optional(),
  ojpApiToken: z.string().optional(),
  ojpTokenHash: z.string().optional(),
  clearOjpCredentials: z.boolean().optional(),
  nominatimBaseUrl: z.string().optional(),
  tripMapStyle: z.enum(MAP_STYLES).optional(),
  eventAiImagePrompt: z.string().max(4000).optional(),
  resetEventAiImagePrompt: z.boolean().optional(),
  financeExpenseAiImagePrompt: z.string().max(4000).optional(),
  resetFinanceExpenseAiImagePrompt: z.boolean().optional(),
  smtpHost: z.string().max(200).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpSecure: z.boolean().nullable().optional(),
  smtpUser: z.string().max(320).nullable().optional(),
  smtpPassword: z.string().optional(),
  clearSmtpPassword: z.boolean().optional(),
  smtpFrom: z.string().max(320).nullable().optional(),
  appPublicUrl: z.string().max(500).nullable().optional(),
});

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const body = await request.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingabe", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.appPublicUrl !== undefined) {
    try {
      const normalized = normalizeAppPublicUrl(parsed.data.appPublicUrl);
      setSetting(APP_PUBLIC_URL_KEY, normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (parsed.data.paperlessBaseUrl) {
    savePaperlessSettings(
      parsed.data.paperlessBaseUrl,
      parsed.data.paperlessApiToken ?? null,
      parsed.data.paperlessPublicUrl !== undefined
        ? parsed.data.paperlessPublicUrl
        : undefined
    );
  } else if (parsed.data.paperlessPublicUrl !== undefined) {
    const current = getPaperlessSettings();
    if (!current.baseUrl) {
      return NextResponse.json(
        { error: "Paperless API-URL fehlt." },
        { status: 400 }
      );
    }
    savePaperlessSettings(
      current.baseUrl,
      parsed.data.paperlessApiToken ?? null,
      parsed.data.paperlessPublicUrl
    );
  } else if (parsed.data.paperlessApiToken) {
    const current = getPaperlessSettings();
    if (!current.baseUrl) {
      return NextResponse.json(
        { error: "Paperless API-URL fehlt." },
        { status: 400 }
      );
    }
    savePaperlessSettings(current.baseUrl, parsed.data.paperlessApiToken);
  }

  if (parsed.data.paperlessWritebackEnabled !== undefined) {
    setPaperlessWritebackEnabled(parsed.data.paperlessWritebackEnabled);
  }
  if (parsed.data.generatePaperlessWebhookSecret) {
    setPaperlessWebhookSecret(randomBytes(24).toString("hex"));
  } else if (parsed.data.paperlessWebhookSecret !== undefined) {
    setPaperlessWebhookSecret(parsed.data.paperlessWebhookSecret);
  }
  if (parsed.data.documentAiIconsEnabled !== undefined) {
    setDocumentAiIconsEnabled(parsed.data.documentAiIconsEnabled);
  }

  if (parsed.data.openaiApiKey !== undefined || parsed.data.openaiModel) {
    saveOpenAISettings(
      parsed.data.openaiApiKey ?? null,
      parsed.data.openaiModel ?? null
    );
  }

  if (parsed.data.triliumBaseUrl) {
    saveTriliumSettings({
      baseUrl: parsed.data.triliumBaseUrl,
      apiToken: parsed.data.triliumApiToken ?? null,
    });
  } else if (parsed.data.triliumApiToken) {
    const current = getTriliumSettings();
    if (!current.baseUrl) {
      return NextResponse.json(
        { error: "Trilium Basis-URL fehlt." },
        { status: 400 }
      );
    }
    saveTriliumSettings({ apiToken: parsed.data.triliumApiToken });
  }

  let chatInstructions = getChatInstructions();
  try {
    if (parsed.data.resetChatInstructions) {
      chatInstructions = resetChatInstructions();
    } else if (parsed.data.chatInstructions !== undefined) {
      chatInstructions = saveChatInstructions(parsed.data.chatInstructions);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (parsed.data.clearAerodataboxApiKey) {
    saveAeroDataBoxApiKey(null);
  } else if (parsed.data.aerodataboxApiKey !== undefined) {
    saveAeroDataBoxApiKey(parsed.data.aerodataboxApiKey || null);
  }

  if (parsed.data.aerodataboxProvider !== undefined) {
    saveAeroDataBoxProvider(parsed.data.aerodataboxProvider);
  }

  if (parsed.data.clearOjpCredentials) {
    saveOjpApiToken(null);
    saveOjpTokenHash(null);
  } else {
    if (parsed.data.ojpApiToken !== undefined) {
      saveOjpApiToken(parsed.data.ojpApiToken || null);
    }
    if (parsed.data.ojpTokenHash !== undefined) {
      saveOjpTokenHash(parsed.data.ojpTokenHash || null);
    }
  }

  if (parsed.data.nominatimBaseUrl !== undefined) {
    const raw = parsed.data.nominatimBaseUrl.trim();
    if (raw) {
      try {
        // eslint-disable-next-line no-new
        new URL(raw);
      } catch {
        return NextResponse.json(
          { error: "Nominatim-URL ist ungültig." },
          { status: 400 }
        );
      }
      saveNominatimBaseUrl(raw);
    } else {
      saveNominatimBaseUrl(null);
    }
  }

  if (parsed.data.tripMapStyle !== undefined) {
    saveTripMapStyle(parsed.data.tripMapStyle);
  }

  let eventAiImagePrompt = getEventAiImagePromptTemplate();
  try {
    if (parsed.data.resetEventAiImagePrompt) {
      eventAiImagePrompt = resetEventAiImagePromptTemplate();
    } else if (parsed.data.eventAiImagePrompt !== undefined) {
      eventAiImagePrompt = saveEventAiImagePromptTemplate(
        parsed.data.eventAiImagePrompt
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let financeExpenseAiImagePrompt = getExpenseAiImagePromptTemplate();
  try {
    if (parsed.data.resetFinanceExpenseAiImagePrompt) {
      financeExpenseAiImagePrompt = resetExpenseAiImagePromptTemplate();
    } else if (parsed.data.financeExpenseAiImagePrompt !== undefined) {
      financeExpenseAiImagePrompt = saveExpenseAiImagePromptTemplate(
        parsed.data.financeExpenseAiImagePrompt
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (
    parsed.data.clearSmtpPassword ||
    parsed.data.smtpHost !== undefined ||
    parsed.data.smtpPort !== undefined ||
    parsed.data.smtpSecure !== undefined ||
    parsed.data.smtpUser !== undefined ||
    parsed.data.smtpPassword !== undefined ||
    parsed.data.smtpFrom !== undefined
  ) {
    saveSmtpSettings({
      host: parsed.data.smtpHost,
      port: parsed.data.smtpPort,
      secure: parsed.data.smtpSecure,
      user: parsed.data.smtpUser,
      password: parsed.data.smtpPassword,
      clearPassword: parsed.data.clearSmtpPassword,
      from: parsed.data.smtpFrom,
    });
  }

  const paperless = getPaperlessSettings();
  const openai = getOpenAISettings();
  const trilium = getTriliumSettings();
  const aeroKey = getAeroDataBoxApiKey();
  const ojpToken = getOjpApiToken();
  const ojpTokenHash = getOjpTokenHash();
  const nominatimBaseUrl = getNominatimBaseUrl();

  return NextResponse.json({
    ok: true,
    paperlessBaseUrl: paperless.baseUrl,
    paperlessPublicUrl: paperless.publicUrlSetting || "",
    paperlessApiTokenMasked: maskToken(paperless.apiToken),
    hasPaperlessToken: Boolean(paperless.apiToken),
    ...paperlessIntegrationPayload(request),
    openaiApiKeyMasked: maskToken(openai.apiKey),
    hasOpenAIKey: hasOpenAIKey(),
    openaiModel: openai.model,
    triliumBaseUrl: trilium.baseUrl,
    triliumApiTokenMasked: maskToken(trilium.apiToken),
    hasTriliumToken: Boolean(trilium.apiToken),
    triliumMasterNoteId: trilium.masterNoteId,
    triliumPrivatNoteId: trilium.privatNoteId,
    triliumGeschaeftlichNoteId: trilium.geschaeftlichNoteId,
    triliumConfigured: isTriliumConfigured(),
    triliumSyncedNotes: countSyncedTriliumNotes(),
    triliumInitialSyncComplete: getTriliumInitialSyncComplete(),
    chatInstructions,
    chatInstructionsCustomized: isChatInstructionsCustomized(),
    chatInstructionsDefault: DEFAULT_CHAT_INSTRUCTIONS,
    aerodataboxApiKeyMasked: maskToken(aeroKey),
    hasAerodataboxKey: Boolean(aeroKey),
    aerodataboxProvider: getAeroDataBoxProvider(),
    ojpApiTokenMasked: maskToken(ojpToken),
    hasOjpApiToken: Boolean(ojpToken),
    ojpTokenHashMasked: maskToken(ojpTokenHash),
    hasOjpTokenHash: Boolean(ojpTokenHash),
    hasOjpCredentials: hasOjpCredentials(),
    nominatimBaseUrl,
    tripMapStyle: getTripMapStyle(),
    eventAiImagePrompt,
    eventAiImagePromptCustomized: isEventAiImagePromptCustomized(),
    eventAiImagePromptDefault: DEFAULT_EVENT_AI_IMAGE_PROMPT,
    eventAiImagePromptPlaceholders: EVENT_AI_IMAGE_PROMPT_PLACEHOLDERS,
    financeExpenseAiImagePrompt,
    financeExpenseAiImagePromptCustomized: isExpenseAiImagePromptCustomized(),
    financeExpenseAiImagePromptDefault: DEFAULT_EXPENSE_AI_IMAGE_PROMPT,
    financeExpenseAiImagePromptPlaceholders: EXPENSE_AI_IMAGE_PROMPT_PLACEHOLDERS,
    appPublicUrl: getAppPublicUrlSetting() || "",
    ...getSmtpSettingsPublic(),
  });
}
