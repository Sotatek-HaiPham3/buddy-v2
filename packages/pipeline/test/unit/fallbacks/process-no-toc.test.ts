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
