import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchEcbExchangeRate } from "@/lib/finance-brain/exchange-rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  from: z.string().min(3).max(3),
  to: z.string().min(3).max(3),
  date: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      from: searchParams.get("from")?.toUpperCase(),
      to: searchParams.get("to")?.toUpperCase(),
      date: searchParams.get("date") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parameter from und to (ISO-Währung) erforderlich" },
        { status: 400 }
      );
    }
    const result = await fetchEcbExchangeRate(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
