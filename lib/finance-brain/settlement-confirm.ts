import {
  capSettlementToCreditorNet,
  roundMoney,
} from "@/lib/finance-brain/settlement";
import { formatMoney } from "@/lib/finance-brain/format";

/**
 * Confirm a suggested repayment. If it would overpay the creditor's remaining
 * net, offer to cap. Returns the amount to post, or null if cancelled / zero.
 */
export function confirmSettlementAmount(input: {
  fromName: string;
  toName: string;
  suggested: number;
  creditorNet: number;
  currency: string;
}): number | null {
  const suggested = roundMoney(Math.max(0, input.suggested));
  if (!(suggested > 0)) return null;

  const cap = capSettlementToCreditorNet(suggested, input.creditorNet);
  if (!(cap.amount > 0)) {
    window.alert(
      `${input.toName} hat kein offenes Netto-Guthaben mehr — Rückzahlung nicht sinnvoll.`
    );
    return null;
  }

  if (cap.capped) {
    const ok = window.confirm(
      `${input.fromName} → ${input.toName}: Vorschlag ${formatMoney(suggested, input.currency)} übersteigt das offene Netto von ${input.toName} (${formatMoney(cap.creditorNet, input.currency)}) um ${formatMoney(cap.overpayBy, input.currency)}.\n\nAuf ${formatMoney(cap.amount, input.currency)} begrenzen und erfassen?`
    );
    return ok ? cap.amount : null;
  }

  const ok = window.confirm(
    `${input.fromName} → ${input.toName}: ${formatMoney(cap.amount, input.currency)} als Rückzahlung erfassen?`
  );
  return ok ? cap.amount : null;
}
