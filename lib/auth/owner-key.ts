import type { AuthContext } from "@/lib/auth/current-user";

export function ownerKeyFromAuth(auth: AuthContext): string {
  if (auth.userId != null && Number.isInteger(auth.userId) && auth.userId > 0) {
    return `user:${auth.userId}`;
  }
  return "admin";
}

export function parseOwnerKey(
  ownerKey: string
): { kind: "admin" } | { kind: "user"; userId: number } | null {
  if (ownerKey === "admin") return { kind: "admin" };
  const m = /^user:(\d+)$/.exec(ownerKey);
  if (!m) return null;
  const userId = Number(m[1]);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return { kind: "user", userId };
}
