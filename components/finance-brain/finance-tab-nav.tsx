"use client";

import type { LucideIcon } from "lucide-react";
import { AppTabNav, type AppTabItem } from "@/components/layout/app-tab-nav";

export type FinanceLedgerTab =
  | "overview"
  | "new"
  | "expenses"
  | "settle"
  | "more";

export type FinanceTabItem = AppTabItem<FinanceLedgerTab>;

export function parseFinanceLedgerTab(
  raw: string | null | undefined,
  opts: { isSplit: boolean }
): FinanceLedgerTab {
  const allowed = new Set<FinanceLedgerTab>(
    opts.isSplit
      ? ["overview", "new", "expenses", "settle", "more"]
      : ["overview", "new", "expenses", "more"]
  );
  if (raw && allowed.has(raw as FinanceLedgerTab)) {
    return raw as FinanceLedgerTab;
  }
  return "overview";
}

export function FinanceTabNav({
  items,
  active,
  onChange,
  className,
  alwaysBottom,
}: {
  items: FinanceTabItem[];
  active: FinanceLedgerTab;
  onChange: (tab: FinanceLedgerTab) => void;
  className?: string;
  alwaysBottom?: boolean;
}) {
  return (
    <AppTabNav
      items={items}
      active={active}
      onChange={onChange}
      className={className}
      alwaysBottom={alwaysBottom}
      accent="green"
    />
  );
}

// Re-export for convenience
export type { LucideIcon };
