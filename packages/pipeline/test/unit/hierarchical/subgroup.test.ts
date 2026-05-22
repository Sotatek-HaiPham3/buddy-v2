import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { subgroupAgent } from '../../../src/hierarchical/subgroup-agent.js';
import { subgroupHeadingsPrompt } from '../../../src/prompts/subgroup-headings.js';
import { tagPages } from '../../../src/page-tag.js';
import type { RawPage } from '../../../src/types.js';

describe('subgroupAgent', () => {
  it('returns [title] tuples from new prompt contract', async () => {
    const pages: RawPage[] = [{ pageNumber: 5, text: 'x', annotatedText: 'x', tokenCount: 0 }];
    const tagged = tagPages(pages, 'annotatedText');
    const responses = new Map([
      [hashPrompt([subgroupHeadingsPrompt(tagged)]), { text: '[["Intro"], ["Bg"]]' }],
    ]);
    const out = await subgroupAgent({ pages }, { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([['Intro'], ['Bg']]);
  });

  it('coerces legacy tuples to [title]', async () => {
    const pages: RawPage[] = [{ pageNumber: 5, text: 'x', annotatedText: 'x', tokenCount: 0 }];
    const tagged = tagPages(pages, 'annotatedText');
    const responses = new Map([
      [hashPrompt([subgroupHeadingsPrompt(tagged)]), { text: '[["Intro", 5], ["Bg", null, 7]]' }],
    ]);
    const out = await subgroupAgent({ pages }, { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([['Intro'], ['Bg']]);
  });
});
