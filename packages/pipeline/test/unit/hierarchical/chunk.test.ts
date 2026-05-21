import { describe, expect, it } from 'vitest';
import { chunkPages } from '../../../src/hierarchical/chunk.js';
import type { RawPage } from '../../../src/types.js';

const p = (n: number, tokens: number): RawPage => ({ pageNumber: n, text: `p${n}`, tokenCount: tokens });

describe('chunkPages', () => {
  it('packs pages until tokenBudget hit', () => {
    const chunks = chunkPages([p(1, 3000), p(2, 3000), p(3, 3000), p(4, 3000)], 7000);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]?.pages[0]?.pageNumber).toBe(1);
  });
  it('1-page overlap between chunks', () => {
    const chunks = chunkPages([p(1, 6000), p(2, 6000), p(3, 6000)], 7000);
    const c0Last = chunks[0]?.pages.at(-1)?.pageNumber;
    const c1First = chunks[1]?.pages[0]?.pageNumber;
    expect(c1First).toBe(c0Last);
  });
});
