import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { chapterMaster } from '../../../src/hierarchical/chapter-master.js';
import { chapterMasterPrompt } from '../../../src/prompts/chapter-master.js';

describe('chapterMaster', () => {
  it('merges with prefix as [structure,title]', async () => {
    const groups: [string, string][][] = [[['1', 'A']], [['1', 'B']]];
    const responses = new Map([
      [hashPrompt([chapterMasterPrompt(groups, '3')]), { text: '[["3.1","A"],["3.2","B"]]' }],
    ]);
    const out = await chapterMaster(groups, '3', { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([['3.1', 'A'], ['3.2', 'B']]);
  });

  it('coerces legacy tuples to [structure,title]', async () => {
    const groups: [string, string][][] = [[['1', 'A']], [['1', 'B']]];
    const responses = new Map([
      [hashPrompt([chapterMasterPrompt(groups, '3')]), { text: '[["3.1","A",1,5],["3.2","B",10]]' }],
    ]);
    const out = await chapterMaster(groups, '3', { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([['3.1', 'A'], ['3.2', 'B']]);
  });
});