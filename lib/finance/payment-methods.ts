export const PAYMENT_METHODS = [
  { id: "telebanking", label: "Telebanking" },
  { id: "ebill", label: "eBill" },
  { id: "cash", label: "Bar" },
  { id: "other", label: "Anders" },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

export function isPaymentMethodId(value: string): value is PaymentMethodId {
  return PAYMENT_METHODS.some((m) => m.id === value);
}

export function paymentMethodLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return PAYMENT_METHODS.find((m) => m.id === id)?.label ?? id;
}
