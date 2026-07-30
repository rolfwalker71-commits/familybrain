"use client";

import { UserAvatar } from "@/components/users/user-avatar";
import { UNKNOWN_RECIPIENT_LABEL } from "@/lib/family/constants";
import { cn } from "@/lib/utils";

export type RecipientAvatarMember = {
  id: number;
  display_name: string;
  avatar_url: string | null;
};

export type RecipientAvatarInfo = {
  status?: "matched" | "unknown" | null;
  label?: string | null;
  members?: RecipientAvatarMember[];
};

export function RecipientAvatars({
  recipients,
  size = "xs",
  className,
  showLabel = true,
}: {
  recipients?: RecipientAvatarInfo | null;
  size?: "xs" | "sm";
  className?: string;
  showLabel?: boolean;
}) {
  if (!recipients) return null;
  const members = recipients.members || [];
  const label =
    recipients.label ||
    (recipients.status === "unknown" ? UNKNOWN_RECIPIENT_LABEL : null);
  if (!label && members.length === 0) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap",
        className
      )}
      title={label || undefined}
    >
      {members.slice(0, 3).map((m) => (
        <UserAvatar
          key={m.id}
          name={m.display_name}
          src={m.avatar_url}
          size={size}
        />
      ))}
      {showLabel && label ? (
        <span className="text-muted-foreground">{label}</span>
      ) : null}
    </span>
  );
}
