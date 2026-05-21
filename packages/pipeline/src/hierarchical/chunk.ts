import type { RawPage } from '../types.js';

export interface Chunk { pages: RawPage[]; }

export function chunkPages(pages: RawPage[], tokenBudget: number): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < pages.length) {
    let tokens = 0;
    const buf: RawPage[] = [];
    let j = i;
    while (j < pages.length && (tokens === 0 || tokens + (pages[j]?.tokenCount ?? 0) <= tokenBudget)) {
      buf.push(pages[j]!);
      tokens += pages[j]?.tokenCount ?? 0;
      j++;
    }
    chunks.push({ pages: buf });
    if (j >= pages.length) break;
    i = j - 1; // 1-page overlap
  }
  return chunks;
}
