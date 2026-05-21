import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { subgroupAgent } from '../../../src/hierarchical/subgroup-agent.js';
import { subgroupHeadingsPrompt } from '../../../src/prompts/subgroup-headings.js';
import { tagPages } from '../../../src/page-tag.js';
import type { RawPage } from '../../../src/types.js';

describe('subgroupAgent', () => {
  it('returns [title, page] tuples', async () => {
    const pages: RawPage[] = [{ pageNumber: 5, text: 'x', tokenCount: 0 }];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([subgroupHeadingsPrompt(tagged)]), { text: '[["Intro", 5], ["Bg", 7]]' }],
    ]);
    const out = await subgroupAgent({ pages }, { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([['Intro', 5], ['Bg', 7]]);
  });

  it('returns [title, logical|null, physical] tuples', async () => {
    const pages: RawPage[] = [{ pageNumber: 5, text: 'x', tokenCount: 0 }];
    const tagged = tagPages(pages);
    const responses = new Map([
      [hashPrompt([subgroupHeadingsPrompt(tagged)]), { text: '[["Intro", 1, 5], ["Bg", null, 7]]' }],
    ]);
    const out = await subgroupAgent({ pages }, { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([['Intro', 1, 5], ['Bg', null, 7]]);
  });

  it('returns [] on error', async () => {
    const pages: RawPage[] = [{ pageNumber: 1, text: 'x', tokenCount: 0 }];
    const gemini = createStubGemini({ responses: new Map() });
    const out = await subgroupAgent({ pages }, { gemini });
    expect(out).toEqual([]);
  });
});
