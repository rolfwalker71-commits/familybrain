import { notFound } from "next/navigation";
import { getFinanceLedgerMemberByToken } from "@/lib/finance-brain/queries";
import { FinanceShareClient } from "@/components/finance-brain/finance-share-client";

export const dynamic = "force-dynamic";

export default async function FinanceSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const member = getFinanceLedgerMemberByToken(token);
  if (!member) notFound();
  return <FinanceShareClient token={token} />;
}
