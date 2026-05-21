import { describe, expect, it } from 'vitest';
import { extractTocContent } from '../../../src/steps/03-toc-content.js';
import type { RawPage } from '../../../src/types.js';

const p = (n: number, text: string): RawPage => ({ pageNumber: n, text, tokenCount: 0 });

describe('extractTocContent', () => {
  it('concatenates pages by 1-based number', () => {
    const out = extractTocContent([p(1, 'A'), p(2, 'B'), p(3, 'C')], [2, 3]);
    expect(out).toBe('BC');
  });
  it('replaces .... with :', () => {
    const out = extractTocContent([p(1, 'Intro ........ 5')], [1]);
    expect(out).toBe('Intro : 5');
  });
  it('replaces ". . . . " with :', () => {
    const out = extractTocContent([p(1, 'Intro . . . . . 5')], [1]);
    expect(out).toContain(': 5');
  });
});
