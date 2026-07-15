import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  label,
  detail,
  className,
}: {
  value: number;
  label?: string;
  detail?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("space-y-2", className)}>
      {(label || detail) && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-foreground">{label}</span>
          <span className="tabular-nums text-muted-foreground">
            {detail ?? `${clamped}%`}
          </span>
        </div>
      )}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
