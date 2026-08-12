/**
 * Soft tint surfaces that stay readable in dim dark mode.
 * Light: pastel fill. Dark: low-opacity hue on card canvas (no washed pastels).
 */

export const softTint = {
  teal: {
    card: "border-teal-200/70 bg-teal-50/60 dark:border-teal-400/25 dark:bg-teal-500/12",
    chip: "border-teal-200/90 bg-teal-50 text-teal-950 dark:border-teal-400/30 dark:bg-teal-500/15 dark:text-teal-100",
    well: "bg-teal-100/80 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200",
    soft: "bg-teal-50/70 hover:bg-teal-100/70 dark:bg-teal-500/10 dark:hover:bg-teal-500/16",
    text: "text-teal-800 dark:text-teal-200",
  },
  rose: {
    card: "border-rose-200/70 bg-rose-50/60 dark:border-rose-400/25 dark:bg-rose-500/12",
    chip: "border-rose-200/90 bg-rose-50 text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-100",
    well: "bg-rose-100/80 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200",
    soft: "bg-rose-50/70 hover:bg-rose-100/70 dark:bg-rose-500/10 dark:hover:bg-rose-500/16",
    text: "text-rose-800 dark:text-rose-200",
  },
  amber: {
    card: "border-amber-200/70 bg-amber-50/60 dark:border-amber-400/25 dark:bg-amber-500/12",
    chip: "border-amber-200/90 bg-amber-50 text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100",
    well: "bg-amber-100/80 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    soft: "bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-500/10 dark:hover:bg-amber-500/16",
    text: "text-amber-800 dark:text-amber-200",
  },
  sky: {
    card: "border-sky-200/70 bg-sky-50/60 dark:border-sky-400/25 dark:bg-sky-500/12",
    chip: "border-sky-200/90 bg-sky-50 text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-100",
    well: "bg-sky-100/80 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
    soft: "bg-sky-50/70 hover:bg-sky-100/70 dark:bg-sky-500/10 dark:hover:bg-sky-500/16",
    text: "text-sky-800 dark:text-sky-200",
  },
  orange: {
    card: "border-orange-200/70 bg-orange-50/60 dark:border-orange-400/25 dark:bg-orange-500/12",
    chip: "border-orange-200/90 bg-orange-50 text-orange-950 dark:border-orange-400/30 dark:bg-orange-500/15 dark:text-orange-100",
    well: "bg-orange-100/80 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200",
    soft: "bg-orange-50/70 hover:bg-orange-100/70 dark:bg-orange-500/10 dark:hover:bg-orange-500/16",
    text: "text-orange-900 dark:text-orange-200",
  },
  emerald: {
    card: "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-400/25 dark:bg-emerald-500/12",
    chip: "border-emerald-200/90 bg-emerald-50 text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-100",
    well: "bg-emerald-100/80 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
    soft: "bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/16",
    text: "text-emerald-800 dark:text-emerald-200",
  },
  violet: {
    card: "border-violet-200/70 bg-violet-50/60 dark:border-violet-400/25 dark:bg-violet-500/12",
    chip: "border-violet-200/90 bg-violet-50 text-violet-950 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-100",
    well: "bg-violet-100/80 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200",
    soft: "bg-violet-50/70 hover:bg-violet-100/70 dark:bg-violet-500/10 dark:hover:bg-violet-500/16",
    text: "text-violet-800 dark:text-violet-200",
  },
  cyan: {
    card: "border-cyan-200/70 bg-cyan-50/60 dark:border-cyan-400/25 dark:bg-cyan-500/12",
    chip: "border-cyan-200/90 bg-cyan-50 text-cyan-950 dark:border-cyan-400/30 dark:bg-cyan-500/15 dark:text-cyan-100",
    well: "bg-cyan-100/80 text-cyan-900 dark:bg-cyan-500/20 dark:text-cyan-200",
    soft: "bg-cyan-50/70 hover:bg-cyan-100/70 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/16",
    text: "text-cyan-800 dark:text-cyan-200",
  },
  red: {
    card: "border-red-200/70 bg-red-50/60 dark:border-red-400/25 dark:bg-red-500/12",
    chip: "border-red-200/90 bg-red-50 text-red-950 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-100",
    well: "bg-red-100/80 text-red-900 dark:bg-red-500/20 dark:text-red-200",
    soft: "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-500/10 dark:hover:bg-red-500/16",
    text: "text-red-800 dark:text-red-200",
  },
  slate: {
    card: "border-slate-200/70 bg-slate-50/60 dark:border-slate-400/25 dark:bg-slate-500/12",
    chip: "border-slate-200/90 bg-slate-50 text-slate-900 dark:border-slate-400/30 dark:bg-slate-500/15 dark:text-slate-100",
    well: "bg-slate-100 text-slate-900 dark:bg-slate-500/20 dark:text-slate-200",
    soft: "bg-slate-50/70 hover:bg-slate-100/70 dark:bg-slate-500/10 dark:hover:bg-slate-500/16",
    text: "text-slate-800 dark:text-slate-200",
  },
  stone: {
    card: "border-stone-200/70 bg-stone-50/60 dark:border-stone-400/25 dark:bg-stone-500/12",
    chip: "border-stone-200/90 bg-stone-100 text-stone-700 dark:border-stone-400/30 dark:bg-stone-500/15 dark:text-stone-200",
    well: "bg-stone-100 text-stone-700 dark:bg-stone-500/20 dark:text-stone-200",
    soft: "bg-stone-50/70 hover:bg-stone-100/70 dark:bg-stone-500/10 dark:hover:bg-stone-500/16",
    text: "text-stone-700 dark:text-stone-300",
  },
} as const;

export type SoftTint = keyof typeof softTint;

/** Mail analysis / triage status chips */
export function mailAnalysisChipClass(
  chip:
    | "suggestion"
    | "applied"
    | "dismissed"
    | "skipped"
    | "error"
    | "pending"
    | "none"
    | string
): string {
  if (chip === "suggestion") {
    return `${softTint.amber.well} border border-amber-200 dark:border-amber-400/30`;
  }
  if (chip === "applied") {
    return `${softTint.emerald.well} border border-emerald-200 dark:border-emerald-400/30`;
  }
  if (chip === "dismissed") {
    return "bg-muted text-muted-foreground";
  }
  if (chip === "skipped") {
    return `${softTint.stone.chip}`;
  }
  if (chip === "error") {
    return `${softTint.rose.well} border border-rose-200 dark:border-rose-400/30`;
  }
  if (chip === "pending") {
    return "bg-muted/80 text-muted-foreground border border-border/70";
  }
  if (chip === "none") {
    return softTint.slate.chip;
  }
  return softTint.sky.chip;
}
