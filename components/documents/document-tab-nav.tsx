"use client";

import { AppTabNav, type AppTabItem } from "@/components/layout/app-tab-nav";

export type DocumentDetailTab = "overview" | "extracts" | "files" | "more";

export type DocumentTabItem = AppTabItem<DocumentDetailTab>;

export function parseDocumentDetailTab(
  raw: string | null | undefined
): DocumentDetailTab {
  if (
    raw === "overview" ||
    raw === "extracts" ||
    raw === "files" ||
    raw === "more"
  ) {
    return raw;
  }
  return "overview";
}

export function DocumentTabNav({
  items,
  active,
  onChange,
  className,
}: {
  items: DocumentTabItem[];
  active: DocumentDetailTab;
  onChange: (tab: DocumentDetailTab) => void;
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
