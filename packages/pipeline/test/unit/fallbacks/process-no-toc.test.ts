import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { processNoToc } from '../../../src/fallbacks/process-no-toc.js';
import { noTocHeadingsPrompt } from '../../../src/prompts/no-toc-headings.js';
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
});
