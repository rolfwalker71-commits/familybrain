import { getFinanceOverview } from "@/lib/db/queries";
import { FinanceOverviewClient } from "@/components/finance/finance-overview";

export const dynamic = "force-dynamic";

type Agg = { label: string; count: number; total: number };

export default function FinancePage() {
  const data = getFinanceOverview();

  const byYear = (
    data.byYear as { year: string; count: number; total: number }[]
  ).map((r) => ({
    label: r.year || "Unbekannt",
    count: r.count,
    total: r.total,
  })) as Agg[];

  const byVendor = (
    data.byVendor as { vendor: string; count: number; total: number }[]
  ).map((r) => ({
    label: r.vendor || "Unbekannt",
    count: r.count,
    total: r.total,
  })) as Agg[];

  const byCategory = (
    data.byCategory as { category: string; count: number; total: number }[]
  ).map((r) => ({
    label: r.category || "Sonstiges",
    count: r.count,
    total: r.total,
  })) as Agg[];

  return (
    <FinanceOverviewClient
      byYear={byYear}
      byVendor={byVendor}
      byCategory={byCategory}
      totals={data.totals as { count: number; total: number }}
      recurring={data.recurring as never[]}
      topInvoices={data.topInvoices as never[]}
      dueInvoices={data.dueInvoices as never[]}
      excludedCount={data.excludedCount}
      unknownVendor={
        data.unknownVendor as { count: number; total: number }
      }
    />
  );
}
