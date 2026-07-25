import fs from "fs";
import {
  isEmailConfigured,
  sendMail,
  type MailAttachment,
} from "@/lib/finance-brain/email";
import {
  buildExpenseMailHtml,
  buildLedgerExpensesMailHtml,
  buildSettlementMailHtml,
  buildTripLedgerSummaryMailHtml,
  type ExpenseMailFields,
} from "@/lib/finance-brain/mail-templates";
import {
  buildExpensePdfBuffer,
  buildLedgerExpensesPdfBuffer,
  buildSettlementPdfBuffer,
  buildTripLedgerSummaryPdfBuffer,
} from "@/lib/finance-brain/receipt-pdf";
import { loadScaledJpeg } from "@/lib/finance-brain/image-scale";
import {
  getFinanceExpenseById,
  getFinanceLedgerById,
  getFinanceLedgerMemberById,
  getFinanceSettlementById,
  listExpenseShareDisplays,
  listFinanceExpenseSplits,
  listFinanceExpenses,
  markFinanceExpenseNotified,
  markFinanceSettlementNotified,
} from "@/lib/finance-brain/queries";
import {
  buildTripLedgerSummaryModel,
  listTripSummaryRecipients,
} from "@/lib/finance-brain/trip-summary";

/** Unique emails for active ledger members (non-revoked, with address). */
function emailsForMemberIds(memberIds: Iterable<number>): string[] {
  const byLower = new Map<string, string>();
  for (const id of memberIds) {
    const member = getFinanceLedgerMemberById(id);
    const email = member?.email?.trim();
    if (!email || member?.invite_revoked_at) continue;
    const key = email.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, email);
  }
  return [...byLower.values()];
}

/** Payer + split participants for a single expense. */
function expenseParticipantMemberIds(expenseId: number): number[] {
  const expense = getFinanceExpenseById(expenseId);
  if (!expense) return [];
  const ids = new Set<number>([expense.paid_by_member_id]);
  for (const split of listFinanceExpenseSplits(expenseId)) {
    ids.add(split.member_id);
  }
  return [...ids];
}

