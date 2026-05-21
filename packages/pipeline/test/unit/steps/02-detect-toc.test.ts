import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { detectTocPages } from '../../../src/steps/02-detect-toc.js';
import { detectTocPrompt } from '../../../src/prompts/detect-toc.js';
import type { RawPage } from '../../../src/types.js';

const page = (n: number, text: string): RawPage => ({ pageNumber: n, text, tokenCount: 100 });

describe('detectTocPages', () => {
  it('returns consecutive yes pages, stops on no', async () => {
    const pages = [page(1, 'cover'), page(2, 'toc1'), page(3, 'toc2'), page(4, 'body')];
    const responses = new Map([
      [hashPrompt([detectTocPrompt('cover')]), { text: '{"toc_detected":"no"}' }],
      [hashPrompt([detectTocPrompt('toc1')]), { text: '{"toc_detected":"yes"}' }],
      [hashPrompt([detectTocPrompt('toc2')]), { text: '{"toc_detected":"yes"}' }],
      [hashPrompt([detectTocPrompt('body')]), { text: '{"toc_detected":"no"}' }],
    ]);
    const gemini = createStubGemini({ responses });
    const result = await detectTocPages(pages, { gemini, maxScan: 20 });
    expect(result).toEqual([2, 3]);
  });

  it('returns [] when no TOC found in first maxScan pages', async () => {
    const pages = [page(1, 'a'), page(2, 'b')];
    const responses = new Map([
      [hashPrompt([detectTocPrompt('a')]), { text: '{"toc_detected":"no"}' }],
      [hashPrompt([detectTocPrompt('b')]), { text: '{"toc_detected":"no"}' }],
    ]);
    const gemini = createStubGemini({ responses });
    expect(await detectTocPages(pages, { gemini, maxScan: 20 })).toEqual([]);
  });
});
