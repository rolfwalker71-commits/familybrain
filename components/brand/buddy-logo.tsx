import { BRAND } from "@/lib/branding";
import { cn } from "@/lib/utils";

/**
 * Dual-mode Buddy mark: 3 staggered rounded cards.
 * Front = --brand-mark-front (orange); rear = --brand-mark;
 * gaps punch through via --brand-mark-gap (defaults to --sidebar).
 */
export function BuddyLogo({
  size = 48,
  className,
  priority: _priority = false,
}: {
  size?: number;
  className?: string;
  /** Kept for call-site compatibility (SVG has no load priority). */
  priority?: boolean;
}) {
  void _priority;
  const gap = "var(--brand-mark-gap, var(--sidebar))";
  const mark = "var(--brand-mark)";
  const front = "var(--brand-mark-front, #e86a2b)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={BRAND.app}
      className={cn("select-none", className)}
    >
      <title>{BRAND.app}</title>
      {/* Back slab */}
      <rect x="24" y="4" width="30" height="46" rx="6.5" fill={mark} />
      {/* Knockout behind middle */}
      <rect x="14" y="11" width="30" height="46" rx="6.5" fill={gap} />
      {/* Middle slab */}
      <rect x="16" y="13" width="30" height="46" rx="6.5" fill={mark} />
      {/* Knockout behind front */}
      <rect x="4" y="20" width="30" height="40" rx="6.5" fill={gap} />
      {/* Front slab (brand orange) */}
      <rect x="6" y="22" width="30" height="38" rx="6.5" fill={front} />
    </svg>
  );
}
