export type ChatSourceKey = "paperless" | "trilium" | "guides";

export type ChatSourceSelection = Record<ChatSourceKey, boolean>;

export const DEFAULT_CHAT_SOURCES: ChatSourceSelection = {
  paperless: true,
  trilium: true,
  guides: true,
};

export function normalizeChatSources(
  input?: Partial<ChatSourceSelection> | null
): ChatSourceSelection {
  const next: ChatSourceSelection = { ...DEFAULT_CHAT_SOURCES, ...(input || {}) };
  // At least one source must stay on — otherwise fall back to all.
  if (!next.paperless && !next.trilium && !next.guides) {
    return { ...DEFAULT_CHAT_SOURCES };
  }
  return next;
}

export function describeChatSources(sources: ChatSourceSelection): string {
  const labels: string[] = [];
  if (sources.paperless) labels.push("Paperless");
  if (sources.trilium) labels.push("Trilium");
  if (sources.guides) labels.push("Guides");
  return labels.join(", ");
}
