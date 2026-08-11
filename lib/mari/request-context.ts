import { AsyncLocalStorage } from "node:async_hooks";

type MariRequestStore = {
  /** Buddy user id for per-user MARI credentials; null = global admin settings. */
  userId: number | null;
};

const mariRequestAls = new AsyncLocalStorage<MariRequestStore>();

/** Bind MARI credential resolution for the rest of this request. */
export function enterMariRequestUser(userId: number | null): void {
  mariRequestAls.enterWith({ userId });
}

export function getMariRequestUserId(): number | null {
  return mariRequestAls.getStore()?.userId ?? null;
}
