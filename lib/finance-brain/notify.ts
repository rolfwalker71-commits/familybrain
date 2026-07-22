import fs from "fs";
import {
  isEmailConfigured,
  sendMail,
  type MailAttachment,
} from "@/lib/finance-brain/email";
import {
  buildExpenseMailHtml,
  buildSettlementMailHtml,
} from "@/lib/finance-brain/mail-templates";
import {
  buildExpensePdfBuffer,
  buildSettlementPdfBuffer,
} from "@/lib/finance-brain/receipt-pdf";
import {
  getFinanceExpenseById,
  getFinanceLedgerById,
  getFinanceLedgerMemberById,
  getFinanceSettlementById,
  listFinanceLedgerMembers,
  markFinanceExpenseNotified,
  markFinanceSettlementNotified,
} from "@/lib/finance-brain/queries";

function memberEmails(ledgerId: number): string[] {
  return listFinanceLedgerMembers(ledgerId)
    .filter((m) => !m.invite_revoked_at && m.email?.trim())
    .map((m) => m.email!.trim());
}

export type NotifyResult = {
  ok: boolean;
  sent: number;
  skipped?: string;
  error?: string;
};

/** True when mail was attempted and failed (not merely skipped / unconfigured). */
export function notifyFailed(result: NotifyResult): boolean {
  return !result.ok && Boolean(result.error);
}

export async function notifyLedgerExpense(
  expenseId: number,
  options?: { force?: boolean }
): Promise<NotifyResult> {
  if (!isEmailConfigured()) {
    if (options?.force) {
      return { ok: false, sent: 0, error: "E-Mail nicht konfiguriert" };
    }
    return { ok: true, sent: 0, skipped: "E-Mail nicht konfiguriert" };
  }
  const expense = getFinanceExpenseById(expenseId);
  if (!expense) return { ok: false, sent: 0, error: "Ausgabe nicht gefunden" };
  if (expense.notified_at && !options?.force) {
    return { ok: true, sent: 0, skipped: "bereits benachrichtigt" };
  }
  const ledger = getFinanceLedgerById(expense.ledger_id);
  if (!ledger) return { ok: false, sent: 0, error: "Abrechnung nicht gefunden" };

  const recipients = memberEmails(expense.ledger_id);
  if (recipients.length === 0) {
    markFinanceExpenseNotified(expenseId);
    if (options?.force) {
      return { ok: false, sent: 0, error: "Keine Empfänger mit E-Mail-Adresse" };
    }
    return { ok: true, sent: 0, skipped: "keine Empfänger mit E-Mail" };
  }

  const payer = getFinanceLedgerMemberById(expense.paid_by_member_id);
  const mail = buildExpenseMailHtml({
    ledgerTitle: ledger.title,
    description: expense.description,
    categoryLabel: expense.category_label,
    amount: expense.amount,
    currency: expense.currency,
    amountBase: expense.amount_base,
    baseCurrency: ledger.base_currency,
    paidByName: payer?.display_name || `#${expense.paid_by_member_id}`,
    placeName: expense.place_name,
    expenseDate: expense.expense_date,
    hasAiImage: Boolean(expense.ai_image_path),
  });

  const pdf = await buildExpensePdfBuffer({
    ledgerTitle: ledger.title,
    description: expense.description,
    categoryLabel: expense.category_label,
    amount: expense.amount,
    currency: expense.currency,
    amountBase: expense.amount_base,
    baseCurrency: ledger.base_currency,
    exchangeRate: expense.exchange_rate,
    paidByName: payer?.display_name || `#${expense.paid_by_member_id}`,
    placeName: expense.place_name,
    expenseDate: expense.expense_date,
    aiImagePath: expense.ai_image_path,
    expenseId: expense.id,
  });

  const attachments: MailAttachment[] = [
    {
      filename: `finanzbrain-ausgabe-${expense.id}.pdf`,
      content: pdf.toString("base64"),
    },
  ];
  if (expense.ai_image_path && fs.existsSync(expense.ai_image_path)) {
    attachments.push({
      filename: `expense-${expense.id}-ai.png`,
      content: fs.readFileSync(expense.ai_image_path).toString("base64"),
      content_id: "expense-ai",
    });
  }

  const result = await sendMail({
    to: recipients,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments,
  });
  if (!result.ok) {
    return { ok: false, sent: 0, error: result.error };
  }
  markFinanceExpenseNotified(expenseId);
  return { ok: true, sent: recipients.length };
}

export async function notifyLedgerSettlement(
  settlementId: number
): Promise<NotifyResult> {
  if (!isEmailConfigured()) {
    return { ok: true, sent: 0, skipped: "E-Mail nicht konfiguriert" };
  }
  const settlement = getFinanceSettlementById(settlementId);
  if (!settlement) {
    return { ok: false, sent: 0, error: "Rückzahlung nicht gefunden" };
  }
  if (settlement.notified_at) {
    return { ok: true, sent: 0, skipped: "bereits benachrichtigt" };
  }
  const ledger = getFinanceLedgerById(settlement.ledger_id);
  if (!ledger) return { ok: false, sent: 0, error: "Abrechnung nicht gefunden" };

  const recipients = memberEmails(settlement.ledger_id);
  if (recipients.length === 0) {
    markFinanceSettlementNotified(settlementId);
    return { ok: true, sent: 0, skipped: "keine Empfänger mit E-Mail" };
  }

  const from = getFinanceLedgerMemberById(settlement.from_member_id);
  const to = getFinanceLedgerMemberById(settlement.to_member_id);
  const mail = buildSettlementMailHtml({
    ledgerTitle: ledger.title,
    fromName: from?.display_name || `#${settlement.from_member_id}`,
    toName: to?.display_name || `#${settlement.to_member_id}`,
    amount: settlement.amount,
    currency: settlement.currency,
    amountBase: settlement.amount_base,
    baseCurrency: ledger.base_currency,
    note: settlement.note,
    settledAt: settlement.settled_at,
  });

  const pdf = await buildSettlementPdfBuffer({
    ledgerTitle: ledger.title,
    fromName: from?.display_name || `#${settlement.from_member_id}`,
    toName: to?.display_name || `#${settlement.to_member_id}`,
    amount: settlement.amount,
    currency: settlement.currency,
    amountBase: settlement.amount_base,
    baseCurrency: ledger.base_currency,
    note: settlement.note,
    settledAt: settlement.settled_at,
    settlementId: settlement.id,
  });

  const result = await sendMail({
    to: recipients,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: [
      {
        filename: `finanzbrain-rueckzahlung-${settlement.id}.pdf`,
        content: pdf.toString("base64"),
      },
    ],
  });
  if (!result.ok) {
    return { ok: false, sent: 0, error: result.error };
  }
  markFinanceSettlementNotified(settlementId);
  return { ok: true, sent: recipients.length };
}
