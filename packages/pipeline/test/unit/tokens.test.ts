import { describe, expect, it } from 'vitest';
import { countTokens } from '../../src/tokens.js';

describe('countTokens', () => {
  it('returns 0 for empty', () => { expect(countTokens('')).toBe(0); });
  it('returns positive int for non-empty', () => {
    const n = countTokens('Hello world, this is a test.');
    expect(n).toBeGreaterThan(0);
    expect(Number.isInteger(n)).toBe(true);
  });
  it('scales roughly with length', () => {
    const a = countTokens('short');
    const b = countTokens('short '.repeat(100));
    expect(b).toBeGreaterThan(a * 10);
  });
});
