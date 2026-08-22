import { BRAND, BRAND_LOGO_DARK_SRC, BRAND_LOGO_SRC } from "@/lib/branding";
import { cn } from "@/lib/utils";

/**
 * Buddy B-Monogramm (freigestellt).
 * Light: navy + orange. Dark: helles Grau + orange — lesbar auf der dunklen Sidebar.
 */
export function BuddyLogo({
  size = 48,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND_LOGO_SRC}
        width={size}
        height={size}
        alt={BRAND.app}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        className="size-full object-contain dark:hidden"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND_LOGO_DARK_SRC}
        width={size}
        height={size}
        alt=""
        aria-hidden
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        className="hidden size-full object-contain dark:block"
        draggable={false}
      />
    </span>
  );
}
