import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";
import { hashPassword } from "@/lib/auth/password";
import {
  deleteAppUser,
  getAppUserPublic,
  updateAppUser,
} from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  username: z.string().min(1).max(80).optional(),
  email: z.string().email().max(200).optional(),
  displayName: z.string().min(1).max(120).optional(),
  password: z.string().min(6).max(200).optional(),
  active: z.boolean().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  showTodayHub: z.boolean().optional(),
});

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const user = getAppUserPublic(id);
  if (!user) {
    return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ user });
}

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const parsed = PatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const passwordHash = parsed.data.password
      ? await hashPassword(parsed.data.password)
      : undefined;
    updateAppUser(id, {
      username: parsed.data.username,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      passwordHash,
      active: parsed.data.active,
      gender: parsed.data.gender,
      showTodayHub: parsed.data.showTodayHub,
    });
    return NextResponse.json({ ok: true, user: getAppUserPublic(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden")
      ? 404
      : message.includes("bereits")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    deleteAppUser(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
