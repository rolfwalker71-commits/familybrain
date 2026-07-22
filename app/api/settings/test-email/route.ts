import { NextResponse } from "next/server";
import { z } from "zod";
import { sendTestEmail } from "@/lib/finance-brain/email";
import { isEmailConfigured } from "@/lib/finance-brain/mail-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  to: z.string().email(),
});

export async function POST(request: Request) {
  try {
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "Resend ist nicht konfiguriert (API-Key fehlt)." },
        { status: 400 }
      );
    }
    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
    }
    const result = await sendTestEmail(parsed.data.to);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Versand fehlgeschlagen" },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
