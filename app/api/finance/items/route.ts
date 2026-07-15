import { NextResponse } from "next/server";
import { z } from "zod";
import { updateFinancialItemCountsInStats } from "@/lib/db/queries";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";

const PatchSchema = z.object({
  id: z.number().int().positive(),
  counts_in_stats: z.boolean(),
});

export async function PATCH(request: Request) {
  ensureInitialized();
  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  updateFinancialItemCountsInStats(
    parsed.data.id,
    parsed.data.counts_in_stats
  );
  return NextResponse.json({ ok: true });
}
