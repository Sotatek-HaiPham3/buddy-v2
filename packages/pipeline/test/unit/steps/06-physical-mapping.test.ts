import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { mapPhysical } from '../../../src/steps/06-physical-mapping.js';
import { physicalMappingPrompt } from '../../../src/prompts/physical-mapping.js';
import { tagPages } from '../../../src/page-tag.js';
import type { FlatTocEntry, RawPage } from '../../../src/types.js';

describe('mapPhysical', () => {
  it('applies most-common offset to all entries', async () => {
    const toc: FlatTocEntry[] = [
      { structure: '1', title: 'Intro', page: 1 },
      { structure: '2', title: 'Body', page: 5 },
      { structure: '3', title: 'End', page: 10 },
    ];
    const pages: RawPage[] = [3, 4, 5, 6, 7].map(n => ({ pageNumber: n, text: '', annotatedText: '', tokenCount: 0 }));
    const tagged = tagPages(pages);
    const mockResponse = JSON.stringify([
      { structure: '1', title: 'Intro', physical_index: '<physical_index_5>' },
      { structure: '2', title: 'Body', physical_index: '<physical_index_9>' },
      // structure 3 not found by LLM
    ]);
    const responses = new Map([
      [hashPrompt([physicalMappingPrompt(toc, tagged)]), { text: mockResponse }],
    ]);
    const out = await mapPhysical(toc, pages, { gemini: createStubGemini({ responses }), searchAfterToc: 0 });
    expect(out[0]?.physical_index).toBe(5);  // page 1 + offset 4
    expect(out[1]?.physical_index).toBe(9);  // page 5 + offset 4
    expect(out[2]?.physical_index).toBe(14); // page 10 + offset 4
  });
});
