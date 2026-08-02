import { NextResponse } from "next/server";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";
import {
  backfillPaymentFlagsFromRawMetadata,
  getPaperlessSettings,
  listOpenUnpaidInvoices,
} from "@/lib/db/queries";
import { ensureInitialized } from "@/lib/db/migrations";
import { buildInboxTaskBoard } from "@/lib/inbox/build-tasks";
import { PaperlessClient } from "@/lib/paperless/client";
import { ingestPaperlessDocumentById } from "@/lib/paperless/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensurePaymentFlagsPopulated() {
  const existing = listOpenUnpaidInvoices(1);
  if (existing.length > 0) return;

  const settings = getPaperlessSettings();
  if (!settings.baseUrl || !settings.apiToken) return;

  try {
    const client = new PaperlessClient(
      settings.baseUrl,
      settings.apiToken,
      settings.publicUrl
    );
    const fields = await client.listCustomFields();
    if (fields.length === 0) return;
    const map = new Map(fields.map((f) => [f.id, f.name] as const));
    backfillPaymentFlagsFromRawMetadata(map);

    if (listOpenUnpaidInvoices(1).length > 0) return;

    const query = JSON.stringify([
      "AND",
      [
        ["Zu bezahlen", "exact", true],
        ["OR", [["Bezahlt", "exact", false], ["Bezahlt", "isnull", true]]],
      ],
    ]);
    const page = await client.listDocumentsPage(undefined, {
      pageSize: 25,
      ordering: "-modified",
      customFieldQuery: query,
    });
    for (const doc of page.results || []) {
      await ingestPaperlessDocumentById(doc.id);
    }
  } catch {
    /* Paperless unreachable */
  }
}

export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  await ensurePaymentFlagsPopulated();
  return NextResponse.json(buildInboxTaskBoard());
}
