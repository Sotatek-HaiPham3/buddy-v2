import type { RawPage } from '../types.js';

export interface Chunk { pages: RawPage[]; }

export function chunkPages(pages: RawPage[], tokenBudget: number): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < pages.length) {
    const buf: RawPage[] = [];
    let tokens = 0;
    let j = i;
    // Always include at least 2 pages so overlap is possible (unless at end)
    const minJ = Math.min(i + 2, pages.length);
    while (j < pages.length && (j < minJ || tokens + (pages[j]?.tokenCount ?? 0) <= tokenBudget)) {
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
