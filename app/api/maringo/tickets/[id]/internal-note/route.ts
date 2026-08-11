import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { MariTicketAnalysisSchema } from "@/lib/mari/analyze-ticket";
import { deleteMariInternalNote } from "@/lib/mari/attachments";
import {
  postAnalysisAsInternalNote,
  postPlainInternalNote,
} from "@/lib/mari/internal-note";
import {
  clearMariTicketAnalysisInternalNotePosted,
  markMariTicketAnalysisInternalNotePosted,
} from "@/lib/mari/ticket-analysis-store";
import { getTicketDetail } from "@/lib/mari/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z
  .object({
    analysis: MariTicketAnalysisSchema.optional(),
    text: z.string().max(20_000).optional(),
  })
  .superRefine((val, ctx) => {
    const hasAnalysis = val.analysis != null;
    const hasText = Boolean(val.text?.trim());
    if (hasAnalysis === hasText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Entweder analysis oder text (nicht beides, nicht keines).",
      });
    }
  });

const DeleteBodySchema = z.object({
  attachmentId: z.number().int().positive(),
});

export async function POST(request: Request, context: Ctx) {
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
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Ungültige Anfrage",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    // Ticket muss existieren; verhindert Blind-Writes
    await getTicketDetail(id);
    const isAnalysisNote = parsed.data.analysis != null;
    const posted = isAnalysisNote
      ? await postAnalysisAsInternalNote(id, parsed.data.analysis!)
      : await postPlainInternalNote(id, parsed.data.text || "");

    let internalNotePostedAt: string | null = null;
    if (isAnalysisNote) {
      const marked = markMariTicketAnalysisInternalNotePosted(
        ownerKeyFromAuth(auth),
        id
      );
      internalNotePostedAt =
        marked?.internalNotePostedAt ?? new Date().toISOString();
    }

    const ticket = await getTicketDetail(id);
    return NextResponse.json({
      ok: true,
      attachmentId: posted.attachmentId,
      internal: posted.internal,
      internalNotePostedAt,
      ticket,
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

/** Löscht einen internen Kommentar (SupportIssueAttachment / Notiz) am Ticket. */
export async function DELETE(request: Request, context: Ctx) {
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
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const fromQuery = Number(url.searchParams.get("attachmentId"));
  let attachmentId = fromQuery;
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    const json = await request.json().catch(() => null);
    const parsed = DeleteBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "attachmentId fehlt oder ungültig." },
        { status: 400 }
      );
    }
    attachmentId = parsed.data.attachmentId;
  }

  try {
    const deleted = await deleteMariInternalNote({
      issueId: id,
      attachmentId,
    });

    const subject = (deleted.subject || "").toLowerCase();
    const wasAnalysisNote =
      subject.includes("buddy ai") ||
      subject.includes("ai-analyse") ||
      subject === "interner kommentar";
    let internalNotePostedAt: string | null | undefined;
    if (wasAnalysisNote) {
      const cleared = clearMariTicketAnalysisInternalNotePosted(
        ownerKeyFromAuth(auth),
        id
      );
      internalNotePostedAt = cleared?.internalNotePostedAt ?? null;
    }

    const ticket = await getTicketDetail(id);
    return NextResponse.json({
      ok: true,
      deletedAttachmentId: deleted.attachmentId,
      clearedAnalysisMarker: wasAnalysisNote,
      internalNotePostedAt:
        wasAnalysisNote ? internalNotePostedAt ?? null : undefined,
      ticket,
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
