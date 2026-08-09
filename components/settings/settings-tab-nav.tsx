"use client";

import { AppTabNav, type AppTabItem } from "@/components/layout/app-tab-nav";

export type SettingsTab =
  | "paperless"
  | "openai"
  | "calendars"
  | "mail"
  | "travel"
  | "notify"
  | "chat"
  | "users"
  | "family"
  | "maringo"
  | "more";

export type SettingsTabItem = AppTabItem<SettingsTab>;

export function parseSettingsTab(
  raw: string | null | undefined
): SettingsTab {
  if (
    raw === "paperless" ||
    raw === "openai" ||
    raw === "calendars" ||
    raw === "mail" ||
    raw === "travel" ||
    raw === "notify" ||
    raw === "chat" ||
    raw === "users" ||
    raw === "family" ||
    raw === "maringo" ||
    raw === "more"
  ) {
    return raw;
  }
  return "paperless";
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
