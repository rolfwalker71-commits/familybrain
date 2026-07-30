import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { sendTestEmail } from "@/lib/finance-brain/email";
import { isEmailConfigured } from "@/lib/finance-brain/mail-settings";
import { sendTriageTestEmail } from "@/lib/mail/notify-triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  to: z.string().email(),
  /** smtp = plain connectivity test; triage = HTML triage template */
  kind: z.enum(["smtp", "triage"]).optional().default("smtp"),
});

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    if (!isEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            "SMTP ist nicht konfiguriert (Host, Benutzer, Passwort und Absender).",
        },
        { status: 400 }
      );
    }
    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige E-Mail-Adresse" },
        { status: 400 }
      );
    }
    const result =
      parsed.data.kind === "triage"
        ? await sendTriageTestEmail(parsed.data.to)
        : await sendTestEmail(parsed.data.to);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Versand fehlgeschlagen" },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, kind: parsed.data.kind });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
