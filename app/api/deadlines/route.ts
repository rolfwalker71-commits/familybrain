import { NextResponse } from "next/server";
import { z } from "zod";
import { listDeadlines, updateDeadlineStatus } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  return NextResponse.json({ deadlines: listDeadlines(status) });
}

const PatchSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["open", "completed"]),
});

export async function PATCH(request: Request) {
  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  updateDeadlineStatus(parsed.data.id, parsed.data.status);
  return NextResponse.json({ ok: true });
}
