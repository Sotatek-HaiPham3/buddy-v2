import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLlmPool, createLogger, createStubGemini, loadConfig, hashPrompt } from '@buddy/shared';
import { buildDoc } from '../../src/index.js';
import { pdfWithTable } from '../fixtures/pdfs.js';
import { detectTocPrompt } from '../../src/prompts/detect-toc.js';
import { noTocHeadingsPrompt } from '../../src/prompts/no-toc-headings.js';
import { tagPages } from '../../src/page-tag.js';
import { extractPages } from '../../src/steps/01-extract.js';
import type { ContentPart } from '@buddy/shared';

let dataDir: string;
let pdfPath: string;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-tbl-'));
  const buf = await pdfWithTable();
  pdfPath = path.join(dataDir, 'doc.pdf');
  await fs.writeFile(pdfPath, buf);
});
afterEach(async () => { await fs.rm(dataDir, { recursive: true, force: true }); });

describe('golden: small PDF with table', () => {
  it('produces DocOutput with table attached to deepest node', async () => {
    const pages = await extractPages(pdfPath);
    const tagged = tagPages(pages);

    const stubs = new Map<string, { text: string }>();
    for (const p of pages) {
      stubs.set(hashPrompt([detectTocPrompt(p.text)]), { text: '{"toc_detected":"no"}' });
    }
    stubs.set(hashPrompt([noTocHeadingsPrompt(tagged)]), {
      text: '[{"structure":"1","title":"Products","physical_index":"<physical_index_1>"}]',
    });

    const baseGemini = createStubGemini({ responses: stubs });
    const stubWithFallback = {
      ...baseGemini,
      generate: async (parts: ContentPart[], opts?: unknown) => {
        const key = hashPrompt(parts);
        if (stubs.has(key)) return stubs.get(key)!;
        // Fallback for normalizeTable calls — return structured table
        return {
          text: JSON.stringify({
            headers: ['Product', 'Price', 'Stock'],
            rows: [['Widget A', '$10', '100'], ['Widget B', '$15', '50']],
            columnTypes: ['string', 'number', 'number'],
            schemaDescriptor: 'Product inventory table',
          }),
        };
      },
      generateStream: baseGemini.generateStream,
      calls: baseGemini.calls,
    };

    const cfg = loadConfig({
      GEMINI_API_KEY: 'stub',
      DATA_DIR: dataDir,
      ADD_SUMMARIES: 'false',
      HIERARCHICAL_PROCESSING: 'false',
      IMAGES_ENABLED: 'false',
      TABLES_ENABLED: 'true',
      MAX_CONCURRENT_LLM: '4',
      MAX_PAGES_PER_NODE: '100',
      MAX_RETRIES: '1',
    });

    const pool = createLlmPool(4);
    const logger = createLogger({ level: 'silent' });
    const out = await buildDoc({
      cfg, topic: 'test', pdfPath,
      gemini: stubWithFallback as any,
      pool, logger,
    });

    expect(out.structure.length).toBeGreaterThan(0);
    const allNodes = flattenNodes(out.structure);
    const nodesWithTables = allNodes.filter((n) => n.tables.length > 0);
    expect(nodesWithTables.length).toBeGreaterThan(0);
    expect(nodesWithTables[0]!.tables[0]!.schema).toBe('Product inventory table');
  });
});

function flattenNodes(
  nodes: { images: unknown[]; tables: unknown[]; nodes: any[] }[],
): typeof nodes {
  const out: typeof nodes = [];
  for (const n of nodes) { out.push(n); out.push(...flattenNodes(n.nodes)); }
  return out;
}
