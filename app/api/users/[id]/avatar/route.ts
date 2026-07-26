import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";
import { hasOpenAIKey } from "@/lib/ai/client";
import {
  clearUserAvatar,
  generateUserAvatar,
  saveUserAvatarUpload,
} from "@/lib/users/avatar";
import { getAppUserPublic, updateAppUser } from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const GenerateSchema = z.object({
  generate: z.literal(true),
  gender: z.enum(["male", "female"]).nullable().optional(),
});

export async function POST(request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    if (!getAppUserPublic(id)) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Bilddatei fehlt" },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length === 0) {
        return NextResponse.json({ error: "Leere Datei" }, { status: 400 });
      }
      await saveUserAvatarUpload(id, buf);
      return NextResponse.json({ ok: true, user: getAppUserPublic(id) });
    }

    const body = await request.json();
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    if (!hasOpenAIKey()) {
      return NextResponse.json(
        { error: "OpenAI API-Key fehlt" },
        { status: 400 }
      );
    }
    if (parsed.data.gender !== undefined) {
      updateAppUser(id, { gender: parsed.data.gender });
    }
    await generateUserAvatar(id, {
      gender: parsed.data.gender,
    });
    return NextResponse.json({ ok: true, user: getAppUserPublic(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
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
    clearUserAvatar(id);
    return NextResponse.json({ ok: true, user: getAppUserPublic(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
