import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createLlmPool, openPdf } from '@buddy/shared';
import { runTablePipeline } from '../../src/table/pipeline.js';
import { pdfWithTable } from '../fixtures/pdfs.js';

describe('runTablePipeline', () => {
  it('detects, normalizes, saves; returns SavedTable[]', async () => {
    const alwaysNormalized = {
      generate: async () => ({ text: JSON.stringify({
        headers: ['Product', 'Price', 'Stock'],
        rows: [['Widget A', '$10', '100'], ['Widget B', '$15', '50']],
        columnTypes: ['string', 'number', 'number'],
        schemaDescriptor: 'Product inventory',
      }) }),
      generateStream: async function*() {},
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tblpipe-'));
    const out = await runTablePipeline({
      doc: openPdf(await pdfWithTable()),
      pages: [{ pageNumber: 1, text: 'x', tokenCount: 0 }],
      dir, gemini: alwaysNormalized as any, pool: createLlmPool(2),
    });
    expect(out).toHaveLength(1);
    expect(out[0].page).toBe(1);
    expect(out[0].schema).toBe('Product inventory');
    expect(out[0].headers).toEqual(['Product', 'Price', 'Stock']);
    const saved = JSON.parse(await fs.readFile(out[0].path, 'utf8'));
    expect(saved.headers).toEqual(['Product', 'Price', 'Stock']);
    expect(saved.rows).toHaveLength(2);
  });
});
