import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { contentTypeForReceipt } from "@/lib/finance-brain/receipts";
import { resolveFinanceExpenseAiPath } from "@/lib/finance-brain/expense-image";
import {
  getFinanceLedgerMemberByToken,
} from "@/lib/finance-brain/queries";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; filename: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { token, filename } = await context.params;
  const member = getFinanceLedgerMemberByToken(token);
  if (!member) {
    return NextResponse.json(
      { error: "Einladungs-Link ungültig oder widerrufen." },
      { status: 404 }
    );
  }
  const full = resolveFinanceExpenseAiPath(decodeURIComponent(filename));
  if (!full) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const base = path.basename(full);
  const row = getDb()
    .prepare(
      `SELECT id FROM finance_expenses
       WHERE ledger_id = ?
         AND (ai_image_path LIKE ? OR ai_image_path LIKE ?)
       LIMIT 1`
    )
    .get(member.ledger_id, `%/${base}`, `%\\${base}`) as
    | { id: number }
    | undefined;
  if (!row) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  const buffer = fs.readFileSync(full);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentTypeForReceipt(full),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
