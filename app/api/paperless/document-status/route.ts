import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getDocumentById, getPaperlessSettings } from "@/lib/db/queries";
import { PaperlessClient } from "@/lib/paperless/client";
import {
  BUDDY_CUSTOM_FIELD_NAMES,
  extractNamedBooleanField,
  extractNamedStringField,
} from "@/lib/paperless/custom-fields";
import { writebackStatusFlagsToPaperless } from "@/lib/paperless/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  documentLocalId: z.number().int().positive(),
  buddyReviewed: z.boolean().optional(),
  taxRelevant: z.boolean().optional(),
  buddyStatus: z.string().max(40).nullable().optional(),
});

async function resolveStatusFromRaw(
  raw: Record<string, unknown>
): Promise<{
  buddyReviewed: boolean | null;
  taxRelevant: boolean | null;
  buddyStatus: string | null;
}> {
  const fieldIdToName = new Map<number, string>();
  const { baseUrl, apiToken } = getPaperlessSettings();
  if (baseUrl && apiToken) {
    try {
      const client = new PaperlessClient(baseUrl, apiToken);
      const defs = await client.listCustomFields();
      for (const def of defs) fieldIdToName.set(def.id, def.name);
    } catch {
      /* use names embedded in raw only */
    }
  }
  return {
    buddyReviewed: extractNamedBooleanField(
      raw,
      fieldIdToName,
      BUDDY_CUSTOM_FIELD_NAMES.buddyReviewed
    ),
    taxRelevant: extractNamedBooleanField(
      raw,
      fieldIdToName,
      BUDDY_CUSTOM_FIELD_NAMES.taxRelevant
    ),
    buddyStatus: extractNamedStringField(
      raw,
      fieldIdToName,
      BUDDY_CUSTOM_FIELD_NAMES.buddyStatus
    ),
  };
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("documentLocalId"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const detail = getDocumentById(id);
  if (!detail) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  let raw: Record<string, unknown> = {};
  try {
    raw = detail.document.raw_metadata
      ? (JSON.parse(detail.document.raw_metadata) as Record<string, unknown>)
      : {};
  } catch {
    raw = {};
  }
  const status = await resolveStatusFromRaw(raw);
  return NextResponse.json(status);
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const result = await writebackStatusFlagsToPaperless({
    localDocumentId: parsed.data.documentLocalId,
    buddyReviewed: parsed.data.buddyReviewed,
    taxRelevant: parsed.data.taxRelevant,
    buddyStatus: parsed.data.buddyStatus,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Writeback fehlgeschlagen" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
