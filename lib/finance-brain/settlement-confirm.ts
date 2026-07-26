import {
  capSettlementToCreditorNet,
  roundMoney,
} from "@/lib/finance-brain/settlement";
import { formatMoney } from "@/lib/finance-brain/format";

/**
 * Confirm a suggested repayment. If it would overpay the creditor's remaining
 * overall net, warn and let the user book the full amount or cap to net.
 * Returns the amount to post, or null if cancelled / zero.
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
  if (!(cap.amount > 0) && !cap.capped) {
    window.alert(
      `${input.toName} hat kein offenes Netto-Guthaben mehr — Rückzahlung nicht sinnvoll.`
    );
    return null;
  }

  if (cap.capped) {
    // Creditor net can be lower than a single «Nach Zahler» share when the
    // creditor also owes others or has counter-claims in the ledger.
    const bookFull = window.confirm(
      `${input.fromName} → ${input.toName}: ${formatMoney(suggested, input.currency)} übersteigt das offene Gesamt-Netto von ${input.toName} (${formatMoney(cap.creditorNet, input.currency)}) um ${formatMoney(cap.overpayBy, input.currency)}.\n\n` +
        `Das Netto ist der Saldo über alle Buchungen — einzelne Anteile können höher sein.\n\n` +
        `OK = vollen Betrag ${formatMoney(suggested, input.currency)} trotzdem buchen\n` +
        `Abbrechen = andere Option`
    );
    if (bookFull) return suggested;

    if (!(cap.amount > 0)) {
      window.alert(
        `${input.toName} hat kein offenes Netto-Guthaben — ohne Überzahlung nichts zu erfassen.`
      );
      return null;
    }

    const bookCapped = window.confirm(
      `Stattdessen auf ${formatMoney(cap.amount, input.currency)} (offenes Netto von ${input.toName}) begrenzen und erfassen?`
    );
    return bookCapped ? cap.amount : null;
  }

  const ok = window.confirm(
    `${input.fromName} → ${input.toName}: ${formatMoney(cap.amount, input.currency)} als Rückzahlung erfassen?`
  );
  return ok ? cap.amount : null;
}
