import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { groupMaster } from '../../../src/hierarchical/group-master.js';
import { groupMasterPrompt } from '../../../src/prompts/group-master.js';
import type { Heading } from '../../../src/hierarchical/subgroup-agent.js';

describe('groupMaster', () => {
  it('returns structured tuples on direct merge', async () => {
    const sub: Heading[][] = [[['Intro', 5]], [['Bg', 7]]];
    const responses = new Map([
      [hashPrompt([groupMasterPrompt(sub, undefined)]), { text: '[["1","Intro",5],["1.1","Bg",7]]' }],
    ]);
    const out = await groupMaster(sub, [], { gemini: createStubGemini({ responses }), maxRetrievals: 3 });
    expect(out).toEqual([['1', 'Intro', 5], ['1.1', 'Bg', 7]]);
  });

  it('preserves logical when returned by master', async () => {
    const sub: Heading[][] = [[['Intro', 1, 5]], [['Bg', null, 7]]];
    const responses = new Map([
      [hashPrompt([groupMasterPrompt(sub, undefined)]), { text: '[["1","Intro",1,5],["1.1","Bg",null,7]]' }],
    ]);
    const out = await groupMaster(sub, [], { gemini: createStubGemini({ responses }), maxRetrievals: 3 });
    expect(out).toEqual([['1', 'Intro', 1, 5], ['1.1', 'Bg', null, 7]]);
  });
});
