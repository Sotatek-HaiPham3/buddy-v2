import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLlmPool, createLogger, createStubGemini, loadConfig, hashPrompt } from '@buddy/shared';
import { buildDoc } from '../../src/index.js';
import { makeTinyPdf } from '../fixtures/make-tiny-pdf.js';
import { detectTocPrompt } from '../../src/prompts/detect-toc.js';
import { detectPageNumbersPrompt } from '../../src/prompts/detect-page-numbers.js';
import { tocTransformPrompt } from '../../src/prompts/toc-transform.js';
import { physicalMappingPrompt } from '../../src/prompts/physical-mapping.js';
import { verifyMappingPrompt } from '../../src/prompts/verify-mapping.js';
import { titleAtStartPrompt } from '../../src/prompts/title-at-start.js';
import { tagPages } from '../../src/page-tag.js';
import type { FlatTocEntry, RawPage } from '../../src/types.js';
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

// Exact MuPDF-extracted page texts (verified via extract-text helper)
const PAGE_TEXTS = {
  cover: 'Annual Report 2023',
  toc: '1. Intro: 1\n2. Body: 2',
  intro: 'Intro\nThis is the intro section.',
  body: 'Body\nDetailed analysis content.',
};

const pages: RawPage[] = [
  { pageNumber: 1, text: PAGE_TEXTS.cover, annotatedText: PAGE_TEXTS.cover, tokenCount: 10 },
  { pageNumber: 2, text: PAGE_TEXTS.toc, annotatedText: PAGE_TEXTS.toc, tokenCount: 10 },
  { pageNumber: 3, text: PAGE_TEXTS.intro, annotatedText: PAGE_TEXTS.intro, tokenCount: 10 },
  { pageNumber: 4, text: PAGE_TEXTS.body, annotatedText: PAGE_TEXTS.body, tokenCount: 10 },
];

// TOC entries after transform step
const tocJson: FlatTocEntry[] = [
  { structure: '1', title: 'Intro', page: 1 },
  { structure: '2', title: 'Body', page: 2 },
];

// After physical mapping: offset=2 (Intro at phys 3, Body at phys 4)
// addPreface: first physical_index=3 > 1, so Preface entry added at physical_index=1
const mappedEntries: FlatTocEntry[] = [
  { structure: '1', title: 'Intro', page: 1, physical_index: 3 },
  { structure: '2', title: 'Body', page: 2, physical_index: 4 },
];

// After addPreface: preface gets inserted at physical_index=1
// checkTitleAtStart is called on ALL entries (including preface if added)
// But preface has no physical_index... wait, addPreface sets physical_index: 1
// Let's check: addPreface adds { structure: '0', title: 'Preface', physical_index: 1 }
const afterPreface: FlatTocEntry[] = [
  { structure: '0', title: 'Preface', physical_index: 1 },
  { structure: '1', title: 'Intro', page: 1, physical_index: 3 },
  { structure: '2', title: 'Body', page: 2, physical_index: 4 },
];

function buildStubs(): Map<string, { text: string }> {
  const stubs = new Map<string, { text: string }>();
  const taggedAll = tagPages(pages);

  // Step 02: detectToc for each page
  stubs.set(hashPrompt([detectTocPrompt(PAGE_TEXTS.cover)]), { text: '{"toc_detected":"no"}' });
  stubs.set(hashPrompt([detectTocPrompt(PAGE_TEXTS.toc)]), { text: '{"toc_detected":"yes"}' });
  stubs.set(hashPrompt([detectTocPrompt(PAGE_TEXTS.intro)]), { text: '{"toc_detected":"no"}' });
  stubs.set(hashPrompt([detectTocPrompt(PAGE_TEXTS.body)]), { text: '{"toc_detected":"no"}' });

  // Step 04: detectPageNumbers
  stubs.set(hashPrompt([detectPageNumbersPrompt(PAGE_TEXTS.toc)]), {
    text: '{"page_index_given_in_toc":"yes"}',
  });

  // Step 05: tocTransform
  stubs.set(hashPrompt([tocTransformPrompt(PAGE_TEXTS.toc)]), {
    text: JSON.stringify({
      table_of_contents: [
        { structure: '1', title: 'Intro', page: 1 },
        { structure: '2', title: 'Body', page: 2 },
      ],
    }),
  });

  // Step 06: physicalMapping
  stubs.set(hashPrompt([physicalMappingPrompt(tocJson, taggedAll)]), {
    text: JSON.stringify([
      { structure: '1', title: 'Intro', physical_index: '<physical_index_3>' },
      { structure: '2', title: 'Body', physical_index: '<physical_index_4>' },
    ]),
  });

  // Step 06_6: verifyMapping (uses entries with physical_index from mapPhysical output)
  stubs.set(hashPrompt([verifyMappingPrompt(mappedEntries, taggedAll)]), {
    text: JSON.stringify({
      results: [
        { structure: '1', correct: 'yes' },
        { structure: '2', correct: 'yes' },
      ],
    }),
  });

  // Step 06_8: checkTitleAtStart for each entry with physical_index
  // Preface (physical_index=1 → page 1 = cover page)
  stubs.set(hashPrompt([titleAtStartPrompt('Preface', PAGE_TEXTS.cover)]), {
    text: '{"appear_start":"yes"}',
  });
  // Intro (physical_index=3 → page 3)
  stubs.set(hashPrompt([titleAtStartPrompt('Intro', PAGE_TEXTS.intro)]), {
    text: '{"appear_start":"yes"}',
  });
  // Body (physical_index=4 → page 4)
  stubs.set(hashPrompt([titleAtStartPrompt('Body', PAGE_TEXTS.body)]), {
    text: '{"appear_start":"yes"}',
  });

  return stubs;
}

let dataDir: string;
let pdfPath: string;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-toc-'));
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

describe('golden: small PDF with TOC', () => {
  it('produces a valid DocOutput tree', async () => {
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
    // Should have root nodes for Preface, Intro, Body
    const titles = out.structure.map(n => n.title);
    expect(titles).toContain('Intro');
    expect(titles).toContain('Body');

    expect(stableOutput(out)).toMatchSnapshot();
  });
});
