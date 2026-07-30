import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  createFamilyMember,
  listFamilyMembers,
} from "@/lib/family/queries";
import { generateFamilyMemberAvatar } from "@/lib/family/avatar";
import { hasOpenAIKey } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  userId: z.number().int().positive().nullable().optional(),
  sortKey: z.number().int().optional(),
  active: z.boolean().optional(),
  generateAvatar: z.boolean().optional(),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ members: listFamilyMembers() });
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  try {
    const member = createFamilyMember({
      displayName: parsed.data.displayName,
      aliases: parsed.data.aliases,
      gender: parsed.data.gender ?? null,
      userId: parsed.data.userId,
      sortKey: parsed.data.sortKey,
      active: parsed.data.active,
    });

    if (parsed.data.generateAvatar !== false && hasOpenAIKey()) {
      try {
        await generateFamilyMemberAvatar(member.id);
      } catch {
        /* avatar optional */
      }
    }

    const { getFamilyMemberPublic } = await import("@/lib/family/queries");
    return NextResponse.json({
      ok: true,
      member: getFamilyMemberPublic(member.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
