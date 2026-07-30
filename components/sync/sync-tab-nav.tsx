"use client";

import { AppTabNav, type AppTabItem } from "@/components/layout/app-tab-nav";

export type SyncTab = "status" | "automation" | "analyse" | "duplicates" | "log";

export type SyncTabItem = AppTabItem<SyncTab>;

export function parseSyncTab(raw: string | null | undefined): SyncTab {
  if (
    raw === "status" ||
    raw === "automation" ||
    raw === "analyse" ||
    raw === "duplicates" ||
    raw === "log"
  ) {
    return raw;
  }
  return "status";
}

export function SyncTabNav({
  items,
  active,
  onChange,
  className,
}: {
  items: SyncTabItem[];
  active: SyncTab;
  onChange: (tab: SyncTab) => void;
  className?: string;
}) {
  return (
    <AppTabNav
      items={items}
      active={active}
      onChange={onChange}
      className={className}
      accent="teal"
    />
  );
}
