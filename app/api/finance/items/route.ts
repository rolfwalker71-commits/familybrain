import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";
import {
  updateFinancialItem,
  updateFinancialItemCountsInStats,
} from "@/lib/db/queries";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  id: z.number().int().positive(),
  counts_in_stats: z.boolean().optional(),
  vendor: z.string().max(200).nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().max(3).nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  category: z.string().max(120).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
});

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const data = parsed.data;
  const onlyStats =
    data.counts_in_stats !== undefined &&
    data.vendor === undefined &&
    data.amount === undefined &&
    data.currency === undefined &&
    data.invoiceDate === undefined &&
    data.dueDate === undefined &&
    data.category === undefined &&
    data.description === undefined;

  if (onlyStats) {
    updateFinancialItemCountsInStats(data.id, data.counts_in_stats!);
  } else {
    updateFinancialItem(data.id, {
      vendor: data.vendor,
      amount: data.amount,
      currency: data.currency,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      category: data.category,
      description: data.description,
      countsInStats: data.counts_in_stats,
      manualOverride: true,
    });
  }
  return NextResponse.json({ ok: true });
}
