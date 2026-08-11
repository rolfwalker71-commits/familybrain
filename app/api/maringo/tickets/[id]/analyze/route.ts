import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { hasChatKey, hasOpenAIKey } from "@/lib/ai/client";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { listMariImageAttachmentsForAi } from "@/lib/mari/attachments";
import { analyzeMariTicket } from "@/lib/mari/analyze-ticket";
import { getTicketDetail } from "@/lib/mari/tickets";
import {
  getMariTicketAnalysis,
  upsertMariTicketAnalysis,
} from "@/lib/mari/ticket-analysis-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vision + Attachments können länger dauern */
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function parseIssueId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function GET(_request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;

  const { id: raw } = await context.params;
  const id = parseIssueId(raw);
  if (id == null) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  const stored = getMariTicketAnalysis(ownerKeyFromAuth(auth), id);
  if (!stored) {
    return NextResponse.json({ stored: false, issueId: id });
  }
  return NextResponse.json({
    stored: true,
    issueId: id,
    analyzedAt: stored.analyzedAt,
    summary: stored.summary,
    analysis: stored.analysis,
    imagesAnalyzed: stored.imagesAnalyzed,
    imageNames: stored.imageNames,
    usage: stored.usage,
    model: stored.model,
    internalNotePostedAt: stored.internalNotePostedAt,
  });
}

export async function POST(_request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  if (!hasMariConfig()) {
    return NextResponse.json(
      { error: "MARI nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { id: raw } = await context.params;
  const id = parseIssueId(raw);
  if (id == null) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  let includeImages = false;
  try {
    const body = await _request.json();
    if (body && typeof body === "object" && "includeImages" in body) {
      includeImages = Boolean(
        (body as { includeImages?: unknown }).includeImages
      );
    }
  } catch {
    includeImages = false;
  }

  if (includeImages && !hasOpenAIKey()) {
    return NextResponse.json(
      {
        error:
          "Screenshot-Analyse braucht den OpenAI-Key (Einstellungen → KI-API → OpenAI).",
      },
      { status: 400 }
    );
  }
  if (!includeImages && !hasChatKey()) {
    return NextResponse.json(
      { error: "Chat-/Analyse-API-Key fehlt (Einstellungen → KI-API)." },
      { status: 400 }
    );
  }

  try {
    const ticket = await getTicketDetail(id);
    let images: Awaited<ReturnType<typeof listMariImageAttachmentsForAi>> = [];
    if (includeImages) {
      try {
        images = await listMariImageAttachmentsForAi(id, { maxImages: 4 });
      } catch {
        images = [];
      }
    }
    const analysis = await analyzeMariTicket(ticket, {
      images: images.map((img) => ({
        dataUrl: img.dataUrl,
        orgFilename: img.orgFilename,
        mimeType: img.mimeType,
      })),
    });
    const { imagesAnalyzed, imageNames, usage, ...payload } = analysis;
    const stored = upsertMariTicketAnalysis({
      ownerKey: ownerKeyFromAuth(auth),
      issueId: id,
      analysis: payload,
      imagesAnalyzed,
      imageNames,
      usage,
      model: usage?.model ?? null,
    });
    return NextResponse.json({
      analysis: payload,
      issueId: id,
      imagesAnalyzed,
      imageNames,
      usage,
      includeImages,
      stored: true,
      analyzedAt: stored.analyzedAt,
      internalNotePostedAt: stored.internalNotePostedAt,
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
