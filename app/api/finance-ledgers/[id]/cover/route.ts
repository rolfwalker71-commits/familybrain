import fs from "fs";
import { NextResponse } from "next/server";
import {
  isAuthError,
  requireLedgerAccess,
} from "@/lib/auth/current-user";
import {
  generateFinanceLedgerCover,
  ledgerCoverPublicUrl,
  saveFinanceLedgerCoverUpload,
} from "@/lib/finance-brain/cover";
import { contentTypeForReceipt } from "@/lib/finance-brain/receipts";
import {
  getFinanceLedgerById,
} from "@/lib/finance-brain/queries";
import { serializeLedger } from "@/lib/finance-brain/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireLedgerAccess(id);
    if (isAuthError(auth)) return auth;
    const ledger = getFinanceLedgerById(id);
    if (!ledger) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }
    const url = new URL(request.url);
    if (url.searchParams.get("download") !== "1") {
      return NextResponse.json({
        ok: true,
        hasCover: Boolean(ledger.cover_path),
        cover_url: ledgerCoverPublicUrl(ledger.cover_path),
      });
    }
    if (!ledger.cover_path || !fs.existsSync(ledger.cover_path)) {
      return NextResponse.json(
        { error: "Kein Titelbild vorhanden" },
        { status: 404 }
      );
    }
    const buffer = fs.readFileSync(ledger.cover_path);
    const safeTitle = (ledger.title || `abrechnung-${id}`)
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 60);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypeForReceipt(ledger.cover_path),
        "Content-Disposition": `attachment; filename="${safeTitle}-titelbild.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const auth = await requireLedgerAccess(id);
    if (isAuthError(auth)) return auth;
    const ledger = getFinanceLedgerById(id);
    if (!ledger) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Datei fehlt" }, { status: 400 });
      }
      await saveFinanceLedgerCoverUpload(
        id,
        Buffer.from(await file.arrayBuffer()),
        file.type || "image/jpeg"
      );
      return NextResponse.json({
        ok: true,
        ledger: serializeLedger(getFinanceLedgerById(id)!),
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      generate?: boolean;
      prompt?: string;
    };
    if (body.generate) {
      await generateFinanceLedgerCover(id, body.prompt);
      return NextResponse.json({
        ok: true,
        ledger: serializeLedger(getFinanceLedgerById(id)!),
      });
    }

    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
