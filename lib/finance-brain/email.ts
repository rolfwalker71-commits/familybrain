/** Optional email notifications for FinanzBrain (Resend). */

import {
  getResendApiKey,
  getResendFrom,
  isEmailConfigured,
} from "@/lib/finance-brain/mail-settings";

export { isEmailConfigured };

export type ResendAttachment = {
  filename: string;
  content: string; // base64
  content_id?: string;
};

export async function sendResendEmail(input: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: ResendAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { ok: false, error: "E-Mail nicht konfiguriert (Resend API-Key fehlt)" };
  }
  const from = getResendFrom();
  const to = Array.isArray(input.to) ? input.to : [input.to];
  if (to.length === 0) {
    return { ok: false, error: "Keine Empfänger" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          ...(a.content_id ? { content_id: a.content_id } : {}),
        })),
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return {
        ok: false,
        error: data.message || `Resend-Fehler (${res.status})`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildInviteMailto(input: {
  memberName: string;
  ledgerTitle: string;
  shareUrl: string;
}): string {
  const subject = encodeURIComponent(`FinanzBrain: ${input.ledgerTitle}`);
  const body = encodeURIComponent(
    `Hallo ${input.memberName},\n\n` +
      `du wurdest zur Abrechnung «${input.ledgerTitle}» eingeladen.\n\n` +
      `Dein persönlicher Link:\n${input.shareUrl}\n\n` +
      `Damit kannst du Ausgaben erfassen und deinen Saldo sehen.`
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

export async function sendFinanceInviteEmail(input: {
  to: string;
  memberName: string;
  ledgerTitle: string;
  shareUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  return sendResendEmail({
    to: input.to,
    subject: `FinanzBrain: ${input.ledgerTitle}`,
    text:
      `Hallo ${input.memberName},\n\n` +
      `du wurdest zur Abrechnung «${input.ledgerTitle}» eingeladen.\n\n` +
      `Dein Link: ${input.shareUrl}\n`,
  });
}

export async function sendBalanceReminderEmail(input: {
  to: string;
  memberName: string;
  ledgerTitle: string;
  shareUrl: string;
  netBalance: number;
  baseCurrency: string;
}): Promise<{ ok: boolean; error?: string }> {
  const direction =
    input.netBalance < 0
      ? `Du schuldest noch ${Math.abs(input.netBalance).toFixed(2)} ${input.baseCurrency}.`
      : input.netBalance > 0
        ? `Dir werden ${input.netBalance.toFixed(2)} ${input.baseCurrency} geschuldet.`
        : "Dein Saldo ist ausgeglichen.";

  return sendResendEmail({
    to: input.to,
    subject: `FinanzBrain Saldo: ${input.ledgerTitle}`,
    text:
      `Hallo ${input.memberName},\n\n` +
      `Stand deiner Abrechnung «${input.ledgerTitle}»:\n${direction}\n\n` +
      `Details: ${input.shareUrl}\n`,
  });
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  return sendResendEmail({
    to,
    subject: "FamilyBrain Testmail",
    text:
      "Hallo,\n\ndies ist eine Testmail aus den FamilyBrain-Einstellungen.\n" +
      "Wenn du diese Nachricht siehst, ist Resend korrekt konfiguriert.\n",
    html: `<!DOCTYPE html><body style="font-family:system-ui,sans-serif;padding:24px;">
      <h2>FamilyBrain Testmail</h2>
      <p>Resend ist korrekt konfiguriert. FinanzBrain kann Beleg-Mails versenden.</p>
    </body>`,
  });
}
