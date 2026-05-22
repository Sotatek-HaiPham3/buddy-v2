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
  it('LLM emits 2-tuples; resolver derives physical from page-text match', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: '24\nCHIPPING POTATOES\nbody', annotatedText: '24\nCHIPPING POTATOES\nbody', tokenCount: 5 },
      { pageNumber: 2, text: '25\nROUND CABBAGES\nbody', annotatedText: '25\nROUND CABBAGES\nbody', tokenCount: 5 },
    ];
    const tagged = tagPages(pages, 'annotatedText');
    const responses = new Map([
      [hashPrompt([noTocHeadingsPrompt(tagged)]), {
        text: JSON.stringify([
          ['1.1', 'CHIPPING POTATOES'],
          ['1.2', 'ROUND CABBAGES'],
        ]),
      }],
    ]);
    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out[0]).toMatchObject({ structure: '1.1', physical_index: 1, page: 24 });
    expect(out[1]).toMatchObject({ structure: '1.2', physical_index: 2, page: 25 });
  });

  it('still parses legacy 3-tuple output but resolves pages from text', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: '1\nINTRO\nbody', annotatedText: '1\nINTRO\nbody', tokenCount: 5 },
    ];
    const tagged = tagPages(pages, 'annotatedText');
    const responses = new Map([
      [hashPrompt([noTocHeadingsPrompt(tagged)]), { text: JSON.stringify([['1.1', 'INTRO', 99]]) }],
    ]);
    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out[0]?.physical_index).toBe(1);
  });

  it('still parses legacy 4-tuple output and ignores tuple page values', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'ANCHOR\nbody', annotatedText: 'ANCHOR\nbody', tokenCount: 5 },
    ];
    const tagged = tagPages(pages, 'annotatedText');
    const responses = new Map([
      [hashPrompt([noTocHeadingsPrompt(tagged)]), { text: JSON.stringify([['1.1', 'ANCHOR', 50, 99]]) }],
    ]);
    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100000, hierarchical: false,
      subgroupTokenSize: 7000, maxRetrievalsPerMaster: 3,
    });
    expect(out[0]?.physical_index).toBe(1);
    expect(out[0]?.page).toBeUndefined();
  });

  it('resolves pages for hierarchical output chain', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: '1\nINTRO', annotatedText: '1\nINTRO', tokenCount: 10 },
      { pageNumber: 2, text: '2\nBODY', annotatedText: '2\nBODY', tokenCount: 10 },
    ];
    const tagged = tagPages(pages, 'annotatedText');
    const responses = new Map([
      [hashPrompt([subgroupHeadingsPrompt(tagged)]), { text: JSON.stringify([['INTRO'], ['BODY']]) }],
      [hashPrompt([groupMasterPrompt([[['INTRO'], ['BODY']]], undefined)]), { text: JSON.stringify([['1', 'INTRO'], ['2', 'BODY']]) }],
      [hashPrompt([chapterMasterPrompt([[['1', 'INTRO'], ['2', 'BODY']]], '1')]), { text: JSON.stringify([['1.1', 'INTRO'], ['1.2', 'BODY']]) }],
    ]);

    const out = await processNoToc(pages, {
      gemini: createStubGemini({ responses }), pool: async <T,>(fn: () => Promise<T>) => fn(),
      chunkTokens: 100000, hierarchical: true,
      subgroupTokenSize: 100000, maxRetrievalsPerMaster: 0,
    });

    expect(out).toEqual([
      { structure: '1.1', title: 'INTRO', page: 1, physical_index: 1 },
      { structure: '1.2', title: 'BODY', page: 2, physical_index: 2 },
    ]);
  });
});
