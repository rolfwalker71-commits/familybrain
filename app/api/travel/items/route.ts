import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInitialized } from "@/lib/db/migrations";
import { reclassifyTravelItem } from "@/lib/db/queries";
import { TRAVEL_TYPES } from "@/lib/extraction/normalize-categories";

export const runtime = "nodejs";

const PatchSchema = z.object({
  id: z.number().int().positive(),
  travel_type: z.enum(TRAVEL_TYPES as unknown as [string, ...string[]]),
  learn: z.boolean().optional().default(true),
});

export async function PATCH(request: Request) {
  ensureInitialized();
  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  try {
    const result = reclassifyTravelItem({
      id: parsed.data.id,
      travelType: parsed.data.travel_type,
      learn: parsed.data.learn,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
