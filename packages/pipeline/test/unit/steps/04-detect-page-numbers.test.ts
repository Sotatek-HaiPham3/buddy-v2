import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { detectPageNumbers } from '../../../src/steps/04-detect-page-numbers.js';
import { detectPageNumbersPrompt } from '../../../src/prompts/detect-page-numbers.js';

describe('detectPageNumbers', () => {
  it('returns true on yes', async () => {
    const toc = '1. Intro: 1\n2. Body: 5';
    const responses = new Map([
      [hashPrompt([detectPageNumbersPrompt(toc)]), { text: '{"page_index_given_in_toc":"yes"}' }],
    ]);
    expect(await detectPageNumbers(toc, { gemini: createStubGemini({ responses }) })).toBe(true);
  });
  it('returns false on no', async () => {
    const toc = '1. Intro\n2. Body';
    const responses = new Map([
      [hashPrompt([detectPageNumbersPrompt(toc)]), { text: '{"page_index_given_in_toc":"no"}' }],
    ]);
    expect(await detectPageNumbers(toc, { gemini: createStubGemini({ responses }) })).toBe(false);
  });
});
