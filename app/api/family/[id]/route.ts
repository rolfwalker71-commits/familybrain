import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { clearFamilyMemberAvatar } from "@/lib/family/avatar";
import {
  deleteFamilyMember,
  getFamilyMemberById,
  getFamilyMemberPublic,
  updateFamilyMember,
} from "@/lib/family/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  userId: z.number().int().positive().nullable().optional(),
  sortKey: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function GET(_request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const member = getFamilyMemberPublic(id);
  if (!member) {
    return NextResponse.json(
      { error: "Familienmitglied nicht gefunden" },
      { status: 404 }
    );
  }
  return NextResponse.json({ member });
}

export async function PATCH(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  if (!getFamilyMemberById(id)) {
    return NextResponse.json(
      { error: "Familienmitglied nicht gefunden" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  try {
    const member = updateFamilyMember(id, {
      displayName: parsed.data.displayName,
      aliases: parsed.data.aliases,
      gender: parsed.data.gender,
      userId: parsed.data.userId,
      sortKey: parsed.data.sortKey,
      active: parsed.data.active,
    });
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  try {
    try {
      clearFamilyMemberAvatar(id);
    } catch {
      /* may already have no avatar */
    }
    deleteFamilyMember(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("nicht gefunden") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