/** Union of participants across all expenses in a ledger. */
function ledgerExpenseParticipantMemberIds(ledgerId: number): number[] {
  const ids = new Set<number>();
  for (const expense of listFinanceExpenses(ledgerId)) {
    ids.add(expense.paid_by_member_id);
    for (const split of listFinanceExpenseSplits(expense.id)) {
      ids.add(split.member_id);
    }
  }
  return [...ids];
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

function toExpenseMailFields(
  expense: NonNullable<ReturnType<typeof getFinanceExpenseById>>,
  ledger: NonNullable<ReturnType<typeof getFinanceLedgerById>>,
  paidByName: string
): ExpenseMailFields {
  const shares = listExpenseShareDisplays(
    expense.id,
    expense.paid_by_member_id
  ).map((s) => ({
    displayName: s.displayName,
    shareAmountBase: s.shareAmountBase,
    isPayer: s.isPayer,
  }));
  return {
    expenseId: expense.id,
    description: expense.description,
    categoryLabel: expense.category_label,
    amount: expense.amount,
    currency: expense.currency,
    amountBase: expense.amount_base,
    baseCurrency: ledger.base_currency,
    exchangeRate: expense.exchange_rate,
    paidByName,
    placeName: expense.place_name,
    expenseDate: expense.expense_date,
    note: expense.note,
    hasAiImage: Boolean(expense.ai_image_path),
    aiCid: `expense-ai-${expense.id}`,
    shares,
  };
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

  const recipients = emailsForMemberIds(expenseParticipantMemberIds(expenseId));
  if (recipients.length === 0) {
    markFinanceExpenseNotified(expenseId);
    if (options?.force) {
      return { ok: false, sent: 0, error: "Keine Empfänger mit E-Mail-Adresse" };
    }
    return { ok: true, sent: 0, skipped: "keine Empfänger mit E-Mail" };
  }

  const payer = getFinanceLedgerMemberById(expense.paid_by_member_id);
  const paidByName = payer?.display_name || `#${expense.paid_by_member_id}`;
  const fields = toExpenseMailFields(expense, ledger, paidByName);
  const mail = buildExpenseMailHtml({
    ledgerTitle: ledger.title,
    ...fields,
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
    paidByName,
    placeName: expense.place_name,
    expenseDate: expense.expense_date,
    note: expense.note,
    aiImagePath: expense.ai_image_path,
    expenseId: expense.id,
    shares: fields.shares,
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

export async function notifyLedgerExpensesSummary(
  ledgerId: number
): Promise<NotifyResult> {
  if (!isEmailConfigured()) {
    return { ok: false, sent: 0, error: "E-Mail nicht konfiguriert" };
  }
  const ledger = getFinanceLedgerById(ledgerId);
  if (!ledger) return { ok: false, sent: 0, error: "Abrechnung nicht gefunden" };

  const recipients = emailsForMemberIds(
    ledgerExpenseParticipantMemberIds(ledgerId)
  );
  if (recipients.length === 0) {
    return { ok: false, sent: 0, error: "Keine Empfänger mit E-Mail-Adresse" };
  }

  const expenses = listFinanceExpenses(ledgerId);
  if (expenses.length === 0) {
    return { ok: false, sent: 0, error: "Keine Ausgaben vorhanden" };
  }

  const fields = expenses.map((expense) => {
    const payer = getFinanceLedgerMemberById(expense.paid_by_member_id);
    return toExpenseMailFields(
      expense,
      ledger,
      payer?.display_name || `#${expense.paid_by_member_id}`
    );
  });

  const mail = buildLedgerExpensesMailHtml({
    ledgerTitle: ledger.title,
    baseCurrency: ledger.base_currency,
    expenses: fields,
  });

  const pdf = await buildLedgerExpensesPdfBuffer({
    ledgerTitle: ledger.title,
    baseCurrency: ledger.base_currency,
    expenses: fields.map((f) => ({
      expenseId: f.expenseId,
      description: f.description,
      categoryLabel: f.categoryLabel,
      amount: f.amount,
      currency: f.currency,
      amountBase: f.amountBase,
      baseCurrency: f.baseCurrency,
      exchangeRate: f.exchangeRate,
      paidByName: f.paidByName,
      placeName: f.placeName,
      expenseDate: f.expenseDate,
      note: f.note,
      aiImagePath:
        expenses.find((e) => e.id === f.expenseId)?.ai_image_path ?? null,
      shares: f.shares,
    })),
  });

  const attachments: MailAttachment[] = [
    {
      filename: `finanzbrain-ausgaben-${ledgerId}.pdf`,
      content: pdf.toString("base64"),
    },
  ];
  for (const expense of expenses) {
    const thumb = await loadScaledJpeg(expense.ai_image_path);
    if (!thumb) continue;
    attachments.push({
      filename: `expense-${expense.id}-ai.jpg`,
      content: thumb.toString("base64"),
      content_id: `expense-ai-${expense.id}`,
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

  const from = getFinanceLedgerMemberById(settlement.from_member_id);
  const to = getFinanceLedgerMemberById(settlement.to_member_id);
  const recipients = emailsForMemberIds([
    settlement.from_member_id,
    settlement.to_member_id,
  ]);
  if (recipients.length === 0) {
    markFinanceSettlementNotified(settlementId);
    return { ok: true, sent: 0, skipped: "keine Empfänger mit E-Mail" };
  }

  const mail = buildSettlementMailHtml({
    ledgerTitle: ledger.title,
    fromName: from?.display_name || `#${settlement.from_member_id}`,
    toName: to?.display_name || `#${settlement.to_member_id}`,
    amount: settlement.amount,
    currency: settlement.currency,
    amountBase: settlement.amount_base,
    baseCurrency: ledger.base_currency,
    exchangeRate: settlement.exchange_rate,
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
    exchangeRate: settlement.exchange_rate,
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

export async function notifyTripLedgerSummary(
  ledgerId: number,
  recipientMemberIds: number[]
): Promise<NotifyResult> {
  if (!isEmailConfigured()) {
    return { ok: false, sent: 0, error: "E-Mail nicht konfiguriert" };
  }

  const allowed = listTripSummaryRecipients(ledgerId);
  if (allowed.length === 0) {
    return { ok: false, sent: 0, error: "Keine Empfänger mit E-Mail-Adresse" };
  }

  const idSet = new Set(recipientMemberIds);
  const recipients = allowed.filter((r) => idSet.has(r.memberId));
  if (recipients.length === 0) {
    return { ok: false, sent: 0, error: "Keine gültigen Empfänger ausgewählt" };
  }

  let model;
  try {
    model = buildTripLedgerSummaryModel(ledgerId);
  } catch (err) {
    return {
      ok: false,
      sent: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (model.expenses.length === 0) {
    return { ok: false, sent: 0, error: "Keine Ausgaben vorhanden" };
  }

  const mail = buildTripLedgerSummaryMailHtml({
    ledgerTitle: model.ledgerTitle,
    tripTitle: model.tripTitle,
    baseCurrency: model.baseCurrency,
    exportedAt: model.exportedAt,
    expenses: model.expenses,
    totalExpenseBase: model.totalExpenseBase,
    totalSettlementsBase: model.totalSettlementsBase,
    members: model.members,
    settlements: model.settlements,
    openDebts: model.openDebts,
  });

  const pdf = await buildTripLedgerSummaryPdfBuffer(model);

  const attachments: MailAttachment[] = [
    {
      filename: `finanzbuddy-reise-uebersicht-${ledgerId}.pdf`,
      content: pdf.toString("base64"),
    },
  ];
  for (const expense of model.expenses) {
    const thumb = await loadScaledJpeg(expense.aiImagePath);
    if (!thumb) continue;
    attachments.push({
      filename: `expense-${expense.expenseId}-ai.jpg`,
      content: thumb.toString("base64"),
      content_id: expense.aiCid,
    });
  }

  const result = await sendMail({
    to: recipients.map((r) => r.email),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments,
  });
  if (!result.ok) {
    return { ok: false, sent: 0, error: result.error };
  }
  return { ok: true, sent: recipients.length };
}
