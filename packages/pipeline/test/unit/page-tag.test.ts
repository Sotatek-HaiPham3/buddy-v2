import { describe, expect, it } from 'vitest';
import { parsePhysicalIndexTag, tagPages } from '../../src/page-tag.js';
import type { RawPage } from '../../src/types.js';

describe('page-tag', () => {
  it('tags pages by 1-based pageNumber using plain text by default', () => {
    const out = tagPages([
      { pageNumber: 5, text: 'hello', annotatedText: '<b>HELLO</b>', tokenCount: 0 },
      { pageNumber: 6, text: 'world', annotatedText: '<b>WORLD</b>', tokenCount: 0 },
    ] as RawPage[]);
    expect(out).toBe('<physical_index_5>\nhello\n</physical_index_5>\n<physical_index_6>\nworld\n</physical_index_6>');
  });
  it('uses annotatedText when field arg is annotatedText', () => {
    const out = tagPages([
      { pageNumber: 1, text: 'hello', annotatedText: '<b>HEADING</b>\nhello', tokenCount: 2 },
    ] as RawPage[], 'annotatedText');
    expect(out).toContain('<b>HEADING</b>');
  });
  it('parses tag to int', () => {
    expect(parsePhysicalIndexTag('<physical_index_42>')).toBe(42);
    expect(parsePhysicalIndexTag('physical_index_42')).toBe(42);
  });
  it('throws on unparseable', () => {
    expect(() => parsePhysicalIndexTag('garbage')).toThrow();
  });
});
