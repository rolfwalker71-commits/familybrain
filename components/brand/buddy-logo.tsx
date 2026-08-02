"use client";

import Image from "next/image";
import { BRAND, BRAND_LOGO_SRC } from "@/lib/branding";
import { cn } from "@/lib/utils";

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
    <Image
      src={BRAND_LOGO_SRC}
      alt={BRAND.app}
      width={size}
      height={size}
      priority={priority}
      className={cn("select-none object-contain", className)}
    />
  );
}
