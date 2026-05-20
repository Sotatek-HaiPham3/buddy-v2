import pLimit from 'p-limit';

export type LlmPool = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLlmPool(concurrency: number): LlmPool {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`);
  }
  const limit = pLimit(concurrency);
  return <T>(fn: () => Promise<T>) => limit(fn);
}
