"use client";

import {
  AppTabNav,
  type AppTabItem,
  type AppTabOverflowItem,
} from "@/components/layout/app-tab-nav";

export type TripDetailTab =
  | "ablauf"
  | "finanzen"
  | "reisende"
  | "dokumente"
  | "neu"
  | "mehr";

export type TripTabItem = AppTabItem<TripDetailTab>;

export function parseTripDetailTab(
  raw: string | null | undefined
): TripDetailTab {
  // Legacy URL aliases
  if (raw === "belege") return "dokumente";
  if (
    raw === "neu" ||
    raw === "mehr" ||
    raw === "ablauf" ||
    raw === "finanzen" ||
    raw === "reisende" ||
    raw === "dokumente"
  ) {
    return raw;
  }
  return "ablauf";
}

export function TripTabNav({
  items,
  active,
  onChange,
  className,
  overflowItems,
}: {
  items: TripTabItem[];
  active: TripDetailTab;
  onChange: (tab: TripDetailTab) => void;
  className?: string;
  overflowItems?: AppTabOverflowItem[];
}) {
  return (
    <AppTabNav
      items={items}
      active={active}
      onChange={onChange}
      className={className}
      accent="sky"
      overflowItems={overflowItems}
    />
  );
}
