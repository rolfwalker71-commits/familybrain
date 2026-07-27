"use client";

import type { LucideIcon } from "lucide-react";
import {
  AppTabNav,
  type AppTabItem,
  type AppTabOverflowItem,
} from "@/components/layout/app-tab-nav";

export type FinanceLedgerTab =
  | "overview"
  | "payments"
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
      ? ["overview", "payments", "new", "expenses", "settle", "more"]
      : ["overview", "new", "expenses", "more"]
  );
  if (raw && allowed.has(raw as FinanceLedgerTab)) {
    return raw as FinanceLedgerTab;
  }
  return "expenses";
}

export function FinanceTabNav({
  items,
  active,
  onChange,
  className,
  alwaysBottom,
  overflowItems,
}: {
  items: FinanceTabItem[];
  active: FinanceLedgerTab;
  onChange: (tab: FinanceLedgerTab) => void;
  className?: string;
  alwaysBottom?: boolean;
  overflowItems?: AppTabOverflowItem[];
}) {
  return (
    <AppTabNav
      items={items}
      active={active}
      onChange={onChange}
      className={className}
      alwaysBottom={alwaysBottom}
      accent="green"
      overflowItems={overflowItems}
    />
  );
}

// Re-export for convenience
export type { LucideIcon, AppTabOverflowItem };
