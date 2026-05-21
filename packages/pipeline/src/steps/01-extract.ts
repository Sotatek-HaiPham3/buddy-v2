import fs from 'node:fs/promises';
import { getPageCount, getPageText, openPdf } from '@buddy/shared';
import { countTokens } from '../tokens.js';
import type { RawPage } from '../types.js';

export async function extractPages(pdfPath: string): Promise<RawPage[]> {
  const buf = await fs.readFile(pdfPath);
  const doc = openPdf(buf);
  const n = getPageCount(doc);
  const pages: RawPage[] = [];
  for (let i = 0; i < n; i++) {
    const text = getPageText(doc, i);
    pages.push({ pageNumber: i + 1, text, tokenCount: countTokens(text) });
  }
  return pages;
}
