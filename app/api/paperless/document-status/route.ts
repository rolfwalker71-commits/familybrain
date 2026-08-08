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
  extractPaymentCustomFlags,
} from "@/lib/paperless/custom-fields";
import { writebackStatusFlagsToPaperless } from "@/lib/paperless/writeback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  documentLocalId: z.number().int().positive(),
  buddyReviewed: z.boolean().optional(),
  taxRelevant: z.boolean().optional(),
  forGuide: z.boolean().optional(),
  buddyStatus: z.string().max(40).nullable().optional(),
  /** Paperless UDF «Bezahlt» / «Rechnung Bezahlt» */
  bezahlt: z.boolean().optional(),
  /** Paperless UDF «Zu bezahlen» / «Rechnung Offen» */
  zuBezahlen: z.boolean().optional(),
});

async function resolveStatusFromRaw(
  raw: Record<string, unknown>
): Promise<{
  buddyReviewed: boolean | null;
  taxRelevant: boolean | null;
  forGuide: boolean | null;
  buddyStatus: string | null;
  bezahlt: boolean | null;
  zuBezahlen: boolean | null;
}> {
  const fieldIdToName = new Map<number, string>();
  const { baseUrl, apiToken, publicUrl } = getPaperlessSettings();
  if (baseUrl && apiToken) {
    try {
      const client = new PaperlessClient(baseUrl, apiToken, publicUrl);
      const defs = await client.listCustomFields();
      for (const def of defs) fieldIdToName.set(def.id, def.name);
    } catch {
      /* use names embedded in raw only */
    }
  }
  const payment = extractPaymentCustomFlags(raw, fieldIdToName);
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
    forGuide: extractNamedBooleanField(
      raw,
      fieldIdToName,
      BUDDY_CUSTOM_FIELD_NAMES.forGuide
    ),
    buddyStatus: extractNamedStringField(
      raw,
      fieldIdToName,
      BUDDY_CUSTOM_FIELD_NAMES.buddyStatus
    ),
    bezahlt: payment.bezahlt,
    zuBezahlen: payment.zuBezahlen,
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
  const category =
    typeof detail.summary?.category === "string"
      ? detail.summary.category
      : null;
  // Prefer Paperless UDF; if unset, fall back to Buddy Steuern category.
  const taxRelevant =
    status.taxRelevant != null
      ? status.taxRelevant
      : category === "Steuern"
        ? true
        : status.taxRelevant;
  const { getDocumentForGuide } = await import("@/lib/documents/for-guide");
  const forGuideLocal = getDocumentForGuide(id);
  const forGuide =
    status.forGuide != null ? status.forGuide : forGuideLocal;
  return NextResponse.json({ ...status, taxRelevant, forGuide });
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
    forGuide: parsed.data.forGuide,
    buddyStatus: parsed.data.buddyStatus,
    bezahlt: parsed.data.bezahlt,
    zuBezahlen: parsed.data.zuBezahlen,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Writeback fehlgeschlagen" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
