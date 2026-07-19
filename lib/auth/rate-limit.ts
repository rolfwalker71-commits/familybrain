type LoginAttempt = {
  failures: number[];
  blockedUntil: number | null;
};

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const globalKey = "__familybrain_login_attempts__";

function attempts(): Map<string, LoginAttempt> {
  const globalStore = globalThis as typeof globalThis & {
    [globalKey]?: Map<string, LoginAttempt>;
  };
  if (!globalStore[globalKey]) globalStore[globalKey] = new Map();
  return globalStore[globalKey]!;
}

export function loginRateLimitStatus(
  key: string,
  now = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  const record = attempts().get(key);
  if (!record) return { allowed: true, retryAfterSeconds: 0 };

  if (record.blockedUntil && record.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.blockedUntil - now) / 1000),
    };
  }

  record.failures = record.failures.filter((time) => now - time < WINDOW_MS);
  record.blockedUntil = null;
  if (record.failures.length === 0) attempts().delete(key);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const store = attempts();
  const record = store.get(key) ?? { failures: [], blockedUntil: null };
  record.failures = record.failures.filter((time) => now - time < WINDOW_MS);
  record.failures.push(now);
  if (record.failures.length >= MAX_FAILURES) {
    record.blockedUntil = now + BLOCK_MS;
  }
  store.set(key, record);
}

export function clearLoginFailures(key: string): void {
  attempts().delete(key);
}
