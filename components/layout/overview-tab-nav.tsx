"use client";

import { AppTabNav, type AppTabItem } from "@/components/layout/app-tab-nav";

export type OverviewTab = "overview" | "list" | "breakdown";

export type OverviewTabItem = AppTabItem<OverviewTab>;

export function parseOverviewTab(
  raw: string | null | undefined
): OverviewTab {
  if (raw === "overview" || raw === "list" || raw === "breakdown") {
    return raw;
  }
  return "overview";
}

export function OverviewTabNav({
  items,
  active,
  onChange,
  className,
  accent = "primary",
}: {
  items: OverviewTabItem[];
  active: OverviewTab;
  onChange: (tab: OverviewTab) => void;
  className?: string;
  accent?: "primary" | "teal" | "green" | "slate";
}) {
  return (
    <AppTabNav
      items={items}
      active={active}
      onChange={onChange}
      className={className}
      accent={accent}
    />
  );
}
