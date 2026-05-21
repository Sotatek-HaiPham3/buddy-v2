import { describe, expect, it } from 'vitest';
import * as S from '../../src/schemas.js';

describe('schemas', () => {
  it('detectTocResponse', () => {
    expect(() => S.detectTocResponseSchema.parse({ toc_detected: 'yes' })).not.toThrow();
    expect(() => S.detectTocResponseSchema.parse({ toc_detected: 'maybe' })).toThrow();
  });
  it('flatTocEntry', () => {
    expect(() => S.flatTocEntrySchema.parse({ structure: '1.1', title: 'Intro', page: 5 })).not.toThrow();
  });
  it('subgroupHeadings', () => {
    expect(() => S.subgroupHeadingsResponseSchema.parse([['Intro', 1], ['Bg', 3]])).not.toThrow();
    expect(() => S.subgroupHeadingsResponseSchema.parse([['Intro', 1, 5], ['Bg', null, 7]])).not.toThrow();
  });

  it('masterMerge accepts legacy and logical tuple shapes', () => {
    expect(() => S.masterMergeResponseSchema.parse([
      ['1', 'Intro', 5],
      ['1.1', 'Bg', null, 7],
      { action: 'retrieve', pages: [5], reason: 'need context' },
    ])).not.toThrow();
  });

  it('noTocHeadings accepts object and tuple variants', () => {
    expect(() => S.noTocHeadingsResponseSchema.parse([
      { structure: '1', title: 'Intro', physical_index: '<physical_index_1>' },
      ['2', 'Body', 2],
      ['3', 'Appendix', null, 10],
    ])).not.toThrow();
  });
});
