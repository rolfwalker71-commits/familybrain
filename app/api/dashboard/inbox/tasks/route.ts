import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { applyInboxTaskAction } from "@/lib/inbox/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  sourceKind: z.enum([
    "triage",
    "deadline",
    "invoice",
    "warranty",
    "analysis",
  ]),
  sourceId: z.string().min(1).max(64),
  action: z.enum(["snooze", "done", "dismiss", "reopen", "mark_paid"]),
  snoozeDays: z.number().int().positive().max(90).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentMethod: z.enum(["telebanking", "ebill", "cash", "other"]).optional(),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { finalizeDuePaymentPlans } = await import(
    "@/lib/finance/payment-pipeline"
  );
  await finalizeDuePaymentPlans().catch(() => undefined);

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const result = await applyInboxTaskAction(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Aktion fehlgeschlagen" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, board: result.board });
}
