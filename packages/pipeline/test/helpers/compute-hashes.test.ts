/**
 * Helper to compute exact hashes for all prompts used in the golden tests.
 * Run with: pnpm vitest run packages/pipeline/test/helpers/compute-hashes.test.ts --reporter=verbose
 */
import { describe, it } from 'vitest';
import { hashPrompt } from '@buddy/shared';
import { detectTocPrompt } from '../../src/prompts/detect-toc.js';
import { detectPageNumbersPrompt } from '../../src/prompts/detect-page-numbers.js';
import { tocTransformPrompt } from '../../src/prompts/toc-transform.js';
import { physicalMappingPrompt } from '../../src/prompts/physical-mapping.js';
import { verifyMappingPrompt } from '../../src/prompts/verify-mapping.js';
import { titleAtStartPrompt } from '../../src/prompts/title-at-start.js';
import { noTocHeadingsPrompt } from '../../src/prompts/no-toc-headings.js';
import { tagPages } from '../../src/page-tag.js';
import type { FlatTocEntry, RawPage } from '../../src/types.js';

// Exact MuPDF-extracted texts (from extract-text helper)
const PAGE_TEXTS = {
  cover: 'Annual Report 2023',
  toc: '1. Intro: 1\n2. Body: 2',
  intro: 'Intro\nThis is the intro section.',
  body: 'Body\nDetailed analysis content.',
};

// For no-toc test (3 pages)
const NO_TOC_PAGE_TEXTS = {
  cover: 'Annual Report 2023',
  intro: 'Introduction\nThis is the intro section.',
  body: 'Body\nDetailed analysis content.',
};

describe('compute hashes', () => {
  it('small-with-toc hashes', () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: PAGE_TEXTS.cover, annotatedText: PAGE_TEXTS.cover, tokenCount: 10 },
      { pageNumber: 2, text: PAGE_TEXTS.toc, annotatedText: PAGE_TEXTS.toc, tokenCount: 10 },
      { pageNumber: 3, text: PAGE_TEXTS.intro, annotatedText: PAGE_TEXTS.intro, tokenCount: 10 },
      { pageNumber: 4, text: PAGE_TEXTS.body, annotatedText: PAGE_TEXTS.body, tokenCount: 10 },
    ];

    // detectToc prompts for each page
    for (const p of pages) {
      const prompt = detectTocPrompt(p.text);
      const hash = hashPrompt([prompt]);
      console.log(`detectToc page ${p.pageNumber}: hash=${hash.slice(0, 12)}, text=${JSON.stringify(p.text)}`);
    }

    // tocText is the concatenated TOC page(s)
    // Page 2 is toc — joined with newlines
    const tocText = PAGE_TEXTS.toc;

    // detectPageNumbers
    const pageNumPrompt = detectPageNumbersPrompt(tocText);
    console.log(`detectPageNumbers: hash=${hashPrompt([pageNumPrompt]).slice(0, 12)}`);

    // tocTransform
    const tocTransformP = tocTransformPrompt(tocText);
    console.log(`tocTransform: hash=${hashPrompt([tocTransformP]).slice(0, 12)}`);

    // After transform: TOC entries with page numbers
    const tocJson: FlatTocEntry[] = [
      { structure: '1', title: 'Intro', page: 1 },
      { structure: '2', title: 'Body', page: 2 },
    ];

    // physicalMapping (all pages tagged)
    const taggedAll = tagPages(pages);
    const physMapPrompt = physicalMappingPrompt(tocJson, taggedAll);
    console.log(`physicalMapping: hash=${hashPrompt([physMapPrompt]).slice(0, 12)}`);

    // After mapping: entries get physical_index
    // offset = phys - page. Intro (page=1) should be at physical 3, Body (page=2) at physical 4
    // offset = 3-1=2 (for Intro), 4-2=2 (for Body). So offset=2
    // physical_index = page + offset
    const mappedEntries: FlatTocEntry[] = [
      { structure: '1', title: 'Intro', page: 1, physical_index: 3 },
      { structure: '2', title: 'Body', page: 2, physical_index: 4 },
    ];

    // verifyMapping
    const verifyPrompt = verifyMappingPrompt(mappedEntries, taggedAll);
    console.log(`verifyMapping: hash=${hashPrompt([verifyPrompt]).slice(0, 12)}`);

    // titleAtStart for each entry
    for (const e of mappedEntries) {
      if (e.physical_index === undefined) continue;
      const page = pages.find(p => p.pageNumber === e.physical_index)!;
      const taPrompt = titleAtStartPrompt(e.title, page.text);
      console.log(`titleAtStart "${e.title}" (page ${e.physical_index}): hash=${hashPrompt([taPrompt]).slice(0, 12)}`);
    }
  });

  it('no-toc hashes', () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: NO_TOC_PAGE_TEXTS.cover, annotatedText: NO_TOC_PAGE_TEXTS.cover, tokenCount: 10 },
      { pageNumber: 2, text: NO_TOC_PAGE_TEXTS.intro, annotatedText: NO_TOC_PAGE_TEXTS.intro, tokenCount: 10 },
      { pageNumber: 3, text: NO_TOC_PAGE_TEXTS.body, annotatedText: NO_TOC_PAGE_TEXTS.body, tokenCount: 10 },
    ];

    // detectToc for each page - all return no
    for (const p of pages) {
      const prompt = detectTocPrompt(p.text);
      const hash = hashPrompt([prompt]);
      console.log(`no-toc detectToc page ${p.pageNumber}: hash=${hash.slice(0, 12)}`);
    }

    // noTocHeadings (all pages chunked together)
    const tagged = tagPages(pages, 'annotatedText');
    const headingPrompt = noTocHeadingsPrompt(tagged);
    console.log(`noTocHeadings: hash=${hashPrompt([headingPrompt]).slice(0, 12)}`);
  });

  it('toc-no-page-numbers hashes', () => {
    // Same as small-with-toc but detect page numbers returns 'no'
    // This routes through processNoToc as well
    const pages: RawPage[] = [
      { pageNumber: 1, text: PAGE_TEXTS.cover, annotatedText: PAGE_TEXTS.cover, tokenCount: 10 },
      { pageNumber: 2, text: PAGE_TEXTS.toc, annotatedText: PAGE_TEXTS.toc, tokenCount: 10 },
      { pageNumber: 3, text: PAGE_TEXTS.intro, annotatedText: PAGE_TEXTS.intro, tokenCount: 10 },
      { pageNumber: 4, text: PAGE_TEXTS.body, annotatedText: PAGE_TEXTS.body, tokenCount: 10 },
    ];

    // detectToc - page 2 returns yes, others no
    for (const p of pages) {
      const prompt = detectTocPrompt(p.text);
      const hash = hashPrompt([prompt]);
      console.log(`toc-no-pn detectToc page ${p.pageNumber}: hash=${hash.slice(0, 12)}`);
    }

    const tocText = PAGE_TEXTS.toc;
    const pageNumPrompt = detectPageNumbersPrompt(tocText);
    console.log(`toc-no-pn detectPageNumbers: hash=${hashPrompt([pageNumPrompt]).slice(0, 12)}`);

    // After 'no', routes to processNoToc -> noTocHeadings
    const tagged = tagPages(pages, 'annotatedText');
    const headingPrompt = noTocHeadingsPrompt(tagged);
    console.log(`toc-no-pn noTocHeadings: hash=${hashPrompt([headingPrompt]).slice(0, 12)}`);
  });
});
