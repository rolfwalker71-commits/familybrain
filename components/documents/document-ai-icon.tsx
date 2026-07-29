"use client";

import { AiImagePreview } from "@/components/layout/ai-image-preview";
import {
  IconCircle,
  knowledgeVisual,
} from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md";

const SIZE: Record<
  Size,
  { image: string; circle: "sm" | "md" | "lg"; wrap: string }
> = {
  xs: {
    image: "h-8 w-8 object-cover",
    circle: "sm",
    wrap: "size-8",
  },
  sm: {
    image: "h-10 w-10 object-cover",
    circle: "sm",
    wrap: "size-10",
  },
  md: {
    image: "h-11 w-11 object-cover sm:h-12 sm:w-12",
    circle: "lg",
    wrap: "size-11 sm:size-12",
  },
};

/**
 * Shared document visual: generated AI icon, or category/fallback circle
 * (same idea as on the documents list).
 */
export function DocumentAiIcon({
  aiIconUrl,
  category,
  size = "sm",
  className,
  onOpen,
}: {
  aiIconUrl?: string | null;
  category?: string | null;
  size?: Size;
  className?: string;
  onOpen?: (url: string) => void;
}) {
  const dim = SIZE[size];
  if (aiIconUrl) {
    return (
      <span className={cn("relative shrink-0", dim.wrap, className)}>
        <AiImagePreview
          src={aiIconUrl}
          brand="docs"
          alt=""
          imageClassName={dim.image}
          onOpen={() => onOpen?.(aiIconUrl)}
        />
      </span>
    );
  }
  const visual = knowledgeVisual(category || "Sonstiges");
  return (
    <IconCircle
      icon={visual.icon}
      tone="teal"
      size={dim.circle}
      className={cn("shrink-0 rounded-xl", className)}
    />
  );
}
