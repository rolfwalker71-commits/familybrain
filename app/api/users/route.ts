import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";
import { hashPassword } from "@/lib/auth/password";
import {
  createAppUser,
  getAppUserPublic,
  listAppUsers,
} from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  username: z.string().min(1).max(80),
  email: z.string().email().max(200),
  displayName: z.string().min(1).max(120).optional(),
  password: z.string().min(6).max(200),
  active: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ users: listAppUsers() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const user = createAppUser({
      username: parsed.data.username,
      email: parsed.data.email,
      displayName: parsed.data.displayName || parsed.data.username,
      passwordHash,
      active: parsed.data.active,
    });
    return NextResponse.json({
      ok: true,
      user: getAppUserPublic(user.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("bereits") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
