import { FinanceLedgerDetailClient } from "@/components/finance-brain/finance-ledger-detail-client";

export const dynamic = "force-dynamic";

export default async function FinanceLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ledgerId = Number(id);
  if (!Number.isInteger(ledgerId) || ledgerId <= 0) {
    return <p className="p-6 text-sm text-destructive">Ungültige ID.</p>;
  }
  return <FinanceLedgerDetailClient ledgerId={ledgerId} />;
}
