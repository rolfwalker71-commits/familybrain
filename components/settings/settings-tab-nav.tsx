"use client";

import { AppTabNav, type AppTabItem } from "@/components/layout/app-tab-nav";

export type SettingsTab =
  | "chat"
  | "paperless"
  | "travel"
  | "mail"
  | "more";

export type SettingsTabItem = AppTabItem<SettingsTab>;

export function parseSettingsTab(
  raw: string | null | undefined
): SettingsTab {
  if (
    raw === "chat" ||
    raw === "paperless" ||
    raw === "travel" ||
    raw === "mail" ||
    raw === "more"
  ) {
    return raw;
  }
  return "chat";
}

export function SettingsTabNav({
  items,
  active,
  onChange,
  className,
}: {
  items: SettingsTabItem[];
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
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
