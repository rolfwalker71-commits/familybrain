/** Optional email notifications for FinanzBrain (Resend). */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function buildInviteMailto(input: {
  memberName: string;
  ledgerTitle: string;
  shareUrl: string;
}): string {
  const subject = encodeURIComponent(
    `FinanzBrain: ${input.ledgerTitle}`
  );
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
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "E-Mail nicht konfiguriert (RESEND_API_KEY fehlt)" };
  }
  const from =
    process.env.RESEND_FROM?.trim() || "FamilyBrain <noreply@familybrain.local>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: `FinanzBrain: ${input.ledgerTitle}`,
        text:
          `Hallo ${input.memberName},\n\n` +
          `du wurdest zur Abrechnung «${input.ledgerTitle}» eingeladen.\n\n` +
          `Dein Link: ${input.shareUrl}\n`,
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

export async function sendBalanceReminderEmail(input: {
  to: string;
  memberName: string;
  ledgerTitle: string;
  shareUrl: string;
  netBalance: number;
  baseCurrency: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "E-Mail nicht konfiguriert (RESEND_API_KEY fehlt)" };
  }
  const from =
    process.env.RESEND_FROM?.trim() || "FamilyBrain <noreply@familybrain.local>";
  const direction =
    input.netBalance < 0
      ? `Du schuldest noch ${Math.abs(input.netBalance).toFixed(2)} ${input.baseCurrency}.`
      : input.netBalance > 0
        ? `Dir werden ${input.netBalance.toFixed(2)} ${input.baseCurrency} geschuldet.`
        : "Dein Saldo ist ausgeglichen.";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: `FinanzBrain Saldo: ${input.ledgerTitle}`,
        text:
          `Hallo ${input.memberName},\n\n` +
          `Stand deiner Abrechnung «${input.ledgerTitle}»:\n${direction}\n\n` +
          `Details: ${input.shareUrl}\n`,
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
