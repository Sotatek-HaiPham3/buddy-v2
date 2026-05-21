import fs from 'node:fs/promises';
import { LRUCache } from 'lru-cache';
import { openPdf, type PdfDoc } from '@buddy/shared';

export function createPdfCache(max = 4) {
  const cache = new LRUCache<string, PdfDoc>({ max });
  return {
    async load(filePath: string): Promise<PdfDoc> {
      const cached = cache.get(filePath);
      if (cached) return cached;
      const doc = openPdf(await fs.readFile(filePath));
      cache.set(filePath, doc);
      return doc;
    },
    clear(): void {
      cache.clear();
    },
  };
}
