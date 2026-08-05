import { getFinanceOverview } from "@/lib/db/queries";
import { FinanceOverviewClient } from "@/components/finance/finance-overview";

export const dynamic = "force-dynamic";

type Agg = { label: string; count: number; total: number };

function mapAgg(
  rows: Array<{ label?: string; year?: string; vendor?: string; category?: string; count: number; total: number }>,
  labelKey: "year" | "vendor" | "category" | "label",
  fallback: string
): Agg[] {
  return rows.map((r) => ({
    label:
      (labelKey === "label"
        ? r.label
        : labelKey === "year"
          ? r.year
          : labelKey === "vendor"
            ? r.vendor
            : r.category) || fallback,
    count: r.count,
    total: r.total,
  }));
}

export default function FinancePage() {
  const data = getFinanceOverview();

  const byYear = mapAgg(
    data.byYear as Array<{ year: string; count: number; total: number }>,
    "year",
    "Unbekannt"
  );
  const byVendor = mapAgg(
    data.byVendor as Array<{ vendor: string; count: number; total: number }>,
    "vendor",
    "Unbekannt"
  );
  const byCategory = mapAgg(
    data.byCategory as Array<{ category: string; count: number; total: number }>,
    "category",
    "Sonstiges"
  );
  const historyByYear = mapAgg(
    data.historyByYear as Array<{ year: string; count: number; total: number }>,
    "year",
    "Unbekannt"
  );
  const historyByCategory = mapAgg(
    data.historyByCategory as Array<{
      category: string;
      count: number;
      total: number;
    }>,
    "category",
    "Sonstiges"
  );

  return (
    <FinanceOverviewClient
      statsYear={data.statsYear}
      yearRangeLabel={data.yearRangeLabel}
      byYear={byYear}
      byVendor={byVendor}
      byCategory={byCategory}
      historyByYear={historyByYear}
      historyByCategory={historyByCategory}
      totals={data.totals as { count: number; total: number }}
      recurring={data.recurring as never[]}
      topInvoices={data.topInvoices as never[]}
      dueInvoices={data.dueInvoices as never[]}
      detailInvoices={data.detailInvoices as never[]}
      excludedCount={data.excludedCount}
      unknownVendor={
        data.unknownVendor as { count: number; total: number }
      }
    />
  );
}
