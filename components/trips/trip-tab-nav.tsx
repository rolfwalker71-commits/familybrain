"use client";

import { AppTabNav, type AppTabItem } from "@/components/layout/app-tab-nav";

export type TripDetailTab = "ablauf" | "neu" | "belege" | "mehr";

export type TripTabItem = AppTabItem<TripDetailTab>;

export function parseTripDetailTab(
  raw: string | null | undefined
): TripDetailTab {
  if (raw === "neu" || raw === "belege" || raw === "mehr" || raw === "ablauf") {
    return raw;
  }
  return "ablauf";
}

export function TripTabNav({
  items,
  active,
  onChange,
  className,
}: {
  items: TripTabItem[];
  active: TripDetailTab;
  onChange: (tab: TripDetailTab) => void;
  className?: string;
}) {
  return (
    <AppTabNav
      items={items}
      active={active}
      onChange={onChange}
      className={className}
      accent="green"
    />
  );
}
