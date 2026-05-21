import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { transformToc } from '../../../src/steps/05-toc-transform.js';
import { tocTransformPrompt } from '../../../src/prompts/toc-transform.js';

describe('transformToc', () => {
  it('parses flat TOC entries from LLM JSON', async () => {
    const toc = '1. Intro: 1\n2. Body: 5';
    const responses = new Map([
      [hashPrompt([tocTransformPrompt(toc)]), {
        text: '{"table_of_contents":[{"structure":"1","title":"Intro","page":1},{"structure":"2","title":"Body","page":5}]}',
      }],
    ]);
    const out = await transformToc(toc, { gemini: createStubGemini({ responses }) });
    expect(out).toEqual([
      { structure: '1', title: 'Intro', page: 1 },
      { structure: '2', title: 'Body', page: 5 },
    ]);
  });
});
