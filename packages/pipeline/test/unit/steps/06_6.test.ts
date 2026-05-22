import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { verifyAndFix } from '../../../src/steps/06_6-verify-fix.js';
import { verifyMappingPrompt } from '../../../src/prompts/verify-mapping.js';
import { tagPages } from '../../../src/page-tag.js';
import type { FlatTocEntry, RawPage } from '../../../src/types.js';

const pages: RawPage[] = [1, 2, 3].map(n => ({ pageNumber: n, text: '', annotatedText: '', tokenCount: 0 }));

describe('verifyAndFix', () => {
  it('reports accuracy 1.0 when all correct', async () => {
    const entries: FlatTocEntry[] = [
      { structure: '1', title: 'A', physical_index: 1 },
      { structure: '2', title: 'B', physical_index: 2 },
    ];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([verifyMappingPrompt(entries, tagged)]), {
        text: '{"results":[{"structure":"1","correct":"yes"},{"structure":"2","correct":"yes"}]}',
      }],
    ]);
    const out = await verifyAndFix(entries, pages, { gemini: createStubGemini({ responses }), maxFixRetries: 3 });
    expect(out.accuracy).toBe(1);
    expect(out.entries).toEqual(entries);
  });
});
