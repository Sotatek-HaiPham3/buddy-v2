import { describe, expect, it } from 'vitest';
import { createLlmPool } from '../../src/llm/pool.js';

describe('createLlmPool', () => {
  it('caps concurrency to N', async () => {
    const pool = createLlmPool(2);
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;

    const task = (id: string) =>
      pool(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 10));
        order.push(id);
        running--;
        return id;
      });

    const results = await Promise.all([task('a'), task('b'), task('c'), task('d')]);
    expect(results).toEqual(['a', 'b', 'c', 'd']);
    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(order).toHaveLength(4);
  });

  it('throws if concurrency < 1', () => {
    expect(() => createLlmPool(0)).toThrow();
  });
});
