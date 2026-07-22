/** Optional email notifications for FinanzBrain (SMTP, e.g. iCloud+). */

import nodemailer from "nodemailer";
import {
  getSmtpSettings,
  isEmailConfigured,
} from "@/lib/finance-brain/mail-settings";

export { isEmailConfigured };

export type MailAttachment = {
  filename: string;
  content: string; // base64
  content_id?: string;
};

export async function sendMail(input: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return {
      ok: false,
      error: "E-Mail nicht konfiguriert (SMTP-Zugangsdaten fehlen)",
    };
  }
  const smtp = getSmtpSettings();
  const to = Array.isArray(input.to) ? input.to : [input.to];
  if (to.length === 0) {
    return { ok: false, error: "Keine Empfänger" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.password!,
      },
    });

    await transporter.sendMail({
      from: smtp.from,
      to: to.join(", "),
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
        ...(a.content_id
          ? { cid: a.content_id, contentDisposition: "inline" as const }
          : {}),
      })),
    });
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
  return sendMail({
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

  return sendMail({
    to: input.to,
    subject: `FinanzBrain Saldo: ${input.ledgerTitle}`,
    text:
      `Hallo ${input.memberName},\n\n` +
      `Stand deiner Abrechnung «${input.ledgerTitle}»:\n${direction}\n\n` +
      `Details: ${input.shareUrl}\n`,
  });
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  return sendMail({
    to,
    subject: "FamilyBrain Testmail",
    text:
      "Hallo,\n\ndies ist eine Testmail aus den FamilyBrain-Einstellungen.\n" +
      "Wenn du diese Nachricht siehst, ist SMTP korrekt konfiguriert.\n",
    html: `<!DOCTYPE html><body style="font-family:system-ui,sans-serif;padding:24px;">
      <h2>FamilyBrain Testmail</h2>
      <p>SMTP ist korrekt konfiguriert. FinanzBrain kann Beleg-Mails versenden.</p>
    </body>`,
  });
}
