import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLlmPool, createLogger, createStubGemini, loadConfig, hashPrompt } from '@buddy/shared';
import { buildDoc } from '../../src/index.js';
import { makeTinyPdf } from '../fixtures/make-tiny-pdf.js';
import { detectTocPrompt } from '../../src/prompts/detect-toc.js';
import { detectPageNumbersPrompt } from '../../src/prompts/detect-page-numbers.js';
import { noTocHeadingsPrompt } from '../../src/prompts/no-toc-headings.js';
import { tagPages } from '../../src/page-tag.js';
import type { RawPage } from '../../src/types.js';
import type { DocOutput, TreeNode } from '@buddy/shared';

/** Strip non-deterministic IDs so snapshots are stable across runs. */
function stableOutput(out: DocOutput): unknown {
  function stableNode(n: TreeNode): unknown {
    return {
      title: n.title,
      start_index: n.start_index,
      end_index: n.end_index,
      summary: n.summary,
      images: n.images,
      tables: n.tables,
      nodes: n.nodes.map(stableNode),
    };
  }
  return {
    doc_name: out.doc_name,
    doc_description: out.doc_description,
    structure: out.structure.map(stableNode),
  };
}

// 4-page PDF with TOC but no page numbers in the TOC.
// Pipeline: detectToc=yes for page 2 → extractTocContent → detectPageNumbers=no
// → falls back to processNoToc (spec §4.2 + orchestrator code confirms this)
// Exact MuPDF-extracted page texts (verified via extract-text helper)
const PAGE_TEXTS = {
  cover: 'Annual Report 2023',
  toc: '1. Intro: 1\n2. Body: 2',
  intro: 'Intro\nThis is the intro section.',
  body: 'Body\nDetailed analysis content.',
};

const pages: RawPage[] = [
  { pageNumber: 1, text: PAGE_TEXTS.cover, tokenCount: 10 },
  { pageNumber: 2, text: PAGE_TEXTS.toc, tokenCount: 10 },
  { pageNumber: 3, text: PAGE_TEXTS.intro, tokenCount: 10 },
  { pageNumber: 4, text: PAGE_TEXTS.body, tokenCount: 10 },
];

function buildStubs(): Map<string, { text: string }> {
  const stubs = new Map<string, { text: string }>();

  // Step 02: detectToc — page 2 returns yes, others no
  stubs.set(hashPrompt([detectTocPrompt(PAGE_TEXTS.cover)]), { text: '{"toc_detected":"no"}' });
  stubs.set(hashPrompt([detectTocPrompt(PAGE_TEXTS.toc)]), { text: '{"toc_detected":"yes"}' });
  stubs.set(hashPrompt([detectTocPrompt(PAGE_TEXTS.intro)]), { text: '{"toc_detected":"no"}' });
  stubs.set(hashPrompt([detectTocPrompt(PAGE_TEXTS.body)]), { text: '{"toc_detected":"no"}' });

  // Step 04: detectPageNumbers — returns 'no'
  stubs.set(hashPrompt([detectPageNumbersPrompt(PAGE_TEXTS.toc)]), {
    text: '{"page_index_given_in_toc":"no"}',
  });

  // Fallback: processNoToc with all 4 pages (HIERARCHICAL_PROCESSING=false → noTocHeadings)
  const tagged = tagPages(pages);
  stubs.set(hashPrompt([noTocHeadingsPrompt(tagged)]), {
    text: JSON.stringify([
      { structure: '1', title: 'Intro', physical_index: '<physical_index_3>' },
      { structure: '2', title: 'Body', physical_index: '<physical_index_4>' },
    ]),
  });

  return stubs;
}

let dataDir: string;
let pdfPath: string;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-tocnopn-'));
  const pdf = await makeTinyPdf([
    PAGE_TEXTS.cover,
    PAGE_TEXTS.toc,
    PAGE_TEXTS.intro,
    PAGE_TEXTS.body,
  ]);
  pdfPath = path.join(dataDir, 'doc.pdf');
  await fs.writeFile(pdfPath, pdf);
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe('golden: TOC without page numbers', () => {
  it('falls back to no-toc path and produces a valid DocOutput tree', async () => {
    const cfg = loadConfig({
      GEMINI_API_KEY: 'stub',
      DATA_DIR: dataDir,
      ADD_SUMMARIES: 'false',
      HIERARCHICAL_PROCESSING: 'false',
      IMAGES_ENABLED: 'false',
      TABLES_ENABLED: 'false',
      MAX_CONCURRENT_LLM: '4',
      MAX_PAGES_PER_NODE: '100',
      MAX_RETRIES: '1',
    });

    const stubs = buildStubs();
    const gemini = createStubGemini({ responses: stubs });
    const pool = createLlmPool(4);
    const logger = createLogger({ level: 'silent' });

    const out = await buildDoc({ cfg, topic: 'test', pdfPath, gemini, pool, logger });

    expect(out.structure.length).toBeGreaterThan(0);
    expect(out.doc_name).toBe('doc.pdf');
    const titles = out.structure.map(n => n.title);
    expect(titles).toContain('Intro');
    expect(titles).toContain('Body');

    expect(stableOutput(out)).toMatchSnapshot();
  });
});
