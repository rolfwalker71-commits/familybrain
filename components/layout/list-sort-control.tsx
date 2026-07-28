"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type SortDir,
  readListSortDir,
  toggleSortDir,
  writeListSortDir,
} from "@/lib/utils/list-sort";

export function ListSortControl({
  storageKey,
  label,
  defaultDir = "desc",
  dir: controlledDir,
  onDirChange,
  className,
}: {
  /** sessionStorage key suffix, e.g. `documents` */
  storageKey: string;
  /** Field label shown on the button, e.g. "Dokumentdatum" */
  label: string;
  defaultDir?: SortDir;
  /** Optional controlled mode */
  dir?: SortDir;
  onDirChange?: (dir: SortDir) => void;
  className?: string;
}) {
  const [internalDir, setInternalDir] = useState<SortDir>(defaultDir);
  const dir = controlledDir ?? internalDir;

  useEffect(() => {
    if (controlledDir != null) return;
    setInternalDir(readListSortDir(storageKey, defaultDir));
  }, [storageKey, defaultDir, controlledDir]);

  function setDir(next: SortDir) {
    writeListSortDir(storageKey, next);
    if (controlledDir == null) setInternalDir(next);
    onDirChange?.(next);
  }

  const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
  const hint =
    dir === "asc" ? "Älteste / nächste zuerst" : "Neueste / späteste zuerst";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      title={`Sortierung umkehren (${hint})`}
      aria-label={`${label}: ${hint}. Sortierung umkehren`}
      onClick={() => setDir(toggleSortDir(dir))}
    >
      <span>{label}</span>
      <Arrow className="size-3.5 opacity-80" aria-hidden />
    </Button>
  );
}

/** Hook for lists that need the current sort dir in fetch/useMemo. */
export function useListSortDir(
  storageKey: string,
  defaultDir: SortDir = "desc"
): [SortDir, (dir: SortDir) => void] {
  const [dir, setDirState] = useState<SortDir>(defaultDir);

  useEffect(() => {
    setDirState(readListSortDir(storageKey, defaultDir));
  }, [storageKey, defaultDir]);

  function setDir(next: SortDir) {
    writeListSortDir(storageKey, next);
    setDirState(next);
  }

  return [dir, setDir];
}
