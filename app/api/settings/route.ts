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
  getTripMapStyle,
  saveAeroDataBoxApiKey,
  saveAeroDataBoxProvider,
  saveNominatimBaseUrl,
  saveTripMapStyle,
  AERODATABOX_PROVIDERS,
  MAP_STYLES,
} from "@/lib/trips/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const paperless = getPaperlessSettings();
  const openai = getOpenAISettings();
  const trilium = getTriliumSettings();
  const aeroKey = getAeroDataBoxApiKey();
  const nominatimBaseUrl = getNominatimBaseUrl();
  return NextResponse.json({
    paperlessBaseUrl: paperless.baseUrl,
    paperlessApiTokenMasked: maskToken(paperless.apiToken),
    hasPaperlessToken: Boolean(paperless.apiToken),
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
    nominatimBaseUrl,
    tripMapStyle: getTripMapStyle(),
  });
}

const PutSchema = z.object({
  paperlessBaseUrl: z.string().url().optional(),
  paperlessApiToken: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().min(1).optional(),
  triliumBaseUrl: z.string().url().optional(),
  triliumApiToken: z.string().optional(),
  chatInstructions: z.string().max(8000).optional(),
  resetChatInstructions: z.boolean().optional(),
  aerodataboxApiKey: z.string().optional(),
  clearAerodataboxApiKey: z.boolean().optional(),
  aerodataboxProvider: z.enum(AERODATABOX_PROVIDERS).optional(),
  nominatimBaseUrl: z.string().optional(),
  tripMapStyle: z.enum(MAP_STYLES).optional(),
});

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingabe", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.paperlessBaseUrl) {
    savePaperlessSettings(
      parsed.data.paperlessBaseUrl,
      parsed.data.paperlessApiToken ?? null
    );
  } else if (parsed.data.paperlessApiToken) {
    const current = getPaperlessSettings();
    if (!current.baseUrl) {
      return NextResponse.json(
        { error: "Paperless Basis-URL fehlt." },
        { status: 400 }
      );
    }
    savePaperlessSettings(current.baseUrl, parsed.data.paperlessApiToken);
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

  const paperless = getPaperlessSettings();
  const openai = getOpenAISettings();
  const trilium = getTriliumSettings();
  const aeroKey = getAeroDataBoxApiKey();
  const nominatimBaseUrl = getNominatimBaseUrl();

  return NextResponse.json({
    ok: true,
    paperlessBaseUrl: paperless.baseUrl,
    paperlessApiTokenMasked: maskToken(paperless.apiToken),
    hasPaperlessToken: Boolean(paperless.apiToken),
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
    nominatimBaseUrl,
    tripMapStyle: getTripMapStyle(),
  });
}
