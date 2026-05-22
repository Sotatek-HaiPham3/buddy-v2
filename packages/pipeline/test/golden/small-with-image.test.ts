import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLlmPool, createLogger, createStubGemini, loadConfig, hashPrompt } from '@buddy/shared';
import { buildDoc } from '../../src/index.js';
import { pdfWithEmbeddedImage } from '../fixtures/pdfs.js';
import { detectTocPrompt } from '../../src/prompts/detect-toc.js';
import { noTocHeadingsPrompt } from '../../src/prompts/no-toc-headings.js';
import { tagPages } from '../../src/page-tag.js';
import { extractPages } from '../../src/steps/01-extract.js';
import type { ContentPart } from '@buddy/shared';

let dataDir: string;
let pdfPath: string;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-img-'));
  const pdfBuf = await pdfWithEmbeddedImage();
  pdfPath = path.join(dataDir, 'doc.pdf');
  await fs.writeFile(pdfPath, pdfBuf);
});
afterEach(async () => { await fs.rm(dataDir, { recursive: true, force: true }); });

describe('golden: small PDF with embedded image', () => {
  it('produces DocOutput with image attached to deepest node', async () => {
    const pages = await extractPages(pdfPath);
    const tagged = tagPages(pages, 'annotatedText');

    const stubs = new Map<string, { text: string }>();

    for (const p of pages) {
      stubs.set(hashPrompt([detectTocPrompt(p.text)]), { text: '{"toc_detected":"no"}' });
    }

    stubs.set(hashPrompt([noTocHeadingsPrompt(tagged)]), {
      text: '[{"structure":"1","title":"Content","physical_index":"<physical_index_1>"}]',
    });

    // Build a gemini stub that handles inlineData calls with a fallback
    const baseGemini = createStubGemini({ responses: stubs });
    const stubWithFallback = {
      ...baseGemini,
      generate: async (parts: ContentPart[], opts?: unknown) => {
        const key = hashPrompt(parts);
        if (stubs.has(key)) return stubs.get(key)!;
        // Fallback: if it's a describe-image call (has inlineData), return caption
        const hasInlineData = parts.some((p) => typeof p !== 'string' && 'inlineData' in p);
        if (hasInlineData) return { text: 'red square image' };
        throw new Error(`No stub for hash ${key.slice(0, 12)}`);
      },
      generateStream: baseGemini.generateStream,
      calls: baseGemini.calls,
    };

    const cfg = loadConfig({
      GEMINI_API_KEY: 'stub',
      DATA_DIR: dataDir,
      ADD_SUMMARIES: 'false',
      HIERARCHICAL_PROCESSING: 'false',
      IMAGES_ENABLED: 'true',
      TABLES_ENABLED: 'false',
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
    const nodesWithImages = allNodes.filter((n) => n.images.length > 0);
    expect(nodesWithImages.length).toBeGreaterThan(0);
    expect(nodesWithImages[0]!.images[0]!.caption).toBe('red square image');
  });
});

function flattenNodes(
  nodes: { images: unknown[]; tables: unknown[]; nodes: any[] }[],
): typeof nodes {
  const out: typeof nodes = [];
  for (const n of nodes) { out.push(n); out.push(...flattenNodes(n.nodes)); }
  return out;
}
