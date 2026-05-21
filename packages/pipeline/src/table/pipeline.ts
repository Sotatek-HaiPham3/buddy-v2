import type { PdfDoc, GeminiClient, LlmPool } from '@buddy/shared';
import { getPageCount } from '@buddy/shared';
import { detectTables } from './detect.js';
import { normalizeTable } from './normalize.js';
import { saveTable } from './save.js';
import type { SavedTable } from './types.js';
import type { RawPage } from '../types.js';

export interface RunTableOpts {
  doc: PdfDoc;
  pages: RawPage[];
  dir: string;
  gemini: GeminiClient;
  pool: LlmPool;
}

export async function runTablePipeline(opts: RunTableOpts): Promise<SavedTable[]> {
  const total = getPageCount(opts.doc);
  const tasks: Promise<SavedTable | null>[] = [];

  for (const p of opts.pages) {
    if (p.pageNumber < 1 || p.pageNumber > total) continue;
    const detected = detectTables(opts.doc, p.pageNumber);
    detected.forEach((d, idx) => {
      tasks.push(opts.pool(async () => {
        try {
          const normalized = await normalizeTable({ gemini: opts.gemini, rawCells: d.rawCells });
          return await saveTable({ dir: opts.dir, page: p.pageNumber, idx, detected: d, normalized });
        } catch {
          return null;
        }
      }));
    });
  }

  const settled = await Promise.all(tasks);
  return settled.filter((t): t is SavedTable => t !== null);
}
