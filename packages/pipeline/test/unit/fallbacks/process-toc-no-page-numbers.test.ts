import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { processTocNoPageNumbers } from '../../../src/fallbacks/process-toc-no-page-numbers.js';
import { physicalMappingPrompt } from '../../../src/prompts/physical-mapping.js';
import { tagPages } from '../../../src/page-tag.js';
import type { FlatTocEntry, RawPage } from '../../../src/types.js';

describe('processTocNoPageNumbers', () => {
  it('finds physical_index for each TOC entry across all pages', async () => {
    const pages: RawPage[] = [
      { pageNumber: 1, text: 'Intro here', tokenCount: 10 },
      { pageNumber: 5, text: 'Body here', tokenCount: 10 },
    ];
    const tagged = tagPages(pages);
    const toc: FlatTocEntry[] = [{ structure: '1', title: 'Intro' }, { structure: '2', title: 'Body' }];
    const responses = new Map([
      [hashPrompt([physicalMappingPrompt(toc, tagged)]), {
        text: '[{"structure":"1","title":"Intro","physical_index":"<physical_index_1>"},{"structure":"2","title":"Body","physical_index":"<physical_index_5>"}]',
      }],
    ]);
    const out = await processTocNoPageNumbers(toc, pages, { gemini: createStubGemini({ responses }) });
    expect(out[0]?.physical_index).toBe(1);
    expect(out[1]?.physical_index).toBe(5);
  });
});
