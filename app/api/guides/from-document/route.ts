import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { hasOpenAIKey } from "@/lib/ai/client";
import {
  importDocumentAsGuide,
  importPendingGuideDocuments,
  listPendingGuideDocuments,
} from "@/lib/guides/from-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PostSchema = z.object({
  documentLocalId: z.number().int().positive().optional(),
  /** Import all docs flagged «Für Guide». */
  importPending: z.boolean().optional().default(false),
  title: z.string().max(200).optional().nullable(),
  replaceExisting: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({
    pending: listPendingGuideDocuments(50),
    hasOpenAIKey: hasOpenAIKey(),
  });
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const parsed = PostSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  if (!hasOpenAIKey()) {
    return NextResponse.json(
      { error: "OpenAI API-Key fehlt (für Guide-Indexierung)." },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.importPending) {
      const batch = await importPendingGuideDocuments({
        limit: parsed.data.limit,
        replaceExisting: parsed.data.replaceExisting,
      });
      return NextResponse.json({ ok: true, batch });
    }

    if (!parsed.data.documentLocalId) {
      return NextResponse.json(
        { error: "documentLocalId oder importPending nötig." },
        { status: 400 }
      );
    }

    const result = await importDocumentAsGuide({
      documentLocalId: parsed.data.documentLocalId,
      title: parsed.data.title,
      replaceExisting: parsed.data.replaceExisting,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status) || 502
        : 502;
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status }
    );
  }
}
