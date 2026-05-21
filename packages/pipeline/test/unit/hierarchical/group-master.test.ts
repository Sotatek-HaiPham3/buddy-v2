import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { groupMaster } from '../../../src/hierarchical/group-master.js';
import { groupMasterPrompt } from '../../../src/prompts/group-master.js';
import type { Heading } from '../../../src/hierarchical/subgroup-agent.js';

describe('groupMaster', () => {
  it('returns [structure,title] tuples on direct merge', async () => {
    const sub: Heading[][] = [[['Intro']], [['Bg']]];
    const responses = new Map([
      [hashPrompt([groupMasterPrompt(sub, undefined)]), { text: '[["1","Intro"],["1.1","Bg"]]' }],
    ]);
    const out = await groupMaster(sub, [], { gemini: createStubGemini({ responses }), maxRetrievals: 3 });
    expect(out).toEqual([['1', 'Intro'], ['1.1', 'Bg']]);
  });

  it('coerces legacy tuples to [structure,title]', async () => {
    const sub: Heading[][] = [[['Intro']], [['Bg']]];
    const responses = new Map([
      [hashPrompt([groupMasterPrompt(sub, undefined)]), { text: '[["1","Intro",1,5],["1.1","Bg",7]]' }],
    ]);
    const out = await groupMaster(sub, [], { gemini: createStubGemini({ responses }), maxRetrievals: 3 });
    expect(out).toEqual([['1', 'Intro'], ['1.1', 'Bg']]);
  });
});