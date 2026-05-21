import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { processNoToc } from '../../../src/fallbacks/process-no-toc.js';
import { noTocHeadingsPrompt } from '../../../src/prompts/no-toc-headings.js';
import { subgroupHeadingsPrompt } from '../../../src/prompts/subgroup-headings.js';
import { groupMasterPrompt } from '../../../src/prompts/group-master.js';
import { chapterMasterPrompt } from '../../../src/prompts/chapter-master.js';
import { tagPages } from '../../../src/page-tag.js';
import type { RawPage } from '../../../src/types.js';

describe('processNoToc', () => {
  it('returns flat TOC from LLM scan of all pages', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'a', tokenCount: 10 },
      { pageNumber: 2, text: 'b', tokenCount: 10 },
    ];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([noTocHeadingsPrompt(tagged)]), {
        text: '[{"structure":"1","title":"Intro","physical_index":"<physical_index_1>"},{"structure":"2","title":"Body","physical_index":"<physical_index_2>"}]',
      }],
    ]);
    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ structure: '1', title: 'Intro', physical_index: 1 });
  });

  it('parses logical_page when no-toc response is 4-tuple', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'a', tokenCount: 10 },
      { pageNumber: 2, text: 'b', tokenCount: 10 },
    ];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([noTocHeadingsPrompt(tagged)]), {
        text: JSON.stringify([
          ['1', 'Intro', 1, 1],
          ['2', 'Body', null, 2],
        ]),
      }],
    ]);
    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out).toEqual([
      { structure: '1', title: 'Intro', page: 1, physical_index: 1 },
      { structure: '2', title: 'Body', physical_index: 2 },
    ]);
  });

  it('reconstructs physical_index when LLM emits logical and printedNumber is on page header', async () => {
    // 3-page chunk, page 1 prints "61", page 2 prints "62", page 3 prints "63".
    const pages: RawPage[] = [
      { pageNumber: 1, text: '61\nCHAPTER 13\nSemi refined carrageenan content', tokenCount: 10 },
      { pageNumber: 2, text: '62\nPicture caption only', tokenCount: 5 },
      { pageNumber: 3, text: '63\nALKALI TREATED CARRAGEENAN', tokenCount: 8 },
    ];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([noTocHeadingsPrompt(tagged)]), {
        text: JSON.stringify([
          ['1.1', 'CHAPTER 13', 61, 61],
          ['1.1.1', 'ALKALI TREATED', 63, 63],
        ]),
      }],
    ]);
    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100_000, hierarchical: false,
      subgroupTokenSize: 100_000, maxRetrievalsPerMaster: 1,
    });
    expect(out[0].physical_index).toBe(1);   // reconstructed
    expect(out[0].page).toBe(61);            // logical preserved
    expect(out[1].physical_index).toBe(3);   // reconstructed
    expect(out[1].page).toBe(63);
  });

  it('leaves physical_index unchanged when out of range and not in printedNumber map', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'no printed page header here', tokenCount: 5 },
    ];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([noTocHeadingsPrompt(tagged)]), {
        text: JSON.stringify([['1.1', 'GHOST', 99, 99]]),
      }],
    ]);
    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100_000, hierarchical: false,
      subgroupTokenSize: 100_000, maxRetrievalsPerMaster: 1,
    });
    // physical_index 99 is out of range and not reconstructible. Left alone for validate to strip.
    expect(out[0].physical_index).toBe(99);
  });

  it('handles 3-tuple legacy LLM output unchanged (no reconstruction needed)', async () => {
    const pages: RawPage[] = [{ pageNumber: 1, text: 'page 1', tokenCount: 3 }];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([noTocHeadingsPrompt(tagged)]), {
        text: JSON.stringify([['1.1', 'Title', 1]]),
      }],
    ]);
    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100_000, hierarchical: false,
      subgroupTokenSize: 100_000, maxRetrievalsPerMaster: 1,
    });
    expect(out[0].physical_index).toBe(1);
    expect(out[0].page).toBeUndefined();
  });

  it('parses both legacy and logical tuples in hierarchical mode', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'a', tokenCount: 10 },
      { pageNumber: 2, text: 'b', tokenCount: 10 },
    ];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([subgroupHeadingsPrompt(tagged)]), {
        text: JSON.stringify([
          ['Intro', 1, 1],
          ['Body', null, 2],
        ]),
      }],
      [hashPrompt([groupMasterPrompt([[['Intro', 1, 1], ['Body', null, 2]]], undefined)]), {
        text: JSON.stringify([
          ['1', 'Intro', 1, 1],
          ['2', 'Body', 2],
        ]),
      }],
      [hashPrompt([chapterMasterPrompt([[['1', 'Intro', 1, 1], ['2', 'Body', 2]]], '1')]), {
        text: JSON.stringify([
          ['1.1', 'Intro', 1, 1],
          ['1.2', 'Body', 2],
        ]),
      }],
    ]);

    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100000, hierarchical: true,
      subgroupTokenSize: 100000, maxRetrievalsPerMaster: 0,
    });

    expect(out).toEqual([
      { structure: '1.1', title: 'Intro', page: 1, physical_index: 1 },
      { structure: '1.2', title: 'Body', physical_index: 2 },
    ]);
  });
});
