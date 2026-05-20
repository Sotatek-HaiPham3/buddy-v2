import { describe, expect, it, vi } from 'vitest';
import { isRetryable, withRetry } from '../../src/llm/retry.js';

describe('isRetryable', () => {
  it('returns true for status 429', () => {
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it('returns true for status 500', () => {
    expect(isRetryable({ status: 500 })).toBe(true);
  });

  it('returns true for status 503', () => {
    expect(isRetryable({ status: 503 })).toBe(true);
  });

  it('returns false for status 400', () => {
    expect(isRetryable({ status: 400 })).toBe(false);
  });

  it('returns true for network errors (no status)', () => {
    expect(isRetryable({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryable({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRetryable(null)).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable failure then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400, message: 'bad request' });
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toMatchObject({
      status: 400,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries attempts', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toMatchObject({
      status: 503,
    });
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
