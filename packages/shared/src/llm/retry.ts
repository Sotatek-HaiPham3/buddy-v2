const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']);

export function isRetryable(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (typeof err !== 'object') return false;
  const e = err as { status?: number; code?: string };
  if (typeof e.status === 'number') return RETRYABLE_STATUSES.has(e.status);
  if (typeof e.code === 'string') return RETRYABLE_CODES.has(e.code);
  return false;
}

export interface RetryOpts {
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (err: unknown, attempt: number) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) throw err;
      opts.onRetry?.(err, attempt + 1);
      const delay = baseDelay * 2 ** attempt + Math.random() * baseDelay;
      await sleep(delay);
    }
  }
  throw lastErr;
}
