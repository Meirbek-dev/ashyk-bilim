export interface RetryBackoffOptions {
  baseDelayMs: number;
  maxDelayMs?: number;
  jitterRatio?: number;
}

export function calculateExponentialBackoffDelay(
  attemptIndex: number,
  { baseDelayMs, maxDelayMs = Number.POSITIVE_INFINITY, jitterRatio = 0.5 }: RetryBackoffOptions,
): number {
  const exponentDelay = Math.min(baseDelayMs * 2 ** attemptIndex, maxDelayMs);
  if (jitterRatio <= 0) return exponentDelay;

  const minMultiplier = Math.max(0, 1 - jitterRatio);
  const maxMultiplier = 1 + jitterRatio;
  const multiplier = minMultiplier + Math.random() * (maxMultiplier - minMultiplier);

  return Math.floor(exponentDelay * multiplier);
}
