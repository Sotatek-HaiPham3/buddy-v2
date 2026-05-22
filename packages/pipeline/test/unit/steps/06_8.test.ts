import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { checkTitleAtStart } from '../../../src/steps/06_8-title-at-start.js';
import { titleAtStartPrompt } from '../../../src/prompts/title-at-start.js';
import type { RawPage } from '../../../src/types.js';

describe('checkTitleAtStart', () => {
  it('annotates each entry with appear_start in parallel', async () => {
    const pages: RawPage[] = [{ pageNumber: 1, text: 'page1text', annotatedText: 'page1text', tokenCount: 0 }];
    const responses = new Map([
      [hashPrompt([titleAtStartPrompt('Intro', 'page1text')]), { text: '{"appear_start":"yes"}' }],
    ]);
    const gemini = createStubGemini({ responses });
    const pool = async <T,>(fn: () => Promise<T>) => fn();
    const out = await checkTitleAtStart(
      [{ structure: '1', title: 'Intro', physical_index: 1 }],
      pages,
      { gemini, pool },
    );
    expect(out[0]?.appear_start).toBe('yes');
  });
});
